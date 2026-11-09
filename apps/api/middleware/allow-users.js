const { isCentralUser } = require('../services/central-access');

function allowUsers(...usernames) {
  const allowed = new Set(
    usernames.map((username) => String(username).trim().toLowerCase()),
  );

  return (req, res, next) => {
    const username = String(req.user?.username || '').trim().toLowerCase();

    if ((isCentralUser(req.user) && (req.user.role === 'admin' || req.user.capabilities?.includes('gastos-desagregados'))) ||
        (!isCentralUser(req.user) && allowed.has(username))) {
      return next();
    }

    return res.status(403).json({
      message: 'Acceso denegado: usuario no autorizado para esta sección',
    });
  };
}

module.exports = allowUsers;
