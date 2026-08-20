const fs = require('fs');
const path = require('path');

const budgetPath = path.join(__dirname, '../data/presupuesto.json');

let budgetCache = null;
let budgetCacheMtimeMs = 0;

function loadBudgetData() {
    const stat = fs.statSync(budgetPath);
    if (!budgetCache || stat.mtimeMs !== budgetCacheMtimeMs) {
        const payload = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
        if (!payload?.periods || typeof payload.periods !== 'object') {
            throw new Error('Formato de presupuesto inválido');
        }
        budgetCache = payload;
        budgetCacheMtimeMs = stat.mtimeMs;
    }
    return budgetCache;
}

function normalizeBudgetRow(periodId, raw) {
    const ron = Number(raw?.ron);
    const rop = Number(raw?.rop);
    if (!Number.isFinite(ron) || ron <= 0 || !Number.isFinite(rop) || rop <= 0) {
        return null;
    }
    return { periodId, ron, rop };
}

function getMonthlyBudget(periodId) {
    return normalizeBudgetRow(periodId, loadBudgetData().periods[periodId]);
}

function getAnnualBudget(year, throughMonth = 12) {
    const finalMonth = Math.min(12, Math.max(1, Number(throughMonth) || 12));
    const rows = [];
    for (let month = 1; month <= finalMonth; month++) {
        const periodId = `${year}-${String(month).padStart(2, '0')}`;
        const row = getMonthlyBudget(periodId);
        if (!row) return null;
        rows.push(row);
    }

    return {
        year: Number(year),
        throughMonth: finalMonth,
        ron: rows.reduce((sum, row) => sum + row.ron, 0),
        rop: rows.reduce((sum, row) => sum + row.rop, 0),
    };
}

module.exports = {
    getAnnualBudget,
    getMonthlyBudget,
};
