// gasto/script_gasto.js
let rawData = [];
let chartInstance = null;
let ratioChartInstance = null;

// Colores consistentes para cada Partida
const partidaColors = {
    'GASTOS EN PERSONAL': '#719C29',
    'BIENES DE CONSUMO': '#356F23',
    'SERVICIOS NO PERSONALES': '#008275',
    'BIENES DE USO': '#58A89A',
    'TRANSFERENCIAS': '#90B4E1',
    'ACTIVOS FINANCIEROS': '#769FD3',
    'SERVICIO DE LA DEUDA': '#1F5D9B',
    'OTROS GASTOS': '#6B5CB7',
    'GASTOS FIGURATIVOS': '#8E7CC3'
};

const ORDEN_JURISDICCIONES = [
    "MINISTERIO DE SEGURIDAD",
    "MINISTERIO DE HACIENDA Y FINANZAS",
    "MINISTERIO DE EDUCACIÓN",
    "MINISTERIO DE SALUD PÚBLICA",
    "MINISTERIO DE PRODUCCIÓN",
    "MINISTERIO DE OBRAS Y SERVICIOS PÚBLICOS",
    "MINISTERIO SECRETARIA GENERAL",
    "TRIBUNAL DE CUENTAS",
    "PODER JUDICIAL",
    "PODER LEGISLATIVO",
    "FISCALIA DE ESTADO",
    "MINISTERIO DE CIENCIA Y TECNOLOGIA",
    "MINISTERIO DE COORDINACIÓN Y PLANIFICACIÓN",
    "MINISTERIO DE DESARROLLO SOCIAL",
    "POLICIA",
    "MINISTERIO DE JUSTICIA Y DERECHOS HUMANOS",
    "SECRETARIA DE ENERGIA",
    "MINISTERIO DE INDUSTRIA TRABAJO Y COMERCIO",
    "MINISTERIO DE TURISMO",
    "INSTITUTO DE LOTERIA Y CASINOS",
    "CONSEJO DE EDUCACIÓN",
    "INSTITUTO DE CARDIOLOGIA DE CORRIENTES",
    "INSTITUTO PROVINCIAL DEL TABACO",
    "INSTITUTO CORRENTINO DEL AGUA Y DEL AMBIENTE",
    "INSTITUTO DE CULTURA DE CORRIENTES",
    "INSTITUTO DE VIVIENDA DE CORRIENTES",
    "DIRECCION PROVINCIAL DEL VIALIDAD ",
    "ADMINISTRACIÓN DE OBRAS SANITARIAS DE CORRIENTES",
    "INSTITUTO DE DESARROLLO RURAL DE CORRIENTES",
    "CENTRO DE ONCOLOGIA 'ANNA ROCCA DE BONATTI'",
    "ENTE PROVINCIAL REGULADOR ELECTRICO",
    "AGENCIA CORRENTINA DE BIENES DEL ESTADO",
    "INSTITUTO DE PREVISION SOCIAL",
    "INSTITUTO DE OBRA SOCIAL DE CORRIENTES",
    "DIRECCIÓN PROVINCIAL DE ENERGIA DE CORRIENTES"
];

// Utilidad Formato Moneda
const formaterARS = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

async function initDashboard() {
    try {
        const response = await fetch('./gasto_data.json');
        if (!response.ok) throw new Error('Error loading gasto data');
        rawData = await response.json();

        populateFilters();
        setupEventListeners();
        updateView();
    } catch (error) {
        console.error("Dashboard initialization error:", error);
        document.querySelector('#gasto-table tbody').innerHTML = `<tr><td colspan="3" class="text-center" style="color:red;">Error cargando datos.</td></tr>`;
    }
}

function populateFilters() {
    // Selectores
    const periodoSelect = document.getElementById('periodo-selector');
    const jurisSelect = document.getElementById('jurisdiccion-selector');

    // Extraer valores únicos
    const periodos = [...new Set(rawData.map(d => d.periodo))].sort();
    const jurisdicciones = [...new Set(rawData.map(d => d.jurisdiccion))].sort();

    // Rellenar Períodos
    periodoSelect.innerHTML = '';
    periodos.forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = formatPeriodo(p);
        periodoSelect.appendChild(option);
    });
    // Setificar al último disponible (ej: Febrero 2026)
    if (periodos.length > 0) {
        periodoSelect.value = periodos[periodos.length - 1];
    }

    // Rellenar Jurisdicciones en el orden específico
    jurisSelect.innerHTML = '<option value="TODAS">Todas las Jurisdicciones</option>';
    ORDEN_JURISDICCIONES.forEach(j => {
        const option = document.createElement('option');
        option.value = j.trim();
        option.textContent = j.trim();
        jurisSelect.appendChild(option);
    });
}

function formatPeriodo(isoStr) {
    const parts = isoStr.split('-');
    if (parts.length !== 2) return isoStr;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1);
    const m = date.toLocaleString('es-ES', { month: 'long' });
    return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + parts[0];
}

function setupEventListeners() {
    document.getElementById('periodo-selector').addEventListener('change', updateView);
    document.getElementById('estado-selector').addEventListener('change', updateView);
    document.getElementById('jurisdiccion-selector').addEventListener('change', () => {
        // Only update the table and ratio chart, not the 100% stacked chart
        updateTable();
        updateRatioChart();
    });
}

function updateView() {
    updateTable();
    updateChart();
    updateRatioChart();
}

function getSelectedFilters() {
    return {
        periodo: document.getElementById('periodo-selector').value,
        estado: document.getElementById('estado-selector').value,
        jurisdiccion: document.getElementById('jurisdiccion-selector').value
    };
}

// ========================
// TABLA COMPOSTIÓN 
// ========================
function updateTable() {
    const filters = getSelectedFilters();

    // Filtrar dataset
    const filtered = rawData.filter(d => {
        const matchPeriodo = d.periodo === filters.periodo;
        const matchEstado = d.estado === filters.estado;
        const matchJuris = filters.jurisdiccion === "TODAS" ? true : d.jurisdiccion === filters.jurisdiccion;
        return matchPeriodo && matchEstado && matchJuris;
    });

    // Agrupar y sumar por partida
    const group = {};
    let granTotal = 0;

    filtered.forEach(d => {
        if (!group[d.partida]) group[d.partida] = 0;
        group[d.partida] += d.monto;
        granTotal += d.monto;
    });

    // Convertir a array y ordenar desc
    const partidasAgrupadas = Object.keys(group).map(k => {
        return {
            partida: k,
            monto: group[k],
            peso: granTotal > 0 ? (group[k] / granTotal) * 100 : 0
        };
    }).sort((a, b) => b.monto - a.monto);

    renderTable(partidasAgrupadas, granTotal);
}

function renderTable(data, granTotal) {
    const tbody = document.querySelector('#gasto-table tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No hay datos para la selección.</td></tr>`;
        document.getElementById('table-total-monto').textContent = '$0.00';
        return;
    }

    data.forEach(item => {
        const tr = document.createElement('tr');

        const tdPartida = document.createElement('td');
        // color pip
        const colorPip = `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${partidaColors[item.partida] || '#fff'}; margin-right:8px;"></span>`;
        tdPartida.innerHTML = colorPip + item.partida;

        const tdMonto = document.createElement('td');
        tdMonto.className = 'numeric';
        tdMonto.textContent = formaterARS.format(item.monto);

        const tdPeso = document.createElement('td');
        tdPeso.className = 'numeric';
        tdPeso.textContent = item.peso.toFixed(2) + '%';

        tr.appendChild(tdPartida);
        tr.appendChild(tdMonto);
        tr.appendChild(tdPeso);

        tbody.appendChild(tr);
    });

    document.getElementById('table-total-monto').textContent = formaterARS.format(granTotal);
}


// ========================
// GRÁFICO 100% APILADO
// ========================
function updateChart() {
    const filters = getSelectedFilters();

    // The chart explicitly ignores the Jurisdiccion filter to show the 35 bars.
    const filtered = rawData.filter(d => {
        return d.periodo === filters.periodo && d.estado === filters.estado;
    });

    // Utilizar el arreglo ordenado en lugar de deducirlo de los datos filtrados
    const labels = ORDEN_JURISDICCIONES.map(j => j.trim());

    // Todas las partidas
    const allPartidas = Object.keys(partidaColors);

    // Calcular montos absolutos por (jurisdiccion, partida) y totales por jurisdiccion
    const dataMap = {};
    const totalByJuris = {};

    labels.forEach(j => {
        dataMap[j] = {};
        allPartidas.forEach(p => dataMap[j][p] = 0);
        totalByJuris[j] = 0;
    });

    filtered.forEach(d => {
        const jurisTrimmed = d.jurisdiccion.trim();
        if (dataMap[jurisTrimmed] !== undefined) {
            dataMap[jurisTrimmed][d.partida] += d.monto;
            totalByJuris[jurisTrimmed] += d.monto;
        }
    });

    // Armar Datasets en porcentaje
    const datasets = allPartidas.map(partida => {
        return {
            label: partida,
            data: labels.map(j => {
                const monto = dataMap[j][partida];
                const total = totalByJuris[j];
                return total > 0 ? (monto / total) * 100 : 0;
            }),
            backgroundColor: partidaColors[partida] || '#9CA3AF',
            borderWidth: 0 // Cleaner look without borders on thin slices
        };
    });

    renderChart(labels, datasets);
}

function renderChart(labels, datasets) {
    const ctx = document.getElementById('gastoChart');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
    }

    // Usar nombres cortos para las etiquetas del eje si es muy largo
    const shortLabels = labels.map(l => {
        if (l.length > 25) {
            return l.substring(0, 22) + '...';
        }
        return l;
    });

    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.font.family = "'Inter', sans-serif";

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: shortLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    theme: 'dark',
                    callbacks: {
                        label: function (context) {
                            const label = context.dataset.label || '';
                            const val = context.parsed.y; // Change X to Y for vertical
                            return ` ${label}: ${val.toFixed(2)}%`;
                        },
                        title: function (context) {
                            // Show full name on tooltip
                            const idx = context[0].dataIndex;
                            return labels[idx];
                        }
                    }
                },
                legend: {
                    position: 'top',
                    align: 'center',
                    labels: {
                        color: '#64748b',
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 10,
                        font: { size: 10 }
                    }
                }
            },
            scales: {
                y: { // Change X to Y for vertical
                    stacked: true,
                    min: 0,
                    max: 100,
                    ticks: {
                        callback: function (value) {
                            return value + '%';
                        },
                        color: '#9CA3AF'
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                x: { // Change Y to X for vertical
                    stacked: true,
                    ticks: {
                        color: '#D1D5DB',
                        font: { size: 10, weight: 600 },
                        maxRotation: 90, // Force rotated labels so they don't overlap as much
                        minRotation: 90
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

// ========================
// GRÁFICO DE AVANCE DE EJECUCIÓN
// ========================
function updateRatioChart() {
    const filters = getSelectedFilters();

    // The ratio chart responds to the jurisdiction filter
    const matchJuris = filters.jurisdiccion === "TODAS" ? () => true : (d) => d.jurisdiccion === filters.jurisdiccion;

    // Filter data for the specific period, and get Comprometido and Crédito Vigente
    const filteredComprometido = rawData.filter(d => d.periodo === filters.periodo && d.estado === 'Comprometido' && matchJuris(d));
    const filteredVigente = rawData.filter(d => d.periodo === filters.periodo && d.estado === 'Crédito Vigente' && matchJuris(d));

    // Aggregate by partida
    const groupComprometido = {};
    const groupVigente = {};
    const allPartidas = Object.keys(partidaColors);

    allPartidas.forEach(p => {
        groupComprometido[p] = 0;
        groupVigente[p] = 0;
    });

    filteredComprometido.forEach(d => { groupComprometido[d.partida] += d.monto; });
    filteredVigente.forEach(d => { groupVigente[d.partida] += d.monto; });

    // Build the % ratio array for each partida
    const ratioData = allPartidas.map(p => {
        const comp = groupComprometido[p];
        const vig = groupVigente[p];
        return vig > 0 ? (comp / vig) * 100 : 0;
    });

    // Calculate theoretical target line based on month
    // "2026-02" -> ['2026', '02'] -> 2
    const parts = filters.periodo.split('-');
    let targetRatio = 0;
    if (parts.length === 2) {
        const month = parseInt(parts[1], 10);
        targetRatio = (month / 12) * 100;
    }

    renderRatioChart(allPartidas, ratioData, targetRatio);
}

function renderRatioChart(labels, ratioData, targetRatio) {
    const ctx = document.getElementById('ratioChart');
    if (!ctx) return;

    if (ratioChartInstance) {
        ratioChartInstance.destroy();
    }

    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // Create a horizontal line array for the target
    const targetLineData = labels.map(() => targetRatio);

    // Dynamic bar colors based on partida
    const backgroundColors = labels.map(p => partidaColors[p] || '#3b82f6');

    ratioChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Ejecución Teórica Esperada (%)',
                    data: targetLineData,
                    borderColor: '#ef4444',     // Red color for the theoretical line
                    borderWidth: 2,
                    borderDash: [5, 5],         // Dashed line
                    pointRadius: 0,             // Hide points
                    fill: false,
                    order: 1                    // Draw on top
                },
                {
                    type: 'bar',
                    label: '% Comprometido sobre Vigente',
                    data: ratioData,
                    backgroundColor: backgroundColors,
                    borderRadius: 4,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    theme: 'dark',
                    callbacks: {
                        label: function (context) {
                            const val = context.parsed.y;
                            return ` ${context.dataset.label}: ${val.toFixed(2)}%`;
                        }
                    }
                },
                legend: {
                    position: 'top',
                    align: 'center',
                    labels: {
                        color: '#64748b',
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 10,
                        font: { size: 10 },
                        // Custom legend filtering: only show the line dataset in the legend 
                        // or hide the bar dataset since colors already represent partidas
                        filter: function (item, chart) {
                            // Only show the theoretical line legend, and hide the generic bar legend 
                            // to avoid confusion, or keep both. Let's keep both.
                            return true;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#D1D5DB',
                        font: { size: 10, weight: 600 },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: { display: false }
                },
                y: {
                    min: 0,
                    // Give a tiny bit of breathing room above 100% just in case of over-execution
                    suggestedMax: 100,
                    ticks: {
                        callback: function (value) {
                            return value + '%';
                        },
                        color: '#9CA3AF'
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    });
}
