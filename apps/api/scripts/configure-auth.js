const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const { jwtSecret } = require('../services/auth-config');
const envPath = path.resolve(__dirname, '../../../.env');
const source = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const configured = process.env.JWT_SECRET || dotenv.parse(source).JWT_SECRET;

if (configured) {
    process.env.JWT_SECRET = configured;
    jwtSecret();
    console.log('Firma de sesiones: clave existente validada.');
} else {
    const secret = crypto.randomBytes(48).toString('base64url');
    const next = source.replace(/^\s*JWT_SECRET\s*=.*$/gm, '').trimEnd();
    fs.writeFileSync(envPath, `${next}\nJWT_SECRET=${secret}\n`, { mode: 0o600 });
    fs.chmodSync(envPath, 0o600);
    console.log('Firma de sesiones: clave privada configurada; las sesiones anteriores requerirán ingresar nuevamente.');
}
