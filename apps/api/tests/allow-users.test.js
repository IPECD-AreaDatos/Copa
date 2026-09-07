const assert = require('node:assert/strict');
const test = require('node:test');
const allowUsers = require('../middleware/allow-users');

const authorize = allowUsers('gcorrales', 'admin');

function run(username) {
  let nextCalled = false;
  let statusCode = null;
  let payload = null;

  const req = username === undefined ? {} : { user: { username } };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  authorize(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, statusCode, payload };
}

test('permite al usuario gcorrales', () => {
  assert.equal(run('gcorrales').nextCalled, true);
});

test('permite al usuario admin', () => {
  assert.equal(run('admin').nextCalled, true);
});

test('normaliza mayúsculas y espacios', () => {
  assert.equal(run('  GCORRALES ').nextCalled, true);
});

test('rechaza a otros usuarios', () => {
  const result = run('otro_usuario');
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.match(result.payload.message, /Acceso denegado/);
});

test('rechaza solicitudes sin usuario autenticado', () => {
  const result = run(undefined);
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
});
