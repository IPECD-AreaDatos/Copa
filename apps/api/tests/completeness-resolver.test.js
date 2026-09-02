const assert = require('node:assert/strict');
const {
    resolvePeriodCompleteness,
    resolveVariableCompleteness,
} = require('../services/completeness-resolver');

function buildHistory(value = 100) {
    return Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [
            `2025-${String(index + 1).padStart(2, '0')}`,
            value,
        ]),
    );
}

const atThreshold = resolveVariableCompleteness('2026-01', {
    ...buildHistory(),
    '2026-01': 90,
});
assert.equal(atThreshold.isComplete, true);
assert.equal(atThreshold.baselineValue, 100);
assert.equal(atThreshold.minimumCompleteValue, 90);

const belowThreshold = resolveVariableCompleteness('2026-01', {
    ...buildHistory(),
    '2026-01': 89.99,
});
assert.equal(belowThreshold.isComplete, false);

const missing = resolveVariableCompleteness('2026-01', buildHistory());
assert.equal(missing.currentValue, null);
assert.equal(missing.isComplete, false);

const firstObservedPeriod = resolveVariableCompleteness('2025-01', {
    '2025-01': 80,
});
assert.equal(firstObservedPeriod.isComplete, true);
assert.equal(firstObservedPeriod.baselineValue, null);

const yearlyStructuralCheck = resolveVariableCompleteness('2026-08', {
    '2025-12': 300,
    '2026-01': 135,
    '2026-02': 160,
    '2026-03': 179,
    '2026-04': 189,
    '2026-05': 197,
    '2026-06': 193,
    '2026-07': 191,
    '2026-08': 173,
}, {
    comparison: 'maximum',
    sameCalendarYear: true,
});
assert.equal(yearlyStructuralCheck.baselineValue, 197);
assert.equal(yearlyStructuralCheck.isComplete, false);

assert.equal(resolvePeriodCompleteness({
    ron: { isComplete: true },
    rop: { isComplete: true },
    salary: { isComplete: true },
}), true);
assert.equal(resolvePeriodCompleteness({
    ron: { isComplete: true },
    rop: { isComplete: false },
    salary: { isComplete: true },
}), false);

console.log('completeness-resolver: ok');
