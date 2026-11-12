const { config, sessionCookie } = require('./sso-config');
const { centralUser } = require('../services/central-access');

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  let sso; try { sso = config(); } catch { return res.status(503).json({ message: 'Configuración SSO no disponible' }); }
  if (!sso) return res.status(503).json({ message: 'Identidad central no configurada' });
  if (token) return res.status(401).json({ message: 'La sesión anterior venció. Iniciá sesión nuevamente.' });
  const cookie = sessionCookie(req, sso);
  if (!cookie) return res.status(403).json({ message: 'Sesión requerida para autenticación' });
  try {
    const response = await fetch(sso.internal + '/sso/me?audiencia=tablero', { headers: { cookie }, signal: AbortSignal.timeout(2000), redirect: 'error' });
    if (!response.ok) return res.status(401).json({ message: 'Sesión central inválida o sin acceso a Copa' });
    const identity = await response.json();
    req.user = centralUser(identity, sso);
    if (!req.user) return res.status(403).json({ message: 'El acceso asignado no está habilitado para Copa' });
  } catch { return res.status(401).json({ message: 'Sesión central inválida o sin acceso a Copa' }); }
  res.setHeader('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  res.vary('Cookie');
  if (req.user.access.scope === 'institution') {
    const ministryHome = req.user.rango === 'ministerio'
      && req.baseUrl === '/api/dashboard'
      && req.path === '/home';
    const allowed = req.baseUrl === '/api/gastos'
      || ministryHome
      || (req.baseUrl === '/api/auth' && req.path === '/me')
      || (req.baseUrl === '/api/analytics' && req.path === '/log');
    if (!allowed) return res.status(403).json({ message: 'Acceso limitado a los gastos de su institución' });
  }
  return next();
};
module.exports = verifyToken;
