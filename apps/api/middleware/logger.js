const db = require('../db');

/**
 * Middleware to log activity to the database automatically.
 * It expects req.user to be populated by the auth middleware.
 */
const activityLogger = async (req, res, next) => {
  const originalSend = res.send;
  
  // Custom log function that we can trigger manually or wait for response
  req.logAction = async (section, action, details = {}) => {
    const userId = req.user ? req.user.id : null;
    if (!userId) return;

    try {
      await db.query(
        `INSERT INTO public.coparticipacion_registros 
         (id_usuario, seccion_tablero, accion, detalle_interaccion, ip_cliente)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          section || 'API',
          action || `${req.method} ${req.path}`,
          JSON.stringify({
            ...details,
            params: req.params,
            query: req.query,
            body: req.method !== 'GET' ? req.body : undefined
          }),
          req.ip || req.connection.remoteAddress
        ]
      );
    } catch (err) {
      console.error('Telemetría fallida:', err.message);
    }
  };

  next();
};

module.exports = activityLogger;
