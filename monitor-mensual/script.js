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

    const basePath = new URL('.', window.location.href).pathname === '/' ? '/' : new URL('..', window.location.href).pathname;

    fetch(basePath + 'main/_data_ipce_v1.json')
        .then(response => response.json())
        .then(data => {
            dashboardData = data;
            initMonthSelector(data.meta.available_periods);
        })
        .catch(error => console.error('Error loading data:', error));
});

function initMonthSelector(periods) {
    const selector = document.getElementById('month-selector');

    // Clear loading option
    selector.innerHTML = '';

    // Index of the last complete month
    const defaultId = dashboardData.meta.default_period_id;
    const defaultIndex = periods.findIndex(p => p.id === defaultId);

    // Populate options (newest first)
    const reversedPeriods = [...periods].reverse();
    reversedPeriods.forEach(period => {
        const option = document.createElement('option');
        option.value = period.id;
        option.textContent = period.label + ' ' + period.year;

        // Highlight months beyond the default
        const pIndex = periods.findIndex(p => p.id === period.id);
        if (pIndex > defaultIndex) {
            option.dataset.incomplete = 'true';
            option.textContent += ' (Incompleto)';
        }

        selector.appendChild(option);
    });

    // Select default period
    // Priority: meta.default_period_id > last available period
    let chosenId = defaultId;
    if (!chosenId && periods.length > 0) {
        chosenId = periods[periods.length - 1].id;
    }

    selector.value = chosenId;

    // Render initial data
    renderDashboard(chosenId);

    // Handle changes
    selector.addEventListener('change', (e) => {
        const selectedOption = e.target.selectedOptions[0];
        if (selectedOption && selectedOption.dataset.incomplete === 'true') {
            alert("Atención: El periodo seleccionado aún cuenta con datos incompletos. Las variaciones y proyecciones pueden cambiar significativamente hasta el cierre definitivo.");
        }
        renderDashboard(e.target.value);
    });

    // Check if initial is incomplete to trigger alert if necessary
    const initialOption = selector.selectedOptions[0];
}

function renderDashboard(periodId) {
    if (!dashboardData || !dashboardData.data[periodId]) return;

    const periodData = dashboardData.data[periodId];

    // Parse Year and Month from Period ID (e.g., "2026-01")
    const [yearStr, monthStr] = periodId.split('-');
    const currentYear = parseInt(yearStr);
    const prevYear = currentYear - 1;

    // Check if period is complete
    const periods = dashboardData.meta.available_periods;
    const defaultIndex = periods.findIndex(p => p.id === dashboardData.meta.default_period_id);
    const pIndex = periods.findIndex(p => p.id === periodId);
    const isPeriodComplete = pIndex <= defaultIndex;

    // Update KPI Grid
    renderKPIs(periodData.kpi, isPeriodComplete, periodId);

    // Dynamic Labels
    const periodLabel = periodData.kpi.meta.periodo; // "Enero 2026"
    const monthName = periodLabel.split(' ')[0]; // "Enero"

    // Update Header Text
    const headerTitle = document.querySelector('h1.text-gradient');
    if (headerTitle) {
        headerTitle.textContent = `Coparticipación Federal - Análisis Interanual`;
    }

    // Update Main Subtitle
    const mainSubtitle = document.getElementById('main-subtitle');
    if (mainSubtitle) {
        mainSubtitle.textContent = `Análisis comparativo del comportamiento de transferencias nacionales (CFI Neta de Ley 26075) para el período ${monthName} ${prevYear} vs ${monthName} ${currentYear}.`;
    }

    // Update Recaudación Labels
    const isIncomplete = periodData.kpi.masa_salarial.is_incomplete;
    const statusSuffix = isIncomplete ? ' (incompleto)' : '';

    const lblRecCurrent = document.getElementById('label-recaudacion-current');
    if (lblRecCurrent) {
        lblRecCurrent.textContent = `Copa. Disponible ${monthName} ${currentYear}${statusSuffix}`;
    }

    const lblRecPrev = document.getElementById('label-recaudacion-prev');
    if (lblRecPrev) lblRecPrev.textContent = `Copa. Disponible ${monthName} ${prevYear}`;

    const lblMuniCurrent = document.getElementById('label-muni-current');
    if (lblMuniCurrent) {
        lblMuniCurrent.textContent = `Distrib. Municipal ${monthName} ${currentYear}${statusSuffix}`;
    }

    const lblMuniPrev = document.getElementById('label-muni-prev');
    if (lblMuniPrev) lblMuniPrev.textContent = `Distrib. Municipal ${monthName} ${prevYear}`;

    // Update Masa Salarial Subtitle
    const masaSubtitle = document.getElementById('masa-salarial-subtitle');
    if (masaSubtitle) {
        masaSubtitle.textContent = `Relación entre Coparticipación y Masa Salarial para ${monthName} ${prevYear} vs ${currentYear}${statusSuffix}`;
    }

    // Update Masa Salarial Labels
    const lblMasaCurrent = document.getElementById('label-masa-current');
    if (lblMasaCurrent) {
        lblMasaCurrent.textContent = `Masa Salarial ${monthName} ${currentYear}${statusSuffix}`;
    }

    const lblMasaPrev = document.getElementById('label-masa-prev');
    if (lblMasaPrev) lblMasaPrev.textContent = `Masa Salarial ${monthName} ${prevYear}`;

    // Conditional visibility for Incomplete Periods 
    const cardCopaVarNom = document.getElementById('card-copa-var-nom');
    const cardCopaVarReal = document.getElementById('card-copa-var-real');
    const rowCopaCards = document.getElementById('row-copa-cards');

    const cardMuniVarNom = document.getElementById('card-muni-var-nom');
    const cardMuniVarReal = document.getElementById('card-muni-var-real');
    const rowMuniCards = document.getElementById('row-muni-cards');

    const cardMasaVarReal = document.getElementById('card-masa-var-real');
    const rowMasaCards = document.getElementById('row-masa-cards');

    // Mobile-aware grid column setter: on small screens let CSS media queries handle stacking
    const isMobileLayout = window.innerWidth <= 640;

    if (isIncomplete) {
        if (cardCopaVarNom) cardCopaVarNom.style.display = 'none';
        if (cardCopaVarReal) cardCopaVarReal.style.display = 'none';
        if (rowCopaCards) rowCopaCards.style.gridTemplateColumns = isMobileLayout ? '' : 'repeat(2, 1fr)';

        if (cardMuniVarNom) cardMuniVarNom.style.display = 'none';
        if (cardMuniVarReal) cardMuniVarReal.style.display = 'none';
        if (rowMuniCards) rowMuniCards.style.gridTemplateColumns = isMobileLayout ? '' : 'repeat(2, 1fr)';

        if (cardMasaVarReal) cardMasaVarReal.style.display = 'none';
        if (rowMasaCards) rowMasaCards.style.gridTemplateColumns = isMobileLayout ? '' : 'repeat(3, 1fr)';
    }
    // Reset states if complete
    if (!isIncomplete) {
        if (cardCopaVarNom) cardCopaVarNom.style.display = 'flex';
        if (cardCopaVarReal) cardCopaVarReal.style.display = 'flex';
        if (rowCopaCards) rowCopaCards.style.gridTemplateColumns = '';

        if (cardMuniVarNom) cardMuniVarNom.style.display = 'flex';
        if (cardMuniVarReal) cardMuniVarReal.style.display = 'flex';
        if (rowMuniCards) rowMuniCards.style.gridTemplateColumns = '';

        if (cardMasaVarReal) cardMasaVarReal.style.display = 'flex';
        if (rowMasaCards) rowMasaCards.style.gridTemplateColumns = '';
    }

    // Get specific IPC missing flags for each metric (Nacion vs NEA)
    const isIpcNacionMissing = periodData.kpi.recaudacion.ipc_missing;
    const isIpcNeaMissingMuni = periodData.kpi.distribucion_municipal.ipc_missing;
    const isIpcNeaMissingMasa = periodData.kpi.masa_salarial.ipc_missing;

    // Update Chart Title
    const chartTitle = document.getElementById('chart-title');
    if (chartTitle) chartTitle.textContent = `Comportamiento de Coparticipación Disponible Diaria ${monthName}`;

    // Update Chart
    renderChart(periodData.charts.daily, monthName, currentYear, prevYear);
    renderBrechaChart(periodData.charts.copa_vs_salario, monthName, currentYear);
    renderCopaVsSalarioChart(periodData.charts.copa_vs_salario);
    renderRealEvolutionCharts(periodId);
}

// ... Format functions ...
function formatCurrency(value) {
    if (value === undefined || value === null) return 'N/A';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value * 1000000);
}
function formatMillions(value) {
    if (value === undefined || value === null) return 'N/A';
    return '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value) + ' M';
}

function formatPercentage(value) {
    if (value === undefined || value === null) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    const formattedValue = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
    return `${sign}${formattedValue}%`;
}

function renderKPIs(kpi, isPeriodComplete, periodId) {
    const currentNet = kpi.recaudacion.current;
    const prevNet = kpi.recaudacion.prev;
    const diffNomNet = kpi.recaudacion.diff_nom;

    // Get specific IPC missing flags for each metric (Nacion vs NEA)
    const isIpcNacionMissing = kpi.recaudacion.ipc_missing;
    const isIpcNeaMissingMuni = kpi.distribucion_municipal.ipc_missing;
    const isIpcNeaMissingMasa = kpi.masa_salarial.ipc_missing;

    // --- Distribucion Municipal ---
    if (kpi.distribucion_municipal) {
        const muniCurrent = kpi.distribucion_municipal.current;
        const muniPrev = kpi.distribucion_municipal.prev;

        const elMuniCurr = document.getElementById('kpi-muni-current');
        if (elMuniCurr) elMuniCurr.textContent = formatMillions(muniCurrent);

        const elMuniPrev = document.getElementById('kpi-muni-prev');
        if (elMuniPrev) elMuniPrev.textContent = formatMillions(muniPrev);

        const muniVarNomEl = document.getElementById('kpi-muni-var-nom-abs');
        const muniDiffNom = kpi.distribucion_municipal.diff_nom;
        const muniDiffSign = muniDiffNom >= 0 ? '+' : '-';
        if (muniVarNomEl) muniVarNomEl.textContent = muniDiffSign + formatMillions(Math.abs(muniDiffNom));

        const muniVarNomSub = document.getElementById('kpi-muni-var-nom-pct');
        const muniPctSign = kpi.distribucion_municipal.var_nom >= 0 ? '+' : '-';
        if (muniVarNomSub) {
            muniVarNomSub.textContent = muniPctSign + formatPercentage(Math.abs(kpi.distribucion_municipal.var_nom)).replace('+', '').replace('-', '');
            muniVarNomSub.className = `kpi-value ${kpi.distribucion_municipal.var_nom >= 0 ? 'text-success' : 'text-danger'}`;
        }

        const muniVarRealEl = document.getElementById('real-var-muni-val');
        const muniVarRealAbsEl = document.getElementById('real-var-muni-abs');

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
                muniVarRealAbsEl.textContent = muniDiffRealSign + formatMillions(Math.abs(muniDiffReal));
                muniVarRealAbsEl.className = muniDiffReal >= 0 ? 'text-success' : 'text-danger';
            }
        }
    }

    // --- Recaudación ---
    document.getElementById('kpi-recaudacion-current').textContent = formatMillions(currentNet);
    document.getElementById('kpi-recaudacion-prev').textContent = formatMillions(prevNet);

    // Neta and Bruta labels
    document.getElementById('kpi-neta-current').textContent = formatMillions(kpi.recaudacion.neta_current);
    document.getElementById('kpi-neta-prev').textContent = formatMillions(kpi.recaudacion.neta_prev);
    document.getElementById('kpi-bruta-current').textContent = formatMillions(kpi.recaudacion.bruta_current);
    document.getElementById('kpi-bruta-prev').textContent = formatMillions(kpi.recaudacion.bruta_prev);

    // Var Nominal
    const recVarNomEl = document.getElementById('kpi-recaudacion-var-nom-abs');
    const diffSign = diffNomNet >= 0 ? '+' : '-';
    recVarNomEl.textContent = diffSign + formatMillions(Math.abs(diffNomNet));

    const recVarNomSub = document.getElementById('kpi-recaudacion-var-nom-pct');
    const pctSign = kpi.recaudacion.var_nom >= 0 ? '+' : '-';
    recVarNomSub.textContent = pctSign + formatPercentage(Math.abs(kpi.recaudacion.var_nom)).replace('+', '').replace('-', '');
    recVarNomSub.className = `kpi-value ${kpi.recaudacion.var_nom >= 0 ? 'text-success' : 'text-danger'}`;

    // Var Real (Check IPC Missing)
    const recVarRealEl = document.getElementById('real-var-val');
    const recVarRealAbsEl = document.getElementById('real-var-abs');

    if (isIpcNacionMissing) {
        recVarRealEl.textContent = 'Sin IPC completo';
        recVarRealEl.className = 'kpi-value text-secondary text-missing';
        if (recVarRealAbsEl) recVarRealAbsEl.textContent = '--';
    } else {
        recVarRealEl.textContent = formatPercentage(kpi.recaudacion.var_real);
        recVarRealEl.className = `kpi-value ${kpi.recaudacion.var_real >= 0 ? 'text-success' : 'text-danger'}`;

        // Calculate the absolute real value (Difference in current purchasing power)
        // IPC used for calculation is given in kpi.recaudacion.ipc_used_for_calc (e.g. 30.5 for 30.5%)
        const inflacionPct = kpi.recaudacion.ipc_used_for_calc / 100;

        // Update the previous collection to today's money equivalent
        const prevAjustado = prevNet * (1 + inflacionPct);

        // The real diff is the current collection minus the adjusted previous collection
        const diffReal = currentNet - prevAjustado;

        if (recVarRealAbsEl) {
            const diffRealSign = diffReal >= 0 ? '+' : '-';
            recVarRealAbsEl.textContent = diffRealSign + formatMillions(Math.abs(diffReal));
            recVarRealAbsEl.className = diffReal >= 0 ? 'text-success' : 'text-danger';
        }
    }

    // --- Masa Salarial ---
    const masaCurrentEl = document.getElementById('kpi-masa-current');

    // Cobertura text
    document.getElementById('kpi-masa-cob-current').textContent = `Cobertura: ${kpi.masa_salarial.cobertura_current.toFixed(1)}%`;
    document.getElementById('kpi-masa-cob-prev').textContent = `Cobertura: ${kpi.masa_salarial.cobertura_prev.toFixed(1)}%`;

    // Masse Salarial Logic - Check for incomplete data
    const isIncomplete = kpi.masa_salarial.is_incomplete;

    // Masa Current
    if (isIncomplete) {
        masaCurrentEl.textContent = 'Sin datos';
        // Optional: change style to gray?
    } else {
        masaCurrentEl.textContent = formatMillions(kpi.masa_salarial.current);
    }

    document.getElementById('kpi-masa-prev').textContent = formatMillions(kpi.masa_salarial.prev);

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
        if (masaVarNomAbsEl) masaVarNomAbsEl.textContent = masaDiffSign + formatMillions(Math.abs(kpi.masa_salarial.diff_nom));

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
        if (isIpcNeaMissingMasa) {
            masaVarRealEl.textContent = 'Sin IPC completo';
        } else {
            masaVarRealEl.textContent = 'Sin datos';
        }
        masaVarRealEl.className = 'kpi-value text-secondary text-missing';
        if (masaVarRealAbsEl) masaVarRealAbsEl.textContent = '--';
    } else {
        masaVarRealEl.textContent = formatPercentage(kpi.masa_salarial.var_real);
        masaVarRealEl.className = `kpi-value ${kpi.masa_salarial.var_real >= 0 ? 'text-success' : 'text-danger'}`;

        // Calculate the absolute real value for Masa Salarial
        const inflacionPct = kpi.recaudacion.ipc_used_for_calc / 100;
        const prevAjustado = kpi.masa_salarial.prev * (1 + inflacionPct);
        const diffReal = kpi.masa_salarial.current - prevAjustado;

        if (masaVarRealAbsEl) {
            const diffRealSign = diffReal >= 0 ? '+' : '-';
            masaVarRealAbsEl.textContent = diffRealSign + formatMillions(Math.abs(diffReal));
            masaVarRealAbsEl.className = diffReal >= 0 ? 'text-success' : 'text-danger';
        }
    }

    // --- Presupuesto vs Real (Only 2026 Complete Months) ---
    const presupuestoSection = document.getElementById('presupuesto-section');
    if (presupuestoSection && periodId) {
        if (periodId.startsWith('2026') && isPeriodComplete) {
            presupuestoSection.style.display = 'block';

            const neta = kpi.recaudacion.neta_current || 0;
            const esperada = kpi.recaudacion.esperada || 0;

            const diffAbs = neta - esperada;
            const diffPct = esperada > 0 ? ((neta / esperada) - 1) * 100 : 0;

            const pctSign = diffPct > 0 ? '+' : '';
            const absSign = diffAbs > 0 ? '+' : '';

            const kpiNom = document.getElementById('kpi-brecha-nom');
            if (kpiNom) {
                kpiNom.textContent = absSign + formatMillions(Math.abs(diffAbs));
                kpiNom.className = `kpi-value ${diffAbs >= 0 ? 'text-success' : 'text-danger'}`;
            }

            const kpiPct = document.getElementById('kpi-brecha-pct');
            if (kpiPct) {
                // Remove replace('-', '') to preserve negative sign when formatPercentage is used
                kpiPct.textContent = pctSign + formatPercentage(diffPct).replace('+', '');
                kpiPct.className = `kpi-value ${diffPct >= 0 ? 'text-success' : 'text-danger'}`;
            }

            const valNeta = document.getElementById('kpi-neta-presupuesto');
            if (valNeta) valNeta.textContent = formatMillions(neta);

            const valEsperada = document.getElementById('kpi-esperada');
            if (valEsperada) valEsperada.textContent = formatMillions(esperada);

        } else {
            presupuestoSection.style.display = 'none';
        }
    }
}

let dailyChartInstance = null;

// Helper: group array values in chunks of N (summing), and produce range labels
function groupByNDays(labels, dataArr, n) {
    const groupedLabels = [];
    const groupedData = [];
    for (let i = 0; i < dataArr.length; i += n) {
        const chunk = dataArr.slice(i, i + n).filter(v => v != null && v > 0);
        const sum = chunk.reduce((a, b) => a + b, 0);
        const startLabel = labels[i] || (i + 1).toString();
        const endIdx = Math.min(i + n - 1, dataArr.length - 1);
        const endLabel = labels[endIdx] || (endIdx + 1).toString();
        groupedLabels.push(n > 1 ? `${startLabel}-${endLabel}` : startLabel);
        groupedData.push(sum);
    }
    return { labels: groupedLabels, data: groupedData };
}

function renderChart(dailyData, monthName, currentYear, prevYear) {
    const ctx = document.getElementById('dailyChart').getContext('2d');

    if (dailyChartInstance) {
        dailyChartInstance.destroy();
    }

    // Gradient for 2026 (Green/Emerald)
    const gradient2026 = ctx.createLinearGradient(0, 0, 0, 400);
    gradient2026.addColorStop(0, 'rgba(16, 185, 129, 0.9)');
    gradient2026.addColorStop(1, 'rgba(16, 185, 129, 0.4)');

    let chartLabels = dailyData.labels;
    let dataCurrNet = dailyData.data_curr;
    let dataPrevNet = dailyData.data_prev_nom;

    // Mobile: group by 3 days
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const groupSize = 3;
        const gCurr = groupByNDays(chartLabels, dataCurrNet, groupSize);
        const gPrev = groupByNDays(chartLabels, dataPrevNet, groupSize);
        chartLabels = gCurr.labels;
        dataCurrNet = gCurr.data;
        dataPrevNet = gPrev.data;
    }

    dailyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    label: `${monthName} ${currentYear}`,
                    data: dataCurrNet,
                    backgroundColor: gradient2026,
                    borderRadius: 4,
                    borderSkipped: false,
                    order: 1
                },
                {
                    label: `${monthName} ${prevYear}`,
                    data: dataPrevNet,
                    backgroundColor: '#94a3b8', // Slate Gray (consistent with other dashboards)
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
                                return `${label}: $${new Intl.NumberFormat('es-AR').format(Math.round(context.parsed.y))} M`;
                            }
                        },
                        afterBody: function (tooltipItems) {
                            const valCurr = tooltipItems[0].raw || 0;
                            const valPrev = tooltipItems[1] ? tooltipItems[1].raw : 0;

                            if (valCurr > 0 && valPrev > 0) {
                                const diff = valCurr - valPrev;
                                const sign = diff > 0 ? '+' : '';
                                return `\nVar. Nominal: ${sign}$${new Intl.NumberFormat('es-AR').format(Math.round(diff))} M`;
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
                        callback: val => '$' + new Intl.NumberFormat('es-AR').format(Math.round(val)) + ' M'
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

    // Update Title dynamically
    const titleEl = document.getElementById('copaVsSalarioTitle');
    if (titleEl && dataCopa && dataCopa.copa_label && dataCopa.salario_label) {
        titleEl.textContent = `Coparticipación Disponible ${dataCopa.copa_label} vs Sueldos ${dataCopa.salario_label}`;
    }

    if (chartCopaInstance) {
        chartCopaInstance.destroy();
    }

    if (!dataCopa) return;

    const colorPrimary = '#10b981';
    const colorAccent = '#af2f2f';

    let chartLabels = dataCopa.labels;
    let cumulativeCopaNet = dataCopa.cumulative_copa;
    let salarioTarget = dataCopa.salario_target;

    // Mobile: sample every 3rd data point (data is cumulative, so we take snapshots)
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const step = 3;
        const sampledLabels = [];
        const sampledCopa = [];
        const sampledSalario = [];
        for (let i = 0; i < chartLabels.length; i += step) {
            const idx = Math.min(i + step - 1, chartLabels.length - 1);
            sampledLabels.push(chartLabels[idx]);
            sampledCopa.push(cumulativeCopaNet[idx]);
            sampledSalario.push(salarioTarget[idx]);
        }
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
                    label: 'Masa Salarial Objetivo',
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
                                return `${label}: $${new Intl.NumberFormat('es-AR').format(Math.round(context.parsed.y))} M`;
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
                        callback: (value) => '$' + new Intl.NumberFormat('es-AR').format(Math.round(value)) + ' M'
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

function renderBrechaChart(dataCopa, monthName, currentYear) {
    const ctx = document.getElementById('chartBrechaAcumulada');
    if (!ctx) return;

    if (chartBrechaInstance) {
        chartBrechaInstance.destroy();
    }

    if (!dataCopa || !dataCopa.cumulative_esperada || !dataCopa.cumulative_copa) return;

    const colorActual = '#10b981'; // Green from existing platform (e.g. cumulative actuals)
    const colorFaltante = '#94a3b8'; // Slate Gray from existing platform (e.g. previous year)
    const colorExcedente = '#047857'; // Darker green for exceeding EXPECTED

    // Use expected as is (compared against Neta)
    const expectedData = dataCopa.cumulative_esperada || [];
    const actualDataRaw = dataCopa.cumulative_neta || dataCopa.cumulative_copa;

    // Process data for stacked bars
    const baseData = [];
    const faltanteData = [];
    const excedenteData = [];

    for (let i = 0; i < expectedData.length; i++) {
        const exp = expectedData[i];
        const act = actualDataRaw[i];

        if (exp === null || act === null) {
            baseData.push(null);
            faltanteData.push(null);
            excedenteData.push(null);
        } else {
            if (act <= exp) {
                baseData.push(act); // Efectiva is entirely within expected
                faltanteData.push(exp - act); // The missing gap
                excedenteData.push(0);
            } else {
                baseData.push(exp); // Cap base at expected
                faltanteData.push(0);
                excedenteData.push(act - exp); // The surplus
            }
        }
    }

    chartBrechaInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: dataCopa.labels,
            datasets: [
                {
                    label: `Recaudación Ingresada`,
                    data: baseData,
                    backgroundColor: 'rgba(16, 185, 129, 0.85)', // Green
                    borderColor: colorActual,
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: `Faltante`,
                    data: faltanteData,
                    backgroundColor: 'rgba(148, 163, 184, 0.7)', // Slate gray
                    borderColor: colorFaltante,
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: `Excedente`,
                    data: excedenteData,
                    backgroundColor: 'rgba(4, 120, 87, 0.8)',
                    borderColor: colorExcedente,
                    borderWidth: 1,
                    borderRadius: 4
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
                        font: { size: 12, weight: '600' },
                        filter: function (item, chart) {
                            return item.text !== 'Excedente'; // Hide surplus from legend usually
                        }
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
                        afterBody: function (tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            const exp = expectedData[index];
                            const act = actualDataRaw[index];

                            if (exp > 0 && act > 0) {
                                const diff = act - exp;
                                const missingPercentage = ((exp - act) / exp) * 100;

                                let pctText = "";
                                if (missingPercentage > 0) {
                                    pctText = `Porcentaje Faltante: ${missingPercentage.toFixed(1)}%`;
                                } else {
                                    pctText = `Superávit: ${Math.abs(missingPercentage).toFixed(1)}%`;
                                }

                                return [
                                    ``,
                                    `━━━━━━━━━━━━━━━━━━━━`,
                                    `Esperada (100%): $${new Intl.NumberFormat('es-AR').format(Math.round(exp))} M`,
                                    `Diferencia Neta: ${diff > 0 ? '+' : ''}$${new Intl.NumberFormat('es-AR').format(Math.round(diff))} M`,
                                    pctText
                                ];
                            }
                        },
                        label: function (context) {
                            if (context.parsed.y !== null && context.parsed.y > 0) {
                                return `${context.dataset.label}: $${new Intl.NumberFormat('es-AR').format(Math.round(context.parsed.y))} M`;
                            }
                            return null;
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
                    stacked: true,
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        font: { size: 11 },
                        color: '#64748b',
                        callback: (value) => '$' + new Intl.NumberFormat('es-AR').format(Math.round(value)) + ' M'
                    }
                },
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}

let chartCopaRealInstance = null;
let chartMasaRealInstance = null;

function renderRealEvolutionCharts(periodId) {
    if (!dashboardData || !dashboardData.meta.available_periods) return;

    const periods = dashboardData.meta.available_periods;
    const selectedIdx = periods.findIndex(p => p.id === periodId);
    if (selectedIdx === -1) return;

    // Show last 3 months ending in selectedIdx
    const startIndex = Math.max(0, selectedIdx - 2);
    const chartPeriods = periods.slice(startIndex, selectedIdx + 1);

    // Update subtitles to 'Últimos 3 meses'
    const subCopa = document.querySelector('#chartCopaRealEvol').closest('.chart-container').querySelector('.section-subtitle');
    if (subCopa) subCopa.textContent = `Evolución últimos 3 meses (Pesos constantes)`;
    const subMasa = document.querySelector('#chartMasaRealEvol').closest('.chart-container').querySelector('.section-subtitle');
    if (subMasa) subMasa.textContent = `Evolución últimos 3 meses (Pesos constantes)`;

    const labels = [];
    const copaCurrent = [];
    const copaPrevReal = [];
    const masaCurrent = [];
    const masaPrevReal = [];

    const factor = 0.81;

    chartPeriods.forEach(p => {
        const periodData = dashboardData.data[p.id];
        if (!periodData) return;

        // Label: "Ene 26"
        const shortLabel = p.label.substring(0, 3) + ' ' + p.year.toString().slice(-2);
        labels.push(shortLabel);

        // Coparticipation
        const copaNom = periodData.kpi.recaudacion.current * factor;
        const inflation = periodData.kpi.recaudacion.ipc_used_for_calc / 100;
        const copaPrevNom = periodData.kpi.recaudacion.prev * factor;
        const copaPrevR = copaPrevNom * (1 + inflation);

        copaCurrent.push(copaNom);
        copaPrevReal.push(copaPrevR);

        // Masa Salarial
        const masaNom = periodData.kpi.masa_salarial.current;
        const masaPrevNom = periodData.kpi.masa_salarial.prev;
        const masaPrevR = masaPrevNom * (1 + inflation);

        masaCurrent.push(masaNom);
        masaPrevReal.push(masaPrevR);
    });

    // Determine years for labels
    const currentYear = periods[selectedIdx].year;
    const prevYear = currentYear - 1;

    // Pass periods info to the chart for dynamic tooltips
    const barPeriods = chartPeriods.map(p => ({ year: p.year, label: p.label }));

    // Render Charts - Use generic labels in legend, precise years in tooltips
    renderBarComparisonChart('chartCopaRealEvol', labels, `Copa. Disponible Real`, copaCurrent, `Copa. Disponible Real`, copaPrevReal, '#10b981', barPeriods);
    renderBarComparisonChart('chartMasaRealEvol', labels, `Masa Salarial Real`, masaCurrent, `Masa Salarial Real`, masaPrevReal, '#3b82f6', barPeriods);
}

function renderBarComparisonChart(canvasId, labels, labelBase, data1, label2Ignored, data2, color1, barPeriods) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Destroy previous instance
    if (canvasId === 'chartCopaRealEvol' && chartCopaRealInstance) chartCopaRealInstance.destroy();
    if (canvasId === 'chartMasaRealEvol' && chartMasaRealInstance) chartMasaRealInstance.destroy();

    const instance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Actual`,
                    data: data1,
                    backgroundColor: color1,
                    borderRadius: 4
                },
                {
                    label: `Año Anterior`,
                    data: data2,
                    backgroundColor: '#94a3b8',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, padding: 15 }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            const p = barPeriods[context.dataIndex];
                            const isPrev = context.datasetIndex === 1;
                            const year = isPrev ? p.year - 1 : p.year;
                            const value = new Intl.NumberFormat('es-AR').format(Math.round(context.raw));
                            return `${labelBase} ${year}: $${value} M`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        callback: (value) => '$' + new Intl.NumberFormat('es-AR').format(Math.round(value)) + ' M'
                    }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    if (canvasId === 'chartCopaRealEvol') chartCopaRealInstance = instance;
    if (canvasId === 'chartMasaRealEvol') chartMasaRealInstance = instance;
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
