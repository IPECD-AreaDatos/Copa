const { resolveVariableCompleteness } = require('./completeness-resolver');
const { currentPeriod } = require('./gasto-periodo');

function buildEconomicPosition(filters, expenseRows, ronRows, ropRows, now = new Date()) {
    const id = (r) => `${r.anio}-${String(r.mes).padStart(2, '0')}`;
    const ron = Object.fromEntries(ronRows.map((r) => [id(r), r.ron_bruto === null ? null : Number(r.ron_bruto)]));
    const rop = Object.fromEntries(ropRows.map((r) => [id(r), r.rop_bruta === null ? null : Number(r.rop_bruta)]));
    const expenses = new Map(expenseRows.map((r) => [Number(r.mes), Number(r.total)]));
    const monthly = Array.from({ length: filters.mesHasta - filters.mesDesde + 1 }, (_, i) => {
        const mes = filters.mesDesde + i;
        const period = id({ anio: filters.anio, mes });
        const complete = period < currentPeriod(now)
            && [ron, rop].every((values) => values[period] !== null
                && resolveVariableCompleteness(period, values).isComplete);
        const ingresos = complete ? ron[period] + rop[period] : null;
        const gastos = expenses.get(mes) ?? null;
        return { mes, ron: ron[period] ?? null, rop: rop[period] ?? null,
            ingresos, gastos, ingresos_completos: complete,
            diferencia: ingresos === null || gastos === null ? null : ingresos - gastos };
    });
    const total = (key) => monthly.every((r) => r[key] !== null)
        ? monthly.reduce((n, r) => n + r[key], 0) : null;
    return {
        selected: filters, monthly,
        totals: { ingresos: total('ingresos'), gastos: total('gastos'), diferencia: total('diferencia') },
        sources: ['copa_recursos_origen_nacional.total_general', 'copa_reca_rop', 'copa_gastos_fte'],
        income_scope: 'RON + ROP brutos de toda la provincia, sin descontar coparticipación municipal. Los filtros de fuente, jurisdicción y partida se aplican al gasto.',
    };
}

module.exports = { buildEconomicPosition };
