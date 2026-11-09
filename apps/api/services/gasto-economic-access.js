function canAccessEconomicPosition(user) {
    return typeof user?.username === 'string'
        && user.username.trim().toLowerCase() === 'admin'
        && user.access?.scope === 'global';
}

module.exports = { canAccessEconomicPosition };
