'use strict';

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

test('la convivencia conserva JWT locales cuando SSO está desactivado', async () => {
  const previousFlag = process.env.COPA_SSO_ENSAYO_LOCAL;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'secreto-exclusivo-para-pruebas-locales';
  try {
    delete process.env.COPA_SSO_ENSAYO_LOCAL;
    const token = jwt.sign({ id: 17, username: 'usuario' }, process.env.JWT_SECRET);
    const legacy = await call({ authorization: 'Bearer ' + token });
    assert.equal(legacy.next, true);
    assert.equal(legacy.user.username, 'usuario');
  } finally {
    if (previousFlag === undefined) delete process.env.COPA_SSO_ENSAYO_LOCAL; else process.env.COPA_SSO_ENSAYO_LOCAL = previousFlag;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  }
});

test('con SSO activo requiere la sesión central y resuelve el rango desde el servicio', async () => {
  const previousFetch = global.fetch;
  const previousFlag = process.env.COPA_SSO_ENSAYO_LOCAL;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'secreto-exclusivo-para-pruebas-locales';
  process.env.COPA_SSO_ENSAYO_LOCAL = 'si';
  try {
    const token = jwt.sign({ id: 17, username: 'usuario' }, process.env.JWT_SECRET);
    assert.equal((await call({ authorization: 'Bearer ' + token })).status, 401);
    global.fetch = async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:38966/sso/me');
      assert.equal(options.headers.cookie, 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      return { ok: true, json: async () => ({ usuario: 'ivan', nombres: 'Iván', apellidos: 'Rodríguez', tableros: [{ codigo: 'copa', rango: 'admin', alcances: [] }] }) };
    };
    const central = await call({ cookie: 'otra=valor; imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.equal(central.next, true);
    assert.deepEqual(central.user, {
      username: 'ivan', name: 'Iván Rodríguez', role: 'admin', rango: 'admin', origen: 'central-ensayo',
      capabilities: ['gastos-desagregados'], access: { scope: 'global', jurisdictions: [] },
    });
    let allowed = false;
    allowUsers('admin')({ user: central.user }, {}, () => { allowed = true; });
    assert.equal(allowed, true);
  } finally {
    global.fetch = previousFetch;
    if (previousFlag === undefined) delete process.env.COPA_SSO_ENSAYO_LOCAL; else process.env.COPA_SSO_ENSAYO_LOCAL = previousFlag;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  }
});

test('el rango lector habilita el tablero pero no gastos desagregados', async () => {
  const previousFetch = global.fetch;
  const previousFlag = process.env.COPA_SSO_ENSAYO_LOCAL;
  process.env.COPA_SSO_ENSAYO_LOCAL = 'si';
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ usuario: 'lector', tableros: [{ codigo: 'copa', rango: 'lector', alcances: [] }] }) });
    const reader = await call({ cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.equal(reader.next, true);
    assert.equal(reader.user.role, 'user');
    assert.equal(reader.user.access.scope, 'global');
    let allowed = false;
    let deniedStatus = null;
    allowUsers('admin')({ user: reader.user }, { status(code) { deniedStatus = code; return this; }, json() {} }, () => { allowed = true; });
    assert.equal(allowed, false);
    assert.equal(deniedStatus, 403);
  } finally {
    global.fetch = previousFetch;
    if (previousFlag === undefined) delete process.env.COPA_SSO_ENSAYO_LOCAL; else process.env.COPA_SSO_ENSAYO_LOCAL = previousFlag;
  }
});

test('analista y rangos institucionales conservan los permisos actuales', async () => {
  const previousFetch = global.fetch;
  const previousFlag = process.env.COPA_SSO_ENSAYO_LOCAL;
  process.env.COPA_SSO_ENSAYO_LOCAL = 'si';
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ usuario: 'analista', tableros: [{ codigo: 'copa', rango: 'analista-gastos', alcances: [] }] }) });
    const analyst = await call({ cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.equal(analyst.user.capabilities.includes('gastos-desagregados'), true);
    let allowed = false;
    allowUsers('otro')({ user: analyst.user }, {}, () => { allowed = true; });
    assert.equal(allowed, true);

    global.fetch = async () => ({ ok: true, json: async () => ({ usuario: 'institucion', tableros: [{ codigo: 'copa', rango: 'consulta-salud', alcances: [] }] }) });
    const institution = await call({ cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.equal(institution.user.access.scope, 'institution');
    assert.deepEqual(institution.user.access.jurisdictions, [{ code: 4, name: 'MINISTERIO DE SALUD PÚBLICA' }]);
  } finally {
    global.fetch = previousFetch;
    if (previousFlag === undefined) delete process.env.COPA_SSO_ENSAYO_LOCAL; else process.env.COPA_SSO_ENSAYO_LOCAL = previousFlag;
  }
});

test('rechaza rangos desconocidos, alcances no previstos y cuentas sin Copa', async () => {
  const previousFetch = global.fetch;
  const previousFlag = process.env.COPA_SSO_ENSAYO_LOCAL;
  process.env.COPA_SSO_ENSAYO_LOCAL = 'si';
  try {
    for (const tableros of [
      [{ codigo: 'copa', rango: 'superadmin', alcances: [] }],
      [{ codigo: 'copa', rango: 'consulta-salud', alcances: [{ tipo: 'jurisdiccion', valor: '4' }] }],
      [{ codigo: 'activos', rango: 'admin', alcances: [] }],
    ]) {
      global.fetch = async () => ({ ok: true, json: async () => ({ usuario: 'cuenta', tableros }) });
      assert.equal((await call({ cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).status, 403);
    }
    global.fetch = async () => { throw Error('servicio no disponible'); };
    assert.equal((await call({ cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).status, 401);
  } finally {
    global.fetch = previousFetch;
    if (previousFlag === undefined) delete process.env.COPA_SSO_ENSAYO_LOCAL; else process.env.COPA_SSO_ENSAYO_LOCAL = previousFlag;
  }
});
