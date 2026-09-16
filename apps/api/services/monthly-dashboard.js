const db_copa = require('../db');
const { createInflationResolver } = require('./inflation-resolver');
const { getMonthlyBudget } = require('./budget-resolver');
const { resolveMonthlySalaryTarget } = require('./salary-target-resolver');
const { periodId, nullableNumber, mapValue, createDashboardCompleteness } = require('./dashboard-completeness');

// Fuente compartida por el análisis mensual, el anual y el reporte mensual.
// Las consultas, filtros y reglas se mantienen definidos aquí, sin snapshots de importes.
async function loadMonthlyDashboard() {
    // 1. Obtener RON Mensual detallado (db_copa)
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
        SELECT curr.*,
               prev.ron_bruto as ron_bruto_anterior,
               prev.ron_neto as ron_neto_anterior,
               prev.ron_iva as ron_iva_anterior
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

    // 5. Datos diarios para gráficos (db_copa)
    const years = [...new Set(ronResult.rows.map(r => r.anio))];
    const prevYears = years.map(y => y - 1);
    const allYears = [...new Set([...years, ...prevYears])];

    const dailyResult = await db_copa.query(`
        SELECT EXTRACT(YEAR FROM fecha)::int as anio, EXTRACT(MONTH FROM fecha)::int as mes, EXTRACT(DAY FROM fecha)::int as dia, total_general
        FROM copa_recursos_origen_nacional
        WHERE EXTRACT(YEAR FROM fecha) = ANY($1)
        ORDER BY fecha ASC
    `, [allYears]);

    const dailyDataMap = {};
    dailyResult.rows.forEach(d => {
        const key = `${d.anio}-${String(d.mes).padStart(2, '0')}`;
        if (!dailyDataMap[key]) dailyDataMap[key] = {};
        dailyDataMap[key][d.dia] = parseFloat(d.total_general || 0) / 1000000;
    });

    // Invertir para available_periods ASC (cronológico: más viejo → más nuevo)
    const ronRowsAsc = [...ronResult.rows].reverse();
    const ronMap = ronRowsAsc.reduce((acc, row) => {
        acc[periodId(row.anio, row.mes)] = nullableNumber(row.ron_bruto);
        return acc;
    }, {});
    const resolveCompleteness = createDashboardCompleteness({
        ronByPeriod: ronMap,
        ropByPeriod: ropMap,
        salaryByPeriod: masaMap,
    });

    const available_periods = ronRowsAsc.map((row) => ({
        id: periodId(row.anio, row.mes),
        label: months[row.mes - 1],
        year: row.anio,
        month: row.mes,
        is_complete: resolveCompleteness(periodId(row.anio, row.mes)).is_complete,
        incomplete: !resolveCompleteness(periodId(row.anio, row.mes)).is_complete,
    }));

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
        const ronNetoPrev = nullableNumber(row.ron_neto_anterior);
        const ronIva = nullableNumber(row.ron_iva);
        const ronIvaPrev = nullableNumber(row.ron_iva_anterior);
        const ropValue = mapValue(ropMap, currentPeriodId);
        const ropPrevValue = mapValue(ropMap, previousPeriodId);

        const ronComplete = completeness.variables.ron.is_complete;
        const ropComplete = completeness.variables.rop.is_complete;
        const salaryComplete = completeness.variables.masa_salarial.is_complete;
        const ronPreviousComplete = previousCompleteness.variables.ron.is_complete;
        const ropPreviousComplete = previousCompleteness.variables.rop.is_complete;
        const salaryPreviousComplete = previousCompleteness.variables.masa_salarial.is_complete;

        // Ratios Legales (del JSON original)
        const RON_DISPO_RATIO = 0.877487;
        const ROP_DISPO_RATIO = 0.812932;
        const ROP_MUNI_RATIO = 0.187068;
        // Ajuste fino para reproducir el tablero publicado:
        // para años < 2026, al construir la base del "RON disponible" se excluye casi todo IVA_ley_23966,
        // dejando un residuo del orden de 0.52% del IVA.
        const RON_IVA_RESIDUAL_RATIO = 0.005185194361665872;

        // Daily Chart
        const dailyCurr = dailyDataMap[currentPeriodId] || {};
        const dailyPrev = dailyDataMap[previousPeriodId] || {};

        const daysSet = new Set([...Object.keys(dailyCurr), ...Object.keys(dailyPrev)].map(Number));
        const sortedDays = [...daysSet].sort((a, b) => a - b);

        // Copa vs Salario (Acumulado) — alineado a backend/etl_main.py (pre migración Next)
        const now = new Date();
        const isRunningMonth = row.anio === now.getFullYear() && row.mes === now.getMonth() + 1;

        let maxDayCurr = 0;
        for (const [k, v] of Object.entries(dailyCurr)) {
            const di = parseInt(k, 10);
            if (Number.isFinite(di) && Number(v) > 0) maxDayCurr = Math.max(maxDayCurr, di);
        }

        const dailyChart = {
            labels: [],
            data_curr: [],
            data_prev_nom: [],
            is_complete: ronComplete && ronPreviousComplete,
        };
        sortedDays.forEach(d => {
            dailyChart.labels.push(String(d));
            // La tabla diaria trae ceros placeholder para los días futuros del mes en
            // curso; a partir del último día con recaudación positiva se deja un hueco
            // (null) en vez de dibujar una caída a cero que todavía no ocurrió.
            const currValue = (isRunningMonth && d > maxDayCurr) ? null : (dailyCurr[d] || 0);
            dailyChart.data_curr.push(currValue);
            dailyChart.data_prev_nom.push(dailyPrev[d] || 0);
        });

        const totalDaysInMonth = new Date(row.anio, row.mes, 0).getDate();

        let chartLastDay = totalDaysInMonth;
        if ((isRunningMonth || !ronComplete) && maxDayCurr > 0) {
            chartLastDay = maxDayCurr;
        }

        // La línea objetivo del gráfico conserva la lógica histórica: si la masa del
        // período no alcanza el umbral de completitud, usa el mes anterior como
        // referencia explícita. Esto no habilita KPIs ni variaciones del período.
        const salaryTarget = resolveMonthlySalaryTarget(currentPeriodId, masaMap);
        const masaPesosObjetivo = salaryTarget.value;
        const salarySourceMonth = salaryTarget.sourcePeriodId
            ? Number(salaryTarget.sourcePeriodId.slice(5, 7))
            : row.mes;
        const salario_label_month = months[salarySourceMonth - 1];
        const masa_objetivo_es_fallback = salaryTarget.isFallback;
        const salario_line_label = masa_objetivo_es_fallback
            ? `Masa Salarial Objetivo · referencia ${salario_label_month}`
            : 'Masa Salarial Objetivo';

        const copa_label = months[row.mes - 1];

        const cumulativeCopa = [];
        const cumulativeRop = [];
        const salarioTarget = [];
        let accCopa = 0;
        let accRop = 0;
        const ropDispoPesosMes = ropComplete ? ropValue * ROP_DISPO_RATIO : null;

        // Reparto diario del RON disponible mensual:
        // Para años anteriores a 2026 se excluye IVA_ley_23966 de la base que se reparte (ajuste coherente con el tablero deployado).
        const useExclIvaCurr = row.anio < 2026;
        const ronNetoDispBaseCurrRaw = useExclIvaCurr
            ? ronNeto + ronIva * (1 - RON_IVA_RESIDUAL_RATIO)
            : ronNeto;
        // El acumulado diario debe mostrar el progreso real hasta la fecha: exige sólo
        // que haya observación (`ronBruto > 0`), no el umbral de completitud de KPIs
        // (`ronComplete`), que sigue gobernando variaciones y coberturas del período.
        const ronHasData = ronBruto !== null && ronBruto > 0;
        const ronBrutoDispFactor = ronHasData
            ? ronNetoDispBaseCurrRaw / ronBruto
            : 0;
        for (let d = 1; d <= chartLastDay; d++) {
            accCopa +=
                (dailyCurr[d] || 0) *
                1000000 *
                RON_DISPO_RATIO *
                ronBrutoDispFactor;
            if (d === maxDayCurr && maxDayCurr > 0 && ropDispoPesosMes !== null) {
                accRop += ropDispoPesosMes;
            }
            cumulativeCopa.push(ronHasData ? accCopa / 1000000 : null);
            cumulativeRop.push(ropComplete ? accRop / 1000000 : null);
            salarioTarget.push(masaPesosObjetivo > 0 ? masaPesosObjetivo / 1000000 : null);
        }

        // RON disponible: base puede excluir IVA_ley_23966 para años anteriores a 2026.
        const useExclIvaPrev = row.anio - 1 < 2026;
        const ronNetoDispBasePrevRaw = useExclIvaPrev
            ? ronNetoPrev + ronIvaPrev * (1 - RON_IVA_RESIDUAL_RATIO)
            : ronNetoPrev;

        const ronDispo = ronComplete ? ronNetoDispBaseCurrRaw * RON_DISPO_RATIO : null;
        const ronDispoPrev = ronPreviousComplete ? ronNetoDispBasePrevRaw * RON_DISPO_RATIO : null;

        let vNomRon = null;
        let vRealRon = null;
        if (ronDispo !== null && ronDispoPrev > 0) {
            vNomRon = ronDispo / ronDispoPrev - 1;
            if (vIpc !== null) {
                vRealRon = ((1 + vNomRon) / (1 + vIpc)) - 1;
            }
        }

        const vNomRop = ropComplete && ropPreviousComplete && ropPrevValue > 0
            ? ropValue / ropPrevValue - 1
            : null;
        let vRealRop = null;
        if (vNomRop !== null && vIpc !== null) {
            vRealRop = ((1 + vNomRop) / (1 + vIpc)) - 1;
        }

        const ropDispo = ropComplete ? ropValue * ROP_DISPO_RATIO : null;
        const ropDispoPrev = ropPreviousComplete ? ropPrevValue * ROP_DISPO_RATIO : null;

        const ronDispoM = ronDispo === null ? null : ronDispo / 1000000;
        const ronDispoPrevM = ronDispoPrev === null ? null : ronDispoPrev / 1000000;
        const ropDispoM = ropDispo === null ? null : ropDispo / 1000000;
        const ropDispoPrevM = ropDispoPrev === null ? null : ropDispoPrev / 1000000;

        // El presupuesto mensual se resuelve desde la fuente presupuestaria completa.
        // El resto de KPIs (recaudado/variaciones/municipal) se calcula 100% desde BD.
        const budget = getMonthlyBudget(currentPeriodId);
        const ropBrutaCurrentM = ropComplete ? ropValue / 1000000 : null;
        const esperadaProv = budget?.rop;
        const brechaAbsProv = ropBrutaCurrentM !== null && typeof esperadaProv === 'number'
            ? ropBrutaCurrentM - esperadaProv
            : null;
        const brechaPctProv = ropBrutaCurrentM !== null && typeof esperadaProv === 'number'
            ? (esperadaProv > 0 ? ((ropBrutaCurrentM / esperadaProv) - 1) * 100 : 0)
            : null;

        // Distribución municipal:
        // - Nacional (RON) = RON neto - RON disponible (según la base condicional usada para disponible).
        // - Provincial (ROP) = ROP bruta * ROP_MUNI_RATIO (constante).
        const municipalComplete = ronComplete && ropComplete;
        const municipalPreviousComplete = ronPreviousComplete && ropPreviousComplete;
        const nacionCurrentM = ronComplete ? ronNeto / 1000000 - ronDispoM : null;
        const nacionPrevM = ronPreviousComplete ? ronNetoPrev / 1000000 - ronDispoPrevM : null;
        const provinciaCurrentM = ropComplete ? (ropValue * ROP_MUNI_RATIO) / 1000000 : null;
        const provinciaPrevM = ropPreviousComplete ? (ropPrevValue * ROP_MUNI_RATIO) / 1000000 : null;
        const muniCurrentM = municipalComplete ? nacionCurrentM + provinciaCurrentM : null;
        const muniPrevM = municipalPreviousComplete ? nacionPrevM + provinciaPrevM : null;

        const vNomMuni = muniCurrentM !== null && muniPrevM > 0
            ? muniCurrentM / muniPrevM - 1
            : null;
        const diffNomMuni = muniCurrentM !== null && muniPrevM !== null
            ? muniCurrentM - muniPrevM
            : null;
        let vRealMuni = null;
        if (muniCurrentM !== null && muniPrevM > 0 && vIpc !== null) {
            vRealMuni = muniCurrentM / muniPrevM / (1 + vIpc) - 1;
        }
        const diffRealMuni = muniCurrentM !== null && muniPrevM !== null && vIpc !== null
            ? muniCurrentM - muniPrevM * (1 + vIpc)
            : null;

        const muniKpi = {
            current: muniCurrentM,
            prev: muniPrevM,
            nacion_current: nacionCurrentM,
            nacion_prev: nacionPrevM,
            provincia_current: provinciaCurrentM,
            provincia_prev: provinciaPrevM,
            var_nom: vNomMuni !== null ? vNomMuni * 100 : null,
            var_real: vRealMuni !== null ? vRealMuni * 100 : null,
            diff_nom: diffNomMuni,
            diff_real: diffRealMuni,
            is_complete: municipalComplete,
            ...ipcMeta,
            ipc_used_for_calc: vIpc !== null ? vIpc * 100 : null,
        };

        // Cobertura salarial: masa / (RON bruto + ROP bruto), igual que el JSON de referencia (no sobre recursos disponibles).
        const totalBrutoPesos = ronComplete && ropComplete ? ronBruto + ropValue : null;
        const totalBrutoPrevPesos = ronPreviousComplete && ropPreviousComplete
            ? ronBrutoPrev + ropPrevValue
            : null;

        let vRealMasa = null;
        if (salaryComplete && salaryPreviousComplete && masaPrevValue > 0 && vIpc !== null) {
            vRealMasa = ((masaValue / masaPrevValue) / (1 + vIpc)) - 1;
        }

        data[currentPeriodId] = {
            completeness,
            kpi: {
                meta: {
                    periodo: `${months[row.mes-1]} ${row.anio}`,
                    is_complete: completeness.is_complete,
                },
                resumen: {
                    total_disponible_current: ronDispoM !== null && ropDispoM !== null
                        ? ronDispoM + ropDispoM
                        : null,
                    ron_disponible: ronDispoM,
                    rop_disponible: ropDispoM,
                    post_sueldos_current: completeness.is_complete
                        ? (ronDispo + ropDispo - masaValue) / 1000000
                        : null,
                },
                recaudacion: {
                    current: ronDispoM,
                    prev: ronDispoPrevM,
                    bruta_current: ronComplete ? ronBruto / 1000000 : null,
                    bruta_prev: ronPreviousComplete ? ronBrutoPrev / 1000000 : null,
                    neta_current: ronComplete ? ronNeto / 1000000 : null,
                    neta_prev: ronPreviousComplete ? ronNetoPrev / 1000000 : null,
                    var_nom: vNomRon !== null ? vNomRon * 100 : null,
                    var_real: vRealRon !== null ? vRealRon * 100 : null,
                    diff_nom: ronDispoM !== null && ronDispoPrevM !== null
                        ? ronDispoM - ronDispoPrevM
                        : null,
                    is_complete: ronComplete,
                    ...ipcMeta,
                    ipc_used_for_calc: vIpc !== null ? vIpc * 100 : null,
                    esperada: budget?.ron,
                },
                rop: {
                    bruta_current: ropBrutaCurrentM,
                    bruta_prev: ropPreviousComplete ? ropPrevValue / 1000000 : null,
                    disponible_current: ropDispoM,
                    disponible_prev: ropDispoPrevM,
                    var_nom: vNomRop !== null ? vNomRop * 100 : null,
                    var_real: vRealRop !== null ? vRealRop * 100 : null,
                    diff_nom: ropDispoM !== null && ropDispoPrevM !== null
                        ? ropDispoM - ropDispoPrevM
                        : null,
                    diff_real: ropDispoM !== null && ropDispoPrevM !== null && vIpc !== null
                        ? ropDispoM - ropDispoPrevM * (1 + vIpc)
                        : null,
                    is_complete: ropComplete,
                    ...ipcMeta,
                    esperada_prov: esperadaProv,
                    brecha_abs_prov: brechaAbsProv,
                    brecha_pct_prov: brechaPctProv,
                },
                masa_salarial: {
                    current: salaryComplete ? masaValue / 1000000 : null,
                    prev: salaryPreviousComplete ? masaPrevValue / 1000000 : null,
                    cobertura_current: completeness.is_complete && totalBrutoPesos > 0
                        ? (masaValue / totalBrutoPesos) * 100
                        : null,
                    cobertura_prev: previousCompleteness.is_complete && totalBrutoPrevPesos > 0
                        ? (masaPrevValue / totalBrutoPrevPesos) * 100
                        : null,
                    var_nom: salaryComplete && salaryPreviousComplete && masaPrevValue > 0
                        ? ((masaValue / masaPrevValue) - 1) * 100
                        : null,
                    var_real: vRealMasa !== null ? vRealMasa * 100 : null,
                    diff_nom: salaryComplete && salaryPreviousComplete
                        ? (masaValue - masaPrevValue) / 1000000
                        : null,
                    ...ipcMeta,
                    is_complete: salaryComplete,
                },
                distribucion_municipal: {
                    ...muniKpi
                }
            },
            charts: {
                daily: dailyChart,
                copa_vs_salario: {
                    labels: Array.from({length: cumulativeCopa.length}, (_, i) => String(i + 1)),
                    cumulative_copa: cumulativeCopa,
                    cumulative_rop: cumulativeRop,
                    cumulative_neta: cumulativeCopa.map((v, i) =>
                        v !== null && cumulativeRop[i] !== null ? v + cumulativeRop[i] : null),
                    cumulative_esperada: salarioTarget,
                    salario_target: salarioTarget,
                    copa_label,
                    salario_label: salario_label_month,
                    salario_line_label,
                    rop_dia_imputacion: maxDayCurr,
                    chart_last_day: chartLastDay,
                    chart_dias_mes: totalDaysInMonth,
                    is_complete: completeness.is_complete,
                    periodo_incompleto: !completeness.is_complete,
                    masa_objetivo_es_fallback,
                }
            }
        };
    });

    return { meta: { default_period_id: defaultId, available_periods }, data };
}

module.exports = { loadMonthlyDashboard };
