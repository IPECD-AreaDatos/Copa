// RUN_INSTITUTION_DB_TESTS=1 node --test tests/institution-access.integration.test.js
// Reads real source rows; does not create sessions, users, or modify data.
const test = require('node:test');
const assert = require('node:assert/strict');

test('Salud y Educación: cada respuesta concilia contra SQL de su institución', {
    skip: process.env.RUN_INSTITUTION_DB_TESTS !== '1',
}, async (t) => {
    const db = require('../db');
    const router = require('../routes/gastos');
    const { publicUser } = require('../services/user-access');
    const { buildWhere } = require('../services/gasto-desagregado');
    const invoke = async (path, user, query = {}) => {
        const handler = router.stack.find((layer) => layer.route?.path === path).route.stack.at(-1).handle;
        let body;
        const res = { status(code) { throw new Error(`HTTP ${code}`); }, json(result) { body = result; }, setHeader() {} };
        await handler({ user, query }, res);
        return body;
    };
    try {
        for (const code of [4, 3]) {
            await t.test(`institución ${code}`, async () => {
                const user = publicUser({ id_usuario: -1, username: 'integration', activo: true, tablero_acceso: 'coparticipacion', gastos_jurisdicciones: [code] });
                const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                const expectedName = normalize(user.access.jurisdictions[0].name);
                const rows = await invoke('/all-data', user);
                assert.ok(rows.length > 0);
                assert.ok(rows.every((row) => normalize(row.jurisdiccion) === expectedName));
                const options = await invoke('/filtros', user);
                assert.deepEqual(options.jurisdicciones.map(normalize), [expectedName]);
                const summary = await invoke('/resumen', user);
                assert.ok(summary.length > 0);
                assert.ok(summary.every((row) => normalize(row.jurisdiccion) === expectedName));
                const completeness = await invoke('/completeness', user);
                assert.ok(Object.keys(completeness.periods).length > 0);
                for (const estado of ['Comprometido', 'Cred Vig']) {
                    const data = await invoke('/desagregados', user, { anio: '2026', mesDesde: '1', mesHasta: '6', estado, fuente: '10' });
                    assert.deepEqual(data.meta.selected.jurisdicciones, [code]);
                    assert.deepEqual(data.meta.available.jurisdicciones.map((j) => j.codigo), [code]);
                    assert.ok(data.jurisdicciones.every((j) => j.codigo === code));
                    assert.ok(data.jurisdiccion_subpartidas.every((j) => j.jurisdiccion.codigo === code));
                    assert.ok(data.modificaciones_presupuestarias.every((j) => j.codigo === code));
                    assert.ok(data.ministerial_analysis.all.matrix.every((j) => Number(j.id) === code));
                    assert.ok(data.ministerial_analysis.referenceJurisdictions.every((j) => j === code));
                    const where = buildWhere(data.meta.selected);
                    const direct = await db.query(`SELECT SUM(val) AS total FROM copa_gastos_fte WHERE ${where.text}`, where.params);
                    assert.ok(data.total > 0);
                    assert.ok(Math.abs(data.total - Number(direct.rows[0].total)) < 0.01);
                    for (const delta of Object.values(data.controles)) assert.ok(Math.abs(delta) < 0.01);
                    assert.ok(Math.abs(data.ministerial_analysis.all.total - data.total) < 0.01);
                }
            });
        }
    } finally { await db.pool.end(); }
});
