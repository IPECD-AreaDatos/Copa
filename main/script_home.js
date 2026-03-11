
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
    // Check authentication state
    const isAuthenticated = Auth.isAuthenticated();
    const currentUser = isAuthenticated ? Auth.getCurrentUser() : null;

    // Elements for conditional display
    const btnHeaderLogin = document.getElementById('btnHeaderLogin');
    const navUserHeader = document.getElementById('navUserHeader');
    const navUserMobile = document.getElementById('navUserMobile');

    // Dashboard links (desktop)
    const navMonitor = document.getElementById('navMonitor');
    const navAnual = document.getElementById('navAnual');
    const navPersonal = document.getElementById('navPersonal');

    // Dashboard links (mobile)
    const navMonitorMobile = document.getElementById('navMonitorMobile');
    const navAnualMobile = document.getElementById('navAnualMobile');
    const navPersonalMobile = document.getElementById('navPersonalMobile');

    if (isAuthenticated && currentUser) {
        // User is logged in - show user info and all dashboard links

        // Hide login button
        if (btnHeaderLogin) btnHeaderLogin.style.display = 'none';

        // Show user info (desktop)
        if (navUserHeader) {
            navUserHeader.style.display = 'flex';
            const userNameEl = navUserHeader.querySelector('#userName');
            if (userNameEl) userNameEl.textContent = currentUser.name;
        }

        // Show user info (mobile)
        if (navUserMobile) {
            navUserMobile.style.display = 'flex';
            const userNameMobileEl = navUserMobile.querySelector('#userNameMobile');
            if (userNameMobileEl) userNameMobileEl.textContent = currentUser.name;
        }

        // Show all dashboard links (desktop)
        if (navMonitor) navMonitor.style.display = 'block';
        if (navAnual) navAnual.style.display = 'block';
        if (navPersonal) navPersonal.style.display = 'none'; // Hidden as per user request


        // Show all dashboard links (mobile)
        if (navMonitorMobile) navMonitorMobile.style.display = 'block';
        if (navAnualMobile) navAnualMobile.style.display = 'block';
        if (navPersonalMobile) navPersonalMobile.style.display = 'none'; // Hidden as per user request


        // Setup logout handlers
        const btnLogout = document.getElementById('btnLogout');
        const btnLogoutMobile = document.getElementById('btnLogoutMobile');

        const handleLogout = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('¿Está seguro que desea cerrar sesión?')) {
                Auth.logout();
            }
        };

        if (btnLogout) btnLogout.addEventListener('click', handleLogout);
        if (btnLogoutMobile) btnLogoutMobile.addEventListener('click', handleLogout);
    } else {
        // User is NOT logged in - show only login button

        // Show login button
        if (btnHeaderLogin) btnHeaderLogin.style.display = 'flex';

        // Hide user info
        if (navUserHeader) navUserHeader.style.display = 'none';
        if (navUserMobile) navUserMobile.style.display = 'none';

        // Hide all protected dashboard links (keep them hidden with inline style)
        // They are already hidden by default in the HTML
    }

    // Load dashboard data (Fix 1-B & 3-C)
    // Use an absolute-relative path based on the current domain to avoid nested folder 404s
    const basePath = new URL('.', window.location.href).pathname === '/' ? '/' : new URL('..', window.location.href).pathname;

    Promise.all([
        fetch(basePath + 'main/_data_ipce_v1.json').then(res => res.json()),
        fetch(basePath + 'analisis-personal/_data_ipce_v1.json').then(res => res.json())
    ])
        .then(([mainData, personalData]) => {
            let currentPeriodId = mainData.meta.default_period_id;

            // Setup selector
            const selector = document.getElementById('monthSelector');
            if (selector && mainData.meta.available_periods) {
                const defaultIndex = mainData.meta.available_periods.findIndex(p => p.id === mainData.meta.default_period_id);

                // Populate options (newest first)
                const reversedPeriods = [...mainData.meta.available_periods].reverse();
                reversedPeriods.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.id;
                    option.textContent = `${p.label} ${p.year}`;

                    // Highlight months beyond the default (incomplete)
                    const pIndex = mainData.meta.available_periods.findIndex(per => per.id === p.id);
                    if (pIndex > defaultIndex) {
                        option.style.color = '#ef4444'; // Red-500
                        option.dataset.incomplete = 'true';
                        option.textContent += ' (Incompleto)';
                    }

                    if (p.id === currentPeriodId) option.selected = true;
                    selector.appendChild(option);
                });

                // Add event listener
                selector.addEventListener('change', (e) => {
                    const selectedOption = e.target.selectedOptions[0];
                    if (selectedOption && selectedOption.dataset.incomplete === 'true') {
                        selector.style.color = '#ef4444'; // Red for incomplete
                        alert("Atención: El periodo seleccionado aún cuenta con datos incompletos. Las variaciones y proyecciones pueden cambiar significativamente hasta el cierre definitivo.");
                    } else {
                        selector.style.color = ''; // Default
                    }
                    currentPeriodId = e.target.value;
                    renderKPIs(mainData, personalData, currentPeriodId);
                    renderCoverageChart(mainData, currentPeriodId);
                });

                // Set initial color
                const initialOption = selector.selectedOptions[0];
                if (initialOption && initialOption.dataset.incomplete === 'true') {
                    selector.style.color = '#ef4444';
                }
            }

            // Initial render
            renderKPIs(mainData, personalData, currentPeriodId);
            renderChart(mainData);
            renderPurchasingPowerChart(mainData);
            renderCoverageChart(mainData, currentPeriodId);
        })
        .catch(error => console.error('Error loading dashboard data:', error));

    // Mobile nav toggle logic
    const toggle = document.getElementById('mobileNavToggle');
    const sidebar = document.getElementById('sidebar');

    if (toggle && sidebar) {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggle) {
                sidebar.classList.remove('open');
            }
        });

        const links = sidebar.querySelectorAll('.nav-link-vertical');
        links.forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove('open');
            });
        });
    }
});

function renderKPIs(mainData, personalData, currentPeriodId) {
    // 0. Update Main Title (Dynamic)
    const [year, month] = currentPeriodId.split('-');

    // Find label for this period in available_periods if possible
    let periodLabel = 'Periodo';
    let periodYear = year;

    if (mainData.meta && mainData.meta.available_periods) {
        const periodObj = mainData.meta.available_periods.find(p => p.id === currentPeriodId);
        if (periodObj) {
            periodLabel = periodObj.label;
        }
    }

    const dashboardTitle = document.querySelector('.dashboard-title');
    if (dashboardTitle) {
        dashboardTitle.textContent = `Tablero Ejecutivo Provincial`;
    }

    // Dynamic Period Label for Cards
    const isPeriodIncomplete = mainData.data[currentPeriodId].kpi.masa_salarial.is_incomplete;
    const periodStatus = isPeriodIncomplete ? ' (incompleto)' : '';
    const periodLabelFinal = `${periodLabel} ${year}${periodStatus}`;

    // 1. Variación Real Coparticipación
    const copaData = mainData.data[currentPeriodId].kpi.recaudacion;
    const isIpcNacionMissing = copaData.ipc_missing;
    const kpiCopaReal = isIpcNacionMissing ? null : copaData.var_real;
    updateKPI('kpi-copa-var-real', kpiCopaReal, true, false, isIpcNacionMissing ? 'IPC' : null);

    // Update Card Subtitles with period
    const copaSubEl = document.getElementById('kpi-copa-var-real-subtitle');
    if (copaSubEl) {
        copaSubEl.textContent = `Variación i.a. Deflactada | ${periodLabelFinal}`;
        if (isPeriodIncomplete) copaSubEl.style.color = '#ef4444';
        else copaSubEl.style.color = '';
    }

    // 2. Cobertura Salarial (Main)
    const masaData = mainData.data[currentPeriodId].kpi.masa_salarial;
    const kpiCobertura = masaData.cobertura_current;

    updateKPI('kpi-cobertura', kpiCobertura, false, true);

    // 3. Variación Real Masa Salarial
    const isIpcNeaMissingMasa = mainData.data[currentPeriodId].kpi.masa_salarial.ipc_missing;
    const kpiMasaReal = (masaData.is_incomplete || isIpcNeaMissingMasa) ? null : masaData.var_real;
    updateKPI('kpi-masa-var-real', kpiMasaReal, true, false, isIpcNeaMissingMasa ? 'IPC' : null);

    // Update Masa Card Subtitle
    const masaSubEl = document.getElementById('kpi-masa-var-real-subtitle');
    if (masaSubEl) {
        masaSubEl.textContent = `Variación i.a. Deflactada | ${periodLabelFinal}`;
        if (isPeriodIncomplete) masaSubEl.style.color = '#ef4444';
        else masaSubEl.style.color = '';
    }

    // 4. Ratio CBT (Personal)
    const personalMetrics = mainData.data[currentPeriodId].kpi.personal || {};
    let kpiCbtRatio = null;

    if (personalData && personalData.data && personalData.data[currentPeriodId] && personalData.data[currentPeriodId].kpi) {
        kpiCbtRatio = personalData.data[currentPeriodId].kpi.cbt_ratio;
    } else if (personalData && personalData.kpi) {
        kpiCbtRatio = personalData.kpi.cbt_ratio;
    }

    if (personalMetrics.cbt_ratio !== null && personalMetrics.cbt_ratio !== undefined) {
        kpiCbtRatio = personalMetrics.cbt_ratio;
    }

    const el = document.getElementById('kpi-cbt-ratio');
    if (el) {
        if (kpiCbtRatio === null || kpiCbtRatio === undefined) {
            if (isIpcNeaMissingMasa) {
                el.textContent = 'Sin IPC completo';
                el.className = 'kpi-value text-secondary text-missing';
            } else {
                el.textContent = 'Sin datos';
                el.className = 'kpi-value text-secondary';
            }
        } else {
            el.textContent = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(kpiCbtRatio);
            el.className = `kpi-value ${kpiCbtRatio >= 1.5 ? 'text-success' : 'text-danger'}`;
        }
    }
}

function updateKPI(elementId, value, useColor = true, isCoverage = false, reason = null) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (value === null || value === undefined) {
        if (reason === 'IPC') {
            el.textContent = 'Sin IPC completo';
            el.className = 'kpi-value text-secondary text-missing';
        } else {
            el.textContent = 'Sin datos';
            el.className = 'kpi-value text-secondary';
        }
        return;
    }

    const formatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const formatted = formatter.format(Math.abs(value)) + '%';
    const sign = value > 0 ? '+' : (value < 0 ? '-' : '');

    if (isCoverage) {
        el.textContent = formatter.format(value) + '%';
        el.className = 'kpi-value text-accent';
        return;
    }

    el.textContent = sign + formatted;

    if (useColor) {
        if (value > 0) el.className = 'kpi-value text-success';
        else if (value < 0) el.className = 'kpi-value text-danger';
        else el.className = 'kpi-value';
    }
}

function renderChart(mainData) {
    const ctx = document.getElementById('executiveChart').getContext('2d');
    const chartData = mainData.global_charts;

    // Limit to 6 periods on mobile
    const isMobile = window.innerWidth <= 768;
    const maxPeriods = isMobile ? 6 : chartData.labels.length;

    const labels = chartData.labels.slice(-maxPeriods);
    const copa_var_interanual = chartData.copa_var_interanual.slice(-maxPeriods);
    const ipc_var_interanual = chartData.ipc_var_interanual.slice(-maxPeriods);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Var. Interanual RON (%)',
                    data: copa_var_interanual,
                    borderColor: '#10b981', // Brand Green
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: false
                },
                {
                    label: 'Inflación Interanual (%)',
                    data: ipc_var_interanual,
                    borderColor: '#94a3b8', // Slate Gray
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#64748b',
                        font: { weight: '600' },
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1e293b',
                    bodyColor: '#475569',
                    borderColor: 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += Math.round(context.parsed.y) + '%';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { callback: val => val.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '%' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

let purchasingPowerChartInstance = null;
let coverageChartInstance = null;

function renderPurchasingPowerChart(mainData) {
    if (!mainData.secondary_charts || !mainData.secondary_charts.purchasing_power) return;

    if (purchasingPowerChartInstance) {
        purchasingPowerChartInstance.destroy();
    }

    const ppData = mainData.secondary_charts.purchasing_power;

    // Limit to 6 periods on mobile
    const isMobile = window.innerWidth <= 768;
    const maxPeriods = isMobile ? 6 : ppData.labels.length;
    const labels = ppData.labels.slice(-maxPeriods);
    const values = ppData.values.slice(-maxPeriods);

    const ctxPP = document.getElementById('purchasingPowerChart').getContext('2d');
    purchasingPowerChartInstance = new Chart(ctxPP, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Salarios Promedio / CBT Digital',
                data: values,
                backgroundColor: '#0ea5e9', // Sky Blue
                borderWidth: 0,
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.raw.toFixed(2) + ' CBTs';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    title: { display: true, text: 'Canastas' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderCoverageChart(mainData, periodId) {
    if (!mainData.data[periodId] || !mainData.meta.available_periods) return;

    // Obtener los períodos cronológicamente
    const periods = mainData.meta.available_periods;
    const selectedIdx = periods.findIndex(p => p.id === periodId);

    // Si no se encuentra el período seleccionado, abortar
    if (selectedIdx === -1) return;

    // Tomar los últimos meses (12 en desktop, 6 en mobile)
    const isMobile = window.innerWidth <= 768;
    const numMonths = isMobile ? 6 : 12;
    const startIndex = Math.max(0, selectedIdx - (numMonths - 1));
    const chartPeriods = periods.slice(startIndex, selectedIdx + 1);

    const labels = [];
    const masaSalarialPctData = [];
    const municipiosPctData = [];
    const restoCopaPctData = [];
    const rawMasaData = [];
    const rawMunicipiosData = [];
    const rawRestoData = [];

    // Calcular porcentajes para cada mes seleccionado
    chartPeriods.forEach(p => {
        const pData = mainData.data[p.id];
        if (!pData) return;

        // Ej: "Septiembre 2025" a "Sep 25" para el label podría ser mejor, pero usamos Label + Year
        const shortLabel = p.label.substring(0, 3) + ' ' + p.year.toString().slice(-2);
        labels.push(shortLabel);

        const recaudacionTotalM = pData.kpi.recaudacion.neta_current || pData.kpi.recaudacion.current;
        const masaSalarialM = pData.kpi.masa_salarial.current;
        const distMuniM = pData.kpi.distribucion_municipal?.current || pData.kpi.recaudacion.neta_current * 0.19;
        const isMasaIncomplete = pData.kpi.masa_salarial.is_incomplete;

        let masaSalarial = masaSalarialM * 1000000;
        let recaudacionTotal = recaudacionTotalM * 1000000;
        let municipios = distMuniM * 1000000;
        let restoCopa = Math.max(0, recaudacionTotal - masaSalarial - municipios);

        if (isMasaIncomplete || masaSalarial === 0) {
            masaSalarial = 0;
            restoCopa = recaudacionTotal - municipios;
        }

        const total = recaudacionTotal;
        let masaPct = 0;
        let municipiosPct = 0;
        let restoPct = 0;

        if (total > 0) {
            masaPct = (masaSalarial / total) * 100;
            municipiosPct = (municipios / total) * 100;
            restoPct = Math.max(0, 100 - masaPct - municipiosPct);
        }

        masaSalarialPctData.push(masaPct);
        municipiosPctData.push(municipiosPct);
        restoCopaPctData.push(restoPct);

        rawMasaData.push(masaSalarial);
        rawMunicipiosData.push(municipios);
        rawRestoData.push(restoCopa);
    });

    // Actualizar Subtítulo
    const subtitle = document.getElementById('coverageSubtitle');
    if (subtitle) {
        const startLabel = chartPeriods.length > 0 ? chartPeriods[0].label + ' ' + chartPeriods[0].year : '';
        const endLabel = chartPeriods.length > 0 ? chartPeriods[chartPeriods.length - 1].label + ' ' + chartPeriods[chartPeriods.length - 1].year : '';
        if (startLabel !== endLabel) {
            subtitle.textContent = `Evolución Cobertura (${startLabel} a ${endLabel})`;
        } else {
            subtitle.textContent = `Evolución Cobertura (${startLabel})`;
        }
    }

    if (coverageChartInstance) {
        coverageChartInstance.destroy();
    }

    const ctxCov = document.getElementById('coverageChart').getContext('2d');
    coverageChartInstance = new Chart(ctxCov, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Masa Salarial',
                    data: masaSalarialPctData,
                    backgroundColor: '#10b981', // green
                    borderWidth: 0,
                    barPercentage: 0.6
                },
                {
                    label: 'Municipios',
                    data: municipiosPctData,
                    backgroundColor: '#fdba74', // pastel orange (orange-300)
                    borderWidth: 0,
                    barPercentage: 0.6
                },
                {
                    label: 'Resto RON',
                    data: restoCopaPctData,
                    backgroundColor: '#94a3b8', // gray
                    borderWidth: 0,
                    barPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, padding: 20 }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const pctVal = context.raw.toFixed(1);
                            return `${context.dataset.label}: ${pctVal}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function (value) {
                            return value + '%';
                        }
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
}
