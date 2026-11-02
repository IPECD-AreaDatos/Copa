const db = require('../db');
const {config,sessionCookie}=require('./sso-config');

/**
 * Middleware to log activity to the database automatically.
 * It expects req.user to be populated by the auth middleware.
 */
const activityLogger = async (req, res, next) => {
  const originalSend = res.send;
  
  // Custom log function that we can trigger manually or wait for response
  req.logAction = async (section, action, details = {}) => {
    if (req.user?.origen === 'central-ensayo') {
      let sso;try{sso=config()}catch{return}
      const cookie = sso&&sessionCookie(req,sso);
      if (!cookie || !sso) return;
      try {
        const response = await fetch(sso.internal+'/sso/auditoria/copa', {
          method: 'POST', headers: { cookie, origin: sso.identityOrigin, 'content-type': 'application/json' },
          body: JSON.stringify({ seccion: String(section || 'API').slice(0, 80), accion: String(action || 'Acción').slice(0, 80) }),
          signal: AbortSignal.timeout(2000), redirect: 'error',
        });
        if (!response.ok) console.error('No se pudo registrar la auditoría central de ensayo');
      } catch { console.error('No se pudo registrar la auditoría central de ensayo'); }
      return;
    }
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
