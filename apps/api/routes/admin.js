const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../db');

// Middleware para verificar si es admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.username === 'admin') {
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
        u.username
      FROM public.coparticipacion_registros r
      LEFT JOIN public.usuarios_tableros u ON r.id_usuario = u.id_usuario
      WHERE u.username != 'admin' OR u.username IS NULL
      ORDER BY r.fecha_hora DESC
      LIMIT 500
    `);

    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[ADMIN ROUTE ERROR]', err);
    res.status(500).json({ status: 'error', message: 'Error obteniendo datos de auditoría' });
  }
});

module.exports = router;
