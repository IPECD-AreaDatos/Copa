const db = require('../db_datalake');

const IPC_QUERY = `
    SELECT
        TO_CHAR(fecha, 'YYYY-MM') AS period_id,
        MAX(valor) AS ipc_valor
    FROM ipc
    WHERE id_region = 1
      AND id_categoria = 1
      AND id_division = 1
      AND id_subdivision = 1
    GROUP BY 1
`;

const REM_QUERY = `
    SELECT
        TO_CHAR(fecha, 'YYYY-MM') AS period_id,
        mediana,
        fecha_consulta
    FROM rem_precios_minoristas
    WHERE fecha_consulta = (SELECT MAX(fecha_consulta) FROM rem_precios_minoristas)
    ORDER BY fecha ASC
`;

function nextPeriod(periodId) {
    const [year, month] = periodId.split('-').map(Number);
    return `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
}

function previousYearPeriod(periodId) {
    const [year, month] = periodId.split('-');
    return `${Number(year) - 1}-${month}`;
}

function buildInflationResolver(officialRows, remRows) {
    const official = new Map();
    for (const row of officialRows) {
        const value = Number(row.ipc_valor);
        if (row.period_id && Number.isFinite(value) && value > 0) official.set(row.period_id, value);
    }

    const rem = new Map();
    let remPublishedAt = null;
    for (const row of remRows) {
        const rate = Number(row.mediana);
        if (row.period_id && Number.isFinite(rate) && rate > -100) rem.set(row.period_id, rate / 100);
        if (row.fecha_consulta) {
            remPublishedAt = row.fecha_consulta instanceof Date
                ? row.fecha_consulta.toISOString().slice(0, 10)
                : String(row.fecha_consulta).slice(0, 10);
        }
    }
    const officialPeriods = [...official.keys()].sort();

    function resolveIndex(periodId) {
        const officialValue = official.get(periodId);
        if (officialValue) return { index: officialValue, source: 'official' };

        const basePeriod = officialPeriods.filter((candidate) => candidate < periodId).at(-1);
        if (!basePeriod) return { index: null, source: 'unavailable' };

        let index = official.get(basePeriod);
        for (let current = nextPeriod(basePeriod); current <= periodId; current = nextPeriod(current)) {
            const monthlyRate = rem.get(current);
            if (monthlyRate === undefined) return { index: null, source: 'unavailable' };
            index *= 1 + monthlyRate;
        }
        return { index, source: 'rem_bcra' };
    }

    function resolveYearOverYear(periodId) {
        const current = resolveIndex(periodId);
        const previous = resolveIndex(previousYearPeriod(periodId));
        if (!current.index || !previous.index) {
            return {
                yoyRate: null,
                source: 'unavailable',
                isProjected: false,
                remPublishedAt: null,
            };
        }
        const isProjected = current.source === 'rem_bcra' || previous.source === 'rem_bcra';
        return {
            yoyRate: current.index / previous.index - 1,
            source: isProjected ? 'rem_bcra' : 'official',
            isProjected,
            remPublishedAt: isProjected ? remPublishedAt : null,
        };
    }

    function toApiMeta(result) {
        return {
            ipc_missing: result.yoyRate === null,
            ipc_projected: result.isProjected,
            ipc_source: result.source,
            ipc_rem_published_at: result.remPublishedAt,
        };
    }

    return { resolveYearOverYear, toApiMeta };
}

async function createInflationResolver() {
    const officialResult = await db.query(IPC_QUERY);
    let remRows = [];
    try {
        const remResult = await db.query(REM_QUERY);
        remRows = remResult.rows;
    } catch (err) {
        // El IPC oficial sigue siendo utilizable; los meses sin IPC quedarán explícitamente indisponibles.
        console.error('No se pudo consultar REM para proyecciones de IPC:', err.message);
    }
    return buildInflationResolver(officialResult.rows, remRows);
}

module.exports = { buildInflationResolver, createInflationResolver };
