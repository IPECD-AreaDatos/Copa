// gasto/script_gasto.js
let rawData = [];
let ratioChartInstance = null;
let waterfallChartInstance = null;

const ORDEN_PARTIDAS = [
    "GASTOS EN PERSONAL", "BIENES DE CONSUMO", "SERVICIOS NO PERSONALES",
    "BIENES DE USO", "TRANSFERENCIAS", "ACTIVOS FINANCIEROS",
    "SERVICIO DE LA DEUDA", "OTROS GASTOS", "GASTOS FIGURATIVOS"
];
const CODIGOS_PARTIDA = {
    "GASTOS EN PERSONAL": "100", "BIENES DE CONSUMO": "200",
    "SERVICIOS NO PERSONALES": "300", "BIENES DE USO": "400",
    "TRANSFERENCIAS": "500", "ACTIVOS FINANCIEROS": "600",
    "SERVICIO DE LA DEUDA": "700", "OTROS GASTOS": "800",
    "GASTOS FIGURATIVOS": "900"
};
const ORDEN_JURISDICCIONES = [
    "MINISTERIO DE SEGURIDAD", "MINISTERIO DE HACIENDA Y FINANZAS",
    "MINISTERIO DE EDUCACIÓN", "MINISTERIO DE SALUD PÚBLICA",
    "MINISTERIO DE PRODUCCIÓN", "MINISTERIO DE OBRAS Y SERVICIOS PÚBLICOS",
    "MINISTERIO SECRETARIA GENERAL", "TRIBUNAL DE CUENTAS",
    "PODER JUDICIAL", "PODER LEGISLATIVO", "FISCALIA DE ESTADO",
    "MINISTERIO DE CIENCIA Y TECNOLOGIA", "MINISTERIO DE COORDINACIÓN Y PLANIFICACIÓN",
    "MINISTERIO DE DESARROLLO SOCIAL", "MINISTERIO DE JUSTICIA Y DERECHOS HUMANOS",
    "SECRETARIA DE ENERGIA", "MINISTERIO DE INDUSTRIA TRABAJO Y COMERCIO",
    "MINISTERIO DE TURISMO", "INSTITUTO DE LOTERIA Y CASINOS",
    "INSTITUTO DE CARDIOLOGIA DE CORRIENTES", "INSTITUTO PROVINCIAL DEL TABACO",
    "INSTITUTO CORRENTINO DEL AGUA Y DEL AMBIENTE", "INSTITUTO DE CULTURA DE CORRIENTES",
    "INSTITUTO DE VIVIENDA DE CORRIENTES", "DIRECCIÓN PROVINCIAL DEL VIALIDAD",
    "ADMINISTRACIÓN DE OBRAS SANITARIAS DE CORRIENTES",
    "INSTITUTO DE DESARROLLO RURAL DE CORRIENTES",
    "CENTRO DE ONCOLOGIA 'ANNA ROCCA DE BONATTI'",
    "ENTE PROVINCIAL REGULADOR ELECTRICO", "AGENCIA CORRENTINA DE BIENES DEL ESTADO",
    "INSTITUTO DE PREVISION SOCIAL", "INSTITUTO DE OBRA SOCIAL DE CORRIENTES",
    "DIRECCIÓN PROVINCIAL DE ENERGIA DE CORRIENTES"
];
const SHORT_JURISDICCIONES = {
    "MINISTERIO DE SEGURIDAD": "MIN. SEGURIDAD",
    "MINISTERIO DE HACIENDA Y FINANZAS": "MIN. HACIENDA",
    "MINISTERIO DE EDUCACIÓN": "MIN. EDUCACIÓN",
    "MINISTERIO DE SALUD PÚBLICA": "MIN. SALUD",
    "MINISTERIO DE PRODUCCIÓN": "MIN. PROD",
    "MINISTERIO DE OBRAS Y SERVICIOS PÚBLICOS": "MIN. OBRAS",
    "MINISTERIO SECRETARIA GENERAL": "SEC. GRAL",
    "TRIBUNAL DE CUENTAS": "TRIB. CTAS",
    "PODER JUDICIAL": "POD. JUDICIAL",
    "PODER LEGISLATIVO": "POD. LEG",
    "FISCALIA DE ESTADO": "FISCALIA",
    "MINISTERIO DE CIENCIA Y TECNOLOGIA": "MIN. CIA Y TEC",
    "MINISTERIO DE COORDINACIÓN Y PLANIFICACIÓN": "MIN. COORDINACION",
    "MINISTERIO DE DESARROLLO SOCIAL": "DESARROLLO SOC",
    "MINISTERIO DE JUSTICIA Y DERECHOS HUMANOS": "MIN. JUSTICIA",
    "SECRETARIA DE ENERGIA": "SEC. ENERGIA",
    "MINISTERIO DE INDUSTRIA TRABAJO Y COMERCIO": "MIN. INDUSTRIA",
    "MINISTERIO DE TURISMO": "MIN. TURISMO",
    "INSTITUTO DE LOTERIA Y CASINOS": "LOTERIA",
    "INSTITUTO DE CARDIOLOGIA DE CORRIENTES": "INST. CARDIOLOGIA",
    "INSTITUTO PROVINCIAL DEL TABACO": "INST. TABACO",
    "INSTITUTO CORRENTINO DEL AGUA Y DEL AMBIENTE": "ICAA",
    "INSTITUTO DE CULTURA DE CORRIENTES": "INST. CULTURA",
    "INSTITUTO DE VIVIENDA DE CORRIENTES": "VIVIENDA",
    "DIRECCIÓN PROVINCIAL DEL VIALIDAD": "VIALIDAD",
    "ADMINISTRACIÓN DE OBRAS SANITARIAS DE CORRIENTES": "ADM. OBR SANITARIAS",
    "INSTITUTO DE DESARROLLO RURAL DE CORRIENTES": "DES. RURAL",
    "CENTRO DE ONCOLOGIA 'ANNA ROCCA DE BONATTI'": "ANNA BONATTI",
    "ENTE PROVINCIAL REGULADOR ELECTRICO": "ENT. REG. ELECT",
    "AGENCIA CORRENTINA DE BIENES DEL ESTADO": "AG. BIENES ESTADO",
    "INSTITUTO DE PREVISION SOCIAL": "IPS",
    "INSTITUTO DE OBRA SOCIAL DE CORRIENTES": "IOSCOR",
    "DIRECCIÓN PROVINCIAL DE ENERGIA DE CORRIENTES": "DPEC"
};
const partidaColors = {
    'GASTOS EN PERSONAL': '#719C29', 'BIENES DE CONSUMO': '#356F23',
    'SERVICIOS NO PERSONALES': '#008275', 'BIENES DE USO': '#58A89A',
    'TRANSFERENCIAS': '#90B4E1', 'ACTIVOS FINANCIEROS': '#769FD3',
    'SERVICIO DE LA DEUDA': '#1F5D9B', 'OTROS GASTOS': '#6B5CB7',
    'GASTOS FIGURATIVOS': '#8E7CC3'
};
const FUENTE_VALUES = ['10', '11', '12', '13', '14'];

const formaterARS = new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 0, maximumFractionDigits: 0
});

const tsInstances = {};

document.addEventListener('DOMContentLoaded', () => initDashboard());

async function initDashboard() {
    try {
        const response = await fetch('./gasto_data.json');
        if (!response.ok) throw new Error('Error loading gasto data');
        rawData = await response.json();
        populateAllFilters();
        setupEventListeners();
        updateAll();
    } catch (error) {
        console.error("Dashboard init error:", error);
        const tb = document.querySelector('#gasto-table tbody');
        if (tb) tb.innerHTML = `<tr><td colspan="5" style="text-align:center;color:red;">Error cargando datos.</td></tr>`;
    }
}

// ========================
// MULTI-SELECT HELPER
// Creates a TomSelect multi-select with:
//   - "TODAS" option that selects/deselects all
//   - Summary text instead of individual tags
//   - Checkbox plugin
// ========================
function createMultiSelect(selId, allIndividualValues, allLabel, onChangeCb) {
    const ts = new TomSelect(`#${selId}`, {
        plugins: ['checkbox_options'],
        maxOptions: null,
        closeAfterSelect: false,
        hideSelected: false,
        render: {
            item: function() {
                return '<div style="display:none"></div>';
            }
        },
        onInitialize: function() {
            this.wrapper.classList.add('ts-multi-summary-mode');
            const summary = document.createElement('span');
            summary.className = 'ts-multi-summary';
            summary.textContent = allLabel;
            this.control.insertBefore(summary, this.control_input);
            this._summaryEl = summary;
            this._allLabel = allLabel;
            this._allValues = allIndividualValues;
            this._userIsTyping = false;
            this._clearedByTyping = false;
        },
        onType: function(str) {
            // When user starts typing, clear all selections so they pick fresh
            if (str.length > 0 && !this._clearedByTyping) {
                this._clearedByTyping = true;
                this._userIsTyping = true;
                this.clear(true);
                this._prevHadTodas = false;
            }
            if (str.length === 0) {
                this._clearedByTyping = false;
                this._userIsTyping = false;
            }
        },
        onDropdownClose: function() {
            this._clearedByTyping = false;
            this._userIsTyping = false;
        }
    });

    // Track whether we're in a programmatic update to avoid loops
    let programmatic = false;

    ts.on('change', function() {
        if (programmatic) return;
        programmatic = true;

        const vals = ts.getValue(); // array of selected values

        const todasSelected = vals.includes('TODAS');
        const prevHadTodas = ts._prevHadTodas || false;

        if (todasSelected && !prevHadTodas) {
            // User just checked TODAS → select all individual
            ts.setValue(['TODAS', ...allIndividualValues], true);
        } else if (!todasSelected && prevHadTodas) {
            // User just unchecked TODAS → deselect all
            ts.clear(true);
        } else if (!todasSelected) {
            // Check if all individual are selected → auto-select TODAS
            const indivSelected = vals.filter(v => v !== 'TODAS');
            if (indivSelected.length === allIndividualValues.length) {
                ts.addItem('TODAS', true);
            }
        } else if (todasSelected) {
            // TODAS is selected but an individual was removed
            const indivSelected = vals.filter(v => v !== 'TODAS');
            if (indivSelected.length < allIndividualValues.length) {
                ts.removeItem('TODAS', true);
            }
        }

        // Update tracked state
        const finalVals = ts.getValue();
        ts._prevHadTodas = finalVals.includes('TODAS');

        // Update summary text
        updateMultiSummary(ts);

        programmatic = false;

        // Call the actual update function
        if (onChangeCb) onChangeCb();
    });

    // Initial state: select all + TODAS
    ts.setValue(['TODAS', ...allIndividualValues], true);
    ts._prevHadTodas = true;
    updateMultiSummary(ts);

    tsInstances[selId] = ts;
    return ts;
}

function updateMultiSummary(ts) {
    if (!ts._summaryEl) return;
    const vals = ts.getValue().filter(v => v !== 'TODAS');
    if (vals.length === 0 || vals.length === ts._allValues.length) {
        ts._summaryEl.textContent = ts._allLabel;
    } else if (vals.length === 1) {
        // Show the single selected option text
        const opt = ts.options[vals[0]];
        ts._summaryEl.textContent = opt ? opt.text : '1 seleccionada';
    } else {
        ts._summaryEl.textContent = `${vals.length} seleccionadas`;
    }
}

// Get selected values from a multi-select (excluding TODAS)
// Returns null if all are selected (= no filter needed)
function getMultiValues(selId) {
    const ts = tsInstances[selId];
    if (!ts) return null;
    const vals = ts.getValue().filter(v => v !== 'TODAS');
    if (vals.length === 0 || vals.length === ts._allValues.length) return null; // TODAS
    return new Set(vals);
}

function matchFuenteMulti(d, fuenteSet) {
    if (!fuenteSet) return true;
    return fuenteSet.has(String(d.tipo_financ));
}

function matchJurisMulti(d, jurisSet) {
    if (!jurisSet) return true;
    return jurisSet.has((d.jurisdiccion || '').trim());
}

function getSimpleVal(selId) {
    const el = document.getElementById(selId);
    return el ? el.value : '';
}

function matchFuenteSingle(d, fuenteVal) {
    if (fuenteVal === 'TODAS') return true;
    return String(d.tipo_financ) === fuenteVal;
}

function formatPeriodo(isoStr) {
    const parts = isoStr.split('-');
    if (parts.length !== 2) return isoStr;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1);
    const m = date.toLocaleString('es-ES', { month: 'long' });
    return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + parts[0];
}

// ========================
// POPULATE ALL FILTERS
// ========================
function populateAllFilters() {
    const periodos = [...new Set(rawData.map(d => d.periodo))].sort();
    const jurisVistasEnBD = new Set(rawData.map(d => (d.jurisdiccion || '').trim()));
    const jurisdicciones = ORDEN_JURISDICCIONES.filter(j => jurisVistasEnBD.has(j));
    const lastPeriodo = periodos.length > 0 ? periodos[periodos.length - 1] : '';

    function fillPeriodo(selId) {
        const sel = document.getElementById(selId);
        if (!sel) return;
        sel.innerHTML = '';
        periodos.forEach(p => {
            const o = document.createElement('option');
            o.value = p; o.textContent = formatPeriodo(p);
            sel.appendChild(o);
        });
        sel.value = lastPeriodo;
    }

    function fillJurisOptions(selId) {
        const sel = document.getElementById(selId);
        if (!sel) return;
        // Keep the TODAS option from HTML, add jurisdicciones
        // Clear existing options after TODAS
        const todasOpt = sel.querySelector('option[value="TODAS"]');
        sel.innerHTML = '';
        if (todasOpt) sel.appendChild(todasOpt);
        jurisdicciones.forEach(j => {
            const o = document.createElement('option');
            o.value = j; o.textContent = j;
            sel.appendChild(o);
        });
    }

    // Periodos
    fillPeriodo('tbl-periodo');
    fillPeriodo('av-periodo');

    // Jurisdiccion options (before TomSelect init)
    fillJurisOptions('tbl-jurisdiccion');
    fillJurisOptions('av-jurisdiccion');

    // Destroy existing TomSelect instances
    Object.values(tsInstances).forEach(ts => { try { ts.destroy(); } catch(e) {} });

    // Create multi-selects
    // Heatmap fuente
    createMultiSelect('hm-fuente', FUENTE_VALUES, 'Todas las Fuentes', updateHeatmap);

    // Table
    createMultiSelect('tbl-fuente', FUENTE_VALUES, 'Todas las Fuentes', updateTable);
    createMultiSelect('tbl-jurisdiccion', jurisdicciones, 'Todas las Jurisdicciones', updateTable);

    // Avance
    createMultiSelect('av-fuente', FUENTE_VALUES, 'Todas las Fuentes', updateRatioChart);
    createMultiSelect('av-jurisdiccion', jurisdicciones, 'Todas las Jurisdicciones', updateRatioChart);

    // Waterfall (simple selects, just populate options)
    const wfJuris = document.getElementById('wf-jurisdiccion');
    if (wfJuris) {
        wfJuris.innerHTML = '<option value="TODAS">Todas</option>';
        jurisdicciones.forEach(j => {
            const o = document.createElement('option');
            o.value = j; o.textContent = j;
            wfJuris.appendChild(o);
        });
    }
    const wfPartida = document.getElementById('wf-partida');
    if (wfPartida) {
        wfPartida.innerHTML = '<option value="TODAS">Todas</option>';
        ORDEN_PARTIDAS.forEach(p => {
            const o = document.createElement('option');
            o.value = p; o.textContent = `${CODIGOS_PARTIDA[p]} - ${p}`;
            wfPartida.appendChild(o);
        });
    }
}

// ========================
// EVENT LISTENERS
// ========================
function setupEventListeners() {
    // Heatmap estado (simple select)
    const hmEstado = document.getElementById('hm-estado');
    if (hmEstado) hmEstado.addEventListener('change', updateHeatmap);

    // Table periodo
    const tblP = document.getElementById('tbl-periodo');
    if (tblP) tblP.addEventListener('change', updateTable);

    // Avance periodo
    const avP = document.getElementById('av-periodo');
    if (avP) avP.addEventListener('change', updateRatioChart);

    // Waterfall (all simple selects)
    ['wf-estado', 'wf-jurisdiccion', 'wf-partida', 'wf-fuente'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateWaterfallChart);
    });
}

function updateAll() {
    updateHeatmap();
    updateTable();
    updateRatioChart();
    updateWaterfallChart();
}

// ========================
// 1. MAPA DE CALOR
// ========================
function updateHeatmap() {
    const container = document.getElementById('heatmap-grid');
    if (!container) return;

    const estado = getSimpleVal('hm-estado') || 'Comprometido';
    const fuenteSet = getMultiValues('hm-fuente');

    const periodos = [...new Set(rawData.map(d => d.periodo))].sort();
    const ultimoPeriodo = periodos[periodos.length - 1];
    const jurisVistasEnBD = new Set(rawData.map(d => (d.jurisdiccion || '').trim()));
    const jurisdicciones = ORDEN_JURISDICCIONES.filter(j => jurisVistasEnBD.has(j));

    const estadoAcum = {};
    const vigente = {};
    rawData.forEach(d => {
        if (!matchFuenteMulti(d, fuenteSet)) return;
        const j = (d.jurisdiccion || '').trim();
        const key = `${d.partida}|${j}`;
        if (d.estado === estado) estadoAcum[key] = (estadoAcum[key] || 0) + d.monto;
        if (d.estado === 'Credito Vigente' && d.periodo === ultimoPeriodo) vigente[key] = (vigente[key] || 0) + d.monto;
    });

    const visibleJuris = jurisdicciones;

    let html = '<div class="heatmap-scroll-wrapper"><table class="heatmap-table">';
    html += '<thead><tr><th class="heatmap-corner"></th>';
    visibleJuris.forEach(j => {
        const short = SHORT_JURISDICCIONES[j] || j;
        html += `<th class="heatmap-juris-header" data-juris="${j}" title="${j}. Click para ocultar."><span>${short}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    ORDEN_PARTIDAS.forEach(p => {
        const code = CODIGOS_PARTIDA[p];
        html += `<tr><td class="heatmap-partida-label" title="${p}">${code}</td>`;
        visibleJuris.forEach(j => {
            const key = `${p}|${j}`;
            const comp = estadoAcum[key] || 0;
            const vig = vigente[key] || 0;
            const ratio = vig > 0 ? comp / vig : 0;
            const pct = Math.round(ratio * 100);
            const color = heatmapColor(ratio);
            html += `<td class="heatmap-cell" style="background-color:${color};" title="${p}\n${j}\n${estado}/Vigente: ${pct}%">${pct}%</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function heatmapColor(ratio) {
    const r = Math.min(ratio, 1.5);
    if (r <= 0.5) return interpolateColor([16, 185, 129], [251, 191, 36], r / 0.5);
    if (r <= 1.0) return interpolateColor([251, 191, 36], [249, 115, 22], (r - 0.5) / 0.5);
    return interpolateColor([249, 115, 22], [239, 68, 68], Math.min((r - 1.0) / 0.5, 1));
}
function interpolateColor(c1, c2, t) {
    return `rgb(${Math.round(c1[0]+(c2[0]-c1[0])*t)},${Math.round(c1[1]+(c2[1]-c1[1])*t)},${Math.round(c1[2]+(c2[2]-c1[2])*t)})`;
}

// ========================
// 2. TABLA COMPOSICIÓN
// ========================
function updateTable() {
    const periodo = getSimpleVal('tbl-periodo') || '';
    const jurisSet = getMultiValues('tbl-jurisdiccion');
    const fuenteSet = getMultiValues('tbl-fuente');

    const titleEl = document.getElementById('composicion-title');
    if (titleEl && periodo) titleEl.textContent = `Composición del Gasto de ${formatPeriodo(periodo)}`;

    const dataV = rawData.filter(d => d.periodo === periodo && d.estado === 'Credito Vigente' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));
    const dataC = rawData.filter(d => d.periodo === periodo && d.estado === 'Comprometido' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));
    const dataO = rawData.filter(d => d.periodo === periodo && d.estado === 'Ordenado' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));

    const gV = {}, gC = {}, gO = {};
    ORDEN_PARTIDAS.forEach(p => { gV[p] = 0; gC[p] = 0; gO[p] = 0; });
    dataV.forEach(d => { if (gV[d.partida] !== undefined) gV[d.partida] += d.monto; });
    dataC.forEach(d => { if (gC[d.partida] !== undefined) gC[d.partida] += d.monto; });
    dataO.forEach(d => { if (gO[d.partida] !== undefined) gO[d.partida] += d.monto; });

    let tV = 0, tC = 0, tO = 0;
    const rows = ORDEN_PARTIDAS.map(p => {
        tV += gV[p]; tC += gC[p]; tO += gO[p];
        return { partida: p, codigo: CODIGOS_PARTIDA[p], vigente: gV[p], comprometido: gC[p], ordenado: gO[p], peso: gV[p] > 0 ? (gC[p] / gV[p]) * 100 : 0 };
    });

    const tbody = document.querySelector('#gasto-table tbody');
    tbody.innerHTML = '';
    rows.forEach(item => {
        const tr = document.createElement('tr');
        const pip = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${partidaColors[item.partida]||'#fff'};margin-right:8px;"></span>`;
        tr.innerHTML = `<td>${pip}${item.codigo} - ${item.partida}</td>
            <td class="numeric">${formaterARS.format(item.vigente)}</td>
            <td class="numeric">${formaterARS.format(item.comprometido)}</td>
            <td class="numeric">${formaterARS.format(item.ordenado)}</td>
            <td class="numeric">${item.peso.toFixed(2)}%</td>`;
        tbody.appendChild(tr);
    });

    document.getElementById('table-total-vigente').textContent = formaterARS.format(tV);
    document.getElementById('table-total-comp').textContent = formaterARS.format(tC);
    document.getElementById('table-total-ord').textContent = formaterARS.format(tO);
    document.getElementById('table-total-peso').textContent = tV > 0 ? ((tC / tV) * 100).toFixed(2) + '%' : '0.00%';
}

// ========================
// 3. AVANCE DE EJECUCIÓN
// ========================
function updateRatioChart() {
    const periodo = getSimpleVal('av-periodo') || '';
    const jurisSet = getMultiValues('av-jurisdiccion');
    const fuenteSet = getMultiValues('av-fuente');

    const currentYear = periodo.split('-')[0];
    const fC = rawData.filter(d => d.periodo <= periodo && d.periodo.startsWith(currentYear) && d.estado === 'Comprometido' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));
    const fV = rawData.filter(d => d.periodo === periodo && d.estado === 'Credito Vigente' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));
    const fO = rawData.filter(d => d.periodo <= periodo && d.periodo.startsWith(currentYear) && d.estado === 'Ordenado' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));

    const gC = {}, gV = {}, gO = {};
    ORDEN_PARTIDAS.forEach(p => { gC[p] = 0; gV[p] = 0; gO[p] = 0; });
    fC.forEach(d => { if (gC[d.partida] !== undefined) gC[d.partida] += d.monto; });
    fV.forEach(d => { if (gV[d.partida] !== undefined) gV[d.partida] += d.monto; });
    fO.forEach(d => { if (gO[d.partida] !== undefined) gO[d.partida] += d.monto; });

    const active = ORDEN_PARTIDAS.filter(p => gV[p] > 0 || gC[p] > 0 || gO[p] > 0);
    const rC = active.map(p => gV[p] > 0 ? (gC[p] / gV[p]) * 100 : 0);
    const rO = active.map(p => gV[p] > 0 ? (gO[p] / gV[p]) * 100 : 0);
    const labels = active.map(p => `${CODIGOS_PARTIDA[p]} - ${p}`);

    const parts = periodo.split('-');
    const targetRatio = parts.length === 2 ? (parseInt(parts[1], 10) / 12) * 100 : 0;

    const ctx = document.getElementById('ratioChart');
    if (!ctx) return;
    if (ratioChartInstance) ratioChartInstance.destroy();

    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.font.family = "'Inter', sans-serif";
    const origLabels = labels.map(l => l.split(' - ')[1] || l);

    ratioChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { type: 'line', label: 'Ejecución Teórica (%)', data: labels.map(() => targetRatio), borderColor: '#ef4444', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false, order: 1 },
                { type: 'bar', label: '% Comprometido', data: rC, backgroundColor: origLabels.map(p => (partidaColors[p] || '#3b82f6') + 'b3'), borderRadius: 4, order: 2 },
                { type: 'bar', label: '% Ordenado', data: rO, backgroundColor: origLabels.map(p => partidaColors[p] || '#3b82f6'), borderRadius: 4, order: 3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(2)}%` } },
                legend: { position: 'top', labels: { color: '#64748b', usePointStyle: true, boxWidth: 8, padding: 10, font: { size: 10 } } }
            },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 10, weight: 600 }, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
                y: { min: 0, suggestedMax: 100, ticks: { callback: v => v + '%', color: '#9CA3AF' }, grid: { color: 'rgba(0,0,0,0.05)' } }
            }
        }
    });
}

// ========================
// 4. CASCADA
// ========================
function updateWaterfallChart() {
    const ctx = document.getElementById('waterfallChart');
    if (!ctx) return;

    const estado = getSimpleVal('wf-estado') || 'Comprometido';
    const jurisFilter = getSimpleVal('wf-jurisdiccion') || 'TODAS';
    const partidaFilter = getSimpleVal('wf-partida') || 'TODAS';
    const fuente = getSimpleVal('wf-fuente') || 'TODAS';

    const mj = (d) => jurisFilter === 'TODAS' || (d.jurisdiccion || '').trim() === jurisFilter;
    const mp = (d) => partidaFilter === 'TODAS' || d.partida === partidaFilter;

    const periodos = [...new Set(rawData.map(d => d.periodo))].sort();
    if (periodos.length === 0) return;
    const year = periodos[periodos.length - 1].split('-')[0];
    const lastPeriod = periodos[periodos.length - 1];

    const vigData = rawData.filter(d => d.periodo === lastPeriod && d.estado === 'Credito Vigente' && mj(d) && mp(d) && matchFuenteSingle(d, fuente));
    const creditoVigente = vigData.reduce((s, d) => s + d.monto, 0);

    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const periodoKeys = [];
    for (let m = 1; m <= 12; m++) periodoKeys.push(`${year}-${String(m).padStart(2, '0')}`);

    const monthlyData = periodoKeys.map(pk => {
        const rows = rawData.filter(d => d.periodo === pk && d.estado === estado && mj(d) && mp(d) && matchFuenteSingle(d, fuente));
        return rows.reduce((s, d) => s + d.monto, 0);
    });

    const floatingBars = monthlyData.map((monto, idx) => {
        const base = idx / 12;
        const height = creditoVigente > 0 ? monto / creditoVigente : 0;
        return [base, base + height];
    });

    const hasData = periodoKeys.map(pk => rawData.some(d => d.periodo === pk && d.estado === estado && mj(d) && mp(d) && matchFuenteSingle(d, fuente)));
    const barData = floatingBars.map((bar, idx) => hasData[idx] ? bar : null);

    const lineDatasets = [];
    for (let i = 1; i <= 12; i++) {
        lineDatasets.push({
            type: 'line', label: i === 12 ? 'Techos mensuales (1/12)' : '',
            data: mesesNombres.map(() => i / 12),
            borderColor: 'rgba(100,116,139,0.3)', borderWidth: 1,
            borderDash: [3, 3], pointRadius: 0, fill: false, order: 1
        });
    }

    const barColors = floatingBars.map((bar, idx) => {
        if (!hasData[idx]) return 'rgba(0,0,0,0)';
        return bar[1] > ((idx + 1) / 12) * 1.05 ? '#f97316' : '#10b981';
    });

    if (waterfallChartInstance) waterfallChartInstance.destroy();

    waterfallChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: mesesNombres,
            datasets: [
                { type: 'bar', label: `% ${estado} Acumulado`, data: barData, backgroundColor: barColors, borderRadius: 4, order: 2, barPercentage: 0.7 },
                ...lineDatasets
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            if (context.datasetIndex > 0) return null;
                            const raw = context.raw;
                            if (!raw) return 'Sin datos';
                            const idx = context.dataIndex;
                            const monto = monthlyData[idx];
                            const height = raw[1] - raw[0];
                            return [
                                `${estado} del mes: ${formaterARS.format(monto)}`,
                                `Ejecutado: ${(height * 100).toFixed(2)}% del Crédito Vigente`
                            ];
                        }
                    }
                },
                legend: { labels: { color: '#64748b', usePointStyle: true, boxWidth: 8, padding: 10, font: { size: 10 }, filter: item => item.text !== '' } }
            },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 11, weight: 600 } }, grid: { display: false } },
                y: {
                    min: 0, max: 1,
                    ticks: {
                        callback: v => { const n = Math.round(v * 12); return n === 0 ? '0' : `${n}/12`; },
                        stepSize: 1 / 12, color: '#9CA3AF', font: { size: 11 }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}
