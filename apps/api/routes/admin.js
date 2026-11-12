const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../db');
const { loadDataStatus } = require('../services/data-status');
const {isCentralUser}=require('../services/central-access');

// Middleware para verificar si es admin
const isAdmin = (req, res, next) => {
  if (isCentralUser(req.user) && req.user.role === 'admin') {
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
        r.usuario AS username
      FROM public.coparticipacion_registros r
      WHERE r.usuario != 'admin'
      ORDER BY r.fecha_hora DESC
      LIMIT 500
    `);

    res.json({ status: 'success', data: result.rows });
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
