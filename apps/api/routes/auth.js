'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { config, sessionCookie } = require('../middleware/sso-config');
const { centralUser, isCentralUser } = require('../services/central-access');

router.get('/me', authMiddleware, (req, res) => res.json({ user: req.user }));
router.get('/session', (req, res, next) => {
  try { if (!config()) return res.sendStatus(503); }
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
      body: JSON.stringify({ usuario: username, password, audiencia: 'tablero' }),
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

    const identityResponse = await fetch(sso.internal + '/sso/me?audiencia=tablero', {
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
    try {
      await db.query(`INSERT INTO public.coparticipacion_registros
        (id_usuario,usuario,seccion_tablero,accion,detalle_interaccion,ip_cliente)
        VALUES (NULL,$1,'Acceso','Inicio de sesión en Copa',$2,$3)`,
      [user.username, JSON.stringify({ method: 'SSO' }), req.ip]);
    } catch (err) { console.error('Telemetría de ingreso a Copa fallida:', err.code || 'query_failed'); }
    return res.json({ user });
  } catch {
    return res.status(503).json({ message: 'El servicio central de identidad no está disponible.' });
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
  if (!sso) return res.status(503).json({ message: 'Identidad central no configurada' });
  return centralLogin(req, res, sso, username.trim(), password);
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
