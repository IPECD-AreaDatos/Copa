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

test('protege el desglose y las hojas Excel con la misma autenticación y autorización', () => {
  const router = require('../routes/gastos');
  const authentication = require('../middleware/auth');
  const paths = ['/desagregados', '/desagregados/excel/:id'];
  const routes = paths.map((path) => router.stack.find((layer) => layer.route?.path === path).route);
  for (const route of routes) {
    assert.equal(route.stack.length, 3);
    assert.equal(route.stack[0].handle, authentication);
    assert.equal(route.stack[1].handle, routes[0].stack[1].handle);
    let nextCalled = false;
    let statusCode;
    route.stack[1].handle({ user: { username: 'otro_usuario' } }, {
      status(code) { statusCode = code; return this; },
      json() {},
    }, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 403);
  }
});
