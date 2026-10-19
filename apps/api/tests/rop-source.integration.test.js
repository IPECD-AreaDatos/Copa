const assert = require('node:assert/strict');
const test = require('node:test');
const { Pool } = require('pg');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const { ROP_COLUMNS, ROP_MONTHLY_QUERY } = require('../services/rop-source');
const { SOURCES } = require('../services/data-status');

// Prueba de sólo lectura: una CTE temporal a la consulta sustituye la tabla real.
// Ejecutar expresamente con COPA_DB_TESTS=1 npm run test:rop-source.
test('los SQL del tablero y del monitor cuentan NULL como cero sin inventar meses ausentes', {
    skip: process.env.COPA_DB_TESTS !== '1',
}, async () => {
    const pool = new Pool({
        host: process.env.PG_HOST, port: process.env.PG_PORT,
        user: process.env.PG_USER, password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
        connectionTimeoutMillis: 5000, statement_timeout: 10000,
    });
    const fixture = `copa_reca_rop (anio, mes, ${ROP_COLUMNS.join(', ')}) AS (
        VALUES
            (2026, 8, 10::double precision, 20::double precision, 30::double precision,
                40::double precision, 50::double precision, 60::double precision, 70::double precision),
            (2026, 9, 10, 20, 30, 40, NULL, 50, NULL),
            (2026, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
    )`;
    try {
        const monthly = await pool.query(`WITH ${fixture} ${ROP_MONTHLY_QUERY} ORDER BY anio, mes`);
        assert.deepEqual(monthly.rows, [
            { anio: 2026, mes: 8, rop_bruta: 280 },
            { anio: 2026, mes: 9, rop_bruta: 150 },
            { anio: 2026, mes: 10, rop_bruta: 0 },
        ]);
        assert.equal(monthly.rows.some((row) => row.mes === 7), false);

        const monitorSql = SOURCES.find((source) => source.id === 'rop').sql.replace(/^WITH\s+/i, '');
        const monitor = (await pool.query(`WITH ${fixture}, ${monitorSql}`)).rows[0];
        assert.equal(monitor.last_recorded_date, '2026-10');
        assert.equal(monitor.last_positive_date, '2026-09');
        assert.equal(Number(monitor.latest_value), 150);
    } finally {
        await pool.end();
    }
});
