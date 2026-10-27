const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authenticate = require('../middleware/auth');
const { publicUser, scopeDetailedFilters, institutionWhere } = require('../services/user-access');
const router = require('../routes/gastos');

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
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
    vary(key) { this.headers.Vary = key; },
});
const handler = (path) => router.stack.find((layer) => layer.route?.path === path).route.stack.at(-1).handle;
const token = (claims = {}) => jwt.sign({ id: 900001, ...claims }, process.env.JWT_SECRET);
const authRequest = (signedToken, baseUrl = '/api/gastos', path = '/all-data') => ({
    headers: { authorization: `Bearer ${signedToken}` }, baseUrl, path,
});

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

    test(`jurisdicción ${code}: ni username ni permisos adulterados en JWT amplían el acceso`, async (t) => {
        t.mock.method(db, 'query', async () => ({ rows: [row([code])] }));
        const req = authRequest(token({ username: 'admin', role: 'admin', access: { scope: 'global' } }));
        const res = response();
        let allowed = false;
        await authenticate(req, res, () => { allowed = true; });
        assert.equal(allowed, true);
        assert.equal(req.user.username, 'test_institution');
        assert.deepEqual(req.user.access.jurisdictions.map((j) => j.code), [code]);
        assert.match(res.headers['Cache-Control'], /private.*no-store/);
        assert.equal(res.headers.Vary, 'Authorization');
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

test('cambios de permisos y baja de usuario se aplican al mismo token sin esperar su vencimiento', async (t) => {
    let current = row([4]);
    t.mock.method(db, 'query', async () => ({ rows: [current] }));
    const signed = token();
    const req = authRequest(signed);
    await authenticate(req, response(), () => {});
    assert.equal(req.user.access.jurisdictions[0].code, 4);
    current = row([3]);
    await authenticate(req, response(), () => {});
    assert.equal(req.user.access.jurisdictions[0].code, 3);
    current = row([3], { activo: false });
    const res = response();
    await authenticate(req, res, () => assert.fail('Usuario inactivo autorizado'));
    assert.equal(res.statusCode, 401);
});

test('los perfiles institucionales no acceden a totales provinciales, sueldos, archivos ni auditoría', async (t) => {
    t.mock.method(db, 'query', async () => ({ rows: [row([4])] }));
    for (const [baseUrl, path] of [
        ['/api/dashboard', '/home'], ['/api/dashboard', '/monthly'], ['/api/ron', '/annual-monitor'],
        ['/api/data', '/gasto_data.json'], ['/api/personal', '/masa-salarial'], ['/api/admin', '/usage'],
    ]) {
        const res = response();
        await authenticate(authRequest(token(), baseUrl, path), res, () => assert.fail('Se permitió una sección general'));
        assert.equal(res.statusCode, 403);
    }
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

test('la falta de base o configuración de permisos nunca concede acceso general', async (t) => {
    t.mock.method(db, 'query', async () => { throw new Error('Base no disponible'); });
    const res = response();
    await authenticate(authRequest(token()), res, () => assert.fail('Se autorizó sin permisos verificados'));
    assert.equal(res.statusCode, 503);
});

test('no se acepta una firma con la antigua clave predecible ni una configuración vacía', async () => {
    const forged = jwt.sign({ id: 900001, username: 'admin' }, 'secret_key_temporal_ipced');
    const res = response();
    await authenticate(authRequest(forged), res, () => assert.fail('Se aceptó una firma predecible'));
    assert.equal(res.statusCode, 401);
    const saved = process.env.JWT_SECRET;
    try {
        delete process.env.JWT_SECRET;
        const unavailable = response();
        await authenticate(authRequest(forged), unavailable, () => assert.fail('Se aceptó una sesión sin clave configurada'));
        assert.equal(unavailable.statusCode, 503);
    } finally { process.env.JWT_SECRET = saved; }
});

test('el login entrega la institución del usuario y no acepta el propio hash como contraseña', async (t) => {
    const bcrypt = require('bcrypt');
    const password = crypto.randomBytes(18).toString('base64url');
    const hash = await bcrypt.hash(password, 4);
    t.mock.method(db, 'query', async (sql) => ({ rows: sql.includes('FROM public.usuarios_tableros') ? [row([4], { password_hash: hash })] : [] }));
    const authRouter = require('../routes/auth');
    const login = authRouter.stack.find((layer) => layer.route?.path === '/login').route.stack[0].handle;
    const accepted = response();
    await login({ body: { username: 'test_institution', password }, ip: '127.0.0.1' }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.body.user.access.scope, 'institution');
    assert.deepEqual(accepted.body.user.access.jurisdictions.map((j) => j.code), [4]);
    assert.equal(jwt.verify(accepted.body.token, process.env.JWT_SECRET).id, 900001);
    const rejected = response();
    await login({ body: { username: 'test_institution', password: hash } }, rejected);
    assert.equal(rejected.statusCode, 401);
});
