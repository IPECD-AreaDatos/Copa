const test = require('node:test');
const assert = require('node:assert/strict');
const { latestCompletePeriod } = require('../services/gasto-periodo');
const { buildEconomicPosition } = require('../services/gasto-posicion');
const { buildFilters, buildWhere, buildJurisdictionSubpartidaRows } = require('../services/gasto-desagregado');
const { buildMinisterialAnalysis } = require('../services/gasto-ministerial');
const { canAccessEconomicPosition } = require('../services/gasto-economic-access');

const counts = (anio, mes, count) => ['Comprometido', 'Ordenado', 'Cred Vig'].map((tipo_de_g) => ({ anio, mes, tipo_de_g, row_count: count }));
test('abre enero–octubre; ignora noviembre en curso sin confundir menos movimientos con falta de carga', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const rows = [...counts(2026, 9, 100), ...counts(2026, 10, 95), ...counts(2026, 11, 100)];
    assert.deepEqual(latestCompletePeriod(rows, now), { anio: 2026, mesDesde: 1, mesHasta: 10, periodo: '2026-10' });
    assert.equal(latestCompletePeriod([...counts(2026, 9, 100), ...counts(2026, 10, 30)], now).mesHasta, 10);
    assert.equal(latestCompletePeriod([...counts(2026, 9, 100), ...counts(2026, 10, 30).filter((r) => r.tipo_de_g !== 'Ordenado')], now).mesHasta, 9);
    assert.equal(latestCompletePeriod([], now), null);
});
test('el cambio de año y el huso argentino no abren un mes todavía en curso', () => {
    const rows = [...counts(2025, 12, 100), ...counts(2026, 1, 100)];
    assert.equal(latestCompletePeriod(rows, new Date('2026-01-01T01:00:00Z')), null);
    assert.equal(latestCompletePeriod(rows, new Date('2026-01-02T12:00:00Z')).anio, 2025);
    assert.equal(latestCompletePeriod(rows, new Date('2026-02-01T12:00:00Z')).anio, 2026);
});
test('varias fuentes se combinan en SQL sin duplicarlas ni alterar los filtros restantes', () => {
    const filters = buildFilters({ fuente: '10,11,10', jurisdiccion: '4', partid: '200,300' });
    assert.deepEqual(filters.fuentes, [10, 11]);
    assert.deepEqual(buildWhere(filters).params.slice(3, 6), [[10, 11], [4], [200, 300]]);
});
test('la matriz agrupa los tres rubros en Otros y 421/423 suman una vez por jurisdicción', () => {
    const rows = buildJurisdictionSubpartidaRows([
        { jurisdiccion: 4, partid: 400, sub_partid: 421, total: 100 },
        { jurisdiccion: 4, partid: 400, sub_partid: 423, total: 20 },
        { jurisdiccion: 6, partid: 400, sub_partid: 423, total: 30 },
        { jurisdiccion: 4, partid: 500, sub_partid: 533, total: 40 },
        { jurisdiccion: 4, partid: 700, sub_partid: 711, total: 50 },
        { jurisdiccion: 4, partid: 900, sub_partid: 911, total: 60 },
    ]);
    const result = buildMinisterialAnalysis(rows).all;
    assert.equal(result.matrix.find((r) => r.id === '4').rubros.otros, 150);
    assert.equal(Object.keys(result.labels).length, 6);
    assert.equal(Object.values(result.matrix[0].rubros).reduce((n, v) => n + v, 0), result.matrix[0].total);
    const account = result.accounts.find((r) => r.id === '421+423');
    assert.equal(account.total, 150);
    assert.deepEqual(account.rows.map((r) => [r.id, r.total]), [['4', 120], ['6', 30]]);
    assert.ok(!result.accounts.some((r) => ['421', '423'].includes(r.id)));
});
test('posición económica usa ingresos brutos sin aplicarles el filtro del gasto', () => {
    const filters = buildFilters({ anio: 2026, mesDesde: 1, mesHasta: 2, fuente: '11', jurisdiccion: '4' });
    const result = buildEconomicPosition(filters, [{ mes: 1, total: 20 }, { mes: 2, total: 30 }],
        [{ anio: 2026, mes: 1, ron_bruto: 100 }, { anio: 2026, mes: 2, ron_bruto: 110 }],
        [{ anio: 2026, mes: 1, rop_bruta: 10 }, { anio: 2026, mes: 2, rop_bruta: 20 }], new Date('2026-11-06T12:00:00Z'));
    assert.deepEqual(result.totals, { ingresos: 240, gastos: 50, diferencia: 190 });
    assert.deepEqual(result.selected.fuentes, [11]);
});
test('ingresos ausentes, parciales y meses en curso no se convierten en cero ni saldo', () => {
    const filters = buildFilters({ mesDesde: 1, mesHasta: 2 });
    const result = buildEconomicPosition(filters, [{ mes: 1, total: 0 }, { mes: 2, total: 20 }],
        [{ anio: 2026, mes: 1, ron_bruto: 100 }, { anio: 2026, mes: 2, ron_bruto: 100 }],
        [{ anio: 2026, mes: 1, rop_bruta: 10 }], new Date('2026-11-06T12:00:00Z'));
    assert.equal(result.monthly[0].gastos, 0);
    assert.equal(result.monthly[1].rop, null);
    assert.equal(result.monthly[1].ingresos, null);
    assert.equal(result.monthly[1].diferencia, null);
    assert.deepEqual(result.totals, { ingresos: null, gastos: 20, diferencia: null });
});
test('posición económica queda reservada al rol administrador con alcance global', () => {
    const global = { scope: 'global', jurisdictions: [] };
    for (const origen of ['central', 'central-ensayo']) {
        assert.equal(canAccessEconomicPosition({ username: 'admin', role: 'admin', origen, access: global }), true);
        assert.equal(canAccessEconomicPosition({ username: 'otro-admin', role: 'admin', origen, access: global }), true);
    }
    for (const user of [null, {}, { username: 'admin' }, { username: 'admin', role: 'user', access: global },
        { username: 'gcorrales', access: global },
        { username: 'irodriguez', role: 'editor', origen: 'central-ensayo', access: global },
        { username: 'irodriguez', role: 'lector', origen: 'central-ensayo', access: global },
        { username: 'admin', role: 'admin', origen: 'central-ensayo', access: { scope: 'institution', jurisdictions: [{ code: 4 }] } }]) {
        assert.equal(canAccessEconomicPosition(user), false);
    }
});

test('la comparación y su catálogo aplican el mismo permiso antes de consultar datos', () => {
    const router = require('../routes/gastos');
    const global = { scope: 'global', jurisdictions: [] };
    const institution = { scope: 'institution', jurisdictions: [{ code: 4 }] };
    for (const path of ['/desagregados/posicion-economica', '/desagregados/posicion-economica/filtros']) {
        const guard = router.stack.find((layer) => layer.route?.path === path).route.stack.at(-2).handle;
        for (const user of [
            { username: 'admin', role: 'user', origen: 'central', access: global },
            { username: 'analista-central', role: 'analyst', origen: 'central', access: global },
            { username: 'salud', role: 'user', origen: 'central', access: institution },
        ]) {
            let status;
            guard({ user }, {
                status(code) { status = code; return this; }, json() {},
            }, () => assert.fail(`Acceso inesperado a ${path}`));
            assert.equal(status, 403);
        }
        let authorized = false;
        guard({ user: { username: 'otro-admin', role: 'admin', origen: 'central', access: global } }, {}, () => { authorized = true; });
        assert.ok(authorized);
    }
});
