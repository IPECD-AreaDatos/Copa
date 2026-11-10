'use strict';

const { JURISDICCION_LABELS } = require('./gasto-desagregado');

const CENTRAL_RANKS = Object.freeze({
  admin: { role: 'admin', capabilities: ['gastos-desagregados'] },
  // Compatibilidad si alguien conserva un acceso legado al rango editor.
  editor: { role: 'editor', capabilities: ['gastos-desagregados'] },
  lector: { role: 'user', capabilities: [] },
  'analista-gastos': { role: 'analyst', capabilities: ['gastos-desagregados'] },
  ministerio: { role: 'user', capabilities: [], scope: 'institution' },
});

function isCentralUser(user) {
  return user?.origen === 'central' || user?.origen === 'central-ensayo';
}

function centralUser(identity, sso) {
  if (!identity || typeof identity.usuario !== 'string' || !identity.usuario.trim() || !Array.isArray(identity.tableros)) return null;

  const board = identity.tableros.find((item) => item?.codigo === 'copa');
  if (!board) return null;

  const rank = identity.admin === true ? 'admin' : board.rango;
  const policy = CENTRAL_RANKS[rank];
  if (!policy) return null;

  const scopes = Array.isArray(board.alcances) ? board.alcances : [];
  let codes = [];
  if (policy.scope === 'institution') {
    if (!scopes.length) return null;
    for (const scope of scopes) {
      const value = typeof scope?.valor === 'string' ? scope.valor.trim() : '';
      if (scope?.tipo !== 'jurisdiccion' || !/^[1-9]\d*$/.test(value)) return null;
      const code = Number(value);
      if (!Number.isSafeInteger(code) || !JURISDICCION_LABELS[code] || codes.includes(code)) return null;
      codes.push(code);
    }
  } else if (scopes.length) {
    return null;
  }
  const jurisdictions = codes.map((code) => ({ code, name: JURISDICCION_LABELS[code] }));

  const name = [identity.nombres, identity.apellidos]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim())
    .join(' ') || identity.usuario;

  return {
    username: identity.usuario,
    name,
    role: policy.role,
    rango: rank,
    origen: sso?.mode === 'production' ? 'central' : 'central-ensayo',
    capabilities: policy.capabilities,
    access: {
      scope: jurisdictions.length ? 'institution' : 'global',
      jurisdictions,
    },
  };
}

module.exports = { CENTRAL_RANKS, centralUser, isCentralUser };
