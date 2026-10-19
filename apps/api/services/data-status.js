const copaDb = require('../db');
const datalakeDb = require('../db_datalake');
const { buildInflationResolver, IPC_QUERY, REM_QUERY } = require('./inflation-resolver');
const { ROP_AMOUNT_SQL } = require('./rop-source');

const IPC_FILTER = 'id_region = 1 AND id_categoria = 1 AND id_division = 1 AND id_subdivision = 1';

const SOURCES = [
    {
        id: 'ipc', label: 'Inflación INDEC', database: 'datalake_economico', table: 'ipc',
        frequency: 'monthly', usage: 'Ajustes reales de Inicio y Análisis Mensual y Anual RON',
        updated_at_has_timezone: false,
        sql: `SELECT COUNT(*)::int AS row_count,
            TO_CHAR(MAX(fecha) FILTER (WHERE valor > 0), 'YYYY-MM') AS last_recorded_date,
            TO_CHAR(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS') AS last_updated_at
            FROM ipc WHERE ${IPC_FILTER}`,
        inputs: IPC_QUERY,
    },
    {
        id: 'rem', label: 'Expectativas REM · BCRA', database: 'datalake_economico', table: 'rem_precios_minoristas',
        frequency: 'monthly', usage: 'Respaldo para meses sin IPC oficial; expectativas de mercado publicadas por el BCRA',
        updated_at_has_timezone: false,
        sql: `SELECT COUNT(*)::int AS row_count,
            TO_CHAR(MAX(fecha), 'YYYY-MM') AS last_recorded_date,
            MAX(fecha_consulta)::text AS reference_date,
            TO_CHAR(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS') AS last_updated_at
            FROM rem_precios_minoristas
            WHERE fecha_consulta = (SELECT MAX(fecha_consulta) FROM rem_precios_minoristas)`,
        inputs: REM_QUERY,
    },
    {
        id: 'gastos', label: 'Gastos y masa salarial', database: 'copa', table: 'copa_gastos',
        frequency: 'monthly', usage: 'Gasto; masa salarial de Inicio y Análisis Mensual y Anual RON',
        updated_at_has_timezone: true,
        sql: `SELECT COUNT(*)::int AS row_count,
            TO_CHAR(MAX(periodo), 'YYYY-MM') AS last_recorded_date,
            MAX(updated_at) AS last_updated_at FROM copa_gastos`,
    },
    {
        id: 'gastos_fte', label: 'Gastos desagregados', database: 'copa', table: 'copa_gastos_fte',
        frequency: 'monthly', usage: 'Análisis consolidado y Explorador general de Gastos desagregados',
        updated_at_has_timezone: true,
        sql: `SELECT COUNT(*)::int AS row_count,
            TO_CHAR(MAX(MAKE_DATE(anio, mes, 1)), 'YYYY-MM') AS last_recorded_date,
            MAX(updated_at) AS last_updated_at FROM copa_gastos_fte`,
    },
    {
        id: 'ron', label: 'Recursos nacionales · RON', database: 'copa', table: 'copa_recursos_origen_nacional',
        frequency: 'daily', usage: 'Recursos de Inicio y Análisis Mensual y Anual RON',
        updated_at_has_timezone: null,
        sql: `WITH daily AS (
            SELECT fecha, SUM(total_general) AS amount, COUNT(*) AS rows
            FROM copa_recursos_origen_nacional GROUP BY fecha
        ) SELECT SUM(rows)::int AS row_count, MAX(fecha)::text AS last_recorded_date,
            MAX(fecha) FILTER (WHERE amount > 0)::text AS last_positive_date,
            (SELECT amount FROM daily WHERE amount > 0 ORDER BY fecha DESC LIMIT 1) AS latest_value
            FROM daily`,
    },
    {
        id: 'rop', label: 'Recursos provinciales · ROP', database: 'copa', table: 'copa_reca_rop',
        frequency: 'monthly', usage: 'Recursos de Inicio y Análisis Mensual y Anual RON',
        updated_at_has_timezone: null,
        sql: `WITH monthly AS (
            SELECT MAKE_DATE(anio::int, mes::int, 1) AS period,
                SUM(${ROP_AMOUNT_SQL}) AS amount, COUNT(*) AS rows
            FROM copa_reca_rop GROUP BY 1
        ) SELECT SUM(rows)::int AS row_count,
            TO_CHAR(MAX(period), 'YYYY-MM') AS last_recorded_date,
            TO_CHAR(MAX(period) FILTER (WHERE amount > 0), 'YYYY-MM') AS last_positive_date,
            (SELECT amount FROM monthly WHERE amount > 0 ORDER BY period DESC LIMIT 1) AS latest_value
            FROM monthly`,
    },
];

function currentPeriod(now) {
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'America/Argentina/Cordoba', year: 'numeric', month: '2-digit',
    }).formatToParts(now);
    return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`;
}

function buildInflationStatus(officialRows, remRows, now) {
    const resolver = buildInflationResolver(officialRows, remRows);
    const end = currentPeriod(now);
    const [year, month] = end.split('-').map(Number);
    const periods = Array.from({ length: 24 }, (_, offset) => {
        const date = new Date(Date.UTC(year, month - 1 - offset, 1));
        const periodId = date.toISOString().slice(0, 7);
        const result = resolver.resolveYearOverYear(periodId);
        return {
            period_id: periodId,
            ...resolver.toApiMeta(result),
            yoy_percent: result.yoyRate === null ? null : result.yoyRate * 100,
        };
    });
    return { default_period_id: end, periods };
}

async function loadDataStatus({ db = copaDb, datalake = datalakeDb, now = () => new Date() } = {}) {
    const results = await Promise.all(SOURCES.map(async ({ sql, inputs, ...source }) => {
        const connection = source.database === 'copa' ? db : datalake;
        const metadata = { ...source,
            database: source.database === 'copa' ? process.env.PG_DATABASE || 'datos_tablero' : source.database };
        try {
            const [summary, input] = await Promise.all([
                connection.query({ text: sql, query_timeout: 15000 }),
                inputs ? connection.query({ text: inputs, query_timeout: 15000 }) : null,
            ]);
            const row = summary.rows[0] || {};
            const missing = !row.last_recorded_date
                || (['ron', 'rop'].includes(source.id) && !row.last_positive_date);
            return {
                source: {
                    ...metadata,
                    last_updated_at: null,
                    last_positive_date: null,
                    ...row,
                    row_count: Number(row.row_count || 0),
                    latest_value: row.latest_value == null ? null : Number(row.latest_value),
                    status: missing ? 'missing' : 'ok',
                },
                rows: input?.rows || [],
            };
        } catch (error) {
            console.error(`[DATA STATUS] No se pudo consultar ${source.id}:`, error.code || 'query_failed');
            return {
                source: { ...metadata, status: 'error', last_recorded_date: null, last_positive_date: null,
                    last_updated_at: null, latest_value: null, row_count: null },
                rows: [],
            };
        }
    }));

    const checkedAt = now();
    return {
        checked_at: checkedAt.toISOString(),
        sources: results.map((result) => result.source),
        inflation: buildInflationStatus(results[0].rows, results[1].rows, checkedAt),
    };
}

module.exports = { loadDataStatus, buildInflationStatus, SOURCES };
