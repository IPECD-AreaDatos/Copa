import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const filename = new URL('../src/lib/gasto/desagregadoVm.ts', import.meta.url);
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, Intl, Date }, { filename: filename.pathname });
const { buildProjectionRows, buildAccountGroups, buildMatrixRows, sortMatrixRows, buildConcentration, scopeDashboardJurisdictions } = exports;
const account = (jurisdiction, code, total) => ({ jurisdiccion: { codigo: jurisdiction, nombre: `Jur ${jurisdiction}` }, partida: { codigo: Math.floor(code / 100) * 100 }, subpartida: { codigo: code, nombre: `Cuenta ${code}` }, total });
const snapshot = () => ({
  meta: { requested_months: 4, is_snapshot: false, missing_months: [4] },
  monthly: [{ mes: 1 }, { mes: 2 }, { mes: 3 }],
  monthly_jurisdicciones_rubros: [
    { codigo: 4, mes: 1, rubro: { codigo: 'deuda' }, total: 90 },
    { codigo: 4, mes: 1, rubro: { codigo: 'figurativos' }, total: 30 },
    { codigo: 4, mes: 2, rubro: { codigo: 'deuda' }, total: 60 },
  ],
  rubros: [{ codigo: 'deuda' }, { codigo: 'figurativos' }],
  jurisdicciones: [{ codigo: 4, nombre: 'Salud', total: 180 }],
  jurisdicciones_rubros: [{ codigo: 4, rubro: { codigo: 'deuda' }, total: 150 }, { codigo: 4, rubro: { codigo: 'figurativos' }, total: 30 }],
  jurisdiccion_subpartidas: [],
});

test('Top 3 y máximo se calculan sobre montos mensuales sumados, con meses faltantes explícitos', () => {
  const data = snapshot();
  const [result] = buildProjectionRows(data);
  assert.equal(result.total, 180);
  assert.equal(result.average, 45);
  assert.equal(result.topAverage, 60); // 120 + 60 + 0; mes 4 ausente, no observado.
  assert.equal(result.maximum, 120);
  assert.equal(result.maximumMonth, 1);
  assert.equal(result.topCount, 3);
  assert.equal(result.annual, 540);
  data.monthly = [{ mes: 1 }, { mes: 2 }];
  assert.equal(buildProjectionRows(data)[0].topAverage, 90);
  assert.equal(buildProjectionRows(data)[0].topCount, 2);
  assert.equal(buildProjectionRows({ ...data, meta: { ...data.meta, is_snapshot: true } }).length, 0);
});
test('421 y 423 se consolidan con sus jurisdicciones, filtros y denominadores', () => {
  const rows = [account(4, 421, 100), account(4, 423, 20), account(6, 423, 30), account(4, 571, 200), account(4, 111, 300)];
  const groups = buildAccountGroups(rows, [400, 500], false);
  assert.equal(groups.personalTotal, 0);
  assert.equal(groups.restTotal, 150);
  assert.equal(groups.accounts.length, 1);
  assert.equal(groups.accounts[0].id, '421+423');
  assert.equal(groups.accounts[0].share, 100);
  assert.equal(groups.accounts[0].jurisdictions[0].total, 120);
  assert.equal(buildAccountGroups(rows).personalTotal, 300);
  assert.equal(buildAccountGroups(rows).restTotal, 350);
});
test('Otros y el orden por columna conservan totales y ajustes negativos', () => {
  const data = snapshot();
  const rows = buildMatrixRows(data);
  assert.equal(rows[0].rubros.otros, 180);
  const list = [...rows, { id: '6', label: 'Obras', total: 300, rubros: { otros: -20 } }];
  assert.equal(sortMatrixRows(list, 'otros', true)[0].id, '4');
  assert.equal(sortMatrixRows(list, 'otros', false)[0].id, '6');
  assert.equal(sortMatrixRows(list, 'total', true)[0].id, '6');
  assert.equal(list[0].id, '4');
});
test('todas las jurisdicciones, Top 8 y con/sin personal recalculan sus propios denominadores', () => {
  const data = { jurisdiccion_subpartidas: Array.from({ length: 10 }, (_, i) => [account(i + 1, 211, 10), account(i + 1, 111, 20), account(i + 1, 571, 100)]).flat() };
  assert.equal(buildConcentration(data, false, true).rows.length, 10);
  assert.equal(buildConcentration(data, false, false).rows.length, 8);
  assert.equal(buildConcentration(data, false, true).total, 100);
  assert.equal(buildConcentration(data, true, true).total, 300);
  assert.equal(buildConcentration(data, false, false).rows.at(-1).cumulative, 100);
});
test('el universo de organismos se aplica también a la evolución y la proyección', () => {
  const data = snapshot();
  const empty = scopeDashboardJurisdictions(data, [6]);
  assert.equal(empty.total, 0);
  assert.equal(empty.jurisdicciones.length, 0);
  assert.equal(empty.monthly.reduce((n, r) => n + r.total, 0), 0);
  const selected = scopeDashboardJurisdictions(data, [4]);
  assert.equal(selected.total, 180);
  assert.equal(selected.monthly.reduce((n, r) => n + r.total, 0), 180);
  assert.equal(buildProjectionRows(selected)[0].maximum, 120);
});

test('Personal usa el último mes del corte y no el mes máximo ni el promedio', () => {
  const data = snapshot();
  data.meta.selected = { anio: 2026, mesHasta: 3 };
  data.monthly_jurisdicciones_rubros = [10, 90, 20].map((total, index) => ({ codigo: 4, mes: index + 1, rubro: { codigo: 'personal' }, total }));
  data.jurisdicciones_rubros = [{ codigo: 4, rubro: { codigo: 'personal' }, total: 120 }];
  const [row] = buildProjectionRows(data);
  assert.equal(row.personal, true);
  assert.equal(row.average, 30);
  assert.equal(row.referenceMonth, 3);
  assert.equal(row.referenceAmount, 20);
  assert.equal(row.maximum, 90);
  assert.equal(row.annual, 240);
});

test('Personal no sustituye el mes de referencia ausente y distingue un cero observado', () => {
  const data = snapshot();
  data.meta.selected = { anio: 2026, mesHasta: 4 };
  data.monthly_jurisdicciones_rubros = [{ codigo: 4, mes: 1, rubro: { codigo: 'personal' }, total: 120 }];
  data.jurisdicciones_rubros = [{ codigo: 4, rubro: { codigo: 'personal' }, total: 120 }];
  assert.equal(buildProjectionRows(data)[0].referenceAmount, null);
  assert.equal(buildProjectionRows(data)[0].annual, null);
  data.monthly_jurisdicciones_rubros.push({ codigo: 4, mes: 4, rubro: { codigo: 'bienes_servicios' }, total: 50 });
  assert.equal(buildProjectionRows(data)[0].referenceAmount, 0);
  assert.equal(buildProjectionRows(data)[0].annual, 0);
});
