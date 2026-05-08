import type { ChartData, ChartOptions } from "chart.js";
import { groupByNDays } from "./format";
import type { MonitorJson, PeriodMeta } from "./viewModel";

const esAR = "es-AR";

function yAxisMills(value: number | string) {
  return "$" + new Intl.NumberFormat(esAR).format(Math.round(Number(value))) + " M";
}

export function buildDailyBarData(
  daily: MonitorJson["data"][string]["charts"]["daily"],
  monthName: string,
  currentYear: number,
  prevYear: number,
  isMobile: boolean,
): ChartData<"bar"> {
  let chartLabels = [...daily.labels];
  let dataCurrNet = [...daily.data_curr];
  let dataPrevNet = [...daily.data_prev_nom];

  if (isMobile) {
    const groupSize = 3;
    const gCurr = groupByNDays(chartLabels, dataCurrNet, groupSize);
    const gPrev = groupByNDays(chartLabels, dataPrevNet, groupSize);
    chartLabels = gCurr.labels;
    dataCurrNet = gCurr.data;
    dataPrevNet = gPrev.data;
  }

  return {
    labels: chartLabels,
    datasets: [
      {
        label: `${monthName} ${currentYear}`,
        data: dataCurrNet,
        backgroundColor: "rgba(16, 185, 129, 0.85)",
        borderRadius: 4,
        borderSkipped: false,
        order: 1,
      },
      {
        label: `${monthName} ${prevYear}`,
        data: dataPrevNet,
        backgroundColor: "#94a3b8",
        borderRadius: 4,
        borderSkipped: false,
        order: 2,
      },
    ],
  };
}

export function dailyBarOptions(monthName: string): ChartOptions<"bar"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        titleColor: "#1e293b",
        bodyColor: "#475569",
        borderColor: "rgba(0,0,0,0.1)",
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label(ctx) {
            const label = ctx.dataset.label || "";
            const y = ctx.parsed.y;
            if (y !== null && !Number.isNaN(y)) {
              return `${label}: $${new Intl.NumberFormat(esAR).format(Math.round(y))} M`;
            }
            return "";
          },
          afterBody(tooltipItems) {
            const valCurr = Number(tooltipItems[0]?.raw ?? 0);
            const valPrev = Number(tooltipItems[1]?.raw ?? 0);
            if (valCurr > 0 && valPrev > 0) {
              const diff = valCurr - valPrev;
              const sign = diff > 0 ? "+" : "";
              return `\nVar. Nominal: ${sign}$${new Intl.NumberFormat(esAR).format(Math.round(diff))} M`;
            }
            return "";
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#64748b" },
      },
      y: {
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          color: "#64748b",
          callback: (val) => yAxisMills(val),
        },
      },
    },
    interaction: { mode: "index", intersect: false },
  };
}

export function buildCopaVsSalarioMixed(
  dataCopa: MonitorJson["data"][string]["charts"]["copa_vs_salario"],
  isMobile: boolean,
): ChartData<"bar" | "line"> {
  let chartLabels = [...dataCopa.labels];
  let cumulativeCopaNet = [...dataCopa.cumulative_copa];
  let cumulativeRop = [...(dataCopa.cumulative_rop ?? [])];
  let salarioTarget = [...dataCopa.salario_target];

  if (isMobile) {
    const step = 3;
    const sampledLabels: string[] = [];
    const sampledCopa: number[] = [];
    const sampledRop: number[] = [];
    const sampledSalario: number[] = [];
    for (let i = 0; i < chartLabels.length; i += step) {
      const idx = Math.min(i + step - 1, chartLabels.length - 1);
      sampledLabels.push(chartLabels[idx]);
      sampledCopa.push(cumulativeCopaNet[idx]);
      sampledRop.push(cumulativeRop[idx] ?? 0);
      sampledSalario.push(salarioTarget[idx]);
    }
    chartLabels = sampledLabels;
    cumulativeCopaNet = sampledCopa;
    cumulativeRop = sampledRop;
    salarioTarget = sampledSalario;
  }

  const colorPrimary = "#10b981";
  const colorROP = "#3b82f6";
  const colorAccent = "#af2f2f";

  return {
    labels: chartLabels,
    datasets: [
      {
        type: "line",
        label: "Masa Salarial Objetivo",
        data: salarioTarget,
        borderColor: colorAccent,
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
        yAxisID: "y",
      },
      {
        type: "bar",
        label: "RON Disponible Acumulada",
        data: cumulativeCopaNet,
        backgroundColor: "rgba(16, 185, 129, 0.8)",
        borderColor: colorPrimary,
        borderWidth: 1,
        borderRadius: 4,
        yAxisID: "y",
        stack: "recursos",
      },
      {
        type: "bar",
        label: "ROP Disponible",
        data: cumulativeRop,
        backgroundColor: "rgba(59, 130, 246, 0.8)",
        borderColor: colorROP,
        borderWidth: 1,
        borderRadius: 4,
        yAxisID: "y",
        stack: "recursos",
      },
    ],
  };
}

export function copaVsSalarioOptions(): ChartOptions<"bar"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: {
          usePointStyle: true,
          padding: 20,
          font: { size: 12, weight: 600 },
        },
      },
      tooltip: {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        titleColor: "#1e293b",
        bodyColor: "#475569",
        borderColor: "rgba(0,0,0,0.1)",
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        mode: "index",
        intersect: false,
        callbacks: {
          label(ctx) {
            const label = ctx.dataset.label || "";
            const y = ctx.parsed.y;
            if (y !== null && !Number.isNaN(y)) {
              return `${label}: $${new Intl.NumberFormat(esAR).format(Math.round(Number(y)))} M`;
            }
            return "";
          },
        },
      },
    },
    interaction: {
      mode: "index",
      axis: "x",
      intersect: false,
    },
    scales: {
      y: {
        stacked: true,
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          font: { size: 11 },
          color: "#64748b",
          callback: (val) => yAxisMills(val),
        },
      },
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 11 } },
      },
    },
  };
}

export function buildBrechaStacked(
  dataCopa: MonitorJson["data"][string]["charts"]["copa_vs_salario"],
): ChartData<"bar"> | null {
  const expectedData = dataCopa.cumulative_esperada;
  const neta = dataCopa.cumulative_neta;
  const useNeta = neta?.some((v) => v != null);
  const actualDataRaw = useNeta ? neta! : dataCopa.cumulative_copa;
  if (!expectedData || !actualDataRaw) return null;

  const baseData: (number | null)[] = [];
  const faltanteData: (number | null)[] = [];
  const excedenteData: (number | null)[] = [];

  for (let i = 0; i < expectedData.length; i++) {
    const exp = expectedData[i];
    const act = actualDataRaw[i];

    if (exp === null || act === null) {
      baseData.push(null);
      faltanteData.push(null);
      excedenteData.push(null);
    } else {
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

  const colorActual = "#10b981";
  const colorFaltante = "#94a3b8";
  const colorExcedente = "#047857";

  return {
    labels: dataCopa.labels,
    datasets: [
      {
        label: "Recaudación Ingresada",
        data: baseData as number[],
        backgroundColor: "rgba(16, 185, 129, 0.85)",
        borderColor: colorActual,
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: "Faltante",
        data: faltanteData as number[],
        backgroundColor: "rgba(148, 163, 184, 0.7)",
        borderColor: colorFaltante,
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: "Excedente",
        data: excedenteData as number[],
        backgroundColor: "rgba(4, 120, 87, 0.8)",
        borderColor: colorExcedente,
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };
}

export function brechaOptions(
  expectedData: (number | null)[],
  actualDataRaw: (number | null)[],
): ChartOptions<"bar"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: {
          usePointStyle: true,
          padding: 20,
          font: { size: 12, weight: 600 },
          filter(item) {
            return item.text !== "Excedente";
          },
        },
      },
      tooltip: {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        titleColor: "#1e293b",
        bodyColor: "#475569",
        borderColor: "rgba(0,0,0,0.1)",
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        mode: "index",
        intersect: false,
        callbacks: {
          afterBody(tooltipItems) {
            const index = tooltipItems[0]?.dataIndex ?? 0;
            const exp = expectedData[index];
            const act = actualDataRaw[index];
            if (exp != null && act != null && exp > 0 && act > 0) {
              const diff = act - exp;
              const missingPercentage = ((exp - act) / exp) * 100;
              const pctText =
                missingPercentage > 0
                  ? `Porcentaje Faltante: ${missingPercentage.toFixed(1)}%`
                  : `Superávit: ${Math.abs(missingPercentage).toFixed(1)}%`;
              return [
                "",
                "━━━━━━━━━━━━━━━━━━━━",
                `Esperada (100%): $${new Intl.NumberFormat(esAR).format(Math.round(exp))} M`,
                `Diferencia Neta: ${diff > 0 ? "+" : ""}$${new Intl.NumberFormat(esAR).format(Math.round(diff))} M`,
                pctText,
              ];
            }
            return [];
          },
          label(ctx) {
            const y = ctx.parsed.y;
            if (y !== null && !Number.isNaN(y) && y > 0) {
              return `${ctx.dataset.label}: $${new Intl.NumberFormat(esAR).format(Math.round(y))} M`;
            }
            return "";
          },
        },
      },
    },
    interaction: {
      mode: "index",
      axis: "x",
      intersect: false,
    },
    scales: {
      y: {
        stacked: true,
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          font: { size: 11 },
          color: "#64748b",
          callback: (val) => yAxisMills(val),
        },
      },
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 11 } },
      },
    },
  };
}

export type RealEvolSeries = {
  labels: string[];
  copaCurrent: number[];
  copaPrevReal: number[];
  masaCurrent: number[];
  masaPrevReal: number[];
  barPeriods: { year: number; label: string }[];
};

export function buildRealEvolutionSeries(
  dashboard: MonitorJson,
  periodId: string,
): RealEvolSeries | null {
  const periods = dashboard.meta.available_periods;
  const selectedIdx = periods.findIndex((p) => p.id === periodId);
  if (selectedIdx === -1) return null;

  const startIndex = Math.max(0, selectedIdx - 2);
  const chartPeriods: PeriodMeta[] = periods.slice(startIndex, selectedIdx + 1);

  const labels: string[] = [];
  const copaCurrent: number[] = [];
  const copaPrevReal: number[] = [];
  const masaCurrent: number[] = [];
  const masaPrevReal: number[] = [];
  const barPeriods = chartPeriods.map((p) => ({ year: p.year, label: p.label }));

  chartPeriods.forEach((p) => {
    const periodData = dashboard.data[p.id];
    if (!periodData) return;

    const shortLabel = p.label.substring(0, 3) + " " + p.year.toString().slice(-2);
    labels.push(shortLabel);

    const copaNom =
      periodData.kpi.recaudacion.disponible_current ?? periodData.kpi.recaudacion.current ?? 0;
    const inflation = (periodData.kpi.recaudacion.ipc_used_for_calc ?? 0) / 100;
    const copaPrevNom =
      periodData.kpi.recaudacion.disponible_prev ?? periodData.kpi.recaudacion.prev ?? 0;
    const copaPrevR = copaPrevNom * (1 + inflation);

    copaCurrent.push(copaNom);
    copaPrevReal.push(copaPrevR);

    const masaNom = periodData.kpi.masa_salarial.current ?? 0;
    const masaPrevNom = periodData.kpi.masa_salarial.prev ?? 0;
    const masaPrevR = masaPrevNom * (1 + inflation);

    masaCurrent.push(masaNom);
    masaPrevReal.push(masaPrevR);
  });

  return { labels, copaCurrent, copaPrevReal, masaCurrent, masaPrevReal, barPeriods };
}

export function buildBarComparison(
  labels: string[],
  labelBase: string,
  data1: number[],
  data2: number[],
  color1: string,
  barPeriods: { year: number; label: string }[],
): ChartData<"bar"> {
  return {
    labels,
    datasets: [
      {
        label: "Actual",
        data: data1,
        backgroundColor: color1,
        borderRadius: 4,
      },
      {
        label: "Año Anterior",
        data: data2,
        backgroundColor: "#94a3b8",
        borderRadius: 4,
      },
    ],
  };
}

export function barComparisonOptions(labelBase: string, barPeriods: { year: number; label: string }[]): ChartOptions<"bar"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: { usePointStyle: true, padding: 15 },
      },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label(ctx) {
            const p = barPeriods[ctx.dataIndex];
            if (!p) return "";
            const isPrev = ctx.datasetIndex === 1;
            const year = isPrev ? p.year - 1 : p.year;
            const value = new Intl.NumberFormat(esAR).format(Math.round(Number(ctx.raw)));
            return `${labelBase} ${year}: $${value} M`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          callback: (val) => yAxisMills(val),
        },
      },
      x: {
        grid: { display: false },
      },
    },
  };
}
