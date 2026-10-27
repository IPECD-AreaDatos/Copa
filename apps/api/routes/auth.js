const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { publicUser } = require('../services/user-access');
const { jwtSecret } = require('../services/auth-config');

router.get('/me', authMiddleware, (req, res) => res.json({ user: req.user }));

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  res.setHeader('Cache-Control', 'private, no-store');
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
  }
  console.log(`[AUTH] Intento de login para usuario: ${username}`);

  try {
    // 1. Buscamos el usuario en la DB
    const result = await db.query(
      `SELECT id_usuario, username, password_hash, tablero_acceso, activo, gastos_jurisdicciones
       FROM public.usuarios_tableros 
       WHERE username = $1 AND activo = true`,
      [username]
    );

    const user = result.rows[0];

    if (!user) {
      console.warn(`[AUTH] Usuario '${username}' no encontrado o inactivo.`);
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    console.log(`[AUTH] Usuario encontrado. Tablero: ${user.tablero_acceso}`);

    if (user.tablero_acceso !== 'coparticipacion') {
      console.warn(`[AUTH] Usuario '${username}' no tiene acceso a coparticipacion.`);
      return res.status(401).json({ message: 'No tiene permisos para este tablero' });
    }

    // 2. Verificamos contraseña (bcrypt)
    let validPassword = false;
    try {
        validPassword = await bcrypt.compare(password, user.password_hash);
    } catch (e) {
        console.log("[AUTH] Error comparando hash, probando texto plano...");
    }
    
    const isPlainMatch = !/^\$2[aby]\$/.test(user.password_hash) && password === user.password_hash;

    if (!validPassword && !isPlainMatch) {
      console.warn(`[AUTH] Contraseña incorrecta para usuario: ${username}`);
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // 2.1 Si era texto plano, migramos a Hash automáticamente
    if (isPlainMatch && !validPassword) {
      console.log(`[AUTH] Migrando contraseña de '${username}' a formato seguro (Hash)...`);
      const newHash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE public.usuarios_tableros SET password_hash = $1 WHERE id_usuario = $2',
        [newHash, user.id_usuario]
      );
    }

    const sessionUser = publicUser(user);

    // 3. Generamos JWT
    const token = jwt.sign(
      { id: user.id_usuario, username: user.username },
      jwtSecret(),
      { expiresIn: '8h' }
    );

    // 4. Log accidental (opcional aquí si usamos el logger middleware después del login)
    // Pero como el login es el primer paso, lo hacemos manual
    await db.query(
        `INSERT INTO public.coparticipacion_registros 
         (id_usuario, seccion_tablero, accion, detalle_interaccion, ip_cliente)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id_usuario, 'Acceso', 'Login Exitoso', JSON.stringify({ method: 'API' }), req.ip]
      );

    res.json({
      token,
      user: sessionUser
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

module.exports = router;
