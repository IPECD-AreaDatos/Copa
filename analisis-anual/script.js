// Global state to hold fetched data
let dashboardData = null;

// Global Chart.js Legend Click Override - "Solo" Behavior
const customLegendClick = function (e, legendItem, legend) {
    const index = legendItem.datasetIndex;
    const ci = legend.chart;
    const meta = ci.getDatasetMeta(index);

    // Check if the clicked item is the ONLY visible item
    let isOnlyVisible = true;
    for (let i = 0; i < ci.data.datasets.length; i++) {
        if (i !== index) {
            const m = ci.getDatasetMeta(i);
            if (!m.hidden) {
                isOnlyVisible = false;
                break;
            }
        }
    }

    if (isOnlyVisible) {
        // If it was the only one visible, show all datasets
        for (let i = 0; i < ci.data.datasets.length; i++) {
            ci.getDatasetMeta(i).hidden = null;
        }
    } else {
        // Standard "solo" behavior: hide all EXCEPT the clicked one
        for (let i = 0; i < ci.data.datasets.length; i++) {
            ci.getDatasetMeta(i).hidden = (i !== index);
        }
        // Ensure the clicked one is visible
        meta.hidden = null;
    }

    ci.update();
};

if (typeof Chart !== 'undefined') {
    Chart.defaults.plugins.legend.onClick = customLegendClick;

    // Emphasize visible legend items instead of striking/fading hidden ones
    const originalGenerateLabels = Chart.defaults.plugins.legend.labels.generateLabels;
    Chart.defaults.plugins.legend.labels.generateLabels = function (chart) {
        const labels = originalGenerateLabels(chart);

        // Count how many are visible
        const visibleCount = labels.filter(l => !l.hidden).length;
        const totalCount = labels.length;
        const isFiltering = visibleCount < totalCount;

        labels.forEach(label => {
            label.textDecoration = 'none'; // Never strikethrough

            if (label.hidden) {
                // If hidden, just make the color box empty/transparent
                label.fillStyle = 'transparent';
                label.strokeStyle = '#cbd5e1'; // slate-300
                label.fontColor = '#64748b'; // slate-500
            } else {
                // If visible AND we are filtering, emphasize it
                if (isFiltering) {
                    label.fontColor = '#0f172a'; // slate-900 (darker)
                } else {
                    label.fontColor = '#64748b'; // normal
                }
            }
        });
        return labels;
    };
}

document.addEventListener('DOMContentLoaded', () => {
    // Display current user info
    const currentUser = Auth.getCurrentUser();
    if (currentUser) {
        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = currentUser.name;
        }
    }

    // Logout handler
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

    // Mobile Nav Toggle
    const mobileNavToggle = document.getElementById('mobileNavToggle');
    const sidebar = document.getElementById('sidebar');

    if (mobileNavToggle && sidebar) {
        mobileNavToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });

        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== mobileNavToggle) {
                sidebar.classList.remove('open');
            }
        });

        // Close sidebar when a link is clicked
        const navLinks = sidebar.querySelectorAll('.nav-link-vertical');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove('open');
            });
        });
    }

    // Load dashboard data (Fix 1-B & 3-C)
    // Use an absolute-relative path based on the current domain to avoid nested folder 404s
    const basePath = new URL('.', window.location.href).pathname === '/' ? '/' : new URL('..', window.location.href).pathname;

    fetch(basePath + 'main/_data_ipce_v1.json')
        .then(response => response.json())
        .then(data => {
            dashboardData = data.annual_monitor;
            initYearSelector(dashboardData.meta.available_periods);
        })
        .catch(error => console.error('Error loading data:', error));
});

function initYearSelector(periods) {
    const selector = document.getElementById('year-selector');

    // Clear loading option
    selector.innerHTML = '';

    const defaultId = dashboardData.meta.default_period_id;
    const defaultIndex = periods.findIndex(p => p.id === defaultId);

    // Populate options (newest first - already generally ordered from backend)
    periods.forEach(period => {
        // Skip year 2022 as requested
        if (period.id === '2022' || period.year === 2022) return;

        const option = document.createElement('option');
        option.value = period.id;
        option.textContent = period.label;

        if (period.incomplete) {
            option.dataset.incomplete = 'true';
            // Replace YTD with (incompleto)
            option.textContent = period.label.replace(' (YTD)', '') + ' (incompleto)';
        }

        selector.appendChild(option);
    });

    // Select default period
    let chosenId = defaultId;
    if (!chosenId && periods.length > 0) {
        chosenId = periods[0].id;
    }

    selector.value = chosenId;

    // Render initial data
    renderDashboard(chosenId);

    // Handle changes
    selector.addEventListener('change', (e) => {
        const selectedOption = e.target.selectedOptions[0];
        if (selectedOption && selectedOption.dataset.incomplete === 'true') {
            alert("Atención: El año seleccionado aún cuenta con datos incompletos. Las comparativas se realizan contra los mismos meses del año anterior.");
        }
        renderDashboard(e.target.value);
    });

    // Check if initial is incomplete to trigger alert if necessary
    const initialOption = selector.selectedOptions[0];
}

function renderDashboard(periodId) {
    if (!dashboardData || !dashboardData.data[periodId]) return;

    const periodData = dashboardData.data[periodId];
    const iterYear = parseInt(periodId);
    const prevYear = iterYear - 1;

    // Update KPI Grid
    renderKPIs(periodData.kpi);

    // Dynamic Labels
    const periodLabel = periodData.kpi.meta.periodo.replace(' (YTD)', ' (incompleto)'); // e.g. "Año 2026 (incompleto)"

    // Update Recaudación Labels
    const lblRecCurrent = document.getElementById('label-recaudacion-current');
    if (lblRecCurrent) lblRecCurrent.textContent = `Copa. Disponible ${periodLabel}`;

    const lblRecPrev = document.getElementById('label-recaudacion-prev');
    if (lblRecPrev) lblRecPrev.textContent = `Copa. Disponible Año ${prevYear}`;

    // Update Distribucion Municipal Labels
    const lblMuniCurrent = document.getElementById('label-muni-current');
    if (lblMuniCurrent) lblMuniCurrent.textContent = `Distrib. Municipal ${periodLabel}`;

    const lblMuniPrev = document.getElementById('label-muni-prev');
    if (lblMuniPrev) lblMuniPrev.textContent = `Distrib. Municipal Año ${prevYear}`;

    // Update Masa Salarial Labels
    const lblMasaCurrent = document.getElementById('label-masa-current');
    if (lblMasaCurrent) lblMasaCurrent.textContent = `Masa Salarial ${periodLabel}`;

    const lblMasaPrev = document.getElementById('label-masa-prev');
    if (lblMasaPrev) lblMasaPrev.textContent = `Masa Salarial Año ${prevYear}`;

    // Update Chart Title
    const chartTitle = document.getElementById('chart-title');
    if (chartTitle) chartTitle.textContent = `Comportamiento de Coparticipación Disponible Mensual ${iterYear}`;

    // Update Chart
    renderMonthlyChart(periodData.charts.monthly, iterYear, prevYear);
    renderCopaVsSalarioChart(periodData.charts.copa_vs_salario);

    // Call renderBrechaChart and trigger card rendering
    renderBrechaChart(periodData.charts.copa_vs_salario, iterYear, periodData.kpi.meta.max_month, periodData.kpi.meta.is_complete);
}

// ... Format functions ...
function formatCurrency(value) {
    if (value === undefined || value === null) return 'N/A';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value * 1000000);
}
function formatBillions(value) {
    if (value === undefined || value === null || isNaN(value)) return 'N/A';
    // 1 Billon = 1.000.000.000.000 (Long scale)
    const valInBillions = value / 1000000000000;
    return '$' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(valInBillions) + ' Billones';
}

function formatMillions(value) {
    if (value === undefined || value === null || isNaN(value)) return 'N/A';
    const valInMillions = value / 1000000;
    return '$' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(valInMillions) + ' Millones';
}

function formatPercentage(value) {
    if (value === undefined || value === null || isNaN(value)) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    const formattedValue = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
    return `${sign}${formattedValue}%`;
}

function renderKPIs(kpi) {
    const currentNet = kpi.recaudacion.current;
    const prevNet = kpi.recaudacion.prev;
    const diffNomNet = kpi.recaudacion.diff_nom;

    // --- Distribucion Municipal ---
    if (kpi.distribucion_municipal) {
        const muniCurrent = kpi.distribucion_municipal.current;
        const muniPrev = kpi.distribucion_municipal.prev;

        const elMuniCurr = document.getElementById('kpi-muni-current');
        if (elMuniCurr) elMuniCurr.textContent = formatBillions(muniCurrent);

        const elMuniPrev = document.getElementById('kpi-muni-prev');
        if (elMuniPrev) elMuniPrev.textContent = formatBillions(muniPrev);

        const muniVarNomEl = document.getElementById('kpi-muni-var-nom-abs');
        const muniDiffNom = kpi.distribucion_municipal.diff_nom;
        const muniDiffSign = muniDiffNom >= 0 ? '+' : '-';
        if (muniVarNomEl) muniVarNomEl.textContent = muniDiffSign + formatBillions(Math.abs(muniDiffNom));

        const muniVarNomSub = document.getElementById('kpi-muni-var-nom-pct');
        const muniPctSign = kpi.distribucion_municipal.var_nom >= 0 ? '+' : '-';
        if (muniVarNomSub) {
            muniVarNomSub.textContent = muniPctSign + formatPercentage(Math.abs(kpi.distribucion_municipal.var_nom)).replace('+', '').replace('-', '');
            muniVarNomSub.className = `kpi-value ${kpi.distribucion_municipal.var_nom >= 0 ? 'text-success' : 'text-danger'}`;
        }

        const muniVarRealEl = document.getElementById('real-var-muni-val');
        const muniVarRealAbsEl = document.getElementById('real-var-muni-abs');

        const isIpcNeaMissingMuni = kpi.distribucion_municipal.ipc_missing;

        if (isIpcNeaMissingMuni) {
            if (muniVarRealEl) {
                muniVarRealEl.textContent = 'Sin IPC completo';
                muniVarRealEl.className = 'kpi-value text-secondary text-missing';
            }
            if (muniVarRealAbsEl) muniVarRealAbsEl.textContent = '--';
        } else {
            if (muniVarRealEl) {
                muniVarRealEl.textContent = formatPercentage(kpi.distribucion_municipal.var_real);
                muniVarRealEl.className = `kpi-value ${kpi.distribucion_municipal.var_real >= 0 ? 'text-success' : 'text-danger'}`;
            }
            if (muniVarRealAbsEl) {
                const inflacionPct = kpi.recaudacion.ipc_used_for_calc / 100;
                const muniPrevAjustado = muniPrev * (1 + inflacionPct);
                const muniDiffReal = muniCurrent - muniPrevAjustado;
                const muniDiffRealSign = muniDiffReal >= 0 ? '+' : '-';
                muniVarRealAbsEl.textContent = muniDiffRealSign + formatBillions(Math.abs(muniDiffReal));
                muniVarRealAbsEl.className = muniDiffReal >= 0 ? 'text-success' : 'text-danger';
            }
        }
    }

    // --- Recaudación ---
    document.getElementById('kpi-recaudacion-current').textContent = formatBillions(currentNet);
    document.getElementById('kpi-recaudacion-prev').textContent = formatBillions(prevNet);

    // Neta and Bruta labels
    document.getElementById('kpi-neta-current').textContent = formatBillions(kpi.recaudacion.neta_current);
    document.getElementById('kpi-neta-prev').textContent = formatBillions(kpi.recaudacion.neta_prev);
    document.getElementById('kpi-bruta-current').textContent = formatBillions(kpi.recaudacion.bruta_current);
    document.getElementById('kpi-bruta-prev').textContent = formatBillions(kpi.recaudacion.bruta_prev);

    // Var Nominal
    const recVarNomEl = document.getElementById('kpi-recaudacion-var-nom-abs');
    const diffSign = diffNomNet >= 0 ? '+' : '-';
    if (recVarNomEl) recVarNomEl.textContent = diffSign + formatBillions(Math.abs(diffNomNet));

    const recVarNomSub = document.getElementById('kpi-recaudacion-var-nom-pct');
    const pctSign = kpi.recaudacion.var_nom >= 0 ? '+' : '-';
    if (recVarNomSub) {
        recVarNomSub.textContent = pctSign + formatPercentage(Math.abs(kpi.recaudacion.var_nom)).replace('+', '').replace('-', '');
        recVarNomSub.className = `kpi-value ${kpi.recaudacion.var_nom >= 0 ? 'text-success' : 'text-danger'}`;
    }

    // Var Real (Check IPC Missing)
    const recVarRealEl = document.getElementById('real-var-val');
    const recVarRealAbsEl = document.getElementById('real-var-abs');

    const isIpcNacionMissing = kpi.recaudacion.ipc_missing;

    if (isIpcNacionMissing) {
        if (recVarRealEl) {
            recVarRealEl.textContent = 'Sin IPC completo';
            recVarRealEl.className = 'kpi-value text-secondary text-missing';
        }
        if (recVarRealAbsEl) recVarRealAbsEl.textContent = '--';
    } else {
        if (recVarRealEl) {
            recVarRealEl.textContent = formatPercentage(kpi.recaudacion.var_real);
            recVarRealEl.className = `kpi-value ${kpi.recaudacion.var_real >= 0 ? 'text-success' : 'text-danger'}`;
        }

        const inflacionPct = kpi.recaudacion.ipc_used_for_calc / 100;
        const prevAjustado = prevNet * (1 + inflacionPct);
        const diffReal = currentNet - prevAjustado;

        if (recVarRealAbsEl) {
            const diffRealSign = diffReal >= 0 ? '+' : '-';
            recVarRealAbsEl.textContent = diffRealSign + formatBillions(Math.abs(diffReal));
            recVarRealAbsEl.className = diffReal >= 0 ? 'text-success' : 'text-danger';
        }
    }

    // --- Masa Salarial ---
    const masaCurrentEl = document.getElementById('kpi-masa-current');

    // Cobertura text
    document.getElementById('kpi-masa-cob-current').textContent = `Cobertura: ${kpi.masa_salarial.cobertura_current.toFixed(1)}%`;
    document.getElementById('kpi-masa-cob-prev').textContent = `Cobertura: ${kpi.masa_salarial.cobertura_prev.toFixed(1)}%`;

    const isIncomplete = kpi.masa_salarial.is_incomplete;
    const isIpcNeaMissingMasa = kpi.masa_salarial.ipc_missing;

    // Masa Current
    if (isIncomplete) {
        if (masaCurrentEl) masaCurrentEl.textContent = 'Sin datos';
    } else {
        if (masaCurrentEl) masaCurrentEl.textContent = formatBillions(kpi.masa_salarial.current);
    }

    document.getElementById('kpi-masa-prev').textContent = formatBillions(kpi.masa_salarial.prev);

    // Var Nominal Masa
    const masaVarNomPctEl = document.getElementById('kpi-masa-var-nom-pct');
    const masaVarNomAbsEl = document.getElementById('kpi-masa-var-nom-abs');

    if (isIncomplete) {
        if (masaVarNomPctEl) {
            masaVarNomPctEl.textContent = 'Sin datos';
            masaVarNomPctEl.className = 'kpi-value text-secondary';
        }
        if (masaVarNomAbsEl) masaVarNomAbsEl.textContent = ' - ';
    } else {
        const masaDiffSign = kpi.masa_salarial.diff_nom >= 0 ? '+' : '-';
        if (masaVarNomAbsEl) masaVarNomAbsEl.textContent = masaDiffSign + formatBillions(Math.abs(kpi.masa_salarial.diff_nom));

        const masaPctSign = kpi.masa_salarial.var_nom >= 0 ? '+' : '-';
        if (masaVarNomPctEl) {
            masaVarNomPctEl.textContent = masaPctSign + formatPercentage(Math.abs(kpi.masa_salarial.var_nom)).replace('+', '').replace('-', '');
            masaVarNomPctEl.className = `kpi-value ${kpi.masa_salarial.var_nom >= 0 ? 'text-success' : 'text-danger'}`;
        }
    }

    // Var Real Masa
    const masaVarRealEl = document.getElementById('kpi-masa-var-real');
    const masaVarRealAbsEl = document.getElementById('masa-real-var-abs');

    if (isIncomplete || isIpcNeaMissingMasa) {
        if (masaVarRealEl) {
            if (isIpcNeaMissingMasa) {
                masaVarRealEl.textContent = 'Sin IPC completo';
            } else {
                masaVarRealEl.textContent = 'Sin datos completos';
            }
            masaVarRealEl.className = 'kpi-value text-secondary text-missing';
        }
        if (masaVarRealAbsEl) masaVarRealAbsEl.textContent = '--';
    } else {
        if (masaVarRealEl) {
            masaVarRealEl.textContent = formatPercentage(kpi.masa_salarial.var_real);
            masaVarRealEl.className = `kpi-value ${kpi.masa_salarial.var_real >= 0 ? 'text-success' : 'text-danger'}`;
        }

        const inflacionPct = kpi.recaudacion.ipc_used_for_calc / 100;
        const prevAjustado = kpi.masa_salarial.prev * (1 + inflacionPct);
        const diffReal = kpi.masa_salarial.current - prevAjustado;

        if (masaVarRealAbsEl) {
            const diffRealSign = diffReal >= 0 ? '+' : '-';
            masaVarRealAbsEl.textContent = diffRealSign + formatBillions(Math.abs(diffReal));
            masaVarRealAbsEl.className = diffReal >= 0 ? 'text-success' : 'text-danger';
        }
    }
}

let monthlyChartInstance = null;

function renderMonthlyChart(monthlyData, currentYear, prevYear) {
    const ctx = document.getElementById('monthlyChart').getContext('2d');

    if (monthlyChartInstance) {
        monthlyChartInstance.destroy();
    }

    // Gradient for current year
    const gradientCurr = ctx.createLinearGradient(0, 0, 0, 400);
    gradientCurr.addColorStop(0, 'rgba(16, 185, 129, 0.9)');
    gradientCurr.addColorStop(1, 'rgba(16, 185, 129, 0.4)');

    let chartLabels = monthlyData.labels;
    let dataCurrNet = monthlyData.data_curr;
    let dataPrevNet = monthlyData.data_prev;

    // Mobile: group quarterly
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const quarterLabels = ['T1', 'T2', 'T3', 'T4'];
        const qCurr = [0, 0, 0, 0];
        const qPrev = [0, 0, 0, 0];
        for (let i = 0; i < dataCurrNet.length; i++) {
            const q = Math.floor(i / 3);
            if (q < 4) {
                qCurr[q] += (dataCurrNet[i] || 0);
                qPrev[q] += (dataPrevNet[i] || 0);
            }
        }
        chartLabels = quarterLabels;
        dataCurrNet = qCurr;
        dataPrevNet = qPrev;
    }

    monthlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    label: `Año ${currentYear}`,
                    data: dataCurrNet,
                    backgroundColor: gradientCurr,
                    borderRadius: 4,
                    borderSkipped: false,
                    order: 1
                },
                {
                    label: `Año ${prevYear}`,
                    data: dataPrevNet,
                    backgroundColor: '#94a3b8',
                    borderRadius: 4,
                    borderSkipped: false,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1e293b',
                    bodyColor: '#475569',
                    borderColor: 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (context.parsed.y !== null) {
                                return `${label}: ${formatBillions(context.parsed.y)}`;
                            }
                        },
                        afterBody: function (tooltipItems) {
                            const valCurr = tooltipItems[0].raw || 0;
                            const valPrev = tooltipItems[1] ? tooltipItems[1].raw : 0;

                            if (valCurr > 0 && valPrev > 0) {
                                const diff = valCurr - valPrev;
                                const sign = diff > 0 ? '+' : '';
                                return `\nVar. Nominal: ${sign}${formatBillions(diff)}`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b' }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        color: '#64748b',
                        callback: val => formatBillions(val)
                    }
                }
            },
            interaction: { mode: 'index', intersect: false },
        }
    });
}

let chartCopaInstance = null;

function renderCopaVsSalarioChart(dataCopa) {
    const ctx = document.getElementById('chartCopaVsSalario');
    if (!ctx) return;

    if (chartCopaInstance) {
        chartCopaInstance.destroy();
    }

    if (!dataCopa) return;

    const colorPrimary = '#10b981';
    const colorAccent = '#af2f2f';

    let chartLabels = dataCopa.labels;
    let cumulativeCopaNet = dataCopa.cumulative_copa;
    let salarioTarget = dataCopa.salario_target;

    // Mobile: sample quarter-end months (cumulative data)
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const quarterEndIndices = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec
        const qLabels = ['T1', 'T2', 'T3', 'T4'];
        const sampledLabels = [];
        const sampledCopa = [];
        const sampledSalario = [];
        quarterEndIndices.forEach((idx, qi) => {
            if (idx < chartLabels.length) {
                sampledLabels.push(qLabels[qi]);
                sampledCopa.push(cumulativeCopaNet[idx]);
                sampledSalario.push(salarioTarget[idx]);
            }
        });
        chartLabels = sampledLabels;
        cumulativeCopaNet = sampledCopa;
        salarioTarget = sampledSalario;
    }

    chartCopaInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    type: 'line',
                    label: 'Masa Salarial Objetivo Acum.',
                    data: salarioTarget,
                    borderColor: colorAccent,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    yAxisID: 'y'
                },
                {
                    type: 'bar',
                    label: 'Coparticipación Disponible Acumulada',
                    data: cumulativeCopaNet,
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderColor: colorPrimary,
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1e293b',
                    bodyColor: '#475569',
                    borderColor: 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (context.parsed.y !== null) {
                                return `${label}: ${formatBillions(context.parsed.y)}`;
                            }
                        }
                    }
                }
            },
            interaction: {
                mode: 'index',
                axis: 'x',
                intersect: false
            },
            scales: {
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        font: { size: 11 },
                        color: '#64748b',
                        callback: (value) => formatBillions(value)
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}

let chartBrechaInstance = null;

function renderBrechaChart(dataCopa, currentYear, maxMonth, isComplete) {
    const ctx = document.getElementById('chartBrechaAcumulada');
    if (!ctx) return;

    if (chartBrechaInstance) {
        chartBrechaInstance.destroy();
    }

    const sectionCards = document.getElementById('presupuesto-section-anual');
    const chartContainer = ctx.closest('.chart-container');

    // Check if we should render (currently logic targets 2026 data based on user reqs)
    if (!dataCopa || !dataCopa.cumulative_esperada || !dataCopa.cumulative_copa || currentYear !== 2026) {
        if (chartContainer) chartContainer.style.display = 'none';
        if (sectionCards) sectionCards.style.display = 'none';
        return;
    }

    if (chartContainer) chartContainer.style.display = 'block';
    if (sectionCards) sectionCards.style.display = 'block';

    const colorActual = '#10b981';
    const colorFaltante = '#94a3b8';
    const colorExcedente = '#047857';

    // Use expected as is (compared against Neta)
    const expectedData = dataCopa.cumulative_esperada || [];
    const actualDataRaw = dataCopa.cumulative_neta || dataCopa.cumulative_copa;

    const baseData = [];
    const faltanteData = [];
    const excedenteData = [];

    let lastActualVal = 0;
    let lastExpectedVal = 0;

    // We only want to analyze complete months.
    // maxMonth is 1-indexed (1: Jan, etc.).
    // If the year is incomplete, the maxMonth indicates the month currently in progress, so the last complete month is maxMonth - 1.
    let limitMonthIndex = 12;
    if (maxMonth) {
        limitMonthIndex = isComplete ? maxMonth : (maxMonth - 1);
    }

    for (let i = 0; i < expectedData.length; i++) {
        const exp = expectedData[i];
        const act = actualDataRaw[i];

        // If data is null or we're past the last complete month, we don't calculate or plot the difference 
        // to avoid comparing a partial month of revenue against a full month's expected budget.
        if (exp === null || act === null || i >= limitMonthIndex) {
            baseData.push(null);
            faltanteData.push(null);
            excedenteData.push(null);
        } else {
            lastActualVal = act;
            lastExpectedVal = exp;

            if (act <= exp) {
                baseData.push(act);
                faltanteData.push(exp - act);
                excedenteData.push(0);
            } else {
                baseData.push(exp);
                faltanteData.push(0);
                excedenteData.push(act - exp);
            }
        }
    }

    // Populate Cards
    if (sectionCards) {
        const diffAbs = lastActualVal - lastExpectedVal;
        const diffPct = lastExpectedVal > 0 ? ((lastActualVal / lastExpectedVal) - 1) * 100 : 0;

        const pctSign = diffPct > 0 ? '+' : '';
        const absSign = diffAbs > 0 ? '+' : '';

        const kpiNom = document.getElementById('kpi-brecha-nom-anual');
        if (kpiNom) {
            kpiNom.textContent = absSign + formatMillions(Math.abs(diffAbs));
            kpiNom.className = `kpi-value ${diffAbs >= 0 ? 'text-success' : 'text-danger'}`;
        }

        const kpiPct = document.getElementById('kpi-brecha-pct-anual');
        if (kpiPct) {
            // Remove replace('-', '') to preserve negative sign when formatPercentage is used
            kpiPct.textContent = pctSign + formatPercentage(diffPct).replace('+', '');
            kpiPct.className = `kpi-value ${diffPct >= 0 ? 'text-success' : 'text-danger'}`;
        }

        const valNeta = document.getElementById('kpi-neta-presupuesto-anual');
        if (valNeta) valNeta.textContent = formatMillions(lastActualVal);

        const valEsperada = document.getElementById('kpi-esperada-anual');
        if (valEsperada) valEsperada.textContent = formatMillions(lastExpectedVal);
    }

    // Mobile: sample quarter-end months for reduced data density
    let brechaLabels = dataCopa.labels;
    let brechaBase = baseData;
    let brechaFaltante = faltanteData;
    let brechaExcedente = excedenteData;
    const isMobileBrecha = window.innerWidth <= 768;
    if (isMobileBrecha) {
        const quarterEndIndices = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec
        const qLabels = ['T1', 'T2', 'T3', 'T4'];
        brechaLabels = [];
        brechaBase = [];
        brechaFaltante = [];
        brechaExcedente = [];
        quarterEndIndices.forEach((idx, qi) => {
            if (idx < dataCopa.labels.length) {
                brechaLabels.push(qLabels[qi]);
                brechaBase.push(baseData[idx]);
                brechaFaltante.push(faltanteData[idx]);
                brechaExcedente.push(excedenteData[idx]);
            }
        });
    }

    chartBrechaInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: brechaLabels,
            datasets: [
                {
                    label: 'Recaudación Acumulada',
                    data: brechaBase,
                    backgroundColor: colorActual,
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderWidth: 1,
                    stack: 'Stack 0',
                    barPercentage: 0.7
                },
                {
                    label: 'Meta Pendiente (Faltante para Esperada)',
                    data: brechaFaltante,
                    backgroundColor: 'rgba(148, 163, 184, 0.4)',
                    borderColor: colorFaltante,
                    borderWidth: 1,
                    borderDash: [4, 4],
                    stack: 'Stack 0',
                    barPercentage: 0.7
                },
                {
                    label: 'Excedente (Por encima de la Esperada)',
                    data: brechaExcedente,
                    backgroundColor: colorExcedente,
                    borderColor: '#fff',
                    borderWidth: 1,
                    stack: 'Stack 0',
                    barPercentage: 0.7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: false,
                },
                legend: {
                    position: 'top',
                    align: 'center',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 15,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1e293b',
                    bodyColor: '#475569',
                    borderColor: 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (context.parsed.y !== null) {
                                return `${label}: ${formatMillions(context.parsed.y)}`;
                            }
                        },
                        afterBody: function (tooltipItems) {
                            if (!tooltipItems || tooltipItems.length === 0) return '';
                            let act = tooltipItems[0].raw || 0;
                            let fal = tooltipItems[1] ? (tooltipItems[1].raw || 0) : 0;
                            let exc = tooltipItems[2] ? (tooltipItems[2].raw || 0) : 0;

                            let totalEsp = act + fal;
                            let totalAct = act + exc;

                            if (totalEsp > 0) {
                                let pct = (totalAct / totalEsp) * 100;
                                return `\n% del Esperado: ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(pct)}%`;
                            }
                        }
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        callback: val => formatBillions(val)
                    }
                }
            }
        }
    });
}
