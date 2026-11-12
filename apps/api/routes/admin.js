const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../db');
const { loadDataStatus } = require('../services/data-status');
const {config,sessionCookie}=require('../middleware/sso-config');
const {isCentralUser}=require('../services/central-access');

// Middleware para verificar si es admin
const isAdmin = (req, res, next) => {
  if (req.user && (isCentralUser(req.user) ? req.user.role === 'admin' : req.user.username === 'admin')) {
    return next();
  }
  return res.status(403).json({ message: 'Acceso denegado: Se requieren privilegios de administrador' });
};

// Endpoint para obtener el uso del tablero
router.get('/usage', authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        r.id_registro,
        r.fecha_hora,
        r.seccion_tablero,
        r.accion,
        r.detalle_interaccion,
        r.ip_cliente,
        COALESCE(r.usuario,u.username) AS username
      FROM public.coparticipacion_registros r
      LEFT JOIN public.usuarios_tableros u ON r.id_usuario = u.id_usuario
      WHERE COALESCE(r.usuario,u.username) != 'admin' OR COALESCE(r.usuario,u.username) IS NULL
      ORDER BY r.fecha_hora DESC
      LIMIT 500
    `);

    let rows = result.rows;
    if (isCentralUser(req.user)) {
      const sso=config();
      if (!sso) return res.status(503).json({ message: 'Auditoría central no disponible' });
      const cookie = sessionCookie(req,sso);
      if (!cookie) return res.status(401).json({ message: 'Sesión central inválida' });
      const central = await fetch(sso.internal+'/sso/auditoria/copa', {
        headers: { cookie }, redirect: 'error', signal: AbortSignal.timeout(2000),
      });
      if (!central.ok) return res.status(503).json({ message: 'Auditoría central no disponible' });
      const payload = await central.json();
      if (!Array.isArray(payload.data)) return res.status(503).json({ message: 'Auditoría central no disponible' });
      rows = [...rows, ...payload.data].sort((a,b) => new Date(b.fecha_hora) - new Date(a.fecha_hora)).slice(0,500);
    }
    res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error('[ADMIN ROUTE ERROR]', err);
    res.status(500).json({ status: 'error', message: 'Error obteniendo datos de auditoría' });
  }
});

// La autorización se aplica también al acceso directo, independientemente del menú.
router.get('/data-status', authMiddleware, isAdmin, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.json(await loadDataStatus());
  } catch (err) {
    console.error('[DATA STATUS ERROR]', err.code || 'query_failed');
    res.status(500).json({ message: 'No se pudo consultar el estado de las fuentes de datos' });
  }
});

module.exports = router;
