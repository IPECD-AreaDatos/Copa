const express = require('express');
const router = express.Router();
const gastosDb = require('../db');
const authMiddleware = require('../middleware/auth');
const { createInflationResolver } = require('../services/inflation-resolver');
const fs = require('fs');
const path = require('path');
const annualPath = path.join(__dirname, '../../web/public/data/_data_ipce_v1.json');

let annualMonitorCache = null;
let annualMonitorCacheMtimeMs = 0;

function getAnnualMonitorBase() {
    const stat = fs.statSync(annualPath);
    if (!annualMonitorCache || stat.mtimeMs !== annualMonitorCacheMtimeMs) {
        const payload = JSON.parse(fs.readFileSync(annualPath, 'utf8'));
        if (!payload?.annual_monitor?.data) {
            throw new Error('Formato de annual_monitor inválido');
        }
        annualMonitorCache = payload.annual_monitor;
        annualMonitorCacheMtimeMs = stat.mtimeMs;
    }
    return annualMonitorCache;
}

async function getMasaSalarialByPeriodo() {
    const result = await gastosDb.query(`
        SELECT
            TO_CHAR(periodo, 'YYYY-MM') AS period_id,
            SUM(monto) AS masa_salarial
        FROM copa_gastos
        WHERE UPPER(estado) = 'ORDENADO'
          AND UPPER(partida) LIKE 'GAST% EN PERSONAL%'
          AND tipo_financ IN (10, 14)
        GROUP BY 1
    `);

    return result.rows.reduce((acc, row) => {
        acc[row.period_id] = parseFloat(row.masa_salarial || 0);
        return acc;
    }, {});
}

function buildMasaAcumuladaHastaMes(masaByPeriodo, year, maxMonth, scale) {
    let total = 0;
    for (let m = 1; m <= maxMonth; m++) {
        const periodId = `${year}-${String(m).padStart(2, '0')}`;
        total += masaByPeriodo[periodId] || 0;
    }
    return total / scale;
}

function buildMasaCumulativeSerie(labels, masaByPeriodo, year, scale) {
    return labels.map((label, index) => {
        const monthNumFromLabel = parseInt(label, 10);
        const monthNum = Number.isFinite(monthNumFromLabel) && monthNumFromLabel > 0
            ? monthNumFromLabel
            : index + 1;
        if (!Number.isFinite(monthNum) || monthNum <= 0) return null;
        let acc = 0;
        for (let m = 1; m <= monthNum; m++) {
            const periodId = `${year}-${String(m).padStart(2, '0')}`;
            acc += masaByPeriodo[periodId] || 0;
        }
        return acc / scale;
    });
}

function getAnnualInflation(resolver, year, maxMonth) {
    const results = [];
    for (let month = 1; month <= maxMonth; month++) {
        results.push(resolver.resolveYearOverYear(`${year}-${String(month).padStart(2, '0')}`));
    }
    if (results.some((result) => result.yoyRate === null)) {
        return { yoyRate: null, source: 'unavailable', isProjected: false, remPublishedAt: null };
    }
    const isProjected = results.some((result) => result.isProjected);
    return {
        yoyRate: results.reduce((sum, result) => sum + result.yoyRate, 0) / results.length,
        source: isProjected ? 'rem_bcra' : 'official',
        isProjected,
        remPublishedAt: isProjected ? results.find((result) => result.remPublishedAt)?.remPublishedAt ?? null : null,
    };
}

function applyAnnualInflation(kpi, resolver, year, maxMonth) {
    const inflation = getAnnualInflation(resolver, year, maxMonth);
    const meta = resolver.toApiMeta(inflation);
    const ipcPct = inflation.yoyRate === null ? null : inflation.yoyRate * 100;
    const calculateReal = (current, previous) => (
        inflation.yoyRate !== null && Number(previous) > 0
            ? ((Number(current) / Number(previous)) / (1 + inflation.yoyRate) - 1) * 100
            : 0
    );

    kpi.recaudacion = {
        ...kpi.recaudacion,
        var_real: calculateReal(kpi.recaudacion.current, kpi.recaudacion.prev),
        ipc_used_for_calc: ipcPct,
        ...meta,
    };
    if (kpi.rop) {
        kpi.rop = {
            ...kpi.rop,
            var_real: calculateReal(kpi.rop.disponible_current, kpi.rop.disponible_prev),
            diff_real: inflation.yoyRate === null ? undefined : kpi.rop.disponible_current - kpi.rop.disponible_prev * (1 + inflation.yoyRate),
            ...meta,
        };
    }
    if (kpi.distribucion_municipal) {
        const muni = kpi.distribucion_municipal;
        kpi.distribucion_municipal = {
            ...muni,
            var_real: calculateReal(muni.current, muni.prev),
            diff_real: inflation.yoyRate === null ? undefined : muni.current - muni.prev * (1 + inflation.yoyRate),
            ipc_used_for_calc: ipcPct,
            ...meta,
        };
    }
    if (kpi.masa_salarial) {
        kpi.masa_salarial = {
            ...kpi.masa_salarial,
            var_real: calculateReal(kpi.masa_salarial.current, kpi.masa_salarial.prev),
            ipc_used_for_calc: ipcPct,
            ...meta,
        };
    }
}

/**
 * Adaptador de Compatibilidad para el Monitor Anual.
 * Genera la estructura de _data_ipce_v1.json dinámicamente desde SQL.
 */
router.get('/annual-monitor', authMiddleware, async (req, res) => {
    try {
        const masaByPeriodo = await getMasaSalarialByPeriodo();
        const inflationResolver = await createInflationResolver();
        const annual = getAnnualMonitorBase();

        const SCALE = 1000000;
        const data = JSON.parse(JSON.stringify(annual.data));

        // 2022-2024 quedan hardcodeados; 2025 y 2026 se recalculan desde la misma fuente del dashboard
        ['2025', '2026'].forEach((yearId) => {
            const row = data[yearId];
            if (!row?.kpi?.meta) return;

            const year = parseInt(yearId, 10);
            const maxMonth = Number(row.kpi.meta.max_month || 12);

            const masaCurr = buildMasaAcumuladaHastaMes(masaByPeriodo, year, maxMonth, SCALE);
            const masaPrevFromDb = buildMasaAcumuladaHastaMes(masaByPeriodo, year - 1, maxMonth, SCALE);
            const masaPrevHardcoded = Number(
                row.kpi.masa_salarial?.prev ??
                data[String(year - 1)]?.kpi?.masa_salarial?.current ??
                0
            );
            // Regla de negocio: 2022-2024 permanecen hardcodeados.
            // Para 2025, el año previo debe seguir mostrando 2024 hardcodeado.
            const masaPrev = year === 2025 ? masaPrevHardcoded : masaPrevFromDb;
            const ronBrutaCurr = Number(row.kpi.recaudacion?.bruta_current ?? 0);
            const ronBrutaPrev = Number(row.kpi.recaudacion?.bruta_prev ?? 0);
            const ropBrutaCurr = Number(row.kpi.rop?.bruta_current ?? 0);
            const ropBrutaPrev = Number(row.kpi.rop?.bruta_prev ?? 0);
            const coberturaBaseCurr = ronBrutaCurr + ropBrutaCurr;
            const coberturaBasePrev = ronBrutaPrev + ropBrutaPrev;

            row.kpi.masa_salarial = {
                ...(row.kpi.masa_salarial || {}),
                current: masaCurr,
                prev: masaPrev,
                diff_nom: masaCurr - masaPrev,
                var_nom: masaPrev > 0 ? ((masaCurr / masaPrev) - 1) * 100 : 0,
                cobertura_current: coberturaBaseCurr > 0 ? (masaCurr / coberturaBaseCurr) * 100 : 0,
                cobertura_prev: coberturaBasePrev > 0 ? (masaPrev / coberturaBasePrev) * 100 : 0
            };

            const labels = row.charts?.copa_vs_salario?.labels || [];
            if (row.charts?.copa_vs_salario) {
                row.charts.copa_vs_salario.salario_target =
                    buildMasaCumulativeSerie(labels, masaByPeriodo, year, SCALE);
            }

            applyAnnualInflation(row.kpi, inflationResolver, year, maxMonth);
        });

        const years = Object.keys(data)
            .map((y) => parseInt(y, 10))
            .filter((y) => Number.isFinite(y))
            .sort((a, b) => b - a);

        const available_periods = years.map((y) => {
            const yData = data[String(y)];
            const isComplete = !!yData?.kpi?.meta?.is_complete;
            return {
                id: String(y),
                label: String(y),
                year: y,
                incomplete: !isComplete
            };
        });

        const defaultComplete = available_periods.find((p) => !p.incomplete);
        const default_period_id = defaultComplete?.id || available_periods[0]?.id || null;

        res.json({
            annual_monitor: {
                meta: {
                    default_period_id,
                    available_periods
                },
                data
            }
        });
    } catch (err) {
        console.error('Error al generar monitor anual:', err.message);
        res.status(500).json({ message: 'Error al obtener datos' });
    }
});

module.exports = router;
