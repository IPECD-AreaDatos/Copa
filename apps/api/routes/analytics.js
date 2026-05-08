const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

/**
 * Route for manual UI telemetry
 * Used for actions that aren't API calls (clicks, toggles, etc.)
 */
router.post('/log', authMiddleware, async (req, res) => {
  const { seccion, accion, detalle } = req.body;

  try {
    // req.logAction is provided by the activityLogger middleware
    await req.logAction(seccion, accion, detalle);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
