const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualMonitor } = require('../services/annual-monitor');

const historical = { data: {
    '2024': { kpi: { meta: { max_month: 12, is_complete: true }, masa_salarial: { current: 90 } }, charts: { frozen: true } },
    '2026': { kpi: { recaudacion: { current: 999999 } } },
} };
const budgetForYear = (year, throughMonth) => ({ ron: throughMonth * 130, rop: throughMonth * 25, throughMonth });
function snapshot(year = 2026, count = 8) {
    const data = {};
    const available_periods = [];
    for (let month = 1; month <= count; month++) {
        const id = `${year}-${String(month).padStart(2, '0')}`;
        available_periods.push({ id, year, month });
        data[id] = {
            completeness: { is_complete: true, variables: { ron: { is_complete: true } } },
            kpi: {
                recaudacion: { current: 100, prev: 80, bruta_current: 150, bruta_prev: 120, neta_current: 125, neta_prev: 100, ipc_used_for_calc: 10, ipc_source: 'official' },
                rop: { disponible_current: 20, disponible_prev: 16, bruta_current: 25, bruta_prev: 20 },
                distribucion_municipal: { current: 30, prev: 24, nacion_current: 25, nacion_prev: 20, provincia_current: 5, provincia_prev: 4 },
                masa_salarial: { current: 60, prev: 48 },
            },
        };
    }
    return { meta: { available_periods }, data };
}
const build = (monthly) => buildAnnualMonitor(monthly, historical, { budgetForYear });

test('acumula los mismos meses de ambos años y selecciona el año vigente', () => {
    const result = build(snapshot());
    const row = result.data['2026'];
    assert.equal(result.meta.default_period_id, '2026');
    assert.equal(row.kpi.meta.max_month, 8);
    assert.equal(row.kpi.meta.is_complete, false);
    assert.equal(row.kpi.recaudacion.current, 800);
    assert.equal(row.kpi.recaudacion.prev, 640);
    assert.equal(row.kpi.recaudacion.esperada, 1040);
    assert.equal(row.kpi.rop.disponible_current, 160);
    assert.equal(row.kpi.distribucion_municipal.current, 240);
    assert.equal(row.kpi.masa_salarial.current, 480);
    assert.equal(row.kpi.resumen.total_disponible_current, 960);
    assert.equal(row.kpi.resumen.post_sueldos_current, 480);
    assert.equal(row.kpi.recaudacion.brecha_abs, 160);
    assert.equal(row.charts.copa_vs_salario.cumulative_copa[7], 800);
    assert.equal(row.charts.copa_vs_salario.through_month, 8);
    assert.equal(row.charts.monthly.data_curr[8], null);
    assert.equal(row.charts.monthly.data_prev[8], null);
    assert.ok(Math.abs(row.kpi.recaudacion.var_real - (800 / 704 - 1) * 100) < 1e-9);
});

test('consulta nueva incorpora correcciones, meses y años sin usar el snapshot', () => {
    const monthly = snapshot(2027, 1);
    assert.equal(build(monthly).data['2027'].kpi.recaudacion.current, 100);
    monthly.data['2027-01'].kpi.recaudacion.current = 180;
    const result = build(monthly);
    assert.equal(result.data['2027'].kpi.recaudacion.current, 180);
    assert.equal(result.meta.default_period_id, '2027');
    assert.equal(result.data['2026'], undefined);
});

test('excluye el mes que el análisis mensual considera RON incompleto', () => {
    const monthly = snapshot(2026, 9);
    monthly.data['2026-09'].completeness.variables.ron.is_complete = false;
    monthly.data['2026-09'].kpi.recaudacion.current = null;
    assert.equal(build(monthly).data['2026'].kpi.meta.max_month, 8);
    assert.equal(build(monthly).data['2026'].kpi.recaudacion.current, 800);
});

test('una variable faltante no se convierte en cero ni en una suma parcial', () => {
    const monthly = snapshot();
    monthly.data['2026-04'].kpi.masa_salarial.current = null;
    const row = build(monthly).data['2026'];
    assert.equal(row.kpi.masa_salarial.current, null);
    assert.equal(row.kpi.masa_salarial.var_nom, null);
    assert.equal(row.kpi.masa_salarial.var_real, null);
    assert.equal(row.kpi.masa_salarial.cobertura_current, null);
    assert.equal(row.charts.copa_vs_salario.salario_target[7], null);
    assert.equal(row.kpi.recaudacion.current, 800);
});

test('un mes interior ausente invalida acumulados y no se rellena con el JSON viejo', () => {
    const monthly = snapshot();
    delete monthly.data['2026-04'];
    const row = build(monthly).data['2026'];
    assert.equal(row.kpi.recaudacion.current, null);
    assert.equal(row.kpi.recaudacion.prev, null);
    assert.equal(row.kpi.recaudacion.var_nom, null);
});

test('conserva 2022–2024 y rescata salarios previos sin base sólo con igual corte', () => {
    const monthly = snapshot(2025, 12);
    Object.values(monthly.data).forEach((row) => { row.kpi.masa_salarial.prev = null; });
    const result = build(monthly);
    assert.deepEqual(result.data['2024'], historical.data['2024']);
    assert.notEqual(result.data['2024'], historical.data['2024']);
    assert.equal(result.data['2025'].kpi.masa_salarial.prev, 90);
    assert.equal(result.data['2025'].kpi.masa_salarial.previous_source, 'historical');
    const partial = snapshot(2025, 8);
    Object.values(partial.data).forEach((row) => { row.kpi.masa_salarial.prev = null; });
    assert.equal(build(partial).data['2025'].kpi.masa_salarial.prev, null);
});

test('nunca sustituye faltantes de 2025 en adelante con valores estáticos', () => {
    const monthly = snapshot();
    Object.values(monthly.data).forEach((row) => { row.kpi.masa_salarial.prev = null; });
    assert.equal(build(monthly).data['2026'].kpi.masa_salarial.prev, null);
});

test('IPC faltante y proyección REM conservan la procedencia mensual', () => {
    const monthly = snapshot();
    Object.assign(monthly.data['2026-08'].kpi.recaudacion, { ipc_projected: true, ipc_source: 'rem_bcra', ipc_rem_published_at: '2026-09-01' });
    const projected = build(monthly).data['2026'].kpi.recaudacion;
    assert.equal(projected.ipc_projected, true);
    assert.equal(projected.ipc_source, 'rem_bcra');
    assert.equal(projected.ipc_rem_published_at, '2026-09-01');
    monthly.data['2026-07'].kpi.recaudacion.ipc_used_for_calc = null;
    const missing = build(monthly).data['2026'].kpi.recaudacion;
    assert.equal(missing.var_real, null);
    assert.equal(missing.ipc_source, 'unavailable');
    assert.equal(missing.var_nom, 25);
});

test('sin meses completos mantiene null y sin presupuesto no inventa expectativas', () => {
    const monthly = snapshot(2027, 1);
    monthly.data['2027-01'].completeness.variables.ron.is_complete = false;
    const row = build(monthly).data['2027'];
    assert.equal(row.kpi.meta.max_month, 0);
    assert.equal(row.kpi.recaudacion.current, null);
    assert.equal(row.kpi.recaudacion.esperada, null);
    assert.equal(row.kpi.recaudacion.ipc_used_for_calc, null);
    const noBudget = buildAnnualMonitor(snapshot(), historical, { budgetForYear: () => null }).data['2026'];
    assert.equal(noBudget.kpi.recaudacion.esperada, null);
    assert.ok(noBudget.charts.copa_vs_salario.cumulative_esperada.every((value) => value === null));
});
