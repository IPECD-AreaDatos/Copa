const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const bcrypt = require('bcrypt');
const db = require('../db');

const credentialsPath = path.resolve(__dirname, '../.env.institution-users.json');
const profiles = [
    { username: 'ministerio_salud', jurisdiction: 4 },
    { username: 'ministerio_educacion', jurisdiction: 3 },
];

async function main() {
    const activate = process.argv.includes('--activate');
    if (activate) {
        const urlIndex = process.argv.indexOf('--api-url');
        if (urlIndex < 0 || !process.argv[urlIndex + 1]) throw new Error('La activación requiere --api-url de la API actualizada');
        const url = new URL(process.argv[urlIndex + 1]);
        const health = await fetch(new URL(`${url.pathname.replace(/\/$/, '')}/api/health`, url), { signal: AbortSignal.timeout(10000) });
        if (!health.ok || (await health.json()).institution_access !== true) {
            throw new Error('La API indicada aún no aplica permisos por institución');
        }
    }
    const saved = fs.existsSync(credentialsPath) ? JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) : [];
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        for (const profile of profiles) {
            const result = await client.query('SELECT id_usuario, gastos_jurisdicciones FROM public.usuarios_tableros WHERE username = $1 FOR UPDATE', [profile.username]);
            let credential = saved.find((item) => item.username === profile.username);
            if (result.rows.length) {
                const existing = result.rows[0];
                if (!credential || existing.id !== credential.id
                    || JSON.stringify(existing.gastos_jurisdicciones) !== JSON.stringify([profile.jurisdiction])) {
                    throw new Error(`La cuenta ${profile.username} ya existe; no se modificaron sus credenciales`);
                }
                if (activate) await client.query('UPDATE public.usuarios_tableros SET activo = true WHERE id_usuario = $1', [credential.id]);
            } else {
                if (credential) throw new Error(`Las credenciales guardadas de ${profile.username} no coinciden con la base`);
                const password = crypto.randomBytes(18).toString('base64url');
                const hash = await bcrypt.hash(password, 12);
                const inserted = await client.query(`
                    INSERT INTO public.usuarios_tableros (username, password_hash, tablero_acceso, activo, gastos_jurisdicciones)
                    VALUES ($1, $2, 'coparticipacion', $3, $4::int[]) RETURNING id_usuario
                `, [profile.username, hash, activate, [profile.jurisdiction]]);
                credential = { ...profile, id: inserted.rows[0].id_usuario, password };
                saved.push(credential);
            }
        }
        // Persist before COMMIT so credentials are never lost after account creation.
        fs.writeFileSync(credentialsPath, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
        fs.chmodSync(credentialsPath, 0o600);
        await client.query('COMMIT');
        console.log(JSON.stringify({ users: profiles.map((p) => p.username), active: activate, credentialsFile: credentialsPath }));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { client.release(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.pool.end());
