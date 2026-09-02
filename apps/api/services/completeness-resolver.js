const DEFAULT_LOOKBACK_MONTHS = 12;
const DEFAULT_TOLERANCE = 0.10;

function shiftPeriod(periodId, monthOffset) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodId);
    if (!match) throw new Error(`Período inválido: ${periodId}`);

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const shiftedIndex = year * 12 + monthIndex + monthOffset;
    const shiftedYear = Math.floor(shiftedIndex / 12);
    const shiftedMonth = (shiftedIndex % 12 + 12) % 12 + 1;

    return `${shiftedYear}-${String(shiftedMonth).padStart(2, '0')}`;
}

function observedNumber(valueByPeriod, periodId) {
    if (!Object.prototype.hasOwnProperty.call(valueByPeriod, periodId)) return null;
    const value = Number(valueByPeriod[periodId]);
    return Number.isFinite(value) ? value : null;
}

function comparisonValue(values, comparison) {
    if (values.length === 0) return null;
    if (comparison === 'maximum') return Math.max(...values);
    if (comparison === 'median') {
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[middle - 1] + sorted[middle]) / 2
            : sorted[middle];
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Clasifica una variable con un único estado binario.
 *
 * Una observación es completa cuando existe, es positiva y alcanza el umbral
 * comparativo respecto de hasta `lookbackMonths` períodos anteriores. Si no hay
 * historia comparable, una primera observación positiva se considera completa.
 */
function resolveVariableCompleteness(
    periodId,
    valueByPeriod,
    {
        lookbackMonths = DEFAULT_LOOKBACK_MONTHS,
        tolerance = DEFAULT_TOLERANCE,
        comparison = 'average',
        sameCalendarYear = false,
    } = {},
) {
    const currentValue = observedNumber(valueByPeriod, periodId);
    const currentYear = periodId.slice(0, 4);
    const history = [];

    for (let monthsBack = 1; monthsBack <= lookbackMonths; monthsBack++) {
        const historyPeriodId = shiftPeriod(periodId, -monthsBack);
        if (sameCalendarYear && historyPeriodId.slice(0, 4) !== currentYear) break;
        const value = observedNumber(valueByPeriod, historyPeriodId);
        if (value !== null && value > 0) history.push(value);
    }

    const baselineValue = comparisonValue(history, comparison);
    const minimumCompleteValue = baselineValue === null
        ? null
        : baselineValue * (1 - tolerance);
    const isComplete = currentValue !== null
        && currentValue > 0
        && (minimumCompleteValue === null || currentValue >= minimumCompleteValue);

    return {
        isComplete,
        currentValue,
        baselineValue,
        minimumCompleteValue,
        historyPeriodCount: history.length,
    };
}

function resolvePeriodCompleteness(variableCompleteness) {
    const results = Object.values(variableCompleteness);
    return results.length > 0 && results.every((result) => result?.isComplete === true);
}

module.exports = {
    DEFAULT_LOOKBACK_MONTHS,
    DEFAULT_TOLERANCE,
    resolvePeriodCompleteness,
    resolveVariableCompleteness,
    shiftPeriod,
};
