'use strict';

// Recorrido HTTP con usuarios y servicios centrales ficticios; no conecta a bases reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  async query(sql) {
    if (typeof sql === 'string' && sql.includes('INSERT INTO public.coparticipacion_registros')) return { rows: [], rowCount: 1 };
    if (typeof sql === 'string' && sql.includes('FROM public.coparticipacion_registros')) return { rows: [] };
    throw Error('Consulta no permitida en el ensayo');
  },
} };
const realFetch = global.fetch;
const testCookie = 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
let centralDown = false;
let centralRank = 'admin';
function centralIdentity() {
  return { usuario: 'ivan_ficticio', nombres: 'Iván', apellidos: 'Prueba', tableros: [{ codigo: 'copa', rango: centralRank, alcances: [] }] };
}
function response(ok, status = 200, payload = {}, cookies = []) {
  return { ok, status, headers: { getSetCookie: () => cookies, get: () => cookies[0] || null }, json: async () => payload };
}
global.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target === 'http://127.0.0.1:38966/sso/login') {
    assert.equal(options.headers.origin, 'http://127.0.0.1:38966');
    const body = JSON.parse(options.body);
    assert.equal(body.usuario, 'ivan_ficticio');
    assert.equal(body.password, 'clave-ficticia');
    assert.equal(body.audiencia, 'tablero');
    return response(true, 200, {}, ['imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200']);
  }
  if (target === 'http://127.0.0.1:38966/sso/me?audiencia=tablero') {
    if (centralDown) throw Error('servicio central desconectado');
    if (options.headers?.cookie !== testCookie) return response(false, 401);
    return response(true, 200, centralIdentity());
  }
  if (target === 'http://127.0.0.1:38966/sso/auditoria/copa' && options.method === 'POST') return response(true, 204);
  if (target === 'http://127.0.0.1:38966/sso/auditoria/copa') {
    return response(true, 200, { data: [{ id_registro: 'central-1', username: 'ivan_ficticio', fecha_hora: '2026-11-01T00:00:00Z' }] });
  }
  if (target === 'http://127.0.0.1:38966/sso/logout') return response(true, 204);
  return realFetch(url, options);
};
process.env.COPA_SSO_ENSAYO_LOCAL = 'si';
process.env.JWT_SECRET = 'secreto-descartable-solo-para-pruebas-locales';
const app = express();
app.use(express.json());
app.use(require('../middleware/logger.js'));
app.use('/api/auth', require('../routes/auth'));
app.use('/api/admin', require('../routes/admin'));
// Los módulos anteriores pueden cargar el .env de producción; este proceso usa el ensayo local.
delete process.env.COPA_SSO_MODE;

test('el login local de Copa crea una sesión central y conserva auditoría y permisos', async () => {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { origin: 'http://127.0.0.1:3006', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ivan_ficticio', password: 'clave-ficticia' }),
    });
    assert.equal(login.status, 200);
    const loginData = await login.json();
    assert.equal(loginData.user.origen, 'central-ensayo');
    assert.equal(loginData.user.role, 'admin');
    assert.equal('token' in loginData, false);
    assert.match(login.headers.get('set-cookie') || '', /^imi_sso_ensayo=/);

    const session = await fetch(base + '/api/auth/session', { headers: { cookie: testCookie } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.origen, 'central-ensayo');

    const usage = await fetch(base + '/api/admin/usage', { headers: { cookie: testCookie } });
    assert.equal(usage.status, 200);
    assert.deepEqual((await usage.json()).data, []);

    centralRank = 'lector';
    const readerUsage = await fetch(base + '/api/admin/usage', { headers: { cookie: testCookie } });
    assert.equal(readerUsage.status, 403);
    const readerSession = await fetch(base + '/api/auth/session', { headers: { cookie: testCookie } });
    assert.equal((await readerSession.json()).user.rango, 'lector');

    assert.equal((await fetch(base + '/api/auth/session', { headers: { cookie: 'imi_sso_ensayo=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } })).status, 401);
    assert.equal((await fetch(base + '/api/auth/session')).status, 403);

    centralDown = true;
    assert.equal((await fetch(base + '/api/admin/usage', { headers: { cookie: testCookie } })).status, 401);
  } finally {
    centralDown = false;
    centralRank = 'admin';
    await new Promise(resolve => server.close(resolve));
  }
});

test('sin identidad central configurada el login local falla cerrado', async () => {
  const previous = process.env.COPA_SSO_ENSAYO_LOCAL;
  delete process.env.COPA_SSO_ENSAYO_LOCAL;
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'clave-ficticia' }),
    });
    assert.equal(login.status, 503);
    assert.equal((await fetch(base + '/api/auth/session')).status, 503);
  } finally {
    if (previous === undefined) delete process.env.COPA_SSO_ENSAYO_LOCAL; else process.env.COPA_SSO_ENSAYO_LOCAL = previous;
    await new Promise(resolve => server.close(resolve));
  }
});
