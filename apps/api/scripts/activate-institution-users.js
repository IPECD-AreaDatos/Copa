const path = require('node:path');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const jwt = require('jsonwebtoken');
const db = require('../db');
const { jwtSecret } = require('../services/auth-config');

// Run on the deployment host, after both updated services are healthy.
// Passwords stay on the machine that provisioned the accounts.
const profiles = [
    { username: 'ministerio_salud', code: 4 },
    { username: 'ministerio_educacion', code: 3 },
];
const api = 'http://127.0.0.1:4000';
const web = 'http://127.0.0.1:3006';
const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

async function request(base, route, token, expected) {
    const result = await fetch(`${base}${route}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(20000),
    });
    assert.equal(result.status, expected, `${route}: HTTP inesperado`);
    return result;
}

async function main() {
    const activate = process.argv.includes('--activate');
    const health = await request(api, '/api/health', null, 200);
    assert.equal((await health.json()).institution_access, true);
    await request(web, '/copa/login', null, 200);
    const verified = [];
    const client = await db.pool.connect();
    try {
        // First validate the exact accounts; never alter an existing global user.
        for (const profile of profiles) {
            const result = await client.query('SELECT id_usuario, activo, gastos_jurisdicciones FROM public.usuarios_tableros WHERE username = $1', [profile.username]);
            if (!result.rows.length) continue;
            const user = result.rows[0];
            assert.deepEqual(user.gastos_jurisdicciones, [profile.code], `${profile.username}: institución inesperada`);
            if (!user.activo && !activate) {
                console.log(`${profile.username}: preparada, pendiente de activación explícita.`);
                continue;
            }
            verified.push({ ...profile, id: user.id_usuario, wasActive: user.activo });
        }
        for (const user of verified) {
            if (!user.wasActive) await client.query('UPDATE public.usuarios_tableros SET activo = true WHERE id_usuario = $1', [user.id]);
        }
        for (const user of verified) {
            const token = jwt.sign({ id: user.id }, jwtSecret(), { expiresIn: '2m' });
            const session = await (await request(api, '/api/auth/me', token, 200)).json();
            assert.equal(session.user.username, user.username);
            assert.equal(session.user.access.scope, 'institution');
            assert.deepEqual(session.user.access.jurisdictions.map((j) => j.code), [user.code]);
            const rows = await (await request(api, '/api/gastos/all-data', token, 200)).json();
            assert.ok(rows.length > 0);
            assert.ok(rows.every((r) => normalize(r.jurisdiccion) === normalize(session.user.access.jurisdictions[0].name)));
            const detail = await (await request(web, '/copa/copa-api/api/gastos/desagregados?anio=2026&mesDesde=1&mesHasta=6&fuente=10', token, 200)).json();
            assert.deepEqual(detail.meta.available.jurisdicciones.map((j) => j.codigo), [user.code]);
            assert.ok(detail.total > 0);
            assert.ok(detail.jurisdiccion_subpartidas.every((r) => r.jurisdiccion.codigo === user.code));
            for (const delta of Object.values(detail.controles)) assert.ok(Math.abs(delta) < 0.01);
            for (const route of [
                `/api/gastos/desagregados?jurisdiccion=${user.code === 4 ? 3 : 4}`,
                '/api/gastos/desagregados?jurisdiccion=3,4', '/api/gastos/desagregados/excel/1-1',
                '/api/dashboard/home', '/api/dashboard/monthly', '/api/data/gasto_data.json',
                '/api/ron/annual-monitor', '/api/personal/masa-salarial', '/api/admin/usage',
            ]) await request(api, route, token, 403);
            for (const name of ['gasto_data.json', 'data_personal_v1.json', '_data_ipce_v1.json']) {
                await request(web, `/copa/data/${name}`, token, 403);
                await request(web, `/copa/data/${name}`, null, 403);
            }
            console.log(`${user.username}: ingreso habilitado, datos propios verificados, otras instituciones bloqueadas.`);
        }
        if (!verified.length) console.log('No hay cuentas institucionales de prueba para activar.');
    } catch (error) {
        // Restore the original account state if any boundary fails verification.
        for (const user of verified) {
            if (!user.wasActive) await client.query('UPDATE public.usuarios_tableros SET activo = $2 WHERE id_usuario = $1', [user.id, user.wasActive]);
        }
        throw error;
    } finally { client.release(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.pool.end());
