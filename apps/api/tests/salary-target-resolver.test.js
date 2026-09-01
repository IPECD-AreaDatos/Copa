const assert = require('node:assert/strict');
const { resolveMonthlySalaryTarget } = require('../services/salary-target-resolver');

function buildHistory(value = 100) {
    return Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => {
            const month = String(index + 1).padStart(2, '0');
            return [`2025-${month}`, value];
        }),
    );
}

const complete = resolveMonthlySalaryTarget('2026-01', {
    ...buildHistory(),
    '2026-01': 90,
});
assert.equal(complete.isCurrentComplete, true);
assert.equal(complete.isFallback, false);
assert.equal(complete.value, 90);
assert.equal(complete.minimumCompleteValue, 90);
assert.equal(complete.historyMonthCount, 12);

const partial = resolveMonthlySalaryTarget('2026-01', {
    ...buildHistory(),
    '2026-01': 89.99,
});
assert.equal(partial.isCurrentComplete, false);
assert.equal(partial.isFallback, true);
assert.equal(partial.value, 100);
assert.equal(partial.sourcePeriodId, '2025-12');

const missing = resolveMonthlySalaryTarget('2026-02', {
    ...buildHistory(),
    '2026-01': 125,
});
assert.equal(missing.isCurrentComplete, false);
assert.equal(missing.value, 125);
assert.equal(missing.sourcePeriodId, '2026-01');

const withoutHistory = resolveMonthlySalaryTarget('2025-01', {
    '2025-01': 80,
});
assert.equal(withoutHistory.isCurrentComplete, true);
assert.equal(withoutHistory.value, 80);
assert.equal(withoutHistory.rollingAverage, null);

console.log('salary-target-resolver: ok');
