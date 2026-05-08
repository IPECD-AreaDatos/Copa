const express = require('express');
const router = express.Router();
const gastosDb = require('../db');
const authMiddleware = require('../middleware/auth');
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

/**
 * Adaptador de Compatibilidad para el Monitor Anual.
 * Genera la estructura de _data_ipce_v1.json dinámicamente desde SQL.
 */
router.get('/annual-monitor', authMiddleware, async (req, res) => {
    try {
        const masaByPeriodo = await getMasaSalarialByPeriodo();
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
