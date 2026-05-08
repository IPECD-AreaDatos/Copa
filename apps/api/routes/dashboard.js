const express = require('express');
const router = express.Router();
const db = require('../db_datalake');
const authMiddleware = require('../middleware/auth');

/**
 * GET /api/dashboard/home
 */
router.get('/home', authMiddleware, async (req, res) => {
    try {
        const ronResult = await db.query(`
            SELECT anio, mes, ron_bruto, var_nominal_bruto_ia, var_real_bruto_ia, ipc_valor
            FROM v_ron_mensual_completo
            ORDER BY anio DESC, mes DESC
        `);

        const masaResult = await db.query(`
            SELECT anio, mes, masa_salarial
            FROM v_masa_salarial_mensual
            ORDER BY anio DESC, mes DESC
        `);

        const masaMap = masaResult.rows.reduce((acc, row) => {
            acc[`${row.anio}-${String(row.mes).padStart(2, '0')}`] = parseFloat(row.masa_salarial || 0);
            return acc;
        }, {});

        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const data = {};
        const available_periods = [];

        ronResult.rows.forEach(row => {
            const periodId = `${row.anio}-${String(row.mes).padStart(2, '0')}`;
            available_periods.push({ id: periodId, label: months[parseInt(row.mes)-1], month: parseInt(row.mes), year: parseInt(row.anio) });

            const masaValue = masaMap[periodId] || 0;
            const ronBruto = parseFloat(row.ron_bruto || 0);

            data[periodId] = {
                kpi: {
                    recaudacion: { bruta_current: ronBruto / 1000000, ipc_missing: !row.ipc_valor },
                    resumen: { total_recursos_brutos_var_real: parseFloat(row.var_real_bruto_ia || 0) * 100 },
                    masa_salarial: {
                        current: masaValue / 1000000,
                        cobertura_current: ronBruto > 0 ? (masaValue / ronBruto) * 100 : 0,
                        var_real: null,
                        is_incomplete: false,
                        ipc_missing: !row.ipc_valor
                    },
                    distribucion_municipal: { current: (ronBruto * 0.19) / 1000000 }
                }
            };
        });

        const chartLabels = [];
        const totalVarInteranual = [];
        const ipcVarInteranual = [];
        const chartRows = ronResult.rows.slice(0, 12).reverse();
        chartRows.forEach(row => {
            chartLabels.push(months[parseInt(row.mes)-1].substring(0,3) + " " + String(row.anio).slice(-2));
            totalVarInteranual.push(parseFloat(row.var_nominal_bruto_ia || 0) * 100);
            const vNom = parseFloat(row.var_nominal_bruto_ia || 0);
            const vReal = parseFloat(row.var_real_bruto_ia || 0);
            ipcVarInteranual.push((((1+vNom)/(1+vReal)) - 1) * 100);
        });

        res.json({
            meta: { default_period_id: available_periods[0]?.id, available_periods: available_periods.slice(0, 12) },
            data,
            global_charts: { labels: chartLabels, total_var_interanual: totalVarInteranual, ipc_var_interanual: ipcVarInteranual }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * GET /api/dashboard/monthly
 */
router.get('/monthly', authMiddleware, async (req, res) => {
    try {
        const ronResult = await db.query(`
            SELECT anio, mes, ron_bruto, ron_neto, ron_bruto_anterior, ron_neto_anterior, var_nominal_bruto_ia, var_real_bruto_ia, ipc_valor, ipc_valor_anterior
            FROM v_ron_mensual_completo
            ORDER BY anio DESC, mes DESC
        `);

        const masaResult = await db.query(`
            SELECT anio, mes, masa_salarial
            FROM v_masa_salarial_mensual
        `);

        const masaMap = masaResult.rows.reduce((acc, row) => {
            acc[`${row.anio}-${String(row.mes).padStart(2, '0')}`] = parseFloat(row.masa_salarial || 0);
            return acc;
        }, {});

        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const data = {};

        // To avoid making too many queries, we fetch all daily data for the available years
        const years = [...new Set(ronResult.rows.map(r => parseInt(r.anio)))];
        const prevYears = years.map(y => y - 1);
        const allYears = [...new Set([...years, ...prevYears])];

        const dailyResult = await db.query(`
            SELECT EXTRACT(YEAR FROM fecha) as anio, EXTRACT(MONTH FROM fecha) as mes, EXTRACT(DAY FROM fecha) as dia, total_general
            FROM recursos_origen_nacional
            WHERE EXTRACT(YEAR FROM fecha) = ANY($1)
            ORDER BY fecha ASC
        `, [allYears]);

        const dailyDataMap = {};
        dailyResult.rows.forEach(d => {
            const key = `${d.anio}-${String(d.mes).padStart(2, '0')}`;
            if (!dailyDataMap[key]) dailyDataMap[key] = {};
            dailyDataMap[key][parseInt(d.dia)] = parseFloat(d.total_general || 0) / 1000000;
        });

        ronResult.rows.forEach(row => {
            const periodId = `${row.anio}-${String(row.mes).padStart(2, '0')}`;
            const anio = parseInt(row.anio);
            const mes = parseInt(row.mes);
            const masaValue = masaMap[periodId] || 0;
            const prevPeriodId = `${anio - 1}-${String(mes).padStart(2, '0')}`;
            const masaPrevValue = masaMap[prevPeriodId] || 0;

            const ronBruto = parseFloat(row.ron_bruto || 0);
            const ronBrutoPrev = parseFloat(row.ron_bruto_anterior || 0);

            // Build Daily Chart
            const dailyCurr = dailyDataMap[periodId] || {};
            const dailyPrev = dailyDataMap[prevPeriodId] || {};
            const maxDay = Math.max(...Object.keys(dailyCurr).map(Number), ...Object.keys(dailyPrev).map(Number), 0);
            
            const dailyChart = { labels: [], data_curr: [], data_prev: [] };
            for (let d = 1; d <= maxDay; d++) {
                dailyChart.labels.push(String(d));
                dailyChart.data_curr.push(dailyCurr[d] || 0);
                dailyChart.data_prev.push(dailyPrev[d] || 0);
            }

            data[periodId] = {
                kpi: {
                    recaudacion: {
                        bruta_current: ronBruto / 1000000,
                        bruta_prev: ronBrutoPrev / 1000000,
                        neta_current: parseFloat(row.ron_neto || 0) / 1000000,
                        neta_prev: parseFloat(row.ron_neto_anterior || 0) / 1000000,
                        var_nominal_ia: parseFloat(row.var_nominal_bruto_ia || 0) * 100,
                        var_real_ia: parseFloat(row.var_real_bruto_ia || 0) * 100,
                        ipc_missing: !row.ipc_valor
                    },
                    masa_salarial: {
                        current: masaValue / 1000000,
                        prev: masaPrevValue / 1000000,
                        cobertura_current: ronBruto > 0 ? (masaValue / ronBruto) * 100 : 0,
                        cobertura_prev: ronBrutoPrev > 0 ? (masaPrevValue / ronBrutoPrev) * 100 : 0,
                        ipc_missing: !row.ipc_valor // Simplified
                    }
                },
                charts: {
                    daily: dailyChart,
                    copa_vs_salario: {
                        labels: [], // Not used in this specific dashboard but kept for compatibility
                        cumulative_copa: [],
                        salario_target: []
                    }
                }
            };
        });

        const available_periods = ronResult.rows.map(row => ({
            id: `${row.anio}-${String(row.mes).padStart(2, '0')}`,
            label: months[parseInt(row.mes)-1],
            year: parseInt(row.anio)
        }));

        res.json({
            meta: { default_period_id: available_periods[0]?.id, available_periods },
            data
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
