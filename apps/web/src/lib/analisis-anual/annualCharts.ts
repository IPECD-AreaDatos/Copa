import type { ChartData, ChartOptions } from "chart.js";
import { formatBillions, formatMillions, formatPercentage } from "./format";

export type CopaVsAnnualShape = {
  labels: string[];
  cumulative_copa: (number | null)[];
  cumulative_bruta?: (number | null)[];
  salario_target: (number | null)[];
  cumulative_esperada?: (number | null)[];
};

export type MonthlyAnnualShape = {
  labels: string[];
  data_curr: number[];
  data_prev: number[];
};

function normalizeToMillions(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  // Si viene en pesos, lo llevamos a millones para mantener formato consistente.
  return Math.abs(value) >= 1_000_000_000 ? value / 1_000_000 : value;
}

export function buildMonthlyAnnualData(
  monthlyData: MonthlyAnnualShape,
  currentYear: number,
  prevYear: number,
  isMobile: boolean,
): ChartData<"bar"> {
  let chartLabels = Array.isArray(monthlyData?.labels) ? [...monthlyData.labels] : [];
  let dataCurrNet = Array.isArray(monthlyData?.data_curr)
    ? monthlyData.data_curr.map((v) => normalizeToMillions(v) ?? 0)
    : [];
  let dataPrevNet = Array.isArray(monthlyData?.data_prev)
    ? monthlyData.data_prev.map((v) => normalizeToMillions(v) ?? 0)
    : [];

  if (isMobile) {
    const quarterLabels = ["T1", "T2", "T3", "T4"];
    const qCurr = [0, 0, 0, 0];
    const qPrev = [0, 0, 0, 0];
    for (let i = 0; i < dataCurrNet.length; i++) {
      const q = Math.floor(i / 3);
      if (q < 4) {
        qCurr[q] += dataCurrNet[i] || 0;
        qPrev[q] += dataPrevNet[i] || 0;
      }
    }
    chartLabels = quarterLabels;
    dataCurrNet = qCurr;
    dataPrevNet = qPrev;
  }

  return {
    labels: chartLabels,
    datasets: [
      {
        label: `Año ${currentYear}`,
        data: dataCurrNet,
        backgroundColor: "rgba(16, 185, 129, 0.85)",
        borderRadius: 4,
        borderSkipped: false,
        order: 1,
      },
      {
        label: `Año ${prevYear}`,
        data: dataPrevNet,
        backgroundColor: "#94a3b8",
        borderRadius: 4,
        borderSkipped: false,
        order: 2,
      },
    ],
  };
}

export function monthlyAnnualOptions(): ChartOptions<"bar"> {
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
              return `${label}: ${formatBillions(y)}`;
            }
            return "";
          },
          afterBody(tooltipItems) {
            const valCurr = Number(tooltipItems[0]?.raw ?? 0);
            const valPrev = Number(tooltipItems[1]?.raw ?? 0);
            if (valCurr > 0 && valPrev > 0) {
              const diff = valCurr - valPrev;
              const sign = diff > 0 ? "+" : "";
              return `\nVar. Nominal: ${sign}${formatBillions(diff)}`;
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
          callback: (val) => formatBillions(Number(val)),
        },
      },
    },
    interaction: { mode: "index", intersect: false },
  };
}

export function buildCopaVsAnnualMixed(
  dataCopa: CopaVsAnnualShape,
  isMobile: boolean,
): ChartData<"bar" | "line"> {
  let chartLabels = Array.isArray(dataCopa?.labels) ? [...dataCopa.labels] : [];
  let cumulativeCopaNet = Array.isArray(dataCopa?.cumulative_copa)
    ? dataCopa.cumulative_copa.map((v) => normalizeToMillions(v))
    : [];
  let salarioTarget = Array.isArray(dataCopa?.salario_target)
    ? dataCopa.salario_target.map((v) => normalizeToMillions(v))
    : [];

  if (isMobile) {
    const quarterEndIndices = [2, 5, 8, 11];
    const qLabels = ["T1", "T2", "T3", "T4"];
    const sampledLabels: string[] = [];
    const sampledCopa: (number | null)[] = [];
    const sampledSalario: (number | null)[] = [];
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

  const colorPrimary = "#10b981";
  const colorAccent = "#af2f2f";

  return {
    labels: chartLabels,
    datasets: [
      {
        type: "line",
        label: "Masa Salarial Objetivo Acum.",
        data: salarioTarget as number[],
        borderColor: colorAccent,
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0.3,
        fill: false,
        yAxisID: "y",
        spanGaps: true,
        order: 0,
      },
      {
        type: "bar",
        label: "RON Disponible Acumulada",
        data: cumulativeCopaNet as number[],
        backgroundColor: "rgba(16, 185, 129, 0.8)",
        borderColor: colorPrimary,
        borderWidth: 1,
        borderRadius: 4,
        yAxisID: "y",
        order: 10,
      },
    ],
  };
}

export function copaVsAnnualOptions(): ChartOptions<"bar"> {
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
          sort: (a, b) => {
            const aMasa = a.text.includes("Masa Salarial");
            const bMasa = b.text.includes("Masa Salarial");
            if (aMasa === bMasa) return 0;
            return aMasa ? -1 : 1;
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
          label(ctx) {
            const label = ctx.dataset.label || "";
            const y = ctx.parsed.y;
            if (y !== null && !Number.isNaN(y)) {
              return `${label}: ${formatBillions(Number(y))}`;
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
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          font: { size: 11 },
          color: "#64748b",
          maxTicksLimit: 6,
          callback: (value) => formatBillions(Number(value)),
        },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 } },
      },
    },
  };
}

export type BrechaAnnualCard = {
  diffAbs: string;
  diffAbsClass: string;
  diffPct: string;
  diffPctClass: string;
  recaudado: string;
  esperada: string;
};

export function buildBrechaAnnualStacked(
  dataCopa: CopaVsAnnualShape,
  currentYear: number,
  maxMonth: number | undefined,
  isComplete: boolean | undefined,
  isMobile: boolean,
): { chartData: ChartData<"bar">; card: BrechaAnnualCard } | null {
  if (
    currentYear !== 2026 ||
    !dataCopa.cumulative_esperada ||
    !dataCopa.cumulative_copa
  ) {
    return null;
  }

  const expectedData = dataCopa.cumulative_esperada;
  const actualDataRaw = dataCopa.cumulative_bruta ?? dataCopa.cumulative_copa;

  const baseData: (number | null)[] = [];
  const faltanteData: (number | null)[] = [];
  const excedenteData: (number | null)[] = [];

  let lastActualVal = 0;
  let lastExpectedVal = 0;

  let limitMonthIndex = 12;
  if (maxMonth) {
    limitMonthIndex = isComplete ? maxMonth : maxMonth - 1;
  }

  for (let i = 0; i < expectedData.length; i++) {
    const exp = expectedData[i];
    const act = actualDataRaw[i];

    if (exp === null || act === null || i >= limitMonthIndex) {
      baseData.push(null);
      faltanteData.push(null);
      excedenteData.push(null);
    } else {
      lastActualVal = act as number;
      lastExpectedVal = exp as number;

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

  const diffAbs = lastActualVal - lastExpectedVal;
  const diffPct = lastExpectedVal > 0 ? (lastActualVal / lastExpectedVal - 1) * 100 : 0;
  const pctSign = diffPct > 0 ? "+" : "";
  const absSign = diffAbs > 0 ? "+" : diffAbs < 0 ? "-" : "";

  const card: BrechaAnnualCard = {
    diffAbs: absSign + formatMillions(Math.abs(diffAbs)),
    diffAbsClass: `kpi-value ${diffAbs >= 0 ? "text-success" : "text-danger"}`,
    diffPct: pctSign + formatPercentage(diffPct).replace("+", ""),
    diffPctClass: `kpi-value ${diffPct >= 0 ? "text-success" : "text-danger"}`,
    recaudado: formatMillions(lastActualVal),
    esperada: formatMillions(lastExpectedVal),
  };

  const colorActual = "#10b981";
  const colorFaltante = "#94a3b8";
  const colorExcedente = "#047857";

  let brechaLabels = dataCopa.labels;
  let brechaBase = baseData;
  let brechaFaltante = faltanteData;
  let brechaExcedente = excedenteData;

  if (isMobile) {
    const quarterEndIndices = [2, 5, 8, 11];
    const qLabels = ["T1", "T2", "T3", "T4"];
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

  const chartData: ChartData<"bar"> = {
    labels: brechaLabels,
    datasets: [
      {
        label: "Recaudación Acumulada",
        data: brechaBase as number[],
        backgroundColor: colorActual,
        borderColor: "rgba(255,255,255,0.2)",
        borderWidth: 1,
        stack: "Stack 0",
        barPercentage: 0.7,
      },
      {
        label: "Meta Pendiente (Faltante para Esperada)",
        data: brechaFaltante as number[],
        backgroundColor: "rgba(148, 163, 184, 0.4)",
        borderColor: colorFaltante,
        borderWidth: 1,
        stack: "Stack 0",
        barPercentage: 0.7,
      },
      {
        label: "Excedente (Por encima de la Esperada)",
        data: brechaExcedente as number[],
        backgroundColor: colorExcedente,
        borderColor: "#fff",
        borderWidth: 1,
        stack: "Stack 0",
        barPercentage: 0.7,
      },
    ],
  };

  return { chartData, card };
}

export function brechaAnnualChartOptions(): ChartOptions<"bar"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        align: "center",
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          padding: 15,
          font: { size: 12 },
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
            const y = ctx.parsed.y;
            if (y !== null && !Number.isNaN(y)) {
              return `${ctx.dataset.label}: ${formatMillions(y)}`;
            }
            return "";
          },
          afterBody(tooltipItems) {
            if (!tooltipItems?.length) return "";
            const act = Number(tooltipItems[0]?.raw ?? 0);
            const fal = Number(tooltipItems[1]?.raw ?? 0);
            const exc = Number(tooltipItems[2]?.raw ?? 0);
            const totalEsp = act + fal;
            const totalAct = act + exc;
            if (totalEsp > 0) {
              const pct = (totalAct / totalEsp) * 100;
              return `\n% del Esperado: ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(pct)}%`;
            }
            return "";
          },
        },
      },
    },
    interaction: {
      mode: "index",
      intersect: false,
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
      },
      y: {
        stacked: true,
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          callback: (val) => formatBillions(Number(val)),
        },
      },
    },
  };
}
