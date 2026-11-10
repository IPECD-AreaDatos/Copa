function canAccessEconomicPosition(user) {
    if (user?.origen === 'central-ensayo') return user.role === 'admin';
    return typeof user?.username === 'string'
        && user.username.trim().toLowerCase() === 'admin'
        && user.access?.scope === 'global';
}

module.exports = { canAccessEconomicPosition };
