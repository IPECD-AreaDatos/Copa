const jwt = require('jsonwebtoken');
const db = require('../db');
const { publicUser } = require('../services/user-access');
const { jwtSecret } = require('../services/auth-config');

const verifyToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'Token requerido para autenticación' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
    if (!Number.isInteger(decoded.id)) return res.status(401).json({ message: 'Usuario inválido' });
    const result = await db.query(`
      SELECT id_usuario, username, tablero_acceso, activo, gastos_jurisdicciones
      FROM public.usuarios_tableros WHERE id_usuario = $1
    `, [decoded.id]);
    req.user = publicUser(result.rows[0]);
    if (!req.user) return res.status(401).json({ message: 'Sesión no autorizada' });
  } catch (err) {
    if (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError' && err.name !== 'NotBeforeError') {
      console.error('Error verificando permisos:', err.message);
      return res.status(503).json({ message: 'No se pudieron verificar los permisos de acceso' });
    }
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  if (req.user.access.scope === 'institution') {
    const allowed = req.baseUrl === '/api/gastos'
      || (req.baseUrl === '/api/auth' && req.path === '/me')
      || (req.baseUrl === '/api/analytics' && req.path === '/log');
    if (!allowed) return res.status(403).json({ message: 'Acceso limitado a los gastos de su institución' });
  }
  return next();
};

module.exports = verifyToken;
