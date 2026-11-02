const test = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../middleware/logger');

test('la auditoría central usa la sesión y no envía datos de la solicitud ni IDs heredados', async () => {
  const original = global.fetch, flag = process.env.COPA_SSO_ENSAYO_LOCAL;
  process.env.COPA_SSO_ENSAYO_LOCAL = 'si';
  let sent;
  global.fetch = async (url, options) => { sent = { url, options }; return { ok: true }; };
  try {
    const req = { user: { origen: 'central-ensayo', username: 'ivan' }, headers: { cookie: 'otra=descartar; imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, body: { privado: 'no enviar' } };
    await logger(req, {}, () => {});
    await req.logAction('Inicio', 'Consulta', { privado: 'no enviar' });
    assert.equal(sent.url, 'http://127.0.0.1:38966/sso/auditoria/copa');
    assert.equal(sent.options.headers.cookie, 'imi_sso_ensayo=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.deepEqual(JSON.parse(sent.options.body), { seccion: 'Inicio', accion: 'Consulta' });
  } finally {
    global.fetch = original;
    if (flag === undefined) delete process.env.COPA_SSO_ENSAYO_LOCAL; else process.env.COPA_SSO_ENSAYO_LOCAL = flag;
  }
});
