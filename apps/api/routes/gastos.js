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
