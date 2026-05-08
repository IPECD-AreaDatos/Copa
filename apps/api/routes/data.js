const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');

/**
 * Serves dashboard data safely.
 * Only authenticated users can access the JSON files.
 */
router.get('/:filename', authMiddleware, async (req, res) => {
    const { filename } = req.params;
    
    // Security: Only allow JSON files from the data folder
    if (!filename.endsWith('.json')) {
        return res.status(400).json({ message: 'Solo se permiten archivos JSON' });
    }

    // Sanitize filename to prevent directory traversal
    const safeName = path.basename(filename);
    const dataPath = path.join(__dirname, '../../../data', safeName);

    if (!fs.existsSync(dataPath)) {
        return res.status(404).json({ message: 'Archivo de datos no encontrado' });
    }

    try {
        const data = fs.readFileSync(dataPath, 'utf8');
        
        // The activityLogger middleware in index.js will automatically 
        // log that this user accessed this specific filename.
        
        res.json(JSON.parse(data));
    } catch (err) {
        console.error(`Error sirviendo ${safeName}:`, err.message);
        res.status(500).json({ message: 'Error al leer los datos' });
    }
});

module.exports = router;
