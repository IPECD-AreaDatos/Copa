function canAccessEconomicPosition(user) {
    if (user?.access?.scope !== 'global') return false;

    const isAdministrator = user.role === 'admin';
    const isExpenseAnalyst = user.role === 'analyst'
        && user.rango === 'analista-gastos'
        && user.capabilities?.includes('gastos-desagregados') === true;

    return isAdministrator || isExpenseAnalyst;
}

module.exports = { canAccessEconomicPosition };
