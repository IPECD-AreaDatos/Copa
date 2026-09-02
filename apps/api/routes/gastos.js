const express = require('express');
const router = express.Router();
const db = require('../db'); // datos_tablero
const authMiddleware = require('../middleware/auth');
const {
    DEFAULT_LOOKBACK_MONTHS,
    DEFAULT_TOLERANCE,
    resolvePeriodCompleteness,
    resolveVariableCompleteness,
} = require('../services/completeness-resolver');
const {
    ESTADO_LABELS,
    FUENTE_LABELS,
    buildChapterRows,
    buildFilters,
    buildJurisdictionRows,
    buildSubpartidaRows,
    buildWhere,
    isSnapshotState,
    mapJurisdiccion,
    mapPartida,
    numberValue,
} = require('../services/gasto-desagregado');

const GASTO_VARIABLES = ['credito_vigente', 'comprometido', 'ordenado'];

const JURISDICCION_ALIASES = {
    'ADMINIST. DE OBRAS SANITARIAS DE': 'ADMINISTRACIÓN DE OBRAS SANITARIAS DE CORRIENTES',
    'AGENCIA CORRENTINA DE BIENES DEL': 'AGENCIA CORRENTINA DE BIENES DEL ESTADO',
    'CENTRO DE ONCOLOGIA "ANNA ROCCA DE': "CENTRO DE ONCOLOGIA 'ANNA ROCCA DE BONATTI'",
    '"CENTRO DE ONCOLOGIA ""ANNA ROCCA DE"': "CENTRO DE ONCOLOGIA 'ANNA ROCCA DE BONATTI'",
    'DIRECCION PROVINCIAL DE ENERGIA DE': 'DIRECCIÓN PROVINCIAL DE ENERGIA DE CORRIENTES',
    'DIRECCION PROVINCIAL DE VIALIDAD': 'DIRECCIÓN PROVINCIAL DEL VIALIDAD',
    'INSTITUTO CORRENTINO DEL AGUA Y DEL': 'INSTITUTO CORRENTINO DEL AGUA Y DEL AMBIENTE',
    'INSTITUTO DE DESARROLLO RURAL DE': 'INSTITUTO DE DESARROLLO RURAL DE CORRIENTES',
    'MINISTERIO DE COORDINACION Y': 'MINISTERIO DE COORDINACIÓN Y PLANIFICACIÓN',
    'MINISTERIO DE EDUCACION': 'MINISTERIO DE EDUCACIÓN',
    'MINISTERIO DE INDUSTRIA TRABAJO Y': 'MINISTERIO DE INDUSTRIA TRABAJO Y COMERCIO',
    'MINISTERIO DE JUSTICIA Y DERECHOS': 'MINISTERIO DE JUSTICIA Y DERECHOS HUMANOS',
    'MINISTERIO DE OBRAS Y SERVICIOS PUBLICOS': 'MINISTERIO DE OBRAS Y SERVICIOS PÚBLICOS',
    'MINISTERIO DE PRODUCCION': 'MINISTERIO DE PRODUCCIÓN',
    'MINISTERIO DE SALUD PUBLICA': 'MINISTERIO DE SALUD PÚBLICA',
};

function canonizeJurisdiccion(raw) {
    const key = String(raw || '').trim().toUpperCase();
    return JURISDICCION_ALIASES[key] || String(raw || '').trim();
}

function gastoVariableKey(raw) {
    const normalized = String(raw || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '_');
    return GASTO_VARIABLES.includes(normalized) ? normalized : null;
}

/**
 * Obtiene el resumen de gastos agrupados.
 * Soporta filtros por jurisdicción, partida, fuente y estado.
 */
router.get('/resumen', authMiddleware, async (req, res) => {
    try {
        const { jurisdiccion, partida, fuente, estado } = req.query;
        
        let query = 'SELECT * FROM v_gastos_agrupados WHERE 1=1';
        const params = [];

        if (jurisdiccion) {
            params.push(jurisdiccion);
            query += ` AND jurisdiccion = $${params.length}`;
        }
        if (partida) {
            params.push(partida);
            query += ` AND partida = $${params.length}`;
        }
        if (fuente) {
            params.push(fuente);
            query += ` AND fuente = $${params.length}`;
        }
        if (estado) {
            params.push(estado);
            query += ` AND estado = $${params.length}`;
        }

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al consultar gastos:', err.message);
        res.status(500).json({ message: 'Error al obtener datos de gastos' });
    }
});

/**
 * Obtiene las opciones únicas para los filtros.
 */
router.get('/filtros', authMiddleware, async (req, res) => {
    try {
        const jurisdicciones = await db.query('SELECT DISTINCT jurisdiccion FROM v_gastos_agrupados ORDER BY 1');
        const partidas = await db.query('SELECT DISTINCT partida FROM v_gastos_agrupados ORDER BY 1');
        const fuentes = await db.query('SELECT DISTINCT fuente FROM v_gastos_agrupados ORDER BY 1');
        const estados = await db.query('SELECT DISTINCT estado FROM v_gastos_agrupados ORDER BY 1');

        res.json({
            jurisdicciones: jurisdicciones.rows.map(r => r.jurisdiccion),
            partidas: partidas.rows.map(r => r.partida),
            fuentes: fuentes.rows.map(r => r.fuente),
            estados: estados.rows.map(r => r.estado)
        });
    } catch (err) {
        console.error('Error al obtener filtros de gastos:', err.message);
        res.status(500).json({ message: 'Error al obtener opciones de filtros' });
    }
});

/**
 * Desglose de gastos por fuente, jurisdicción, partida y subpartida.
 * La consulta trabaja sobre copa_gastos_fte en el grano de la base detallada
 * y devuelve agregados para evitar enviar cientos de miles de filas al cliente.
 */
router.get('/desagregados', authMiddleware, async (req, res) => {
    try {
        const filters = buildFilters(req.query);
        let effectiveFilters = filters;
        let snapshotMonth = null;
        const requestedWhere = buildWhere(filters);

        if (isSnapshotState(filters)) {
            const snapshotResult = await db.query(`
                SELECT MAX(mes)::int AS snapshot_month
                FROM copa_gastos_fte
                WHERE ${requestedWhere.text}
            `, requestedWhere.params);
            snapshotMonth = snapshotResult.rows[0]?.snapshot_month ?? null;
            if (snapshotMonth !== null) {
                effectiveFilters = {
                    ...filters,
                    mesDesde: Number(snapshotMonth),
                    mesHasta: Number(snapshotMonth),
                };
            }
        }

        const where = buildWhere(effectiveFilters);
        const from = `FROM copa_gastos_fte WHERE ${where.text}`;

        const [chaptersResult, subpartidasResult, jurisdictionsResult, monthlyResult, coverageResult, optionsResult] = await Promise.all([
            db.query(`
                SELECT partid,
                       SUM(val)::numeric AS total,
                       COUNT(*)::int AS row_count,
                       COUNT(DISTINCT sub_partid)::int AS subpartidas
                ${from}
                GROUP BY partid
                ORDER BY partid
            `, where.params),
            db.query(`
                SELECT partid,
                       sub_partid,
                       SUM(val)::numeric AS total,
                       COUNT(*)::int AS row_count,
                       COUNT(DISTINCT jurisdiccion)::int AS jurisdicciones
                ${from}
                GROUP BY partid, sub_partid
                ORDER BY partid, ABS(SUM(val)) DESC, sub_partid
            `, where.params),
            db.query(`
                SELECT jurisdiccion,
                       partid,
                       SUM(val)::numeric AS total,
                       COUNT(*)::int AS row_count
                ${from}
                GROUP BY jurisdiccion, partid
                ORDER BY jurisdiccion, partid
            `, where.params),
            db.query(`
                SELECT mes,
                       SUM(val)::numeric AS total,
                       COUNT(*)::int AS row_count
                ${from}
                GROUP BY mes
                ORDER BY mes
            `, where.params),
            db.query(`
                SELECT COUNT(*)::int AS raw_rows,
                       COALESCE(SUM(val), 0)::numeric AS total
                ${from}
            `, where.params),
            db.query(`
                SELECT
                    ARRAY_AGG(DISTINCT anio ORDER BY anio) AS years,
                    ARRAY_AGG(DISTINCT codigo_fuente ORDER BY codigo_fuente) AS sources,
                    ARRAY_AGG(DISTINCT tipo_de_g ORDER BY tipo_de_g) AS states,
                    ARRAY_AGG(DISTINCT jurisdiccion ORDER BY jurisdiccion) AS jurisdictions,
                    ARRAY_AGG(DISTINCT partid ORDER BY partid) AS partidas
                FROM copa_gastos_fte
            `),
        ]);

        const chapterRows = buildChapterRows(chaptersResult.rows);
        const subpartidaRows = buildSubpartidaRows(subpartidasResult.rows, chapterRows);
        const jurisdictionRows = buildJurisdictionRows(jurisdictionsResult.rows);
        const coverage = coverageResult.rows[0] || { raw_rows: 0, total: 0 };
        const optionRow = optionsResult.rows[0] || {};
        const availableJurisdictions = (optionRow.jurisdictions || []).map(mapJurisdiccion);
        const availablePartidas = (optionRow.partidas || []).map(mapPartida);
        const unmappedJurisdictions = availableJurisdictions
            .filter((jurisdiccion) => !jurisdiccion.mapeada)
            .map((jurisdiccion) => jurisdiccion.codigo);

        res.json({
            meta: {
                source_table: 'copa_gastos_fte',
                grain: 'mes, año, jurisdicción, fuente, programa, subprofesional, proyecto, obra, partida, subpartida y estado',
                requested: filters,
                selected: effectiveFilters,
                is_snapshot: isSnapshotState(filters),
                snapshot_month: snapshotMonth === null ? null : Number(snapshotMonth),
                available: {
                    years: optionRow.years || [],
                    fuentes: (optionRow.sources || []).map((codigo) => ({
                        codigo: Number(codigo),
                        nombre: FUENTE_LABELS[Number(codigo)] || `Fuente ${codigo}`,
                    })),
                    estados: (optionRow.states || []).map((estado) => ({
                        codigo: estado,
                        nombre: ESTADO_LABELS[estado] || estado,
                    })),
                    jurisdicciones: availableJurisdictions,
                    partidas: availablePartidas,
                },
                unmapped_jurisdictions: unmappedJurisdictions,
                description_source: 'Catálogo de referencia generado a partir de los Excel de desglose recibidos; los códigos sin correspondencia se muestran por código.',
                raw_rows: Number(coverage.raw_rows || 0),
                grouped_rows: subpartidaRows.length,
                response_at: new Date().toISOString(),
            },
            total: numberValue(coverage.total),
            chapters: chapterRows,
            subpartidas: subpartidaRows,
            jurisdicciones: jurisdictionRows,
            monthly: monthlyResult.rows.map((row) => ({
                mes: Number(row.mes),
                total: numberValue(row.total),
                filas: Number(row.row_count || 0),
            })),
        });
    } catch (err) {
        if (err.statusCode === 400) {
            return res.status(400).json({ message: err.message });
        }
        console.error('Error al consultar gastos desagregados:', err.message);
        return res.status(500).json({ message: 'Error al obtener el desglose de gastos' });
    }
});

/**
 * Clasifica la completitud del módulo Gasto por variable y por fecha.
 *
 * Los montos pueden bajar legítimamente, por eso la señal comparativa es la
 * cantidad de registros cargados por estado. Cada estado es completo cuando
 * alcanza al menos el 90% del máximo observado previamente en el mismo año.
 * La fecha sólo es completa cuando sus tres variables lo son.
 */
router.get('/completeness', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                TO_CHAR(periodo, 'YYYY-MM') AS periodo,
                estado,
                COUNT(*)::int AS row_count
            FROM copa_gastos
            GROUP BY 1, 2
            ORDER BY 1, 2
        `);

        const countsByVariable = Object.fromEntries(
            GASTO_VARIABLES.map((variable) => [variable, {}]),
        );
        const periodIds = new Set();

        result.rows.forEach((row) => {
            const variable = gastoVariableKey(row.estado);
            if (!variable) return;
            periodIds.add(row.periodo);
            countsByVariable[variable][row.periodo] = Number(row.row_count);
        });

        const periods = {};
        let defaultPeriodId = null;
        [...periodIds].sort().forEach((currentPeriodId) => {
            const variableResults = Object.fromEntries(
                GASTO_VARIABLES.map((variable) => [
                    variable,
                    resolveVariableCompleteness(currentPeriodId, countsByVariable[variable], {
                        lookbackMonths: DEFAULT_LOOKBACK_MONTHS,
                        tolerance: DEFAULT_TOLERANCE,
                        comparison: 'maximum',
                        sameCalendarYear: true,
                    }),
                ]),
            );
            const isComplete = resolvePeriodCompleteness(variableResults);

            periods[currentPeriodId] = {
                is_complete: isComplete,
                variables: Object.fromEntries(
                    Object.entries(variableResults).map(([variable, value]) => [
                        variable,
                        {
                            is_complete: value.isComplete,
                            observed_rows: value.currentValue,
                            minimum_rows: value.minimumCompleteValue === null
                                ? null
                                : Math.ceil(value.minimumCompleteValue),
                        },
                    ]),
                ),
            };
            if (isComplete) defaultPeriodId = currentPeriodId;
        });

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({
            meta: {
                default_period_id: defaultPeriodId,
                comparison: 'maximum_previous_periods_same_year',
                threshold_pct: (1 - DEFAULT_TOLERANCE) * 100,
            },
            periods,
        });
    } catch (err) {
        console.error('Error al clasificar la completitud de gastos:', err.message);
        res.status(500).json({ message: 'Error al obtener completitud de gastos' });
    }
});

/**
 * Obtiene todos los registros de gastos para el dashboard.
 * Formateado como el antiguo gasto_data.json
 */
router.get('/all-data', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                TO_CHAR(periodo, 'YYYY-MM') as periodo, 
                jurisdiccion, 
                tipo_financ, 
                partida, 
                estado, 
                monto 
            FROM copa_gastos 
            ORDER BY periodo DESC
        `);
        // El frontend espera un array de objetos GastoRow con monto como número
        const rows = result.rows.map(r => ({
            ...r,
            jurisdiccion: canonizeJurisdiccion(r.jurisdiccion),
            monto: parseFloat(r.monto)
        }));
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener todos los gastos:', err.message);
        res.status(500).json({ message: 'Error al obtener datos' });
    }
});

module.exports = router;
