'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { publicUser } = require('../services/user-access');
const { jwtSecret } = require('../services/auth-config');
const { config, sessionCookie } = require('../middleware/sso-config');
const { centralUser, isCentralUser } = require('../services/central-access');

router.get('/me', authMiddleware, (req, res) => res.json({ user: req.user }));
router.get('/session', (req, res, next) => {
  try { if (!config()) return res.sendStatus(404); }
  catch { return res.sendStatus(503); }
  res.set('Cache-Control', 'no-store');
  return next();
}, authMiddleware, (req, res) => {
  if (!isCentralUser(req.user)) return res.sendStatus(401);
  return res.json({ user: req.user });
});

async function centralLogin(req, res, sso, username, password) {
  if (req.get('origin') !== sso.external) return res.status(403).json({ message: 'Origen no permitido' });
  try {
    const response = await fetch(sso.internal + '/sso/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: sso.identityOrigin },
      body: JSON.stringify({ usuario: username, password }),
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!response.ok) {
      if (response.status === 401) return res.status(401).json({ message: 'Credenciales inválidas' });
      if (response.status === 429) return res.status(429).json({ message: 'Demasiados intentos. Esperá un momento y probá nuevamente.' });
      return res.status(503).json({ message: 'No se pudo iniciar sesión. Intentá nuevamente.' });
    }

    const cookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    const issued = cookies.find((value) => value.startsWith(sso.cookieName + '='));
    const cookie = issued?.split(';', 1)[0];
    if (!cookie || !new RegExp('^' + sso.cookieName + '=[A-Za-z0-9_-]{43}$').test(cookie)) {
      return res.status(503).json({ message: 'No se pudo iniciar la sesión central.' });
    }

    const identityResponse = await fetch(sso.internal + '/sso/me', {
      headers: { cookie }, signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    if (!identityResponse.ok) return res.status(503).json({ message: 'No se pudo verificar el acceso a Copa.' });
    const user = centralUser(await identityResponse.json(), sso);
    if (!user) {
      await fetch(sso.internal + '/sso/logout', {
        method: 'POST', headers: { cookie, origin: sso.identityOrigin },
        signal: AbortSignal.timeout(2000), redirect: 'error',
      }).catch(() => {});
      return res.status(403).json({ message: 'La cuenta no tiene un acceso habilitado a Copa.' });
    }

    res.setHeader('Set-Cookie', issued);
    await fetch(sso.internal + '/sso/auditoria/copa', {
      method: 'POST',
      headers: { cookie, origin: sso.identityOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ seccion: 'Acceso', accion: 'Inicio de sesión en Copa' }),
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    }).catch(() => null);
    return res.json({ user });
  } catch {
    return res.status(503).json({ message: 'El servicio central de identidad no está disponible.' });
  }
}

async function legacyLogin(req, res, username, password) {
  console.log(`[AUTH] Intento de login para usuario: ${username}`);
  try {
    const result = await db.query(
      `SELECT id_usuario, username, password_hash, tablero_acceso, activo, gastos_jurisdicciones
       FROM public.usuarios_tableros
       WHERE username = $1 AND activo = true`,
      [username]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });
    if (user.tablero_acceso !== 'coparticipacion') return res.status(401).json({ message: 'No tiene permisos para este tablero' });

    let validPassword = false;
    try { validPassword = await bcrypt.compare(password, user.password_hash); }
    catch { console.log('[AUTH] No se pudo comprobar el hash bcrypt heredado.'); }
    const isPlainMatch = !/^\$2[aby]\$/.test(user.password_hash) && password === user.password_hash;
    if (!validPassword && !isPlainMatch) return res.status(401).json({ message: 'Credenciales inválidas' });

    if (isPlainMatch && !validPassword) {
      const newHash = await bcrypt.hash(password, 10);
      await db.query('UPDATE public.usuarios_tableros SET password_hash = $1 WHERE id_usuario = $2', [newHash, user.id_usuario]);
    }

    const sessionUser = publicUser(user);
    const token = jwt.sign({ id: user.id_usuario, username: user.username }, jwtSecret(), { expiresIn: '12h' });
    await db.query(
      `INSERT INTO public.coparticipacion_registros
       (id_usuario, seccion_tablero, accion, detalle_interaccion, ip_cliente)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id_usuario, 'Acceso', 'Login Exitoso', JSON.stringify({ method: 'API' }), req.ip]
    );
    return res.json({ token, user: sessionUser });
  } catch (err) {
    console.error('[AUTH] Error al iniciar sesión:', err.code || 'request_failed');
    return res.status(500).json({ message: 'Error en el servidor' });
  }
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  res.setHeader('Cache-Control', 'private, no-store');
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
  }

  let sso;
  try { sso = config(); }
  catch { return res.status(503).json({ message: 'Configuración SSO no disponible' }); }
  if (sso) return centralLogin(req, res, sso, username.trim(), password);
  return legacyLogin(req, res, username.trim(), password);
});

router.post('/logout-central', async (req, res) => {
  let sso; try { sso = config(); } catch { return res.sendStatus(503); }
  if (!sso) return res.sendStatus(404);
  if (req.get('origin') !== sso.external) return res.sendStatus(403);
  const cookie = sessionCookie(req, sso);
  if (!cookie) return res.sendStatus(401);
  try {
    const response = await fetch(sso.internal + '/sso/logout', {
      method: 'POST', headers: { cookie, origin: sso.identityOrigin },
      redirect: 'error', signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return res.sendStatus(503);
    res.set('Set-Cookie', sso.cookieName + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (sso.external.startsWith('https:') ? '; Secure' : ''));
    return res.sendStatus(204);
  } catch { return res.sendStatus(503); }
});

module.exports = router;
