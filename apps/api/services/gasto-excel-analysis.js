const archive = require('../data/gasto_excel_sheets.json');
const { JURISDICCION_LABELS } = require('./gasto-desagregado');

const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/["']/g, '').trim().toLowerCase();
const ministryCodes = [1, 2, 3, 4, 6, 7, 13, 14];
const shortJurisdictions = { seguridad: 1, hacienda: 2, educacion: 3, 'salud publica': 4, 'obras publicas': 6, 'secretaria general': 7, planificacion: 13, 'desaroollo social': 14, 'desaroolo social': 14, 'desarrollo social': 14 };
const jurisdictionCode = (name) => shortJurisdictions[normalize(name)] ?? (Number(Object.keys(JURISDICCION_LABELS).find((k) => normalize(JURISDICCION_LABELS[k]) === normalize(name))) || null);
const sourceRubros = { Personal: [100], 'Bienes y servicios': [200, 300], Transferencias: [500], 'Bs de Uso': [400], Coparticipacion: [500], 'Serv deuda': [700], Deuda: [700], Otros: [600, 800] };
const categories = ['Personal', 'Bienes y servicios', 'Transferencias', 'Coparticipacion', 'Serv deuda', 'Bs de Uso', 'Otros'];
const catColumns = { C: 'Personal', D: 'Bienes y servicios', E: 'Transferencias', F: 'Coparticipacion', G: 'Serv deuda', H: 'Bs de Uso', I: 'Otros' };
const number = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (v) => Math.round(v * 100) / 100;

function rubroScope(label) {
    return { chapters: sourceRubros[label] || [], ...(label === 'Coparticipacion' ? { accounts: [571, 587] } : label === 'Transferencias' ? { excludeAccounts: [571, 587] } : {}) };
}

function describeSheet(book, sheet, index) {
    if (book.id === '1') return { destination: 'rankings', summary: 'Cuentas por ministerio separadas por partida, con participación y acumulado dentro de cada bloque.' };
    if (book.id === '2' && index < 8) return { destination: 'rankings', summary: 'Ranking conjunto de bienes y servicios (200 + 300), más bienes de uso y transferencias del ministerio.' };
    return ({
        '2-9': { destination: 'rankings', summary: 'Selección de cuentas y jurisdicciones, subtotales por cuenta y segunda presentación ordenada por monto. No representa todas las jurisdicciones.' },
        '2-10': { destination: 'rankings', summary: 'Tres transferencias de Seguridad: becas (513), ayudas sociales (514) y otras instituciones (517).' },
        '2-11': { destination: 'rankings', summary: 'Selección de bienes y servicios ordenada por cuenta de mayor monto, con apertura por jurisdicción.' },
        '3-1': { destination: 'executive', summary: 'Matriz sin personal, modificaciones presupuestarias, coparticipación y deuda separadas, participaciones y seis gráficos.' },
        '3-2': { destination: 'executive', summary: 'Tres universos con/sin personal y coparticipación, Top 8, ranking jurisdicción-rubro, rankings por rubro y bloque repetido.' },
        '3-3': { destination: 'projection', summary: 'Montos semestrales, promedios /6, seis necesidades o presupuestos ideales manuales, diferencias, subtotales y cálculos auxiliares.' },
        '3-4': { destination: 'executive', summary: 'Concentración Top 5 en bienes y servicios, Top 6 en transferencias y Top 7 en bienes de uso; coparticipación, deuda y otros.' },
        '3-5': { destination: 'executive', summary: 'Matriz por jurisdicción y rubro, modificaciones presupuestarias y subtotales. Base de conciliación de los resúmenes.' },
        '4-1': { destination: 'rankings', summary: 'Ranking conjunto 200 + 300. La hoja se llama 200, pero incluye servicios. Sus porcentajes usan sólo C5:C53.' },
        '4-2': { destination: 'rankings', summary: 'Ranking de servicios no personales (300), porcentaje y acumulado.' },
        '4-3': { destination: 'rankings', summary: 'Ranking de bienes de uso (400), porcentaje y acumulado.' },
        '4-4': { destination: 'rankings', summary: 'Transferencias (500), incluida seguridad social 533 y sin coparticipación 571/587.' },
        '4-5': { destination: 'rankings', summary: 'Coparticipación municipal: cuentas 571 y 587, presentadas fuera de las demás transferencias.' },
    })[sheet.id];
}

function sheetModel(book, sheet, index) {
    const cells = new Map(sheet.cells.map((c) => [c.ref, c]));
    const val = (ref) => cells.get(ref)?.value;
    const blocks = [];
    const add = (title, rows, note = '') => { if (rows.length) blocks.push({ title, note, rows }); };
    const entry = (ref, label, scope, shareRef) => {
        const match = shareRef?.match(/^([A-Z])(\d+)$/);
        const cumulativeRef = match ? String.fromCharCode(match[1].charCodeAt(0) + 1) + match[2] : null;
        const cumulativeCell = cells.get(cumulativeRef);
        return { ref, label, reference: number(val(ref)) ? val(ref) : null, scope,
            originalShare: number(val(shareRef)) ? val(shareRef) * 100 : null,
            originalCumulative: cumulativeCell?.format.includes('%') && number(cumulativeCell.value) ? cumulativeCell.value * 100 : null };
    };
    const accounts = (start, end, amountCol, jurisdiction, byName = false) => {
        const rows = [];
        for (let r = start; r <= end; r++) {
            const code = Number(val(`A${r}`));
            if (!Number.isInteger(code) || code < 100 || code >= 1000) continue;
            const jur = byName ? jurisdictionCode(val(`B${r}`)) : jurisdiction;
            const description = val(`${amountCol === 'D' ? 'C' : 'B'}${r}`);
            rows.push(entry(`${amountCol}${r}`, `${code} · ${description}${byName ? ` · ${val(`B${r}`)}` : ''}`,
                { accounts: [code], chapters: [Math.floor(code / 100) * 100], ...(jur ? { jurisdictions: [jur] } : {}), unresolved: byName && !jur }, `${amountCol === 'D' ? 'E' : 'D'}${r}`));
        }
        return rows;
    };
    if (book.id === '1' || (book.id === '2' && index < 8)) {
        const amount = book.id === '2' || index === 1 ? 'D' : 'C';
        const rows = accounts(1, 130, amount, ministryCodes[index]);
        for (const chapters of book.id === '1' ? [[200], [300], [400], [500], [600], [700], [800]] : [[200, 300], [400], [500], [600], [700], [800]]) {
            add(`Cuentas ${chapters.join(' + ')} · ${sheet.name}`, rows.filter((r) => chapters.includes(r.scope.chapters[0])), 'El porcentaje del corte se recalcula sobre las cuentas de este bloque. El % original conserva la fórmula del Excel.');
        }
    } else if (book.id === '4') {
        add(sheet.name === '200' ? 'Bienes y servicios · 200 + 300' : `Cuentas · ${sheet.name}`, accounts(1, 130, 'C', null), sheet.name === '200' ? 'El denominador original C5:C53 excluye cuentas posteriores. El total recalculado incluye todas las cuentas del bloque.' : 'Se compara la misma selección de cuentas, sin sumar otras hojas.');
    } else if (sheet.id === '2-9' || sheet.id === '2-11' || sheet.id === '2-10') {
        const ranges = sheet.id === '2-9' ? [[5, 109], [117, 194]] : sheet.id === '2-11' ? [[6, 83]] : [[6, 8]];
        ranges.forEach(([a, b]) => add(`Cuentas y jurisdicciones · filas ${a}–${b}`, accounts(a, b, 'D', null, true), 'Selección manual de cuentas y jurisdicciones. Las repeticiones se conservan en el original y se cuentan una sola vez en el total de claves únicas.'));
    } else if (sheet.id === '3-5' || sheet.id === '3-1') {
        const base = sheet.id === '3-5';
        const cols = base ? catColumns : { C: 'Personal', D: 'Bienes y servicios', E: 'Transferencias', F: 'Bs de Uso', G: 'Otros' };
        const allRows = [];
        const budgets = [];
        for (let r = base ? 2 : 3; r <= (base ? 26 : 29); r++) {
            const name = val(`A${r}`);
            const jur = jurisdictionCode(name);
            if (number(val(`B${r}`))) budgets.push(entry(`B${r}`, String(name), { jurisdictions: jur ? [jur] : [], manual: true }));
            for (const [col, label] of Object.entries(cols)) {
                if (!number(val(`${col}${r}`))) continue;
                const special = !base && r === 4 ? 'Coparticipacion' : !base && r === 5 ? 'Deuda' : label;
                allRows.push(entry(`${col}${r}`, `${name} · ${special}`, { ...rubroScope(special), jurisdictions: [jur || 2], unresolved: !jur && ![4, 5].includes(r) }));
            }
        }
        add('Matriz de ejecución por jurisdicción y rubro', allRows, 'Transferencias del Excel incluye 533 y excluye 571/587. La conciliación usa las jurisdicciones de cada fila, no el total de otros organismos del corte.');
        const subtotals = [];
        for (let r = base ? 2 : 3; r <= (base ? 26 : 29); r++) {
            const name = val(`A${r}`), jur = jurisdictionCode(name);
            const scope = !base && r === 4 ? { ...rubroScope('Coparticipacion'), jurisdictions: [2] }
                : !base && r === 5 ? { ...rubroScope('Deuda'), jurisdictions: [2] }
                : { chapters: base ? [100, 200, 300, 400, 500, 600, 700, 800] : [200, 300, 400, 500, 600, 800], jurisdictions: [jur], ...(!base ? { excludeAccounts: [571, 587] } : {}) };
            subtotals.push(entry(`${base ? 'J' : 'H'}${r}`, String(name), scope, base ? null : `I${r}`));
        }
        add(base ? 'Subtotales por jurisdicción · ejecución, sin modificaciones' : 'Subtotales sin personal · participación y acumulado', subtotals, base ? 'J26 no tiene subtotal guardado. El corte vivo incluye toda la ejecución del organismo.' : 'El acumulado vivo recorre el orden del Excel sin reinicios. Coparticipación y deuda se conservan como filas separadas de Hacienda.');
        add('Modificaciones presupuestarias del Excel', budgets, 'Referencia manual del archivo. No forma parte del gasto comprometido.');
    } else if (sheet.id === '3-2') {
        for (const [a, b, title] of [[5, 11, 'Con personal y coparticipación'], [16, 21, 'Sin personal, con coparticipación'], [26, 30, 'Sin personal ni coparticipación']]) {
            const rows = [];
            const baseJurisdictions = archive.books[2].sheets[4].cells.filter((c) => c.col === 1 && c.row >= 2 && c.row <= 26).map((c) => jurisdictionCode(c.value)).filter(Boolean);
            for (let r = a; r <= b; r++) rows.push(entry(`C${r}`, val(`A${r}`), { ...rubroScope(val(`A${r}`)), jurisdictions: baseJurisdictions }, `D${r}`));
            add(title, rows);
        }
        add('Top 8 sin personal ni coparticipación', Array.from({ length: 8 }, (_, i) => {
            const r = 36 + i;
            return entry(`C${r}`, val(`A${r}`), { chapters: [200, 300, 400, 500, 600, 800], excludeAccounts: [571, 587], jurisdictions: [jurisdictionCode(val(`A${r}`))] }, `D${r}`);
        }), 'Porcentajes sobre el Top 8 seleccionado en la hoja; la deuda no integra esos subtotales.');
        for (const [a, b, title] of [[51, 127, 'Ranking jurisdicción y grupo'], [135, 159, 'Ranking bienes y servicios'], [165, 183, 'Ranking transferencias'], [188, 207, 'Ranking bienes de uso'], [221, 297, 'Segunda presentación del ranking jurisdicción y grupo']]) {
            const rows = [];
            for (let r = a; r <= b; r++) {
                if (!val(`A${r}`) || !val(`B${r}`)) continue;
                rows.push(entry(`C${r}`, `${val(`A${r}`)} · ${val(`B${r}`)}`, { ...rubroScope(val(`B${r}`)), jurisdictions: [jurisdictionCode(val(`A${r}`))], unresolved: !jurisdictionCode(val(`A${r}`)) }, `D${r}`));
            }
            add(title, rows);
        }
    } else if (sheet.id === '3-3') {
        const rows = [], targets = [];
        for (let r = 4; r <= 28; r++) {
            const jur = jurisdictionCode(val(`A${r}`));
            for (const [col, cat] of Object.entries({ B: 'Bienes y servicios', F: 'Transferencias', J: 'Bs de Uso', L: 'Serv deuda', N: 'Otros' })) {
                if (!number(val(`${col}${r}`))) continue;
                const targetCol = col === 'B' ? 'D' : col === 'F' ? 'H' : null;
                rows.push({ ...entry(`${col}${r}`, `${val(`A${r}`)} · ${cat}`, { ...rubroScope(cat), jurisdictions: [jur], unresolved: !jur }), projection: true, target: targetCol && number(val(`${targetCol}${r}`)) ? val(`${targetCol}${r}`) : null, targetRef: targetCol ? `${targetCol}${r}` : null });
                if (targetCol && number(val(`${targetCol}${r}`))) targets.push(entry(`${targetCol}${r}`, `${val(`A${r}`)} · ${cat}`, { manual: true }));
            }
        }
        add('Ejecución, promedio mensual y diferencias con necesidades', rows, 'Promedio original /6; promedio vivo por todos los meses solicitados, incluidos meses sin registros. Ritmo anual sólo para Comprometido.');
        add('Necesidades y presupuestos ideales manuales', targets, 'Se conservan las seis cifras y su precisión de origen. No se aplican como metas de otro año, fuente o estado.');
        add('Cálculos auxiliares', ['C32', 'C33', 'G33', 'G34', 'G35', 'G36'].map((ref) => entry(ref, `Auxiliar ${ref}`, { manual: true })), 'C32:C33 no tienen rótulo ni unidad. G33:G36 resta 2.000 millones de las transferencias semestrales de Desarrollo Social y divide el saldo por 6.');
    } else if (sheet.id === '3-4') {
        for (const [a, b, cat] of [[6, 10, 'Bienes y servicios'], [15, 20, 'Transferencias'], [25, 31, 'Bs de Uso']]) {
            add(`Top ${b - a + 1} · ${cat}`, Array.from({ length: b - a + 1 }, (_, i) => entry(`B${a+i}`, val(`A${a+i}`), { ...rubroScope(cat), jurisdictions: [jurisdictionCode(val(`A${a+i}`))] }, `C${a+i}`)), 'La lista conserva los organismos elegidos en el archivo. El % del corte usa el total de la selección; el % Excel usa todo el rubro.');
        }
        const jur = archive.books[2].sheets[4].cells.filter((c) => c.col === 1 && c.row >= 2 && c.row <= 26).map((c) => jurisdictionCode(c.value)).filter(Boolean);
        add('Totales por rubro sin personal', [4, 13, 23, 35, 38, 41].map((r) => entry(`B${r}`, val(`A${r}`), { ...rubroScope(val(`A${r}`)), jurisdictions: jur }, `C${r}`)));
    }
    return { id: sheet.id, name: sheet.name, bookId: book.id, book: book.name, ...describeSheet(book, sheet, index), cellCount: sheet.cells.length, formulaCount: sheet.formulaCount, chartCount: sheet.charts.length, blocks };
}

const models = archive.books.flatMap((book) => book.sheets.map((s, i) => sheetModel(book, s, i)));

function matches(scope, row) {
    return (!scope.jurisdictions?.length || scope.jurisdictions.includes(row.jurisdiccion.codigo))
        && (!scope.chapters?.length || scope.chapters.includes(row.partida.codigo))
        && (!scope.accounts?.length || scope.accounts.includes(row.subpartida.codigo))
        && !scope.excludeAccounts?.includes(row.subpartida.codigo);
}

function buildExcelAnalysis(liveRows, filters, isSnapshot) {
    const months = filters.mesHasta - filters.mesDesde + 1;
    const samePeriod = filters.anio === 2026 && filters.mesDesde === 1 && filters.mesHasta === 6 && filters.fuentes?.length === 1 && filters.fuentes[0] === 10 && filters.estados?.[0] === 'Comprometido' && !filters.jurisdicciones?.length && !filters.partidas?.length && !filters.subPartidas?.length;
    return models.map((model) => ({ ...model, blocks: model.blocks.map((block) => {
        const seen = new Set();
        const rows = block.rows.map((entry) => {
            const key = JSON.stringify(entry.scope);
            const repeated = !entry.scope.manual && seen.has(key);
            seen.add(key);
            const matching = entry.scope.manual || entry.scope.unresolved ? [] : liveRows.filter((r) => matches(entry.scope, r));
            const total = matching.length ? matching.reduce((sum, r) => sum + r.total, 0) : null;
            const average = entry.projection && !isSnapshot && total !== null ? total / months : null;
            return { ...entry, repeated, live: total === null ? null : round(total), difference: samePeriod && total !== null && entry.reference !== null ? round(total - entry.reference) : null,
                average, annual: average === null ? null : average * 12, targetDifference: samePeriod && average !== null && entry.target !== null && entry.target !== undefined ? average - entry.target : null,
                missing: entry.scope.manual ? 'Referencia manual' : entry.scope.unresolved ? 'Jurisdicción sin equivalencia' : matching.length ? null : 'Sin registros en el corte' };
        });
        const unique = rows.filter((r) => !r.repeated && !r.scope.manual);
        const total = unique.reduce((sum, r) => sum + (r.live ?? 0), 0);
        const subtotalMap = new Map();
        if (['2-9', '2-10', '2-11'].includes(model.id)) for (const r of unique) {
            const account = r.scope.accounts[0];
            if (!subtotalMap.has(account)) subtotalMap.set(account, { account, reference: 0, live: null, jurisdictions: 0 });
            const item = subtotalMap.get(account);
            item.reference += r.reference ?? 0;
            if (r.live !== null) item.live = (item.live ?? 0) + r.live;
            item.jurisdictions += 1;
        }
        let cumulative = 0;
        rows.forEach((r) => { if (!r.repeated && !r.scope.manual) cumulative += r.live ?? 0; r.share = r.live !== null && total !== 0 ? r.live / total * 100 : null; r.cumulative = r.live !== null && total !== 0 && !r.repeated ? cumulative / total * 100 : null; });
        return { ...block, rows, accountSubtotals: [...subtotalMap.values()], liveTotal: unique.some((r) => r.live !== null) ? total : null, referenceTotal: unique.reduce((sum, r) => sum + (r.reference ?? 0), 0) };
    }) }));
}

module.exports = { archive, models, buildExcelAnalysis, jurisdictionCode, matches, categories };
