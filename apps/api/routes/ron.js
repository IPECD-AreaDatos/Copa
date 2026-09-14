const express = require('express');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { loadMonthlyDashboard } = require('../services/monthly-dashboard');
const { buildAnnualMonitor } = require('../services/annual-monitor');
const router = express.Router();
const annualPath = path.join(__dirname, '../../web/public/data/_data_ipce_v1.json');

router.get('/annual-monitor', authMiddleware, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
        const monthly = await loadMonthlyDashboard();
        const historical = JSON.parse(fs.readFileSync(annualPath, 'utf8')).annual_monitor;
        res.json({ annual_monitor: buildAnnualMonitor(monthly, historical) });
    } catch (err) {
        console.error('Error al generar monitor anual:', err.message);
        res.status(500).json({ message: 'Error al obtener datos' });
    }
});

module.exports = router;
