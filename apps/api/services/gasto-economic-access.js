function canAccessEconomicPosition(user) {
    return user?.role === 'admin' && user.access?.scope === 'global';
}

module.exports = { canAccessEconomicPosition };
