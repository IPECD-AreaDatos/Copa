const SUBPARTIDA_LABELS = require('../data/gasto_subpartida_labels.json');

const PARTIDA_ORDER = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const PARTIDA_LABELS = Object.freeze({
    100: 'Gastos en personal',
    200: 'Bienes de consumo',
    300: 'Servicios no personales',
    400: 'Bienes de uso',
    500: 'Transferencias',
    600: 'Activos financieros',
    700: 'Servicio de la deuda',
    800: 'Otros gastos',
    900: 'Gastos figurativos',
});

const FUENTE_LABELS = Object.freeze({
    10: 'Tesoro de la Provincia',
    11: 'Recursos propios',
    12: 'Financiamiento interno',
    13: 'Nacional con afectación específica',
    14: 'Provincial con afectación específica',
});

const ESTADO_LABELS = Object.freeze({
    'Comprometido': 'Comprometido',
    'Cred Ori': 'Crédito original',
    'Cred Vig': 'Crédito vigente',
    'Ordenado': 'Ordenado',
});

const SNAPSHOT_STATES = new Set(['Cred Ori', 'Cred Vig']);

// copa_gastos_fte no tiene una tabla de dimensiones para resolver este código.
// Estos nombres corresponden a la codificación actualmente usada por la fuente.
const JURISDICCION_LABELS = Object.freeze({
    1: 'MINISTERIO DE SEGURIDAD',
    2: 'MINISTERIO DE HACIENDA Y FINANZAS',
    3: 'MINISTERIO DE EDUCACIÓN',
    4: 'MINISTERIO DE SALUD PÚBLICA',
    5: 'MINISTERIO DE PRODUCCIÓN',
    6: 'MINISTERIO DE OBRAS Y SERVICIOS PÚBLICOS',
    7: 'MINISTERIO SECRETARIA GENERAL',
    8: 'TRIBUNAL DE CUENTAS',
    9: 'PODER JUDICIAL',
    10: 'PODER LEGISLATIVO',
    11: 'FISCALIA DE ESTADO',
    12: 'MINISTERIO DE CIENCIA Y TECNOLOGIA',
    13: 'MINISTERIO DE COORDINACIÓN Y PLANIFICACIÓN',
    14: 'MINISTERIO DE DESARROLLO SOCIAL',
    16: 'MINISTERIO DE JUSTICIA Y DERECHOS HUMANOS',
    17: 'SECRETARIA DE ENERGIA',
    18: 'MINISTERIO DE INDUSTRIA TRABAJO Y COMERCIO',
    19: 'MINISTERIO DE TURISMO',
    23: 'INSTITUTO DE CARDIOLOGIA DE CORRIENTES',
    24: 'INSTITUTO PROVINCIAL DEL TABACO',
    25: 'INSTITUTO CORRENTINO DEL AGUA Y DEL AMBIENTE',
    26: 'INSTITUTO DE CULTURA DE CORRIENTES',
    27: 'INSTITUTO DE VIVIENDA DE CORRIENTES',
    28: 'DIRECCIÓN PROVINCIAL DE VIALIDAD',
    29: 'ADMINISTRACIÓN DE OBRAS SANITARIAS DE CORRIENTES',
    30: 'INSTITUTO DE DESARROLLO RURAL DE CORRIENTES',
    31: "CENTRO DE ONCOLOGIA 'ANNA ROCCA DE BONATTI'",
    33: 'AGENCIA CORRENTINA DE BIENES DEL ESTADO',
    41: 'INSTITUTO DE PREVISION SOCIAL',
    42: 'ENTE PROVINCIAL REGULADOR ELECTRICO',
    51: 'DIRECCIÓN PROVINCIAL DE ENERGIA DE CORRIENTES',
});

function invalidParameter(name, message) {
    const error = new Error(`${name}: ${message}`);
    error.statusCode = 400;
    return error;
}

function parseInteger(value, name, { min, max } = {}) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw invalidParameter(name, 'debe ser un entero');
    if (min !== undefined && parsed < min) throw invalidParameter(name, `debe ser mayor o igual a ${min}`);
    if (max !== undefined && parsed > max) throw invalidParameter(name, `debe ser menor o igual a ${max}`);
    return parsed;
}

function parseIntegerList(value, name) {
    if (value === undefined || value === null || value === '' || String(value).toUpperCase() === 'TODAS') {
        return null;
    }
    const values = String(value)
        .split(',')
        .map((item) => parseInteger(item.trim(), name))
        .filter((item) => item !== null);
    return [...new Set(values)];
}

function parseTextList(value, name) {
    if (value === undefined || value === null || value === '' || String(value).toUpperCase() === 'TODOS' || String(value).toUpperCase() === 'TODAS') {
        return null;
    }
    const values = String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    if (!values.length) throw invalidParameter(name, 'debe contener al menos un valor');
    return [...new Set(values)];
}

function buildFilters(query = {}) {
    const anio = parseInteger(query.anio, 'anio', { min: 2000, max: 2100 }) || 2026;
    const mesDesde = parseInteger(query.mesDesde, 'mesDesde', { min: 1, max: 12 }) || 1;
    const mesHasta = parseInteger(query.mesHasta, 'mesHasta', { min: 1, max: 12 }) || 6;
    if (mesDesde > mesHasta) throw invalidParameter('mesDesde', 'no puede ser mayor que mesHasta');

    const estados = query.estado === undefined ? ['Comprometido'] : parseTextList(query.estado, 'estado');
    if (!estados || estados.length !== 1) {
        throw invalidParameter('estado', 'debe seleccionar un único estado');
    }
    return {
        anio,
        mesDesde,
        mesHasta,
        fuentes: parseIntegerList(query.fuente, 'fuente'),
        estados,
        jurisdicciones: parseIntegerList(query.jurisdiccion, 'jurisdiccion'),
        partidas: parseIntegerList(query.partid, 'partid'),
        subPartidas: parseIntegerList(query.subPartid, 'subPartid'),
    };
}

function isSnapshotState(filters) {
    return filters.estados?.length === 1 && SNAPSHOT_STATES.has(filters.estados[0]);
}

function buildWhere(filters) {
    const params = [filters.anio, filters.mesDesde, filters.mesHasta];
    const conditions = [
        'anio = $1',
        'mes BETWEEN $2 AND $3',
    ];

    const addArrayFilter = (column, values, type) => {
        if (!values?.length) return;
        params.push(values);
        conditions.push(`${column} = ANY($${params.length}::${type}[])`);
    };

    addArrayFilter('codigo_fuente', filters.fuentes, 'int');
    addArrayFilter('jurisdiccion', filters.jurisdicciones, 'int');
    addArrayFilter('partid', filters.partidas, 'int');
    addArrayFilter('sub_partid', filters.subPartidas, 'int');
    addArrayFilter('tipo_de_g', filters.estados, 'text');

    return { text: conditions.join(' AND '), params };
}

function numberValue(value) {
    return value === null || value === undefined ? 0 : Number(value);
}

function percentage(value, total) {
    return total === 0 ? 0 : (value / total) * 100;
}

function mapPartida(code) {
    const numericCode = Number(code);
    return {
        codigo: numericCode,
        nombre: PARTIDA_LABELS[numericCode] || `Partida ${numericCode}`,
    };
}

function mapJurisdiccion(code) {
    const numericCode = Number(code);
    return {
        codigo: numericCode,
        nombre: JURISDICCION_LABELS[numericCode] || `Jurisdicción ${numericCode}`,
        mapeada: Boolean(JURISDICCION_LABELS[numericCode]),
    };
}

function mapSubPartida(code) {
    const numericCode = Number(code);
    return {
        codigo: numericCode,
        nombre: SUBPARTIDA_LABELS[String(numericCode)] || `Subpartida ${numericCode}`,
        descripcionReferencia: Boolean(SUBPARTIDA_LABELS[String(numericCode)]),
    };
}

function buildChapterRows(rows) {
    const total = rows.reduce((sum, row) => sum + numberValue(row.total), 0);
    return rows
        .map((row) => {
            const partida = mapPartida(row.partid);
            const amount = numberValue(row.total);
            return {
                ...partida,
                total: amount,
                participacion: percentage(amount, total),
                filas: Number(row.row_count || 0),
                subpartidas: Number(row.subpartidas || 0),
            };
        })
        .sort((a, b) => PARTIDA_ORDER.indexOf(a.codigo) - PARTIDA_ORDER.indexOf(b.codigo));
}

function buildSubpartidaRows(rows, chapterRows) {
    const chapterTotals = new Map(chapterRows.map((row) => [row.codigo, row.total]));
    return rows.map((row) => {
        const chapter = Number(row.partid);
        const subPartida = mapSubPartida(row.sub_partid);
        const amount = numberValue(row.total);
        return {
            ...subPartida,
            partida: mapPartida(chapter),
            total: amount,
            participacionPartida: percentage(amount, chapterTotals.get(chapter) || 0),
            participacionTotal: percentage(amount, chapterRows.reduce((sum, item) => sum + item.total, 0)),
            filas: Number(row.row_count || 0),
            jurisdicciones: Number(row.jurisdicciones || 0),
        };
    });
}

function buildJurisdictionRows(rows) {
    const byJurisdiction = new Map();
    rows.forEach((row) => {
        const code = Number(row.jurisdiccion);
        const current = byJurisdiction.get(code) || {
            ...mapJurisdiccion(code),
            total: 0,
            filas: 0,
            partidas: {},
        };
        const amount = numberValue(row.total);
        const partida = Number(row.partid);
        current.total += amount;
        current.filas += Number(row.row_count || 0);
        current.partidas[partida] = amount;
        byJurisdiction.set(code, current);
    });
    return [...byJurisdiction.values()].sort((a, b) => b.total - a.total || a.codigo - b.codigo);
}

module.exports = {
    ESTADO_LABELS,
    FUENTE_LABELS,
    JURISDICCION_LABELS,
    PARTIDA_LABELS,
    PARTIDA_ORDER,
    buildChapterRows,
    buildFilters,
    buildJurisdictionRows,
    buildSubpartidaRows,
    buildWhere,
    isSnapshotState,
    mapJurisdiccion,
    mapPartida,
    mapSubPartida,
    numberValue,
};
