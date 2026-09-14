const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db_copa = require('../db');            // Para RON y Gastos (Datos frescos)
const authMiddleware = require('../middleware/auth');
const { createInflationResolver } = require('../services/inflation-resolver');
const { periodId, nullableNumber, mapValue, createDashboardCompleteness } = require('../services/dashboard-completeness');
const { loadMonthlyDashboard } = require('../services/monthly-dashboard');

function monthlyReportAuth(req, res, next) {
    const expected = process.env.MONTHLY_REPORT_JOB_SECRET;
    const provided = req.get('x-report-job-secret');

    if (!expected || !provided) {
        return res.status(404).json({ message: 'Not found' });
    }

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    if (
        expectedBuffer.length !== providedBuffer.length
        || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
        return res.status(404).json({ message: 'Not found' });
    }

    return next();
}

/**
 * GET /api/dashboard/home
 * Retorna datos resumidos para la pantalla principal.
 * Acceso público (sin JWT): el inicio del tablero debe ser visible para todos.
 */
router.get('/home', async (req, res) => {
    try {
        // 1. Obtener RON Mensual desde la DB fresca (db_copa)
        const ronResult = await db_copa.query(`
            WITH monthly_ron AS (
                SELECT 
                    EXTRACT(YEAR FROM fecha)::int as anio, 
                    EXTRACT(MONTH FROM fecha)::int as mes,
                    SUM(total_general) as ron_bruto,
                    SUM(COALESCE(iva_ley_23966, 0)) as ron_iva,
                    SUM(total_general - (
                        COALESCE(imp_combustibles_vialidad, 0) + 
                        COALESCE(imp_combustibles_fonavi, 0) + 
                        COALESCE(iva_ley_23966, 0) + 
                        COALESCE(imp_bienes_personales_ley_23966, 0)
                    )) as ron_neto
                FROM copa_recursos_origen_nacional
                GROUP BY 1, 2
            )
            SELECT curr.*, prev.ron_bruto as ron_bruto_anterior
            FROM monthly_ron curr
            LEFT JOIN monthly_ron prev ON curr.anio = prev.anio + 1 AND curr.mes = prev.mes
            ORDER BY curr.anio DESC, curr.mes DESC
        `);

        // IPC oficial; si falta un mes, el resolver encadena REM dinámicamente.
        const inflationResolver = await createInflationResolver();

        // 3. Obtener ROP (Recursos de Origen Provincial)
        const ropResult = await db_copa.query(`
            WITH monthly_rop AS (
                SELECT 
                    anio::int, mes::int,
                    SUM(inmobiliario_rural + tasas + marcas_y_senales + sellos + premios + ingresos_brutos + apremios_concursos_quiebras_reg_judiciales) as rop_bruta
                FROM copa_reca_rop
                GROUP BY 1, 2
            )
            SELECT * FROM monthly_rop
        `);
        const ropMap = ropResult.rows.reduce((acc, row) => {
            const m = String(row.mes).padStart(2, '0');
            acc[`${row.anio}-${m}`] = nullableNumber(row.rop_bruta);
            return acc;
        }, {});

        // 4. Obtener Masa Salarial (db_copa)
        const masaResult = await db_copa.query(`
            SELECT 
                EXTRACT(YEAR FROM periodo)::int as anio, 
                EXTRACT(MONTH FROM periodo)::int as mes, 
                SUM(monto) as masa_salarial
            FROM copa_gastos
            WHERE UPPER(estado) = 'ORDENADO'
              AND UPPER(partida) LIKE 'GAST% EN PERSONAL%'
              AND tipo_financ IN (10, 14)
            GROUP BY 1, 2
        `);
        const masaMap = masaResult.rows.reduce((acc, row) => {
            const m = String(row.mes).padStart(2, '0');
            acc[`${row.anio}-${m}`] = nullableNumber(row.masa_salarial);
            return acc;
        }, {});

        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const data = {};

        const ronRowsAllAsc = [...ronResult.rows].reverse();
        const ronMap = ronRowsAllAsc.reduce((acc, row) => {
            acc[periodId(row.anio, row.mes)] = nullableNumber(row.ron_bruto);
            return acc;
        }, {});
        const resolveCompleteness = createDashboardCompleteness({
            ronByPeriod: ronMap,
            ropByPeriod: ropMap,
            salaryByPeriod: masaMap,
        });
        const ronRowsAsc = ronRowsAllAsc.slice(-12);

        const available_periods = ronRowsAsc.map((row) => ({
            id: periodId(row.anio, row.mes),
            label: months[row.mes - 1],
            month: row.mes,
            year: row.anio,
            is_complete: resolveCompleteness(periodId(row.anio, row.mes)).is_complete,
            incomplete: !resolveCompleteness(periodId(row.anio, row.mes)).is_complete,
        }));

        // Ratios Legales (fijos por norma)
        const RON_DISPO_RATIO = 0.877487;
        const RON_MUNI_RATIO = 0.122513;
        const ROP_DISPO_RATIO = 0.812932;
        const ROP_MUNI_RATIO = 0.187068;

        // Default = último mes completo
        let defaultId = null;
        ronRowsAsc.forEach((row) => {
            const pid = periodId(row.anio, row.mes);
            if (resolveCompleteness(pid).is_complete) defaultId = pid;
        });
        if (!defaultId && available_periods.length > 0) {
            defaultId = available_periods[available_periods.length - 1].id;
        }
        ronRowsAsc.forEach((row) => {
            const currentPeriodId = periodId(row.anio, row.mes);
            const previousPeriodId = periodId(row.anio - 1, row.mes);
            const completeness = resolveCompleteness(currentPeriodId);
            const previousCompleteness = resolveCompleteness(previousPeriodId);
            const inflation = inflationResolver.resolveYearOverYear(currentPeriodId);
            const vIpc = inflation.yoyRate;
            const ipcMeta = inflationResolver.toApiMeta(inflation);

            const masaValue = mapValue(masaMap, currentPeriodId);
            const masaPrevValue = mapValue(masaMap, previousPeriodId);
            const ronBruto = nullableNumber(row.ron_bruto);
            const ronBrutoPrev = nullableNumber(row.ron_bruto_anterior);
            const ronNeto = nullableNumber(row.ron_neto);
            const ropValue = mapValue(ropMap, currentPeriodId);
            const ropPrevValue = mapValue(ropMap, previousPeriodId);

            const ronComplete = completeness.variables.ron.is_complete;
            const ropComplete = completeness.variables.rop.is_complete;
            const salaryComplete = completeness.variables.masa_salarial.is_complete;
            const ronPreviousComplete = previousCompleteness.variables.ron.is_complete;
            const ropPreviousComplete = previousCompleteness.variables.rop.is_complete;
            const salaryPreviousComplete = previousCompleteness.variables.masa_salarial.is_complete;

            // Variación Real Recursos Totales (RON + ROP), brutos, deflactado por IPC Nacional
            let varRealTotalBruto = null;
            const totalBrutoCurr = ronComplete && ropComplete
                ? ronBruto + ropValue
                : null;
            const totalBrutoPrev = ronPreviousComplete && ropPreviousComplete
                ? ronBrutoPrev + ropPrevValue
                : null;
            if (totalBrutoCurr !== null && totalBrutoPrev > 0 && vIpc !== null) {
                varRealTotalBruto = ((totalBrutoCurr / totalBrutoPrev) / (1 + vIpc)) - 1;
            }

            // Variación Real Masa Salarial
            let varRealMasa = null;
            if (salaryComplete && salaryPreviousComplete && masaPrevValue > 0 && vIpc !== null) {
                varRealMasa = ((masaValue / masaPrevValue) / (1 + vIpc)) - 1;
            }

            const ronDisponible = ronComplete ? ronNeto * RON_DISPO_RATIO : null;
            const ropDisponible = ropComplete ? ropValue * ROP_DISPO_RATIO : null;
            const municipalComplete = ronComplete && ropComplete;

            data[currentPeriodId] = {
                completeness,
                kpi: {
                    recaudacion: { 
                        bruta_current: ronComplete ? ronBruto / 1000000 : null,
                        is_complete: ronComplete,
                        ...ipcMeta
                    },
                    rop: {
                        bruta_current: ropComplete ? ropValue / 1000000 : null,
                        is_complete: ropComplete,
                    },
                    resumen: { 
                        total_recursos_brutos_var_real: varRealTotalBruto !== null ? varRealTotalBruto * 100 : null,
                    },
                    masa_salarial: {
                        current: salaryComplete ? masaValue / 1000000 : null,
                        // Cobertura Salarial (Inicio) debe usar recursos brutos (RON+ROP) como en la versión web y el gráfico
                        cobertura_current: completeness.is_complete && totalBrutoCurr > 0
                            ? (masaValue / totalBrutoCurr) * 100
                            : null,
                        var_real: varRealMasa !== null ? varRealMasa * 100 : null,
                        is_complete: salaryComplete,
                        ...ipcMeta
                    },
                    distribucion_municipal: { 
                        current: municipalComplete
                            ? (ronNeto * RON_MUNI_RATIO + ropValue * ROP_MUNI_RATIO) / 1000000
                            : null,
                        is_complete: municipalComplete,
                    }
                }
            };
        });

        // Charts
        const chartLabels = [];
        const totalVarInteranual = [];
        const ipcVarInteranual = [];
        
        const chartRows = ronRowsAsc;
        chartRows.forEach(row => {
            const mesPad = String(row.mes).padStart(2, '0');
            const currentPeriodId = `${row.anio}-${mesPad}`;
            const previousPeriodId = `${row.anio - 1}-${mesPad}`;
            const completeness = resolveCompleteness(currentPeriodId);
            const previousCompleteness = resolveCompleteness(previousPeriodId);
            chartLabels.push(months[row.mes-1].substring(0,3) + " " + String(row.anio).slice(-2));
            const ronCurrent = mapValue(ronMap, currentPeriodId);
            const ronPrevious = mapValue(ronMap, previousPeriodId);
            const ropCurrent = mapValue(ropMap, currentPeriodId);
            const ropPrevious = mapValue(ropMap, previousPeriodId);
            const totalInputsComplete = completeness.variables.ron.is_complete
                && completeness.variables.rop.is_complete
                && previousCompleteness.variables.ron.is_complete
                && previousCompleteness.variables.rop.is_complete;
            const totalCurrent = totalInputsComplete ? ronCurrent + ropCurrent : null;
            const totalPrevious = totalInputsComplete ? ronPrevious + ropPrevious : null;
            const vNom = totalCurrent !== null && totalPrevious > 0
                ? (totalCurrent / totalPrevious) - 1
                : null;
            totalVarInteranual.push(vNom === null ? null : vNom * 100);

            const vIpc = inflationResolver.resolveYearOverYear(currentPeriodId).yoyRate;
            ipcVarInteranual.push(vIpc === null ? null : vIpc * 100);
        });

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.json({
            meta: { 
                default_period_id: defaultId, 
                available_periods: available_periods 
            },
            data,
            global_charts: { 
                labels: chartLabels, 
                total_var_interanual: totalVarInteranual, 
                ipc_var_interanual: ipcVarInteranual 
            }
        });
    } catch (err) {
        console.error('Error in /home:', err);
        res.status(500).json({ message: err.message });
    }
});

/**
 * GET /api/dashboard/monthly
 * Retorna datos detallados para el monitor mensual
 */
async function monthlyDashboardHandler(req, res) {
    try {
        const payload = await loadMonthlyDashboard();

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.json(payload);
    } catch (err) {
        console.error('Error in /monthly:', err);
        res.status(500).json({ message: err.message });
    }
}

router.get('/monthly', authMiddleware, monthlyDashboardHandler);
router.get('/monthly-report', monthlyReportAuth, monthlyDashboardHandler);

module.exports = router;
