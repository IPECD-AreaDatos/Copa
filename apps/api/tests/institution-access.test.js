const assert = require('node:assert/strict');
const test = require('node:test');
const db = require('../db');
const { publicUser, scopeDetailedFilters, institutionWhere } = require('../services/user-access');
const router = require('../routes/gastos');

const row = (codes, extra = {}) => ({
    id_usuario: 900001, username: 'test_institution', activo: true,
    tablero_acceso: 'coparticipacion', gastos_jurisdicciones: codes, ...extra,
});
const request = (codes, query = {}) => ({ user: publicUser(row(codes)), query });
const response = () => ({
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    vary(key) { this.headers.Vary = this.headers.Vary ? `${this.headers.Vary}, ${key}` : key; },
});
const handler = (path) => router.stack.find((layer) => layer.route?.path === path).route.stack.at(-1).handle;

test('un usuario global conserva sus permisos; una lista vacía o desconocida falla cerrada', () => {
    assert.equal(publicUser(row(null)).access.scope, 'global');
    for (const value of [[], [null], ['4'], [999], undefined]) {
        assert.throws(() => publicUser(row(value)), /inválidos/);
    }
    assert.equal(publicUser(row([4], { activo: false })), null);
    assert.equal(publicUser(row([4], { tablero_acceso: 'otro' })), null);
});

for (const code of [3, 4]) {
    test(`jurisdicción ${code}: omitir el filtro sigue limitado y mezclar otra institución se rechaza`, () => {
        const req = request([code]);
        assert.deepEqual(scopeDetailedFilters(req, { jurisdicciones: null }).jurisdicciones, [code]);
        assert.deepEqual(scopeDetailedFilters(req, { jurisdicciones: [code] }).jurisdicciones, [code]);
        assert.throws(() => scopeDetailedFilters(req, { jurisdicciones: [3, 4] }), { statusCode: 403 });
        assert.match(institutionWhere(req).text, /TRANSLATE.*ANY/);
        assert.equal(institutionWhere(req).params[0].length, 1);
    });

    test(`jurisdicción ${code}: todas las consultas detalladas y los catálogos se limitan en SQL`, async (t) => {
        const queries = [];
        t.mock.method(db, 'query', async (text, params) => {
            queries.push({ text, params });
            if (text.includes('ARRAY_AGG')) return { rows: [{ jurisdictions: [code], years: [2026] }] };
            return { rows: [] };
        });
        for (const estado of ['Comprometido', 'Cred Vig']) {
            const res = response();
            await handler('/desagregados')(request([code], { estado }), res);
            assert.equal(res.statusCode, 200);
            assert.deepEqual(res.body.meta.selected.jurisdicciones, [code]);
            assert.deepEqual(res.body.meta.available.jurisdicciones.map((j) => j.codigo), [code]);
            assert.ok(res.body.ministerial_analysis.referenceJurisdictions.every((j) => j === code));
        }
        assert.ok(queries.length > 20);
        for (const query of queries) {
            assert.match(query.text, /jurisdiccion = ANY\(/);
            assert.ok(query.params.some((value) => Array.isArray(value) && value.length === 1 && value[0] === code));
        }
    });

    test(`jurisdicción ${code}: resumen, filtros, completitud y datos generales incluyen el límite`, async (t) => {
        const queries = [];
        t.mock.method(db, 'query', async (text, params) => { queries.push({ text, params }); return { rows: [] }; });
        for (const path of ['/resumen', '/filtros', '/completeness', '/all-data']) {
            const res = response();
            await handler(path)(request([code]), res);
            assert.equal(res.statusCode, 200);
        }
        assert.equal(queries.length, 7);
        for (const query of queries) {
            assert.match(query.text, /TRANSLATE\(UPPER\(TRIM\(jurisdiccion\)\)/);
            assert.deepEqual(query.params, institutionWhere(request([code])).params);
        }
        const res = response();
        await handler('/resumen')(request([code], { jurisdiccion: code === 4 ? 'MINISTERIO DE EDUCACION' : 'MINISTERIO DE SALUD PUBLICA' }), res);
        assert.equal(res.statusCode, 403);
        assert.equal(queries.length, 7);
    });
}

test('una selección ajena o mixta falla antes de consultar la base', async (t) => {
    const query = t.mock.method(db, 'query', async () => { throw new Error('No debe consultar'); });
    for (const jurisdiccion of ['3', '3,4', 'TODAS,3', '4 OR 1=1']) {
        const res = response();
        await handler('/desagregados')(request([4], { jurisdiccion }), res);
        assert.ok([400, 403].includes(res.statusCode));
    }
    assert.equal(query.mock.callCount(), 0);
});

test('el usuario institucional puede consultar gastos y sesión pero no los originales Excel', () => {
    for (const path of ['/desagregados', '/desagregados/excel/:id']) {
        const route = router.stack.find((layer) => layer.route?.path === path).route;
        const res = response();
        let allowed = false;
        route.stack[1].handle(request([4]), res, () => { allowed = true; });
        assert.equal(allowed, path === '/desagregados');
        if (!allowed) assert.equal(res.statusCode, 403);
    }
});
