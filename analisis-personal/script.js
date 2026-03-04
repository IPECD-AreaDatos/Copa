let dashboardData = null;
let currentPeriodId = null;
let chartInstance = null;

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

    // Load dashboard data (Fix 1-B & 3-C)
    // Use an absolute-relative path based on the current domain to avoid nested folder 404s
    const basePath = new URL('.', window.location.href).pathname === '/' ? '/' : new URL('..', window.location.href).pathname;

    fetch(basePath + 'analisis-personal/_data_ipce_v1.json')
        .then(response => response.json())
        .then(data => {
            dashboardData = data;
            initMonthSelector();
            updateDashboard();
        })
        .catch(error => console.error('Error loading data:', error));
});

function initMonthSelector() {
    const selector = document.getElementById('monthSelector');
    if (!selector) return;

    const periods = dashboardData.meta.available_periods;
    const defaultId = dashboardData.meta.default_period_id;
    const defaultIndex = periods.findIndex(p => p.id === defaultId);

    const reversedPeriods = [...periods].reverse();

    selector.innerHTML = '';
    reversedPeriods.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.label} ${p.year}`;

        // Highlight months beyond the default
        const pIndex = periods.findIndex(per => per.id === p.id);
        if (pIndex > defaultIndex) {
            option.style.color = '#ef4444';
            option.dataset.incomplete = 'true';
            option.textContent += ' (Incompleto)';
        }

        selector.appendChild(option);
    });

    currentPeriodId = defaultId;
    selector.value = currentPeriodId;

    selector.addEventListener('change', (e) => {
        const selectedOption = e.target.selectedOptions[0];
        if (selectedOption && selectedOption.dataset.incomplete === 'true') {
            alert("Atención: El periodo seleccionado aún cuenta con datos incompletos. Las variaciones y proyecciones pueden cambiar significativamente hasta el cierre definitivo.");
        }
        currentPeriodId = e.target.value;
        updateDashboard();
    });
}

function updateDashboard() {
    if (!dashboardData || !currentPeriodId) return;
    const periodData = dashboardData.data[currentPeriodId];
    if (periodData) {
        renderKPIs(periodData.kpi);
        renderCharts(periodData.charts);
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

function formatPercentage(value) {
    const sign = value >= 0 ? '+' : '';
    const formattedValue = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
    return `${sign}${formattedValue}%`;
}

function formatNumber(value) {
    return new Intl.NumberFormat('es-AR').format(value);
}

function formatDecimal(value, digits = 1) {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function renderKPIs(kpi) {
    // kpi-employees (Shown as subtext)
    document.getElementById('kpi-employees').textContent = `Empleados: ${formatNumber(kpi.empleados)} | ${kpi.periodo_actual}`;

    if (kpi.is_incomplete) {
        // Handle Incomplete Data
        document.getElementById('kpi-avg-salary').textContent = 'Sin datos';
        document.getElementById('kpi-total-wage').textContent = 'Sin datos';

        const nomVarEl = document.getElementById('kpi-nom-var');
        nomVarEl.textContent = 'Sin datos';
        nomVarEl.className = 'kpi-value text-secondary';

        const realVarEl = document.getElementById('kpi-real-var');
        realVarEl.textContent = 'Sin datos';
        realVarEl.className = 'kpi-value text-secondary';

        document.getElementById('label-nom-period').textContent = '-';
        document.getElementById('label-real-period').textContent = '-';

    } else {
        // Render Normal Data
        document.getElementById('kpi-avg-salary').textContent = formatCurrency(kpi.salario_promedio);

        document.getElementById('kpi-total-wage').textContent = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0,
            minimumFractionDigits: 0
        }).format(kpi.masa_salarial) + ' M';

        // kpi-nom-var
        const nomVarEl = document.getElementById('kpi-nom-var');
        nomVarEl.textContent = formatPercentage(kpi.var_nominal_ia);
        nomVarEl.className = `kpi-value ${kpi.var_nominal_ia >= 0 ? 'text-success' : 'text-danger'}`;
        document.getElementById('label-nom-period').textContent = `vs ${kpi.periodo_anterior}`;

        // kpi-real-var
        const realVarEl = document.getElementById('kpi-real-var');
        if (kpi.var_real_ia === null || kpi.var_real_ia === undefined) {
            realVarEl.textContent = 'Sin datos';
            realVarEl.className = 'kpi-value text-secondary';
            document.getElementById('label-real-period').textContent = '-';
        } else {
            realVarEl.textContent = formatPercentage(kpi.var_real_ia);
            realVarEl.className = `kpi-value ${kpi.var_real_ia >= 0 ? 'text-success' : 'text-danger'}`;
            document.getElementById('label-real-period').textContent = 'Variación i.a. Deflactada';
        }
    }

    // Update Header Period
    const headerPeriodEl = document.getElementById('header-period');
    if (headerPeriodEl) {
        headerPeriodEl.textContent = `Análisis de puestos de trabajo y masa salarial | ${kpi.periodo_actual}`;
    }

    // --- Section 2: CBT ---

    // Update CBT Label with current date
    const cbtLabel = document.getElementById('cbt-label-dynamic');
    if (cbtLabel) cbtLabel.textContent = `Valor CBT (${kpi.periodo_actual})`;

    // kpi-cbt-val (Now a main value)
    const cbtValEl = document.getElementById('kpi-cbt-val');
    if (kpi.cbt_valor === null || kpi.cbt_valor === undefined || kpi.cbt_valor === 0) {
        cbtValEl.textContent = 'Sin datos';
        cbtValEl.className = 'kpi-value text-secondary';
    } else {
        cbtValEl.textContent = formatCurrency(kpi.cbt_valor);
        cbtValEl.className = 'kpi-value'; // Reset class
    }

    // kpi-cbt-ratio
    const cbtRatioEl = document.getElementById('kpi-cbt-ratio');
    if (kpi.is_incomplete || kpi.cbt_ratio === null || kpi.cbt_ratio === undefined || kpi.cbt_ratio === 0) {
        cbtRatioEl.textContent = 'Sin datos';
        cbtRatioEl.className = 'kpi-value text-secondary';
    } else {
        cbtRatioEl.textContent = formatDecimal(kpi.cbt_ratio);
        cbtRatioEl.className = `kpi-value ${kpi.cbt_ratio >= 1.5 ? 'text-success' : 'text-danger'}`;
    }
}

function renderCharts(charts) {
    // Common Color Palette
    const colorPrimary = '#10b981'; // Unified Green
    const colorSecondary = '#64748b'; // Slate
    const colorAccent = '#af2f2f'; // Muted Red
    const colorRipte = '#0277BD'; // Intense Blue for RIPTE

    // Chart 1: Avg Salary vs RIPTE
    const ctx1 = document.getElementById('chartAvgVsRipte').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    // Limit to 6 periods on mobile
    const isMobile = window.innerWidth <= 768;
    const maxPeriods = isMobile ? 6 : charts.labels.length;

    const labels = charts.labels.slice(-maxPeriods);
    const salario_promedio = charts.salario_promedio.slice(-maxPeriods);
    const ripte_valor = charts.ripte_valor.slice(-maxPeriods);

    chartInstance = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Salario Promedio Provincial',
                    data: salario_promedio,
                    borderColor: colorPrimary,
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    pointBackgroundColor: colorPrimary,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'y'
                },
                {
                    label: 'RIPTE (Nacional)',
                    data: ripte_valor,
                    borderColor: colorRipte,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 3,
                    tension: 0.3,
                    yAxisID: 'y',
                    spanGaps: true
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
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            scales: {
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        font: { size: 11 },
                        callback: (value) => new Intl.NumberFormat('es-AR', { notation: "compact", style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
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

// --- Navigation Toggle ---
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('mobileNavToggle');
    const sidebar = document.getElementById('sidebar');

    if (toggle && sidebar) {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggle) {
                sidebar.classList.remove('open');
            }
        });

        // Close on link click
        const links = sidebar.querySelectorAll('.nav-link-vertical');
        links.forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove('open');
            });
        });
    }
});
