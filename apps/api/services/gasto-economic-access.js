function canAccessEconomicPosition(user) {
    return user?.role === 'admin'
        && user.access?.scope === 'global'
        && typeof user.username === 'string'
        && user.username.trim().toLowerCase() === 'admin';
}

module.exports = { canAccessEconomicPosition };
