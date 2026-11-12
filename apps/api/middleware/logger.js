const db = require('../db');
const {isCentralUser}=require('../services/central-access');

/**
 * Middleware to log activity to the database automatically.
 * It expects req.user to be populated by the auth middleware.
 */
const activityLogger = async (req, res, next) => {
  // Custom log function that we can trigger manually or wait for response
  req.logAction = async (section, action, details = {}) => {
    if (!isCentralUser(req.user)) return;
    try {
      await db.query(
        `INSERT INTO public.coparticipacion_registros
         (id_usuario,usuario,seccion_tablero,accion,detalle_interaccion,ip_cliente)
         VALUES (NULL,$1,$2,$3,$4,$5)`,
        [req.user.username, String(section || 'API').slice(0, 80),
          String(action || 'Acción').slice(0, 80), JSON.stringify(details),
          req.ip || req.connection.remoteAddress]
      );
    } catch (err) { console.error('Telemetría de Copa fallida:', err.code || 'query_failed'); }
  };

  next();
};

module.exports = activityLogger;
