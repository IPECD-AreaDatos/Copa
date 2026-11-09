// Comprobaciones de sólo lectura sobre la base configurada.
// RUN_GASTO_DB_TESTS=1 node --test tests/gasto-mejoras.integration.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const enabled = process.env.RUN_GASTO_DB_TESTS === '1';
test('nuevos cortes del tablero concilian con datos vivos', { skip: !enabled }, async (t) => {
    const db = require('../db');
    const router = require('../routes/gastos');
    const { currentPeriod } = require('../services/gasto-periodo');
    const { ROP_AMOUNT_SQL } = require('../services/rop-source');
    const invoke = (path, query = {}, access = { scope: 'global', jurisdictions: [] }) => new Promise((resolve, reject) => {
        const handler = router.stack.find((layer) => layer.route?.path === path).route.stack.at(-1).handle;
        handler({ query, user: { username: 'admin', access } }, { json: resolve, status: (status) => ({ json: (payload) => reject(new Error(`${status}: ${JSON.stringify(payload)}`)) }) });
    });
    try {
        const period = await invoke('/desagregados/periodo-predeterminado');
        assert.equal(period.mesDesde, 1);
        assert.ok(period.periodo < currentPeriod());
        const query = { anio: period.anio, mesDesde: 1, mesHasta: period.mesHasta, estado: 'Comprometido', jurisdiccion: '4' };
        let combined;
        await t.test('fuentes múltiples y desglose mensual por organismo suman exactamente el mismo universo', async () => {
            combined = await invoke('/desagregados', { ...query, fuente: '10,11' });
            const singles = await Promise.all([10, 11].map((fuente) => invoke('/desagregados', { ...query, fuente })));
            assert.ok(Math.abs(combined.total - singles.reduce((sum, r) => sum + r.total, 0)) < 0.01);
            assert.ok(Math.abs(combined.total - combined.monthly_jurisdicciones_rubros.reduce((sum, r) => sum + r.total, 0)) < 0.01);
            assert.ok(combined.monthly_jurisdicciones_rubros.every((r) => r.codigo === 4));
            const direct = await db.query(`SELECT mes, SUM(val)::numeric AS total FROM copa_gastos_fte
                WHERE anio=$1 AND mes BETWEEN 1 AND $2 AND jurisdiccion=4 AND codigo_fuente IN (10,11)
                AND tipo_de_g='Comprometido' AND partid IN (200,300) GROUP BY mes ORDER BY mes`, [period.anio, period.mesHasta]);
            for (const r of direct.rows) {
                const actual = combined.monthly_jurisdicciones_rubros.find((m) => m.mes === r.mes && m.rubro.codigo === 'bienes_servicios');
                assert.ok(Math.abs(actual.total - Number(r.total)) < 0.01);
            }
        });
        await t.test('421 y 423 mantienen el subtotal de SQL en una sola cuenta', async () => {
            const account = combined.ministerial_analysis.all.accounts.find((a) => a.id === '421+423');
            const direct = await db.query(`SELECT SUM(val)::numeric AS total FROM copa_gastos_fte
                WHERE anio=$1 AND mes BETWEEN 1 AND $2 AND jurisdiccion=4 AND codigo_fuente IN (10,11)
                AND tipo_de_g='Comprometido' AND partid=400 AND sub_partid IN (421,423)`, [period.anio, period.mesHasta]);
            assert.ok(Math.abs((account?.total ?? 0) - Number(direct.rows[0].total ?? 0)) < 0.01);
            for (const row of combined.ministerial_analysis.all.matrix) assert.ok(Math.abs(Object.values(row.rubros).reduce((n, v) => n + v, 0) - row.total) < 0.01);
        });
        await t.test('RON y ROP brutos concilian mensualmente con SQL, sin transformar faltantes', async () => {
            const position = await invoke('/desagregados/posicion-economica', { ...query, fuente: '10,11' });
            const [ron, rop] = await Promise.all([
                db.query(`SELECT EXTRACT(MONTH FROM fecha)::int AS mes, SUM(total_general)::numeric AS total
                    FROM copa_recursos_origen_nacional WHERE EXTRACT(YEAR FROM fecha)=$1 GROUP BY 1`, [period.anio]),
                db.query(`SELECT mes, SUM(${ROP_AMOUNT_SQL})::numeric AS total FROM copa_reca_rop WHERE anio=$1 GROUP BY mes`, [period.anio]),
            ]);
            for (const month of position.monthly) {
                const ronDirect = ron.rows.find((r) => r.mes === month.mes)?.total;
                const ropDirect = rop.rows.find((r) => Number(r.mes) === month.mes)?.total;
                assert.equal(month.ron, ronDirect === undefined ? null : Number(ronDirect));
                if (ropDirect === undefined) assert.equal(month.rop, null);
                else assert.ok(Math.abs(month.rop - Number(ropDirect)) < 0.01);
                if (month.ingresos_completos) assert.ok(Math.abs(month.ingresos - month.ron - month.rop) < 0.01);
                else assert.equal(month.diferencia, null);
            }
            assert.ok(Math.abs(position.totals.gastos - combined.total) < 0.01);
        });
        await t.test('el corte inicial y la consulta de Salud mantienen el alcance institucional', async () => {
            const access = { scope: 'institution', jurisdictions: [{ code: 4, name: 'Salud' }] };
            const institutionPeriod = await invoke('/desagregados/periodo-predeterminado', {}, access);
            assert.ok(institutionPeriod.periodo < currentPeriod());
            assert.equal(institutionPeriod.periodo, period.periodo);
            const response = await invoke('/desagregados', { ...query, fuente: '10,11', jurisdiccion: undefined }, access);
            assert.ok(response.meta.available.jurisdicciones.every((j) => j.codigo === 4));
            assert.ok(response.monthly_jurisdicciones_rubros.every((j) => j.codigo === 4));
            assert.ok(Math.abs(response.total - combined.total) < 0.01);
        });
    } finally { await db.pool.end(); }
});
