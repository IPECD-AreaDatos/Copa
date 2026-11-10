const jwt = require('jsonwebtoken');
const db = require('../db');
const { publicUser } = require('../services/user-access');
const { jwtSecret } = require('../services/auth-config');
const { config, sessionCookie } = require('./sso-config');

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    let sso; try { sso = config(); } catch { return res.status(503).json({ message: 'Configuración SSO no disponible' }); }
    if (!sso) return res.status(403).json({ message: 'Token requerido para autenticación' });
    const cookie = sessionCookie(req, sso);
    if (!cookie) return res.status(403).json({ message: 'Token requerido para autenticación' });
    try {
      const response = await fetch(sso.internal + '/sso/me', { headers: { cookie }, signal: AbortSignal.timeout(2000), redirect: 'error' });
      if (!response.ok) return res.status(401).json({ message: 'Sesión central inválida o sin acceso a Copa' });
      const identity = await response.json();
      const board = Array.isArray(identity.tableros) && identity.tableros.find(t => t.codigo === 'copa');
      if (!board || !['admin', 'editor', 'lector'].includes(board.rango) || typeof identity.usuario !== 'string') {
        return res.status(403).json({ message: 'La cuenta no tiene un rango central habilitado en Copa' });
      }
      req.user = {
        username: identity.usuario,
        name: identity.usuario,
        role: board.rango,
        origen: 'central-ensayo',
        access: { scope: 'global', jurisdictions: [] },
      };
    } catch { return res.status(401).json({ message: 'Sesión central inválida o sin acceso a Copa' }); }
  } else {
    try {
      const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
      if (!Number.isInteger(decoded.id)) return res.status(401).json({ message: 'Usuario inválido' });
      const result = await db.query('SELECT id_usuario, username, tablero_acceso, activo, gastos_jurisdicciones FROM public.usuarios_tableros WHERE id_usuario = $1', [decoded.id]);
      req.user = publicUser(result.rows[0]);
      if (!req.user) return res.status(401).json({ message: 'Sesión no autorizada' });
    } catch (err) {
      if (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError' && err.name !== 'NotBeforeError') {
        console.error('Error verificando permisos:', err.message);
        return res.status(503).json({ message: 'No se pudieron verificar los permisos de acceso' });
      }
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  res.vary('Cookie');
  if (req.user.access.scope === 'institution') {
    const allowed = req.baseUrl === '/api/gastos'
      || (req.baseUrl === '/api/auth' && req.path === '/me')
      || (req.baseUrl === '/api/analytics' && req.path === '/log');
    if (!allowed) return res.status(403).json({ message: 'Acceso limitado a los gastos de su institución' });
  }
  return next();
};
module.exports = verifyToken;
