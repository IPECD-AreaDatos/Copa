const {
    DEFAULT_LOOKBACK_MONTHS,
    DEFAULT_TOLERANCE,
    resolveVariableCompleteness,
    shiftPeriod,
} = require('./completeness-resolver');

function positiveSalaryValue(salaryByPeriod, periodId) {
    const value = Number(salaryByPeriod[periodId]);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function resolveMonthlySalaryTarget(
    periodId,
    salaryByPeriod,
    { lookbackMonths = DEFAULT_LOOKBACK_MONTHS, tolerance = DEFAULT_TOLERANCE } = {},
) {
    const completeness = resolveVariableCompleteness(periodId, salaryByPeriod, {
        lookbackMonths,
        tolerance,
        comparison: 'average',
    });
    const rollingAverage = completeness.baselineValue;
    const minimumCompleteValue = completeness.minimumCompleteValue;
    const currentValue = positiveSalaryValue(salaryByPeriod, periodId);
    const isCurrentComplete = completeness.isComplete;

    if (isCurrentComplete) {
        return {
            value: currentValue,
            sourcePeriodId: periodId,
            isFallback: false,
            isCurrentComplete: true,
            rollingAverage,
            minimumCompleteValue,
            historyMonthCount: completeness.historyPeriodCount,
        };
    }

    const previousMonthPeriodId = shiftPeriod(periodId, -1);
    const previousMonthValue = positiveSalaryValue(salaryByPeriod, previousMonthPeriodId);
    if (previousMonthValue > 0) {
        return {
            value: previousMonthValue,
            sourcePeriodId: previousMonthPeriodId,
            isFallback: true,
            isCurrentComplete: false,
            rollingAverage,
            minimumCompleteValue,
            historyMonthCount: completeness.historyPeriodCount,
        };
    }

    // Mantiene el resguardo histórico si tampoco existe el mes calendario anterior.
    const previousYearPeriodId = shiftPeriod(periodId, -12);
    const previousYearValue = positiveSalaryValue(salaryByPeriod, previousYearPeriodId);
    return {
        value: previousYearValue,
        sourcePeriodId: previousYearValue > 0 ? previousYearPeriodId : null,
        isFallback: previousYearValue > 0,
        isCurrentComplete: false,
        rollingAverage,
        minimumCompleteValue,
        historyMonthCount: completeness.historyPeriodCount,
    };
}

module.exports = {
    resolveMonthlySalaryTarget,
    shiftPeriod,
};
