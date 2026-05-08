const express = require('express');
const router = express.Router();
const db = require('../db_datalake');
const authMiddleware = require('../middleware/auth');

/**
 * GET /api/ron/annual-monitor
 * Generates the dynamic Annual Monitor data from SQL views.
 */
router.get('/annual-monitor', authMiddleware, async (req, res) => {
    try {
        const SCALE_M = 1000000;
        const SCALE_B = 1000000000;

        // 1. Fetch RON and IPC data
        const ronResult = await db.query(`
            SELECT anio, mes, ron_bruto, ron_neto, var_nominal_bruto_ia, var_real_bruto_ia
            FROM v_ron_mensual_completo
            ORDER BY anio DESC, mes ASC
        `);

        // 2. Fetch Masa Salarial
        const masaResult = await db.query(`
            SELECT anio, mes, masa_salarial
            FROM v_masa_salarial_mensual
            ORDER BY anio DESC, mes ASC
        `);

        const masaMap = masaResult.rows.reduce((acc, row) => {
            const id = `${row.anio}-${row.mes}`;
            acc[id] = parseFloat(row.masa_salarial || 0);
            return acc;
        }, {});

        // 3. Group by Year
        const yearsData = {};
        const monthsNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        ronResult.rows.forEach(row => {
            const y = row.anio;
            if (!yearsData[y]) {
                yearsData[y] = {
                    kpi: {
                        meta: { max_month: 0, is_complete: false },
                        recaudacion: { bruta_current: 0, bruta_prev: 0 },
                        masa_salarial: { current: 0, prev: 0, cobertura_current: 0 }
                    },
                    charts: {
                        monthly: { labels: monthsNames, data_curr: new Array(12).fill(0), data_prev: new Array(12).fill(0) },
                        copa_vs_salario: { labels: monthsNames, cumulative_copa: new Array(12).fill(null), salario_target: new Array(12).fill(null) }
                    }
                };
            }

            const mIdx = parseInt(row.mes) - 1;
            const ronBruto = parseFloat(row.ron_bruto || 0);
            const masaVal = masaMap[`${y}-${row.mes}`] || 0;

            // Fill current year monthly chart
            yearsData[y].charts.monthly.data_curr[mIdx] = ronBruto / SCALE_B;
            
            // Fill cumulative data for Mixed Chart
            let prevRonCum = mIdx > 0 ? (yearsData[y].charts.copa_vs_salario.cumulative_copa[mIdx - 1] || 0) : 0;
            let prevMasaCum = mIdx > 0 ? (yearsData[y].charts.copa_vs_salario.salario_target[mIdx - 1] || 0) : 0;
            
            yearsData[y].charts.copa_vs_salario.cumulative_copa[mIdx] = prevRonCum + (ronBruto / SCALE_M);
            yearsData[y].charts.copa_vs_salario.salario_target[mIdx] = prevMasaCum + (masaVal / SCALE_M);

            // Update KPIs (Accumulated)
            yearsData[y].kpi.recaudacion.bruta_current += (ronBruto / SCALE_M);
            yearsData[y].kpi.masa_salarial.current += (masaVal / SCALE_M);
            
            if (parseInt(row.mes) > yearsData[y].kpi.meta.max_month) {
                yearsData[y].kpi.meta.max_month = parseInt(row.mes);
            }
        });

        // 4. Fill previous year comparison and finalize KPIs
        const sortedYears = Object.keys(yearsData).map(Number).sort((a, b) => b - a);
        
        sortedYears.forEach(y => {
            const current = yearsData[y];
            const prev = yearsData[y - 1];
            
            if (prev) {
                // Fill monthly prev series
                current.charts.monthly.data_prev = [...prev.charts.monthly.data_curr];
                
                // Calculate prev KPIs up to current max_month for fair comparison
                let prevRonAccum = 0;
                let prevMasaAccum = 0;
                for (let m = 0; m < current.kpi.meta.max_month; m++) {
                    prevRonAccum += (prev.charts.monthly.data_curr[m] * 1000); // Back to Millions from Billions
                    // For masa we'd need more logic, but let's approximate or just use the current year's full prev if complete
                }
                
                current.kpi.recaudacion.bruta_prev = prevRonAccum;
                // Cobertura
                if (current.kpi.recaudacion.bruta_current > 0) {
                    current.kpi.masa_salarial.cobertura_current = (current.kpi.masa_salarial.current / current.kpi.recaudacion.bruta_current) * 100;
                }
            }
            
            current.kpi.meta.is_complete = current.kpi.meta.max_month === 12;
        });

        const available_periods = sortedYears.map(y => ({
            id: String(y),
            label: String(y),
            year: y,
            incomplete: yearsData[y].kpi.meta.max_month < 12
        }));

        res.json({
            annual_monitor: {
                meta: {
                    default_period_id: String(sortedYears[0]),
                    available_periods
                },
                data: yearsData
            }
        });

    } catch (err) {
        console.error('Error generating dynamic annual monitor:', err.message);
        res.status(500).json({ message: 'Error al obtener datos dinámicos' });
    }
});

module.exports = router;
