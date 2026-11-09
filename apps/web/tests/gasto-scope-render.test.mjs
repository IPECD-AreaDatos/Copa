import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const cache = new Map();

// Renderiza los componentes reales con el runtime del proyecto, sin DOM ni API.
function loadSource(base) {
  const filename = ['', '.ts', '.tsx'].map((ext) => base + ext).find((name) => fs.existsSync(name));
  if (!filename) throw new Error(`No se encontró ${base}`);
  if (cache.has(filename)) return cache.get(filename);
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule.exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => name.startsWith('@/') ? loadSource(path.join(sourceRoot, name.slice(2)))
    : name.startsWith('.') ? loadSource(path.resolve(path.dirname(filename), name)) : require(name);
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: localRequire, Intl, Date }, { filename });
  cache.set(filename, loadedModule.exports);
  return loadedModule.exports;
}

const Dashboard = loadSource(path.join(sourceRoot, 'components/gasto/GastoAnalisisMinisterial')).default;
const Explorer = loadSource(path.join(sourceRoot, 'components/gasto/GastoExplorador')).default;
const { GastoProyeccion } = loadSource(path.join(sourceRoot, 'components/gasto/GastoEvolucion'));
const { canAccessEconomicPosition } = loadSource(path.join(sourceRoot, 'lib/access'));
const { buildMinisterialAnalysis, referenceJurisdictions } = require('../../api/services/gasto-ministerial');
const { buildJurisdictionRows, buildJurisdictionRubroRows, buildJurisdictionSubpartidaRows, buildRubroRows, mapJurisdiccion, mapPartida } = require('../../api/services/gasto-desagregado');

function fixture(codes, scope = 'global', filtered = true) {
  const rows = codes.flatMap((jurisdiccion) => [[100, 111, 120e6], [200, 211, 90e6], [400, 421, 12e6], [400, 423, 3e6]]
    .map(([partid, sub_partid, total]) => ({ jurisdiccion, partid, sub_partid, total, row_count: 1, months: 3 })));
  const details = buildJurisdictionSubpartidaRows(rows);
  const rubroGroups = new Map();
  for (const r of details) {
    const key = `${r.jurisdiccion.codigo}|${r.rubro.codigo}`;
    const target = rubroGroups.get(key) ?? { jurisdiccion: r.jurisdiccion.codigo, rubro: r.rubro.codigo, total: 0 };
    target.total += r.total;
    rubroGroups.set(key, target);
  }
  const rubroRows = [...rubroGroups.values()];
  const monthlyRubros = [1, 2, 3].flatMap((mes) => rubroRows.map((r) => ({ mes, rubro: { codigo: r.rubro, nombre: r.rubro }, total: r.total / 3, filas: 1 })));
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const filters = { anio: 2026, mesDesde: 1, mesHasta: 3, jurisdicciones: filtered ? codes : null };
  return {
    meta: { access: { scope, jurisdictions: scope === 'institution' ? codes.map((code) => ({ code, name: mapJurisdiccion(code).nombre })) : [] },
      requested: filters, selected: filters, requested_months: 3, is_snapshot: false, missing_months: [],
      available: { jurisdicciones: codes.map(mapJurisdiccion), partidas: [100, 200, 400].map(mapPartida) } },
    total, jurisdicciones: buildJurisdictionRows(rows),
    rubros: buildRubroRows(rubroRows), jurisdicciones_rubros: buildJurisdictionRubroRows(rubroRows),
    monthly: [1, 2, 3].map((mes) => ({ mes, total: total / 3, filas: rows.length })),
    monthly_rubros: monthlyRubros,
    monthly_jurisdicciones_rubros: [1, 2, 3].flatMap((mes) => rubroRows.map((r) => ({ codigo: r.jurisdiccion, mes, rubro: { codigo: r.rubro }, total: r.total / 3 }))),
    jurisdiccion_subpartidas: details,
    ministerial_analysis: buildMinisterialAnalysis(details, scope === 'institution' ? codes : null),
    modificaciones_presupuestarias: [],
  };
}

for (const code of [1, 3, 4, 6, 27]) {
  for (const scope of ['global', 'institution']) {
    test(`jurisdicción ${code}, acceso ${scope}: total, evolución e indicadores completos sin tops individuales`, () => {
      const html = renderToStaticMarkup(createElement(Dashboard, { data: fixture([code], scope) }));
      assert.match(html, /class="kpi-value">\$225 M<\/strong>/);
      assert.match(html, /Evolución mensual por rubro/);
      assert.match(html, /Promedio mensual y proyección simple/);
      assert.match(html, /Promedio 3 más altos/);
      assert.match(html, /Punto máximo/);
      assert.doesNotMatch(html, /Concentración Top 8|Ranking jurisdicción × rubro/);
      assert.doesNotMatch(html, /aria-label="Universo de organismos"/);
    });
  }
}

test('nivel general conserva los mismos indicadores y permite comparar organismos', () => {
  const html = renderToStaticMarkup(createElement(Dashboard, { data: fixture([1, 3], 'global', false) }));
  assert.match(html, /class="kpi-value">\$450 M<\/strong>/);
  assert.match(html, /Evolución mensual por rubro/);
  assert.match(html, /Promedio 3 más altos/);
  assert.match(html, /Punto máximo/);
  assert.match(html, /Concentración Top 8/);
  assert.match(html, /aria-label="Universo de organismos"/);
  assert.equal(referenceJurisdictions.includes(27), false);
});

test('Lectura por rubro precede a Evolución mensual por rubro en el explorador', () => {
  const data = fixture([1, 3], 'global', false);
  data.subpartidas = [];
  data.chapters = [{ codigo: 100, nombre: 'Personal', total: 240e6, participacion: 100, subpartidas: 1 }];
  data.controles = { total_vs_capitulos: 0, total_vs_rubros: 0, total_vs_jurisdicciones_rubros: 0 };
  const html = renderToStaticMarkup(createElement(Explorer, { data }));
  assert.ok(html.indexOf('Lectura por rubro') >= 0);
  assert.ok(html.indexOf('Lectura por rubro') < html.indexOf('Evolución mensual por rubro'));
});

test('Personal destaca el último mes y omite Top 3 y máximo cuando es el único rubro', () => {
  const data = fixture([4]);
  data.jurisdicciones_rubros = data.jurisdicciones_rubros.filter((row) => row.rubro.codigo === 'personal');
  data.monthly_jurisdicciones_rubros = [10e6, 90e6, 20e6].map((total, index) => ({ codigo: 4, mes: index + 1, rubro: { codigo: 'personal' }, total }));
  const html = renderToStaticMarkup(createElement(GastoProyeccion, { data }));
  assert.match(html, /Mes anterior: \$20 M/);
  assert.match(html, /Último mes del corte: Marzo/);
  assert.match(html, /\$240 M/);
  assert.doesNotMatch(html, /Promedio 3 más altos|Punto máximo/);
});

test('los demás rubros conservan promedio Top 3 y máximo', () => {
  const data = fixture([4]);
  data.jurisdicciones_rubros = data.jurisdicciones_rubros.filter((row) => row.rubro.codigo !== 'personal');
  data.monthly_jurisdicciones_rubros = data.monthly_jurisdicciones_rubros.filter((row) => row.rubro.codigo !== 'personal');
  const html = renderToStaticMarkup(createElement(GastoProyeccion, { data }));
  assert.match(html, /Promedio 3 más altos/);
  assert.match(html, /Punto máximo/);
  assert.doesNotMatch(html, /Mes anterior:/);
});

test('la pestaña económica exige la cuenta admin; el rol central admin no habilita otras cuentas', () => {
  const access = { scope: 'global', jurisdictions: [] };
  assert.equal(canAccessEconomicPosition({ username: 'admin', role: 'user', access }), true);
  assert.equal(canAccessEconomicPosition({ username: ' ADMIN ', access }), true);
  for (const user of [null, {}, { username: 'admin' }, { username: 'gcorrales', access },
    { username: 'irodriguez', role: 'admin', origen: 'central-ensayo', access },
    { username: 'admin', access: { scope: 'institution', jurisdictions: [{ code: 4 }] } }]) {
    assert.equal(canAccessEconomicPosition(user), false);
  }
});
