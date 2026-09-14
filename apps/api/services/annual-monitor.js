const { getAnnualBudget } = require('./budget-resolver');

const FIRST_LIVE_YEAR = 2025;
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SOURCES = Object.freeze({
    ron: 'copa_recursos_origen_nacional',
    rop: 'copa_reca_rop',
    masa_salarial: "copa_gastos: ORDENADO, GAST% EN PERSONAL%, tipo_financ IN (10, 14)",
    presupuesto: 'apps/api/data/presupuesto.json (misma fuente del mensual)',
    ipc: 'Mismo resolver mensual: IPC oficial / REM publicado por BCRA',
    historico: '_data_ipce_v1.json: años anteriores a 2025 sin cobertura en la base',
});

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const sum = (values) => values.length && values.every(isNumber)
    ? values.reduce((total, value) => total + value, 0) : null;
const difference = (current, previous) => isNumber(current) && isNumber(previous) ? current - previous : null;
const percentage = (current, previous) => isNumber(current) && previous > 0 ? (current / previous - 1) * 100 : null;
const coverage = (salary, ron, rop) => {
    const resources = sum([ron, rop]);
    return isNumber(salary) && resources > 0 ? salary / resources * 100 : null;
};

function annualInflation(rows) {
    const indicators = rows.map((row) => row?.kpi?.recaudacion);
    const rates = indicators.map((item) => item?.ipc_missing ? null : item?.ipc_used_for_calc);
    const total = sum(rates);
    const projected = indicators.some((item) => item?.ipc_projected);
    return {
        ipc_used_for_calc: total === null ? null : total / rates.length,
        ipc_missing: total === null,
        ipc_projected: total !== null && projected,
        ipc_source: total === null ? 'unavailable' : projected ? 'rem_bcra' : 'official',
        ipc_rem_published_at: total === null ? null : indicators.find((item) => item?.ipc_projected)?.ipc_rem_published_at ?? null,
    };
}

function comparison(current, previous, inflation) {
    const adjustedPrevious = isNumber(previous) && !inflation.ipc_missing
        ? previous * (1 + inflation.ipc_used_for_calc / 100) : null;
    return {
        current, prev: previous,
        diff_nom: difference(current, previous),
        var_nom: percentage(current, previous),
        diff_real: difference(current, adjustedPrevious),
        var_real: percentage(current, adjustedPrevious),
        is_complete: isNumber(current),
        ...inflation,
    };
}

function buildAnnualMonitor(monthly, historical, { now = new Date(), budgetForYear = getAnnualBudget } = {}) {
    // Nunca rescata importes del snapshot de 2025 en adelante.
    const data = Object.fromEntries(Object.entries(historical.data)
        .filter(([year]) => Number(year) < FIRST_LIVE_YEAR)
        .map(([year, row]) => [year, structuredClone(row)]));
    const years = [...new Set(monthly.meta.available_periods.map((period) => period.year))]
        .filter((year) => year >= FIRST_LIVE_YEAR);

    for (const year of years) {
        const allRows = MONTHS.map((_, index) => monthly.data[`${year}-${String(index + 1).padStart(2, '0')}`]);
        // Mismo criterio de RON completo que el mensual; no suma el mes en carga.
        const maxMonth = allRows.reduce((last, row, index) =>
            row?.completeness?.variables?.ron?.is_complete ? index + 1 : last, 0);
        const rows = allRows.slice(0, maxMonth);
        const sumField = (section, field) => sum(rows.map((row) => row?.kpi?.[section]?.[field]));
        const inflation = annualInflation(rows);
        const ron = comparison(sumField('recaudacion', 'current'), sumField('recaudacion', 'prev'), inflation);
        for (const field of ['bruta_current', 'bruta_prev', 'neta_current', 'neta_prev']) {
            ron[field] = sumField('recaudacion', field);
        }
        const rop = comparison(sumField('rop', 'disponible_current'), sumField('rop', 'disponible_prev'), inflation);
        Object.assign(rop, {
            disponible_current: rop.current, disponible_prev: rop.prev,
            bruta_current: sumField('rop', 'bruta_current'), bruta_prev: sumField('rop', 'bruta_prev'),
        });
        const municipal = comparison(sumField('distribucion_municipal', 'current'), sumField('distribucion_municipal', 'prev'), inflation);
        for (const field of ['nacion_current', 'nacion_prev', 'provincia_current', 'provincia_prev']) {
            municipal[field] = sumField('distribucion_municipal', field);
        }

        let salaryPrevious = sumField('masa_salarial', 'prev');
        let previousSalarySource = 'monthly';
        const previousHistorical = historical.data[String(year - 1)];
        // La base no tiene salarios de 2024: conserva el histórico sólo si coincide
        // exactamente el corte, sin prorratear ni inventar meses.
        if (salaryPrevious === null && year - 1 < FIRST_LIVE_YEAR
            && maxMonth > 0 && maxMonth === previousHistorical?.kpi?.meta?.max_month
            && isNumber(previousHistorical?.kpi?.masa_salarial?.current)) {
            salaryPrevious = previousHistorical.kpi.masa_salarial.current;
            previousSalarySource = 'historical';
        }
        const salary = comparison(sumField('masa_salarial', 'current'), salaryPrevious, inflation);
        Object.assign(salary, {
            cobertura_current: coverage(salary.current, ron.bruta_current, rop.bruta_current),
            cobertura_prev: coverage(salary.prev, ron.bruta_prev, rop.bruta_prev),
            is_incomplete: salary.current === null,
            previous_source: previousSalarySource,
        });

        const budget = maxMonth > 0 ? budgetForYear(year, maxMonth) : null;
        ron.esperada = budget?.ron ?? null;
        ron.brecha_abs = difference(ron.bruta_current, ron.esperada);
        ron.brecha_pct = percentage(ron.bruta_current, ron.esperada);
        rop.esperada_prov = budget?.rop ?? null;
        rop.brecha_abs_prov = difference(rop.bruta_current, rop.esperada_prov);
        rop.brecha_pct_prov = percentage(rop.bruta_current, rop.esperada_prov);

        const series = (section, field) => MONTHS.map((_, index) =>
            index < maxMonth ? allRows[index]?.kpi?.[section]?.[field] ?? null : null);
        const cumulative = (values) => values.map((_, index) =>
            index < maxMonth ? sum(values.slice(0, index + 1)) : null);
        const isComplete = maxMonth === 12 && rows.every((row) => row?.completeness?.is_complete);
        data[String(year)] = {
            kpi: {
                meta: {
                    periodo: `Año ${year}${isComplete ? '' : ' (YTD)'}`,
                    max_month: maxMonth, is_complete: isComplete, source: 'monthly',
                    budget_through_month: budget?.throughMonth ?? maxMonth,
                },
                recaudacion: ron, rop, distribucion_municipal: municipal, masa_salarial: salary,
                resumen: {
                    total_disponible_current: sum([ron.current, rop.current]),
                    total_disponible_prev: sum([ron.prev, rop.prev]),
                    post_sueldos_current: difference(sum([ron.current, rop.current]), salary.current),
                    post_sueldos_prev: difference(sum([ron.prev, rop.prev]), salary.prev),
                    ron_disponible: ron.current, rop_disponible: rop.current,
                },
            },
            charts: {
                monthly: { labels: MONTHS, data_curr: series('recaudacion', 'current'), data_prev: series('recaudacion', 'prev') },
                copa_vs_salario: {
                    labels: MONTHS,
                    cumulative_copa: cumulative(series('recaudacion', 'current')),
                    cumulative_bruta: cumulative(series('recaudacion', 'bruta_current')),
                    salario_target: cumulative(series('masa_salarial', 'current')),
                    cumulative_esperada: MONTHS.map((_, index) =>
                        index < maxMonth ? budgetForYear(year, index + 1)?.ron ?? null : null),
                    // Incluye el último mes completo aunque el año siga abierto.
                    through_month: maxMonth,
                },
            },
        };
    }

    const available_periods = Object.keys(data).sort((a, b) => Number(b) - Number(a)).map((id) => ({
        id, label: id, year: Number(id), incomplete: !data[id].kpi.meta.is_complete,
    }));
    const defaultPeriod = available_periods.find((period) => data[period.id].kpi.meta.max_month > 0);
    return {
        meta: {
            default_period_id: defaultPeriod?.id ?? available_periods[0]?.id ?? null,
            available_periods, generated_at: now.toISOString(), sources: SOURCES,
        },
        data,
    };
}

module.exports = { buildAnnualMonitor };
