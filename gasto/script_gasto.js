// gasto/script_gasto.js
let rawData = [];
let ratioChartInstance = null;
let waterfallChartInstance = null;

// Partidas 700, 800, 900 eliminadas del heatmap y gráficos
const ORDEN_PARTIDAS = [
    "GASTOS EN PERSONAL", "BIENES DE CONSUMO", "SERVICIOS NO PERSONALES",
    "BIENES DE USO", "TRANSFERENCIAS", "ACTIVOS FINANCIEROS"
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
// Sin prefijo 'Min.' — nombres resumidos limpios
const SHORT_JURISDICCIONES = {
    "MINISTERIO DE SEGURIDAD": "SEGURIDAD",
    "MINISTERIO DE HACIENDA Y FINANZAS": "HACIENDA Y FINANZAS",
    "MINISTERIO DE EDUCACIÓN": "EDUCACIÓN",
    "MINISTERIO DE SALUD PÚBLICA": "SALUD PÚBLICA",
    "MINISTERIO DE PRODUCCIÓN": "PRODUCCIÓN",
    "MINISTERIO DE OBRAS Y SERVICIOS PÚBLICOS": "OBRAS PÚBLICAS",
    "MINISTERIO SECRETARIA GENERAL": "SEC. GRAL",
    "TRIBUNAL DE CUENTAS": "TRIBUNAL CTAS",
    "PODER JUDICIAL": "PODER JUDICIAL",
    "PODER LEGISLATIVO": "PODER LEG.",
    "FISCALIA DE ESTADO": "FISCALÍA",
    "MINISTERIO DE CIENCIA Y TECNOLOGIA": "CIENCIA Y TEC",
    "MINISTERIO DE COORDINACIÓN Y PLANIFICACIÓN": "COORDINACIÓN",
    "MINISTERIO DE DESARROLLO SOCIAL": "DESARROLLO SOC.",
    "MINISTERIO DE JUSTICIA Y DERECHOS HUMANOS": "JUSTICIA",
    "SECRETARIA DE ENERGIA": "SEC. ENERGIA",
    "MINISTERIO DE INDUSTRIA TRABAJO Y COMERCIO": "INDUSTRIA Y COMERCIO",
    "MINISTERIO DE TURISMO": "TURISMO",
    "INSTITUTO DE LOTERIA Y CASINOS": "LOTERIA Y CASINOS",
    "INSTITUTO DE CARDIOLOGIA DE CORRIENTES": "INST. CARDIOLOGÍA",
    "INSTITUTO PROVINCIAL DEL TABACO": "INST. TABACO",
    "INSTITUTO CORRENTINO DEL AGUA Y DEL AMBIENTE": "ICAA",
    "INSTITUTO DE CULTURA DE CORRIENTES": "INST. CULTURA",
    "INSTITUTO DE VIVIENDA DE CORRIENTES": "VIVIENDA (INVICO)",
    "DIRECCIÓN PROVINCIAL DEL VIALIDAD": "VIALIDAD PROV.",
    "ADMINISTRACIÓN DE OBRAS SANITARIAS DE CORRIENTES": "OBRAS SANITARIAS",
    "INSTITUTO DE DESARROLLO RURAL DE CORRIENTES": "DESARROLLO RURAL",
    "CENTRO DE ONCOLOGIA 'ANNA ROCCA DE BONATTI'": "CENTRO ONCOLOGÍA",
    "ENTE PROVINCIAL REGULADOR ELECTRICO": "EPRE",
    "AGENCIA CORRENTINA DE BIENES DEL ESTADO": "BIENES DEL ESTADO",
    "INSTITUTO DE PREVISION SOCIAL": "PREVISIÓN SOCIAL (IPS)",
    "INSTITUTO DE OBRA SOCIAL DE CORRIENTES": "OBRA SOCIAL (IOSCOR)",
    "DIRECCIÓN PROVINCIAL DE ENERGIA DE CORRIENTES": "ENERGÍA (DPEC)"
};
const partidaColors = {
    'GASTOS EN PERSONAL': '#719C29', 'BIENES DE CONSUMO': '#356F23',
    'SERVICIOS NO PERSONALES': '#008275', 'BIENES DE USO': '#58A89A',
    'TRANSFERENCIAS': '#90B4E1', 'ACTIVOS FINANCIEROS': '#769FD3',
    'SERVICIO DE LA DEUDA': '#1F5D9B', 'OTROS GASTOS': '#6B5CB7',
    'GASTOS FIGURATIVOS': '#8E7CC3'
};
const FUENTE_VALUES = ['10', '11', '12', '13', '14'];

// Formato en Miles de Millones: $xxx M (igual que en monitor-mensual)
const numFmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
function format1M(val) {
    return '$' + numFmt.format(Math.round(val / 1_000_000)) + ' M';
}

const tsInstances = {};

document.addEventListener('DOMContentLoaded', () => initDashboard());

async function initDashboard() {
    try {
        const response = await fetch('./gasto_data.json');
        if (!response.ok) throw new Error('Error loading gasto data');
        rawData = await response.json();

        // --- FIX Bug sesión: mostrar usuario y conectar botón salir ---
        const currentUser = Auth.getCurrentUser();
        if (currentUser) {
            const userNameEl = document.getElementById('userName');
            if (userNameEl) userNameEl.textContent = currentUser.name;
        }
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('¿Está seguro que desea cerrar sesión?')) {
                    Auth.logout();
                }
            });
        }

        populateAllFilters();
        setupEventListeners();
        updateAll();
    } catch (error) {
        console.error("Dashboard init error:", error);
        const tb = document.querySelector('#gasto-table tbody');
        if (tb) tb.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Error cargando datos.</td></tr>`;
    }
}

// ========================
// MULTI-SELECT HELPER
// Creates a TomSelect multi-select with:
//   - "TODAS" option that selects/deselects all
//   - Summary text instead of individual tags
//   - Checkbox plugin
//   - Optional defaultVals to set initial selection
// ========================
function createMultiSelect(selId, allIndividualValues, allLabel, onChangeCb, defaultVals = null) {
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

    // Initial state
    if (defaultVals) {
        ts.setValue(defaultVals, true);
        ts._prevHadTodas = defaultVals.includes('TODAS');
    } else {
        // select all + TODAS
        ts.setValue(['TODAS', ...allIndividualValues], true);
        ts._prevHadTodas = true;
    }
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

    // Fill simple periodo selects (for Composición)
    function fillPeriodoOptions(selId) {
        const sel = document.getElementById(selId);
        if (!sel) return;
        sel.innerHTML = '';
        periodos.forEach(p => {
            const o = document.createElement('option');
            o.value = p; o.textContent = formatPeriodo(p);
            sel.appendChild(o);
        });
    }

    function fillJurisOptions(selId) {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const todasOpt = sel.querySelector('option[value="TODAS"]');
        sel.innerHTML = '';
        if (todasOpt) sel.appendChild(todasOpt);
        jurisdicciones.forEach(j => {
            const o = document.createElement('option');
            o.value = j; o.textContent = j;
            sel.appendChild(o);
        });
    }

    // Periodo options for multi-selects (Composición y Avance)
    fillPeriodoOptions('tbl-periodo');
    fillPeriodoOptions('av-periodo');

    // Jurisdiccion options (before TomSelect init)
    fillJurisOptions('tbl-jurisdiccion');
    fillJurisOptions('av-jurisdiccion');

    // Destroy existing TomSelect instances
    Object.values(tsInstances).forEach(ts => { try { ts.destroy(); } catch(e) {} });

    // Create multi-selects
    // Heatmap fuente — default solo fuente 10
    createMultiSelect('hm-fuente', FUENTE_VALUES, 'Todas las Fuentes', updateHeatmap, ['10']);

    // Table — periodos multi-select (default: último periodo)
    createMultiSelect('tbl-periodo', periodos, 'Todos los Periodos', updateTable, [lastPeriodo]);
    // Table fuente — default solo fuente 10
    createMultiSelect('tbl-fuente', FUENTE_VALUES, 'Todas las Fuentes', updateTable, ['10']);
    createMultiSelect('tbl-jurisdiccion', jurisdicciones, 'Todas las Jurisdicciones', updateTable);

    // Avance — periodos multi-select (default: TODOS = acumulado total)
    createMultiSelect('av-periodo', periodos, 'Todos los Periodos', updateRatioChart);
    // Avance fuente — default solo fuente 10
    createMultiSelect('av-fuente', FUENTE_VALUES, 'Todas las Fuentes', updateRatioChart, ['10']);
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
    // Heatmap estado & juris group
    const hmEstado = document.getElementById('hm-estado');
    if (hmEstado) hmEstado.addEventListener('change', updateHeatmap);
    const hmJurisGroup = document.getElementById('hm-juris-group');
    if (hmJurisGroup) hmJurisGroup.addEventListener('change', updateHeatmap);

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
    const jurisGroup = getSimpleVal('hm-juris-group') || 'MINISTERIOS';
    const fuenteSet = getMultiValues('hm-fuente');

    const periodos = [...new Set(rawData.map(d => d.periodo))].sort();
    const ultimoPeriodo = periodos[periodos.length - 1];
    
    // Update Title
    const hmTitle = document.getElementById('heatmap-title');
    if (hmTitle && ultimoPeriodo) {
        hmTitle.textContent = `Mapa de Calor de Compromiso por Jurisdicción Acumulado hasta ${formatPeriodo(ultimoPeriodo)}`;
    }

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

    let visibleJuris = jurisdicciones.filter(j => {
        if (jurisGroup === 'TODAS') return true;
        const isMin = j.includes('MINISTERIO');
        if (jurisGroup === 'MINISTERIOS') return isMin;
        if (jurisGroup === 'RESTO') return !isMin;
        return true;
    });

    // Ordenar entes de izquierda a derecha de mayor a menor crédito vigente
    visibleJuris.sort((a, b) => {
        let vigA = 0, vigB = 0;
        ORDEN_PARTIDAS.forEach(p => {
            vigA += (vigente[`${p}|${a}`] || 0);
            vigB += (vigente[`${p}|${b}`] || 0);
        });
        return vigB - vigA;
    });

    let html = '<div class="heatmap-scroll-wrapper"><table class="heatmap-table">';
    html += '<thead><tr><th class="heatmap-corner"></th>';
    visibleJuris.forEach(j => {
        const short = SHORT_JURISDICCIONES[j] || j;
        html += `<th class="heatmap-juris-header" data-juris="${j}" title="${j}. Click para ocultar."><span>${short}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    // Filas: "GASTO EN PERSONAL - 100" (nombre primero - código)
    ORDEN_PARTIDAS.forEach(p => {
        const code = CODIGOS_PARTIDA[p];
        html += `<tr><td class="heatmap-partida-label" title="${p}">${p} - ${code}</td>`;
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
// (Multiselect de periodos: acumula Comp y Ord, Vigente del último seleccionado)
// ========================
function updateTable() {
    // Leer periodos seleccionados del multi-select
    const periodoSet = getMultiValues('tbl-periodo');
    const allPeriodos = [...new Set(rawData.map(d => d.periodo))].sort();
    let selectedPeriodos = allPeriodos; // si es null (TODAS), usar todos
    if (periodoSet) {
        selectedPeriodos = allPeriodos.filter(p => periodoSet.has(p));
    }
    const maxPeriodo = selectedPeriodos.length > 0 ? selectedPeriodos[selectedPeriodos.length - 1] : '';

    const jurisSet = getMultiValues('tbl-jurisdiccion');
    const fuenteSet = getMultiValues('tbl-fuente');

    // Titulo dinámico
    const titleEl = document.getElementById('composicion-title');
    if (titleEl && selectedPeriodos.length > 0) {
        if (selectedPeriodos.length === 1) {
            titleEl.textContent = `Composición del Gasto de ${formatPeriodo(selectedPeriodos[0])}`;
        } else {
            titleEl.textContent = `Composición del Gasto (Acumulado hasta ${formatPeriodo(maxPeriodo)})`;
        }
    }

    // Vigente: solo del último periodo seleccionado
    // Comp y Ord: sumar todos los periodos seleccionados
    const matchPeriodo = (d) => !periodoSet || periodoSet.has(d.periodo);
    const dataV = rawData.filter(d => d.periodo === maxPeriodo && d.estado === 'Credito Vigente' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));
    const dataC = rawData.filter(d => matchPeriodo(d) && d.estado === 'Comprometido' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));
    const dataO = rawData.filter(d => matchPeriodo(d) && d.estado === 'Ordenado' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));

    const gV = {}, gC = {}, gO = {};
    ORDEN_PARTIDAS.forEach(p => { gV[p] = 0; gC[p] = 0; gO[p] = 0; });
    dataV.forEach(d => { if (gV[d.partida] !== undefined) gV[d.partida] += d.monto; });
    dataC.forEach(d => { if (gC[d.partida] !== undefined) gC[d.partida] += d.monto; });
    dataO.forEach(d => { if (gO[d.partida] !== undefined) gO[d.partida] += d.monto; });

    let tV = 0, tC = 0, tO = 0;
    const rows = ORDEN_PARTIDAS.map(p => {
        tV += gV[p]; tC += gC[p]; tO += gO[p];
        return {
            partida: p, codigo: CODIGOS_PARTIDA[p],
            vigente: gV[p], comprometido: gC[p], ordenado: gO[p],
            pesoComp: gV[p] > 0 ? (gC[p] / gV[p]) * 100 : 0,
            pesoOrd: gV[p] > 0 ? (gO[p] / gV[p]) * 100 : 0
        };
    });

    const tbody = document.querySelector('#gasto-table tbody');
    tbody.innerHTML = '';
    rows.forEach(item => {
        const tr = document.createElement('tr');
        const pip = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${partidaColors[item.partida]||'#fff'};margin-right:8px;"></span>`;
        tr.innerHTML = `<td>${pip}${item.codigo} - ${item.partida}</td>
            <td class="numeric">${format1M(item.vigente)}</td>
            <td class="numeric">${format1M(item.comprometido)}</td>
            <td class="numeric">${format1M(item.ordenado)}</td>
            <td class="numeric">${item.pesoComp.toFixed(2)}%</td>
            <td class="numeric">${item.pesoOrd.toFixed(2)}%</td>`;
        tbody.appendChild(tr);
    });

    document.getElementById('table-total-vigente').textContent = format1M(tV);
    document.getElementById('table-total-comp').textContent = format1M(tC);
    document.getElementById('table-total-ord').textContent = format1M(tO);
    document.getElementById('table-total-peso').textContent = tV > 0 ? ((tC / tV) * 100).toFixed(2) + '%' : '0.00%';
    document.getElementById('table-total-peso-ord').textContent = tV > 0 ? ((tO / tV) * 100).toFixed(2) + '%' : '0.00%';
}

// ========================
// 3. AVANCE DE EJECUCIÓN
// (Multiselect de periodos: default = TODOS = acumulado total;
//  línea teórica = numSeleccionados/12)
// ========================
function updateRatioChart() {
    // Leer periodos seleccionados
    const periodoSet = getMultiValues('av-periodo');
    const allPeriodos = [...new Set(rawData.map(d => d.periodo))].sort();
    let selectedPeriodos = allPeriodos;
    if (periodoSet) {
        selectedPeriodos = allPeriodos.filter(p => periodoSet.has(p));
    }
    const maxPeriodo = selectedPeriodos.length > 0 ? selectedPeriodos[selectedPeriodos.length - 1] : '';
    const numMeses = selectedPeriodos.length;

    const jurisSet = getMultiValues('av-jurisdiccion');
    const fuenteSet = getMultiValues('av-fuente');

    // Subtítulo dinámico aclarando acumulacion
    const section = document.querySelector('#ratioChart')?.closest('.chart-container');
    const subtitle = section?.querySelector('.section-subtitle');
    if (subtitle) {
        if (numMeses === 1) {
            subtitle.textContent = `Comprometido y Ordenado respecto al Crédito Vigente — ${formatPeriodo(selectedPeriodos[0])}`;
        } else {
            subtitle.textContent = `Comprometido y Ordenado respecto al Crédito Vigente (Acumulado de ${numMeses} meses)`;
        }
    }

    // Filtros
    const matchP = (d) => !periodoSet || periodoSet.has(d.periodo);
    const fC = rawData.filter(d => matchP(d) && d.estado === 'Comprometido' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));
    const fV = rawData.filter(d => d.periodo === maxPeriodo && d.estado === 'Credito Vigente' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));
    const fO = rawData.filter(d => matchP(d) && d.estado === 'Ordenado' && matchJurisMulti(d, jurisSet) && matchFuenteMulti(d, fuenteSet));

    const gC = {}, gV = {}, gO = {};
    ORDEN_PARTIDAS.forEach(p => { gC[p] = 0; gV[p] = 0; gO[p] = 0; });
    fC.forEach(d => { if (gC[d.partida] !== undefined) gC[d.partida] += d.monto; });
    fV.forEach(d => { if (gV[d.partida] !== undefined) gV[d.partida] += d.monto; });
    fO.forEach(d => { if (gO[d.partida] !== undefined) gO[d.partida] += d.monto; });

    const active = ORDEN_PARTIDAS.filter(p => gV[p] > 0 || gC[p] > 0 || gO[p] > 0);
    const rC = active.map(p => gV[p] > 0 ? (gC[p] / gV[p]) * 100 : 0);
    const rO = active.map(p => gV[p] > 0 ? (gO[p] / gV[p]) * 100 : 0);
    const labels = active.map(p => `${CODIGOS_PARTIDA[p]} - ${p}`);

    // Línea teórica: numMeses / 12
    const targetRatio = (numMeses / 12) * 100;

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
                { type: 'line', label: `Ejecución Teórica (${numMeses}/12)`, data: labels.map(() => targetRatio), borderColor: '#ef4444', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false, order: 1 },
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

    const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });

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
                                `${estado} del mes: ${fmtARS.format(monto)}`,
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
