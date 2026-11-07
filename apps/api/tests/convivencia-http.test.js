'use strict';
// Ejercicio HTTP de rutas reales sin conexiones a las bases de negocio.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcrypt');
const dbPath = require.resolve('../db');
let passwordHash;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  async query(sql) {
    if (typeof sql === 'string' && sql.includes('FROM public.usuarios_tableros')) return { rows: [{ id_usuario: 17, username: 'admin', password_hash: passwordHash, tablero_acceso: 'coparticipacion', activo: true, gastos_jurisdicciones: null }] };
    if (typeof sql === 'string' && sql.includes('INSERT INTO public.coparticipacion_registros')) return { rows: [], rowCount: 1 };
    if (typeof sql === 'string' && sql.includes('FROM public.coparticipacion_registros')) return { rows: [] };
    throw Error('Consulta de base no permitida en el ensayo');
  },
} };
const realFetch = global.fetch;
let centralDown = false;
global.fetch = (url, options) => {
  if (String(url) === 'http://127.0.0.1:38966/sso/me') {
    if (centralDown) return Promise.reject(new Error('servicio central desconectado'));
    if (options.headers.cookie !== 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: true, json: async () => ({ usuario: 'ivan_ficticio', tableros: [{ codigo: 'copa', rango: 'admin' }] }) });
  }
  if (String(url) === 'http://127.0.0.1:38966/sso/auditoria/copa') {
    return Promise.resolve({ ok: true, json: async () => ({ data: [{ id_registro: 'central-1', username: 'ivan_ficticio', fecha_hora: '2026-11-01T00:00:00Z' }] }) });
  }
  return realFetch(url, options);
};
process.env.COPA_SSO_ENSAYO_LOCAL = 'si';
process.env.JWT_SECRET = 'secreto-descartable-solo-para-pruebas-locales';
const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/auth'));
app.use('/api/admin', require('../routes/admin'));
// Los módulos anteriores pueden cargar el .env de producción; este proceso usa el ensayo local.
delete process.env.COPA_SSO_MODE;

test('las rutas reales admiten login anterior y sesión central en paralelo', async () => {
  passwordHash = await bcrypt.hash('clave-ficticia', 4);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const old = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'clave-ficticia' }) });
    assert.equal(old.status, 200);
    const token = (await old.json()).token;
    assert.equal((await fetch(base + '/api/admin/usage', { headers: { authorization: 'Bearer ' + token } })).status, 200);
    const central = await fetch(base + '/api/auth/session', { headers: { cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
    assert.equal(central.status, 200);
    assert.equal((await central.json()).user.role, 'admin');
    const usage = await fetch(base + '/api/admin/usage', { headers: { cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
    assert.equal(usage.status, 200);assert.equal((await usage.json()).data[0].id_registro, 'central-1');
    assert.equal((await fetch(base + '/api/admin/usage', { headers: { cookie: 'imi_sso_ensayo=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } })).status, 401);
    assert.equal((await fetch(base + '/api/auth/session')).status, 403);
    centralDown = true;
    assert.equal((await fetch(base + '/api/admin/usage', { headers: { cookie: 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } })).status, 401);
    assert.equal((await fetch(base + '/api/admin/usage', { headers: { authorization: 'Bearer ' + token } })).status, 200);
    assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'clave-ficticia' }) })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
