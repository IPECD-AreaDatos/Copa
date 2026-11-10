/* eslint-disable @typescript-eslint/no-require-imports -- Node runs this test as CommonJS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('src/hooks/useDashboardSession.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
async function scenario(central, legacyToken, centralStatus = null, networkFailure = false) {
  const storage = new Map(legacyToken ? [['copa_token', legacyToken], ['copa_user', 'antiguo']] : []);
  const state = []; let effect, oldCalls = 0, redirect = null;
  const react = { useState(value) { const i = state.length; state.push(value); return [value, v => { state[i] = v; }]; }, useEffect(fn) { effect = fn; }, useCallback(fn) { return fn; } };
  const modules = { react, 'next/navigation': { usePathname: () => '/', useRouter: () => ({ replace(v) { redirect = v; } }) }, '@/lib/access': { isInstitutionUser: user => user.access?.scope === 'institution' }, '@/lib/api': { async fetchWithAuth() { oldCalls++; return { ok: true, json: async () => ({ user: { username: 'anterior', access: { scope: 'global' } } }) }; } } };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: n => modules[n], process: { env: { NEXT_PUBLIC_COPA_SSO_ENABLED: 'si' } }, localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }, fetch: async () => { if (networkFailure) throw Error('central unavailable'); return { ok: !!central, status: centralStatus ?? (central ? 200 : 404), json: async () => ({ user: central }) }; }, queueMicrotask, AbortController });
  exports.useDashboardSession(); effect();
  await new Promise(r => setTimeout(r, 10));
  return { state, storage, oldCalls, redirect };
}
test('la sesión central reemplaza el token antiguo del mismo navegador', async () => {
  const s = await scenario({ username: 'central', origen: 'central-ensayo' }, 'token-anterior');
  assert.equal(s.state[0].username, 'central'); assert.equal(s.storage.has('copa_token'), false); assert.equal(s.oldCalls, 0);
});
test('si no hay sesión central conserva el ingreso anterior', async () => {
  const s = await scenario(null, 'token-anterior');
  assert.equal(s.state[0].username, 'anterior'); assert.equal(s.storage.get('copa_token'), 'token-anterior'); assert.equal(s.oldCalls, 1);
});
test('sin sesión central ni anterior solicita ingresar', async () => {
  const s = await scenario(null, null); assert.equal(s.redirect, '/login');
});
test('con SSO activo no reutiliza un token local cuando central rechaza la sesión', async () => {
  const s = await scenario(null, 'token-anterior', 401);
  assert.equal(s.storage.has('copa_token'), false); assert.equal(s.oldCalls, 0); assert.equal(s.redirect, '/login');
});
test('con SSO activo no reutiliza un token local si central no responde', async () => {
  const s = await scenario(null, 'token-anterior', null, true);
  assert.equal(s.storage.has('copa_token'), false); assert.equal(s.oldCalls, 0); assert.equal(s.redirect, '/login');
});
