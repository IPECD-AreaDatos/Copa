const { JURISDICCION_LABELS } = require('./gasto-desagregado');

function normalizeInstitution(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

// Permissions always come from the database, including for existing JWTs.
function publicUser(row) {
    if (!row || !row.activo || row.tablero_acceso !== 'coparticipacion') return null;
    const codes = row.gastos_jurisdicciones;
    if (codes !== null && (!Array.isArray(codes) || !codes.length
        || codes.some((code) => !Number.isInteger(code) || !JURISDICCION_LABELS[code]))) {
        throw new Error('Permisos de institución inválidos');
    }
    const jurisdictions = codes === null ? [] : [...new Set(codes)].map((code) => ({
        code, name: JURISDICCION_LABELS[code],
    }));
    return {
        id: row.id_usuario,
        username: row.username,
        name: jurisdictions.length ? jurisdictions.map((j) => j.name).join(' / ') : row.username,
        role: 'user',
        access: { scope: codes === null ? 'global' : 'institution', jurisdictions },
    };
}

function institutionCodes(req) {
    return req.user?.access?.scope === 'institution'
        ? req.user.access.jurisdictions.map((j) => j.code) : null;
}

function deniedInstitution() {
    const error = new Error('Acceso denegado: solo puede consultar su institución');
    error.statusCode = 403;
    return error;
}

function scopeDetailedFilters(req, filters) {
    const allowed = institutionCodes(req);
    if (!allowed) return filters;
    if (filters.jurisdicciones?.some((code) => !allowed.includes(code))) throw deniedInstitution();
    return { ...filters, jurisdicciones: filters.jurisdicciones || allowed };
}

function institutionWhere(req, { numeric = false, offset = 0 } = {}) {
    const codes = institutionCodes(req);
    if (!codes) return { text: 'TRUE', params: [] };
    if (numeric) return { text: `jurisdiccion = ANY($${offset + 1}::int[])`, params: [codes] };
    const names = codes.map((code) => normalizeInstitution(JURISDICCION_LABELS[code]));
    // Exact normalized names: no substring matches or institutions with a similar name.
    return {
        text: `TRANSLATE(UPPER(TRIM(jurisdiccion)), 'ÁÉÍÓÚÜ', 'AEIOUU') = ANY($${offset + 1}::text[])`,
        params: [names],
    };
}

function validateNamedInstitution(req, name) {
    const codes = institutionCodes(req);
    if (codes && name !== undefined && !codes.some((code) =>
        normalizeInstitution(JURISDICCION_LABELS[code]) === normalizeInstitution(name))) {
        throw deniedInstitution();
    }
}

module.exports = { publicUser, institutionCodes, institutionWhere, scopeDetailedFilters, validateNamedInstitution };
