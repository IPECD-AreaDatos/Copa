const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const logger = require('../middleware/logger');

test('la telemetría de una sesión central se guarda en Copa con el usuario', async (t) => {
  let inserted;
  t.mock.method(db, 'query', async (sql, values) => { inserted = { sql, values }; });
  const req = { user: { origen: 'central-ensayo', username: 'ivan' },
    ip: '127.0.0.1', body: { privado: 'no enviar' } };
  await logger(req, {}, () => {});
  await req.logAction('Inicio', 'Consulta', { pagina: 'inicio' });
  assert.match(inserted.sql, /INSERT INTO public\.coparticipacion_registros/);
  assert.match(inserted.sql, /id_usuario,usuario/);
  assert.deepEqual(inserted.values, ['ivan', 'Inicio', 'Consulta',
    JSON.stringify({ pagina: 'inicio' }), '127.0.0.1']);
});
