const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db');
db.query = async () => ({ rows: [{ id_usuario: 17, username: 'usuario', activo: true, tablero_acceso: 'coparticipacion', gastos_jurisdicciones: null }] });
const auth = require('../middleware/auth');
const allowUsers = require('../middleware/allow-users');

async function call(headers) {
  const result = { next: false };
  const req = { headers };
  const res = { setHeader() {}, vary() {}, status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
  await auth(req, res, () => { result.next = true; });
  return { ...result, user: req.user };
}

test('la convivencia conserva tokens heredados y confía en el rango central solo tras consultar el servicio', async () => {
  const previousFetch = global.fetch;
  const previousFlag = process.env.COPA_SSO_ENSAYO_LOCAL;
  const previousMode = process.env.COPA_SSO_MODE;
  const previousSecret = process.env.JWT_SECRET;
  // El ensayo no debe heredar el modo de producción del servidor que ejecuta npm test.
  delete process.env.COPA_SSO_MODE;
  process.env.JWT_SECRET = 'secreto-exclusivo-para-pruebas-locales';
  try {
    const token = jwt.sign({ id: 17, username: 'usuario', origen: 'central-ensayo', role: 'admin' }, process.env.JWT_SECRET);
    const legacy = await call({ authorization: 'Bearer ' + token });
    assert.equal(legacy.next, true);
    assert.equal(legacy.user.username, 'usuario');
    delete process.env.COPA_SSO_ENSAYO_LOCAL;
    assert.equal((await call({ cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).status, 403);
    process.env.COPA_SSO_ENSAYO_LOCAL = 'si';
    global.fetch = async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:38966/sso/me');
      assert.equal(options.headers.cookie, 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      return { ok: true, json: async () => ({ usuario: 'ivan', tableros: [{ codigo: 'copa', rango: 'admin' }] }) };
    };
    const central = await call({ cookie: 'otra=valor; imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.deepEqual(central.user, { username: 'ivan', name: 'ivan', role: 'admin', origen: 'central-ensayo', access: { scope: 'global', jurisdictions: [] } });
    let allowed = false;
    allowUsers('admin')({ user: central.user }, {}, () => { allowed = true; });
    assert.equal(allowed, true);
    global.fetch = async () => ({ ok: true, json: async () => ({ usuario: 'ivan', tableros: [{ codigo: 'copa', rango: 'lector' }] }) });
    const reader = await call({ cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.equal(reader.status, 403);
    global.fetch = async () => ({ ok: true, json: async () => ({ usuario: 'ivan', tableros: [] }) });
    assert.equal((await call({ cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).status, 403);
    global.fetch = async () => { throw Error('servicio no disponible'); };
    assert.equal((await call({ cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).status, 401);
  } finally {
    global.fetch = previousFetch;
    if (previousFlag === undefined) delete process.env.COPA_SSO_ENSAYO_LOCAL; else process.env.COPA_SSO_ENSAYO_LOCAL = previousFlag;
    if (previousMode === undefined) delete process.env.COPA_SSO_MODE; else process.env.COPA_SSO_MODE = previousMode;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  }
});
