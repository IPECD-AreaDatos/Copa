function jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    return secret;
}

module.exports = { jwtSecret };
