const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const db = require('../db');

async function migrateAccess() {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query(fs.readFileSync(path.join(__dirname, '../migrations/20261027-institution-access.sql'), 'utf8'));
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { client.release(); }
}

if (require.main === module) {
    migrateAccess().then(() => console.log('Permisos por institución: migración aplicada.'))
        .catch((error) => { console.error(error.message); process.exitCode = 1; })
        .finally(() => db.pool.end());
}

module.exports = { migrateAccess };
