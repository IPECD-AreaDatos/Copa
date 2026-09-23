const test = require('node:test');
const assert = require('node:assert/strict');
const { archive, models, buildExcelAnalysis, matches } = require('../services/gasto-excel-analysis');
const { buildMinisterialAnalysis, referenceJurisdictions, ranked } = require('../services/gasto-ministerial');
const { buildJurisdictionSubpartidaRows } = require('../services/gasto-desagregado');
const filters = { anio: 2026, mesDesde: 1, mesHasta: 6, fuentes: [10], estados: ['Comprometido'] };
const row = (jur, account, total) => buildJurisdictionSubpartidaRows([{ jurisdiccion: jur, partid: Math.floor(account / 100) * 100, sub_partid: account, total, row_count: 1, months: 1 }])[0];
const getRow = (sheets, sheet, ref) => sheets.find((s) => s.id === sheet).blocks.flatMap((b) => b.rows).find((r) => r.ref === ref);

test('cobertura íntegra: cuatro archivos, 29 hojas, 9899 celdas, 2524 fórmulas y seis gráficos', () => {
    assert.deepEqual(archive.books.map((b) => b.sheets.length), [8, 11, 5, 5]);
    const sheets = archive.books.flatMap((b) => b.sheets);
    assert.equal(sheets.reduce((n, s) => n + s.cells.length, 0), 9899);
    assert.equal(sheets.reduce((n, s) => n + s.formulaCount, 0), 2524);
    assert.equal(sheets.reduce((n, s) => n + s.charts.length, 0), 6);
    assert.equal(models.length, 29);
    for (const model of models) {
        assert.ok(model.blocks.length > 0, model.id);
        for (const entry of model.blocks.flatMap((b) => b.rows)) {
            assert.ok(!entry.scope.unresolved, `${model.id}!${entry.ref}`);
            if (!entry.scope.manual) {
                assert.ok(entry.scope.chapters?.length || entry.scope.accounts?.length, `${model.id}!${entry.ref}`);
                assert.ok(!entry.scope.jurisdictions?.includes(null));
            }
        }
    }
    assert.equal(referenceJurisdictions.length, 25);
});
test('ninguna cuenta presupuestaria de los libros de detalle queda fuera del modelo', () => {
    for (const book of archive.books.filter((b) => b.id !== '3')) for (const sheet of book.sheets) {
        const sourceRows = sheet.cells.filter((c) => c.col === 1 && Number.isInteger(c.value) && c.value >= 100 && c.value < 1000).map((c) => c.row);
        const mapped = models.find((s) => s.id === sheet.id).blocks.flatMap((b) => b.rows).map((r) => Number(r.ref.replace(/[A-Z]/g, '')));
        assert.deepEqual(sourceRows.filter((r) => !mapped.includes(r)), [], sheet.id);
    }
});
test('la hoja 200 combina 200 y 300, sin mezclar coparticipación con transferencias', () => {
    const accounts = models.find((s) => s.id === '4-1').blocks[0].rows;
    assert.ok(accounts.some((r) => r.scope.chapters.includes(200)));
    assert.ok(accounts.some((r) => r.scope.chapters.includes(300)));
    const scope = getRow(models, '3-5', 'E3').scope;
    assert.ok(matches(scope, row(2, 533, 10)));
    assert.ok(!matches(scope, row(2, 571, 10)));
    assert.ok(!matches(scope, row(2, 587, 10)));
    assert.ok(!matches(scope, row(1, 533, 10)));
});
test('se conserva el valor original de personal de Oncología y el subtotal omitido', () => {
    assert.equal(getRow(models, '3-5', 'C26').reference, 291841782.06);
    assert.deepEqual(getRow(models, '3-5', 'C26').scope.chapters, [100]);
    assert.equal(archive.books[2].sheets[4].cells.some((c) => c.ref === 'J26'), false);
    const total = models.find((s) => s.id === '3-5').blocks[0].rows.reduce((n, r) => n + r.reference, 0);
    assert.ok(Math.abs(total - 1547855636179.31) < 0.01);
});
test('promedios usan los seis meses solicitados aunque sólo un mes tenga registros; nunca anualizan créditos', () => {
    const rows = [row(1, 211, 600)];
    assert.equal(getRow(buildExcelAnalysis(rows, filters, false), '3-3', 'B4').average, 100);
    assert.equal(getRow(buildExcelAnalysis(rows, filters, false), '3-3', 'B4').annual, 1200);
    assert.equal(getRow(buildExcelAnalysis(rows, filters, true), '3-3', 'B4').annual, null);
    assert.equal(getRow(buildExcelAnalysis(rows, { ...filters, mesDesde: 2 }, false), '3-3', 'B4').average, 120);
});
test('no compara otros cortes ni inventa ceros donde no hay registros', () => {
    const rows = [row(1, 211, 0)];
    const same = buildExcelAnalysis(rows, filters, false);
    assert.equal(getRow(same, '3-3', 'B4').live, 0);
    assert.equal(getRow(same, '3-3', 'B5').live, null);
    for (const other of [{ anio: 2025 }, { fuentes: [11] }, { mesHasta: 5 }, { jurisdicciones: [1] }, { estados: ['Cred Vig'] }]) {
        const r = getRow(buildExcelAnalysis(rows, { ...filters, ...other }, false), '3-3', 'B4');
        assert.equal(r.difference, null);
        assert.equal(r.targetDifference, null);
    }
});
test('duplicados de cuenta 363 se conservan, pero el subtotal los cuenta una vez', () => {
    const r = buildExcelAnalysis([row(2, 363, 100), row(14, 363, 50)], filters, false).find((s) => s.id === '2-11').blocks[0];
    assert.equal(r.rows.filter((x) => x.scope.accounts.includes(363)).length, 4);
    assert.equal(r.rows.filter((x) => x.scope.accounts.includes(363) && x.repeated).length, 2);
    assert.equal(r.liveTotal, 150);
});
test('las seis metas conservan precisión y los auxiliares conservan su falta de unidad', () => {
    const targets = models.find((s) => s.id === '3-3').blocks[1].rows;
    assert.equal(targets.length, 6);
    assert.equal(targets.find((r) => r.ref === 'D6').reference, 8634238499.248333);
    assert.equal(models.find((s) => s.id === '3-3').blocks[2].rows.length, 6);
});
test('tres universos, Top 8 y Top 5/6/7 tienen denominadores diferentes y explícitos', () => {
    const rows = [];
    for (let j = 1; j <= 12; j++) for (const a of [113, 211, 311, 411, 513, 533, 571, 711]) rows.push(row(j, a, 100 + j));
    const a = buildMinisterialAnalysis(rows).all;
    assert.ok(Math.abs(a.universes[0].total - a.universes[1].total - a.universes[0].rubros.find((r) => r.id === 'personal').total) < 0.01);
    assert.equal(a.top8.rows.length, 8);
    assert.ok(Math.abs(a.top8.rows.reduce((n, r) => n + r.shareTop, 0) - 100) < 1e-8);
    assert.ok(a.top8.rows.reduce((n, r) => n + r.share, 0) < 100);
    let cumulativeTop = 0;
    for (const item of a.top8.rows) {
        cumulativeTop += item.total;
        assert.ok(Math.abs(item.cumulativeTop - cumulativeTop / a.top8.total * 100) < 1e-8);
    }
    assert.ok(Math.abs(a.top8.rows.at(-1).cumulativeTop - 100) < 1e-8);
    assert.deepEqual(a.concentration.map((c) => c.n), [5, 6, 7]);
    assert.equal(a.concentration[1].total, rows.filter((r) => [513, 533].includes(r.subpartida.codigo)).reduce((n, r) => n + r.total, 0));
    for (const c of a.concentration) assert.ok(Math.abs(c.rows.at(-1).cumulative - 100) < 1e-8);
});
test('la partida 100 se presenta una vez por jurisdicción y sale del ranking de cuentas', () => {
    const a = buildMinisterialAnalysis([
        row(1, 111, 100), row(1, 113, 50), row(2, 112, 200),
        row(1, 211, 300), row(2, 211, 400),
    ]).all;
    assert.equal(a.total, 1050);
    assert.equal(a.partida100.total, 350);
    assert.deepEqual(a.partida100.rows.map((r) => [r.id, r.total]), [['2', 200], ['1', 150]]);
    assert.equal(a.accountsTotal, 700);
    assert.deepEqual(a.accounts.map((r) => r.id), ['211']);
    assert.equal(a.accounts[0].share, 100);
    assert.equal(a.accounts[0].rows.reduce((n, r) => n + r.total, 0), 700);
    const onlyPersonal = buildMinisterialAnalysis([row(1, 111, 100)]).all;
    assert.equal(onlyPersonal.accountsTotal, 0);
    assert.deepEqual(onlyPersonal.accounts, []);
    assert.equal(onlyPersonal.partida100.total, 100);
});
test('todos los subtotales y la matriz cierran, la selección original no añade otros organismos', () => {
    const a = buildMinisterialAnalysis([row(1, 211, 200), row(2, 211, 300), row(999, 211, 1000), row(1, 311, -50)]);
    assert.equal(a.reference.total, 450);
    assert.equal(a.all.total, 1450);
    assert.equal(a.reference.accounts.find((r) => r.id === '211').total, 500);
    assert.equal(a.reference.matrix.reduce((n, r) => n + r.total, 0), 450);
    assert.equal(a.reference.ministryRankings.find((r) => r.jurisdiction === '1' && r.combined && r.id === '200+300').total, 150);
});
test('los rankings conservan el signo y no anteponen los ajustes negativos por valor absoluto', () => {
    assert.deepEqual(ranked([{ id: 'a', total: -200 }, { id: 'b', total: 100 }]).map((r) => r.total), [100, -200]);
    const grouped = buildJurisdictionSubpartidaRows([{ jurisdiccion: 1, partid: 200, sub_partid: 211, total: -200 }, { jurisdiccion: 1, partid: 200, sub_partid: 212, total: 100 }]);
    assert.deepEqual(grouped.map((r) => r.total), [100, -200]);
});
