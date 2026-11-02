function allowUsers(...usernames) {
  const allowed = new Set(
    usernames.map((username) => String(username).trim().toLowerCase()),
  );

  return (req, res, next) => {
    const username = String(req.user?.username || '').trim().toLowerCase();

    if ((req.user?.origen === 'central-ensayo' && req.user?.role === 'admin') ||
        (req.user?.origen !== 'central-ensayo' && allowed.has(username))) {
      return next();
    }

    return res.status(403).json({
      message: 'Acceso denegado: usuario no autorizado para esta sección',
    });
  };
}

module.exports = allowUsers;
