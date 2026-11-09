'use strict';

const { JURISDICCION_LABELS } = require('./gasto-desagregado');

const CENTRAL_RANKS = Object.freeze({
  admin: { role: 'admin', capabilities: ['gastos-desagregados'] },
  lector: { role: 'user', capabilities: [] },
  'analista-gastos': { role: 'analyst', capabilities: ['gastos-desagregados'] },
  'consulta-salud': { role: 'user', capabilities: [], jurisdictions: [4] },
  'consulta-educacion': { role: 'user', capabilities: [], jurisdictions: [3] },
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

  if (Array.isArray(board.alcances) && board.alcances.length) return null;
  const codes = policy.jurisdictions || [];
  if (codes.some((code) => !Number.isInteger(code) || !JURISDICCION_LABELS[code])) return null;
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
