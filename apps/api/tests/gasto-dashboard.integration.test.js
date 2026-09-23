// Opt-in, read-only checks against the configured database. No users/tokens are created.
// RUN_GASTO_DB_TESTS=1 node --test tests/gasto-dashboard.integration.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const enabled = process.env.RUN_GASTO_DB_TESTS === '1';
test('contrato del tablero y conciliación directa con SQL en seis cortes', { skip: !enabled }, async (t) => {
    const router = require('../routes/gastos');
    const db = require('../db');
    const { buildWhere } = require('../services/gasto-desagregado');
    const invoke = (query) => new Promise((resolve, reject) => {
        const handler = router.stack.find((r) => r.route?.path === '/desagregados').route.stack.at(-1).handle;
        handler({ query }, { json: resolve, status: (status) => ({ json: (data) => reject(new Error(`${status}: ${JSON.stringify(data)}`)) }) });
    });
    try {
        const base = { anio: '2026', mesDesde: '1', mesHasta: '6', fuente: '10', estado: 'Comprometido' };
        for (const query of [base, { ...base, anio: '2025' }, { ...base, fuente: '11' }, { ...base, fuente: undefined }, { ...base, estado: 'Cred Vig' }, { ...base, anio: '2024' }]) {
            await t.test(JSON.stringify(query), async () => {
                const response = await invoke(query);
                assert.equal('excel_analysis' in response, false);
                assert.equal('excel_reference' in response, false);
                assert.equal('excel_inventory' in response, false);
                for (const v of Object.values(response.controles)) assert.ok(Math.abs(v) < 0.01);
                const where = buildWhere(response.meta.selected);
                const direct = await db.query(`SELECT COALESCE(SUM(val), 0)::numeric AS total FROM copa_gastos_fte WHERE ${where.text}`, where.params);
                assert.ok(Math.abs(Number(direct.rows[0].total) - response.total) < 0.01);
                assert.ok(Math.abs(response.ministerial_analysis.all.total - response.total) < 0.01);
                const rubroTotal = (code) => response.rubros.find((row) => row.codigo === code)?.total || 0;
                const accountTotal = (matches) => response.subpartidas.filter(matches).reduce((sum, row) => sum + row.total, 0);
                assert.ok(Math.abs(accountTotal((row) => [200, 300].includes(row.partida.codigo)) - rubroTotal('bienes_servicios')) < 0.01);
                assert.ok(Math.abs(accountTotal((row) => row.partida.codigo === 500 && ![571, 587].includes(row.codigo)) - rubroTotal('transferencias') - rubroTotal('seguridad_social')) < 0.01);
                assert.ok(Math.abs(accountTotal((row) => row.partida.codigo === 500 && [571, 587].includes(row.codigo)) - rubroTotal('coparticipacion')) < 0.01);
                if (response.meta.is_snapshot) {
                    assert.equal(response.meta.snapshot_month, 6);
                }
                if (query.anio === '2024') {
                    assert.equal(response.total, 0);
                    assert.equal(response.jurisdiccion_subpartidas.length, 0);
                }
                for (const r of response.modificaciones_presupuestarias) {
                    if (r.modificacion !== null) assert.ok(Math.abs(r.modificacion - (r.vigente - r.original)) < 0.01);
                    assert.ok(r.mes >= Number(query.mesDesde) && r.mes <= Number(query.mesHasta));
                }
            });
        }
        await t.test('los 29 originales se sirven íntegros; un identificador inválido falla cerrado', async () => {
            const handler = router.stack.find((r) => r.route?.path === '/desagregados/excel/:id').route.stack.at(-1).handle;
            const { archive } = require('../services/gasto-excel-analysis');
            for (const source of archive.books.flatMap((b) => b.sheets)) {
                let result;
                handler({ params: { id: source.id } }, { json: (r) => { result = r; } });
                assert.deepEqual(result, source);
            }
            let status;
            handler({ params: { id: '../unknown' } }, { status: (s) => { status = s; return { json: () => {} }; } });
            assert.equal(status, 404);
        });
        await t.test('Salud: 200 + 300 suma ambos capítulos y mantiene opciones para ampliar la selección', async () => {
            const cut = { ...base, jurisdiccion: '4' };
            const single200 = await invoke({ ...cut, partid: '200' });
            const single300 = await invoke({ ...cut, partid: '300' });
            const combined = await invoke({ ...cut, partid: '200,300' });
            const extended = await invoke({ ...cut, partid: '200,300,400' });
            const single400 = await invoke({ ...cut, partid: '400' });
            assert.deepEqual(combined.meta.selected.partidas, [200, 300]);
            assert.ok(Math.abs(combined.total - single200.total - single300.total) < 0.01);
            assert.ok(Math.abs(extended.total - combined.total - single400.total) < 0.01);
            assert.ok(combined.jurisdiccion_subpartidas.every((r) => r.jurisdiccion.codigo === 4 && [200, 300].includes(r.partida.codigo)));
            assert.ok(combined.modificaciones_presupuestarias.every((r) => r.codigo === 4));
            assert.deepEqual(combined.meta.available.partidas, single200.meta.available.partidas);
            assert.ok(single200.meta.available.partidas.some((p) => p.codigo === 300));
            assert.ok(combined.meta.available.partidas.some((p) => p.codigo === 400));
            for (const response of [combined, extended]) {
                for (const difference of Object.values(response.controles)) assert.ok(Math.abs(difference) < 0.01);
                assert.ok(Math.abs(response.monthly.reduce((n, r) => n + r.total, 0) - response.total) < 0.01);
                assert.ok(Math.abs(response.ministerial_analysis.all.total - response.total) < 0.01);
            }
        });
    } finally { await db.pool.end(); }
});
