const { resolvePeriodCompleteness, resolveVariableCompleteness } = require('./completeness-resolver');

function periodId(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
}

function nullableNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function mapValue(valueByPeriod, id) {
    return Object.prototype.hasOwnProperty.call(valueByPeriod, id)
        ? nullableNumber(valueByPeriod[id])
        : null;
}

function createDashboardCompleteness({ ronByPeriod, ropByPeriod, salaryByPeriod }) {
    const cache = new Map();

    return (id) => {
        if (cache.has(id)) return cache.get(id);

        const variables = {
            ron: resolveVariableCompleteness(id, ronByPeriod),
            rop: resolveVariableCompleteness(id, ropByPeriod),
            masa_salarial: resolveVariableCompleteness(id, salaryByPeriod),
        };
        const result = {
            is_complete: resolvePeriodCompleteness(variables),
            variables: Object.fromEntries(
                Object.entries(variables).map(([name, value]) => [name, { is_complete: value.isComplete }]),
            ),
        };
        cache.set(id, result);
        return result;
    };
}

module.exports = { periodId, nullableNumber, mapValue, createDashboardCompleteness };
