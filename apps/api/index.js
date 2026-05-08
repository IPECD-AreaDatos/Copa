const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config({ path: '../../.env' });

const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');
const dataRoutes = require('./routes/data');
const personalRoutes = require('./routes/personal');
const ronRoutes = require('./routes/ron');
const gastosRoutes = require('./routes/gastos');
const activityLogger = require('./middleware/logger');

const app = express();
const PORT = process.env.PORT || 4000;

// 1. Middlewares Básicos
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// 2. Middleware de Auditoría (Telemetría Automática)
// Este middleware añade la función req.logAction y captura metadatos básicos
app.use(activityLogger);

// 3. Rutas de la API
app.use('/api/auth', authRoutes);           // Login y Usuarios
app.use('/api/analytics', analyticsRoutes); // Registro de eventos manuales
app.use('/api/data', dataRoutes);           // Acceso SEGURO a los JSON de datos
app.use('/api/personal', personalRoutes);   // Datos dinámicos desde vistas SQL
app.use('/api/ron', ronRoutes);             // Datos de Recursos (RON) desde vistas SQL
app.use('/api/gastos', gastosRoutes);       // Datos de Gastos desde vistas SQL

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'IPECD Copa API', 
    db: 'connected',
    timestamp: new Date() 
  });
});

app.listen(PORT, () => {
  console.log('==============================================');
  console.log(`🚀 SERVIDOR COPA listo en puerto ${PORT}`);
  console.log(`🔒 SEGURIDAD: JWT Activo`);
  console.log(`📊 AUDITORÍA: Registro automático activado`);
  console.log('==============================================');
});
