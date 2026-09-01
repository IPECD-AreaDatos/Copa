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

function positiveSalaryValue(salaryByPeriod, periodId) {
    const value = Number(salaryByPeriod[periodId]);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function resolveMonthlySalaryTarget(
    periodId,
    salaryByPeriod,
    { lookbackMonths = DEFAULT_LOOKBACK_MONTHS, tolerance = DEFAULT_TOLERANCE } = {},
) {
    const history = [];
    for (let monthsBack = 1; monthsBack <= lookbackMonths; monthsBack++) {
        const value = positiveSalaryValue(salaryByPeriod, shiftPeriod(periodId, -monthsBack));
        if (value > 0) history.push(value);
    }

    const rollingAverage = history.length > 0
        ? history.reduce((sum, value) => sum + value, 0) / history.length
        : null;
    const minimumCompleteValue = rollingAverage === null
        ? null
        : rollingAverage * (1 - tolerance);
    const currentValue = positiveSalaryValue(salaryByPeriod, periodId);

    // Sin historia disponible para comparar, un valor positivo conserva el comportamiento previo.
    const isCurrentComplete = currentValue > 0
        && (minimumCompleteValue === null || currentValue >= minimumCompleteValue);

    if (isCurrentComplete) {
        return {
            value: currentValue,
            sourcePeriodId: periodId,
            isFallback: false,
            isCurrentComplete: true,
            rollingAverage,
            minimumCompleteValue,
            historyMonthCount: history.length,
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
            historyMonthCount: history.length,
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
        historyMonthCount: history.length,
    };
}

module.exports = {
    resolveMonthlySalaryTarget,
    shiftPeriod,
};
