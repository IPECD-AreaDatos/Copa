const { archive, jurisdictionCode } = require('./gasto-excel-analysis');

const referenceJurisdictions = [...new Set(archive.books[2].sheets[4].cells
    .filter((c) => c.col === 1 && c.row >= 2 && c.row <= 26)
    .map((c) => jurisdictionCode(c.value)).filter(Boolean))];
const labels = { personal: 'Personal', bienes_servicios: 'Bienes y servicios', transferencias: 'Transferencias (incluye 533)', coparticipacion: 'Coparticipación', deuda: 'Servicio de la deuda', bienes_uso: 'Bienes de uso', otros: 'Otros', figurativos: 'Gastos figurativos' };
function sourceCategory(row) {
    return row.rubro.codigo === 'seguridad_social' ? 'transferencias' : row.rubro.codigo;
}
const sum = (rows) => rows.reduce((n, r) => n + r.total, 0);
function ranked(rows, denominator = sum(rows)) {
    let accumulated = 0;
    return [...rows].sort((a, b) => b.total - a.total || String(a.id).localeCompare(String(b.id))).map((r, i) => {
        accumulated += r.total;
        return { ...r, rank: i + 1, share: denominator === 0 ? null : r.total / denominator * 100, cumulative: denominator === 0 ? null : accumulated / denominator * 100 };
    });
}
function aggregate(rows, key, label) {
    const groups = new Map();
    for (const row of rows) {
        const id = key(row);
        if (!groups.has(id)) groups.set(id, { id, label: label(row), total: 0 });
        groups.get(id).total += row.total;
    }
    return [...groups.values()];
}
function analysis(rows) {
    const universes = [
        { id: 'all', label: 'Con personal y coparticipación', rows },
        { id: 'no-personal', label: 'Sin personal, con coparticipación', rows: rows.filter((r) => sourceCategory(r) !== 'personal') },
        { id: 'operating', label: 'Sin personal ni coparticipación', rows: rows.filter((r) => !['personal', 'coparticipacion'].includes(sourceCategory(r))) },
    ].map(({ id, label, rows: selected }) => ({
        id, label, total: sum(selected),
        rubros: ranked(aggregate(selected, sourceCategory, (r) => labels[sourceCategory(r)] || r.rubro.nombre)),
        ranking: ranked(aggregate(selected, (r) => `${r.jurisdiccion.codigo}|${sourceCategory(r)}`, (r) => `${r.jurisdiccion.nombre} · ${labels[sourceCategory(r)] || r.rubro.nombre}`)),
    }));
    const topScope = rows.filter((r) => [200, 300, 400, 500, 600, 800].includes(r.partida.codigo) && ![571, 587].includes(r.subpartida.codigo));
    const jurisdictionRanking = ranked(aggregate(topScope, (r) => String(r.jurisdiccion.codigo), (r) => r.jurisdiccion.nombre));
    const topEight = jurisdictionRanking.slice(0, 8);
    const topTotal = sum(topEight);
    let topAccumulated = 0;
    const top8 = { total: topTotal, universeTotal: sum(topScope), rows: topEight.map((r) => {
        topAccumulated += r.total;
        return {
            ...r,
            shareTop: topTotal === 0 ? null : r.total / topTotal * 100,
            cumulativeTop: topTotal === 0 ? null : topAccumulated / topTotal * 100,
        };
    }) };
    const concentration = Object.entries({ bienes_servicios: 5, transferencias: 6, bienes_uso: 7 }).map(([id, n]) => {
        const selected = rows.filter((r) => sourceCategory(r) === id);
        const ranking = ranked(aggregate(selected, (r) => String(r.jurisdiccion.codigo), (r) => r.jurisdiccion.nombre));
        const top = ranking.slice(0, n);
        return { id, label: labels[id], n, total: sum(selected), topTotal: sum(top), rows: ranking };
    });
    const matrix = aggregate(rows, (r) => String(r.jurisdiccion.codigo), (r) => r.jurisdiccion.nombre).map((jur) => {
        const selected = rows.filter((r) => String(r.jurisdiccion.codigo) === jur.id);
        const rubros = Object.fromEntries(aggregate(selected, sourceCategory, (r) => labels[sourceCategory(r)]).map((r) => [r.id, r.total]));
        return { ...jur, rubros, withoutPersonal: jur.total - (rubros.personal || 0), withoutPersonalCop: jur.total - (rubros.personal || 0) - (rubros.coparticipacion || 0) };
    }).sort((a, b) => b.total - a.total);
    const personalRows = rows.filter((r) => r.partida.codigo === 100);
    const partida100 = {
        total: sum(personalRows),
        rows: ranked(aggregate(personalRows, (r) => String(r.jurisdiccion.codigo), (r) => r.jurisdiccion.nombre)),
    };
    const accountRows = rows.filter((r) => r.partida.codigo !== 100);
    const accountsTotal = sum(accountRows);
    const accounts = ranked(aggregate(accountRows, (r) => String(r.subpartida.codigo), (r) => `${r.subpartida.codigo} · ${r.subpartida.nombre}`)).map((account) => ({
        ...account, rows: ranked(aggregate(accountRows.filter((r) => String(r.subpartida.codigo) === account.id), (r) => String(r.jurisdiccion.codigo), (r) => r.jurisdiccion.nombre)),
    }));
    const ministryRankings = [];
    for (const jur of matrix) {
        const selected = rows.filter((r) => String(r.jurisdiccion.codigo) === jur.id);
        for (const combined of [false, true]) {
            const groups = aggregate(selected, (r) => combined && [200, 300].includes(r.partida.codigo) ? '200+300' : String(r.partida.codigo), (r) => combined && [200, 300].includes(r.partida.codigo) ? 'Bienes y servicios · 200+300' : r.partida.nombre);
            for (const group of groups) {
                const matches = selected.filter((r) => (combined && [200, 300].includes(r.partida.codigo) ? '200+300' : String(r.partida.codigo)) === group.id);
                ministryRankings.push({ ...group, jurisdiction: jur.id, combined, rows: ranked(aggregate(matches, (r) => String(r.subpartida.codigo), (r) => `${r.subpartida.codigo} · ${r.subpartida.nombre}`)) });
            }
        }
    }
    return { universes, top8, concentration, matrix, partida100, accountsTotal, accounts, ministryRankings, labels, total: sum(rows) };
}
function buildMinisterialAnalysis(rows) {
    return { all: analysis(rows), reference: analysis(rows.filter((r) => referenceJurisdictions.includes(r.jurisdiccion.codigo))), referenceJurisdictions };
}
module.exports = { buildMinisterialAnalysis, referenceJurisdictions, sourceCategory, ranked };
