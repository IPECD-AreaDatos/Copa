const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'Token requerido para autenticación' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_temporal_ipced');
    req.user = decoded;
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
  return next();
};

module.exports = verifyToken;
