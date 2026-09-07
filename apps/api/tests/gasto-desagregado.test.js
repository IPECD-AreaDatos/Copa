const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildFilters,
    buildWhere,
    buildJurisdictionSubpartidaRows,
    buildRubroRows,
    buildSubpartidaRows,
    gastoRubro,
} = require('../services/gasto-desagregado');

test('admite varios capítulos sin duplicados y los combina con los demás filtros', () => {
    const filters = buildFilters({ anio: '2026', fuente: '10', jurisdiccion: '4', partid: '200,300,200' });
    assert.deepEqual(filters.partidas, [200, 300]);
    const where = buildWhere(filters);
    assert.ok(where.text.includes('partid = ANY('));
    assert.ok(where.text.includes('jurisdiccion = ANY('));
    assert.ok(where.text.includes('codigo_fuente = ANY('));
    assert.ok(where.params.some((p) => Array.isArray(p) && p.join(',') === '200,300'));
    assert.equal(buildFilters({}).partidas, null);
    assert.equal(buildFilters({ partid: 'TODAS' }).partidas, null);
    assert.throws(() => buildFilters({ partid: '200,no-valido' }), /partid/);
});

test('clasifica los capítulos con la semántica compatible con los Excel', () => {
    assert.equal(gastoRubro(100, 113), 'personal');
    assert.equal(gastoRubro(200, 211), 'bienes_servicios');
    assert.equal(gastoRubro(300, 311), 'bienes_servicios');
    assert.equal(gastoRubro(500, 513), 'transferencias');
    assert.equal(gastoRubro(500, 533), 'seguridad_social');
    assert.equal(gastoRubro(500, 571), 'coparticipacion');
    assert.equal(gastoRubro(500, 587), 'coparticipacion');
    assert.equal(gastoRubro(900, 911), 'figurativos');
});

test('calcula ranking y acumulado de cuentas dentro de cada capítulo', () => {
    const chapters = [
        { codigo: 200, total: 300 },
        { codigo: 500, total: 100 },
    ];
    const rows = [
        { partid: 200, sub_partid: 211, total: 200, row_count: 2, jurisdicciones: 1 },
        { partid: 200, sub_partid: 212, total: 100, row_count: 1, jurisdicciones: 1 },
        { partid: 500, sub_partid: 571, total: 100, row_count: 1, jurisdicciones: 1 },
    ];
    const result = buildSubpartidaRows(rows, chapters);

    assert.deepEqual(result.map((row) => row.rankPartida), [1, 2, 1]);
    assert.equal(result[0].acumuladoPartida, 200 / 300 * 100);
    assert.equal(result[1].acumuladoPartida, 100);
    assert.equal(result[2].rubro.codigo, 'coparticipacion');
});

test('mantiene cierres de rubros y acumulados por jurisdicción', () => {
    const rubros = buildRubroRows([
        { rubro: 'personal', total: 70, row_count: 1, partidas: 1, subpartidas: 1 },
        { rubro: 'bienes_servicios', total: 30, row_count: 1, partidas: 2, subpartidas: 2 },
    ]);
    assert.equal(rubros.reduce((sum, row) => sum + row.total, 0), 100);
    assert.equal(rubros[0].participacion, 70);
    assert.equal(rubros[1].participacion, 30);

    const accounts = buildJurisdictionSubpartidaRows([
        { jurisdiccion: 1, partid: 100, sub_partid: 113, total: 70, row_count: 1, months: 2 },
        { jurisdiccion: 1, partid: 200, sub_partid: 211, total: 30, row_count: 1, months: 2 },
    ]);
    assert.deepEqual(accounts.map((row) => row.rankJurisdiccion), [1, 2]);
    assert.equal(accounts.at(-1).acumuladoJurisdiccion, 100);
    assert.equal(accounts[0].meses, 2);
});
