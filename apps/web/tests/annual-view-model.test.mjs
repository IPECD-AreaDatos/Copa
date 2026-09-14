import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

// Ejecuta las funciones TypeScript puras sin agregar un runner ni dependencias.
function loadTs(filename) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => loadTs(path.resolve(path.dirname(filename), name + '.ts')),
    Intl, Date,
  }, { filename });
  return exports;
}
const { buildAnnualVm } = loadTs(path.resolve(testDirectory, '../src/lib/analisis-anual/annualVm.ts'));
const { buildMonthlyAnnualData, buildBrechaAnnualStacked, buildCopaVsAnnualMixed } = loadTs(path.resolve(testDirectory, '../src/lib/analisis-anual/annualCharts.ts'));

test('la vista no convierte importes ni variaciones faltantes en ceros', () => {
  const result = buildAnnualVm({
    recaudacion: { current: null, prev: 80, var_nom: null, var_real: null, diff_nom: null, esperada: 130 },
    rop: { disponible_current: null, disponible_prev: 16 },
    masa_salarial: { current: null, prev: 48, is_incomplete: true },
  }, 2026);
  assert.equal(result.recaudacion.current, 'Sin datos');
  assert.equal(result.recaudacion.varNomPct, 'Sin datos');
  assert.equal(result.recaudacion.realPct, 'Sin datos');
  assert.equal(result.masa.cobCurr, 'Cobertura: Sin datos');
  assert.equal(result.presupuestoRon.recaudado, 'Sin datos');
  assert.equal(result.presupuestoRon.diffPct, 'Sin datos');
});

test('conserva montos válidos y distingue falta de IPC de falta de datos', () => {
  const result = buildAnnualVm({
    recaudacion: { current: 2000000, prev: 1000000, var_nom: 100, diff_nom: 1000000, ipc_missing: true },
    masa_salarial: { current: 300, prev: null },
  }, 2026);
  assert.equal(result.recaudacion.current, '$2,0 Billones');
  assert.equal(result.recaudacion.realPct, 'Sin IPC completo');
  assert.equal(result.masa.prev, 'Sin datos');
  assert.equal(result.masa.varNomPct, 'Sin datos');
});

function series() {
  return {
    labels: Array.from({ length: 12 }, (_, i) => String(i + 1)),
    cumulative_copa: Array.from({ length: 12 }, (_, i) => i < 8 ? 100 * (i + 1) : null),
    cumulative_bruta: Array.from({ length: 12 }, (_, i) => i < 8 ? 120 * (i + 1) : null),
    cumulative_esperada: Array.from({ length: 12 }, (_, i) => i < 8 ? 110 * (i + 1) : null),
    salario_target: Array.from({ length: 12 }, (_, i) => i < 8 ? 80 * (i + 1) : null),
    through_month: 8,
  };
}

test('brecha incluye agosto en un año abierto y funciona en años siguientes', () => {
  for (const year of [2025, 2026, 2027]) {
    const result = buildBrechaAnnualStacked(series(), year, 8, false, false);
    assert.equal(result.chartData.datasets[0].data[7], 880);
    assert.equal(result.chartData.datasets[2].data[7], 80);
    assert.equal(result.chartData.datasets[0].data[8], null);
    assert.equal(result.card.recaudado, '$960 M');
  }
});

test('los gráficos móviles incluyen el trimestre parcial sin inventar ceros', () => {
  const shape = { labels: series().labels, data_curr: Array(8).fill(100).concat(Array(4).fill(null)), data_prev: Array(8).fill(80).concat(Array(4).fill(null)) };
  const chart = buildMonthlyAnnualData(shape, 2026, 2025, true);
  assert.equal(chart.datasets[0].data[2], 200);
  assert.equal(chart.datasets[1].data[2], 160);
  assert.equal(chart.datasets[0].data[3], null);
  assert.equal(chart.labels[2], 'T3 (parcial)');
  const cumulative = buildCopaVsAnnualMixed(series(), true);
  assert.equal(cumulative.datasets[0].data[2], 640);
  const budget = buildBrechaAnnualStacked(series(), 2026, 8, false, true);
  assert.equal(budget.chartData.datasets[0].data[2], 880);
  const desktop = buildMonthlyAnnualData(shape, 2026, 2025, false);
  assert.equal(desktop.datasets[0].data[8], null);
});
