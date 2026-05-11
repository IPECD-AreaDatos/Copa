import type { ChartData, ChartOptions } from "chart.js";
import {
  CODIGOS_PARTIDA,
  FUENTE_VALUES,
  ORDEN_JURISDICCIONES,
  ORDEN_PARTIDAS,
  SHORT_JURISDICCIONES,
  partidaColors,
} from "./constants";

export type GastoRow = {
  periodo: string;
  jurisdiccion: string;
  partida: string;
  estado: string;
  monto: number;
  tipo_financ: string | number;
};

const numFmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pctFmt1 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctFmt0 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Porcentajes en pantalla: siempre 1 decimal (es-AR). */
export function formatPctOneDecimal(n: number) {
  return pctFmt1.format(n) + "%";
}

/** Para heatmap: porcentajes SIN decimales (es-AR). */
export function formatPctNoDecimals(n: number) {
  return pctFmt0.format(n) + "%";
}

export function format1M(val: number) {
  return "$" + numFmt.format(Math.round(val / 1_000_000)) + " M";
}

export function formatPeriodo(isoStr: string) {
  const parts = isoStr.split("-");
  if (parts.length !== 2) return isoStr;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1);
  const m = d.toLocaleString("es-ES", { month: "long" });
  return m.charAt(0).toUpperCase() + m.slice(1) + " " + parts[0];
}

function interpolateColor(c1: number[], c2: number[], t: number) {
  return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * t)},${Math.round(c1[1] + (c2[1] - c1[1]) * t)},${Math.round(c1[2] + (c2[2] - c1[2]) * t)})`;
}

export function heatmapColor(ratio: number) {
  const r = Math.min(ratio, 1.5);
  if (r <= 0.5) return interpolateColor([16, 185, 129], [251, 191, 36], r / 0.5);
  if (r <= 1.0) return interpolateColor([251, 191, 36], [249, 115, 22], (r - 0.5) / 0.5);
  return interpolateColor([249, 115, 22], [239, 68, 68], Math.min((r - 1.0) / 0.5, 1));
}

export type HeatmapInput = {
  rawData: GastoRow[];
  estado: string;
  jurisGroup: string;
  fuenteFilter: string[] | null;
};

export function computeHeatmap({ rawData, estado, jurisGroup, fuenteFilter }: HeatmapInput) {
  const periodos = [...new Set(rawData.map((d) => d.periodo))].sort();
  const ultimoPeriodo = periodos.length > 0 ? periodos[periodos.length - 1] : "";
  const currentYear = ultimoPeriodo.split("-")[0]; // Extraemos el año fiscal actual (ej: "2026")

  const matchFuente = (d: GastoRow) => {
    if (!fuenteFilter || fuenteFilter.length === 0 || fuenteFilter.length === FUENTE_VALUES.length)
      return true;
    return fuenteFilter.includes(String(d.tipo_financ));
  };

  const estadoAcum: Record<string, number> = {};
  const vigente: Record<string, number> = {};
  const filteredRows = rawData.filter((d) => matchFuente(d));

  filteredRows.forEach((d) => {
    const j = (d.jurisdiccion || "").trim();
    const key = `${d.partida}|${j}`;
    const rowYear = d.periodo.split("-")[0];

    // IMPORTANTE: Solo acumulamos datos del año fiscal actual para evitar inflar porcentajes con años anteriores
    if (rowYear === currentYear) {
      if (d.estado === estado) estadoAcum[key] = (estadoAcum[key] || 0) + d.monto;
    }
    
    // El crédito vigente lo tomamos siempre del último mes reportado para ese año
    if (d.estado === "Credito Vigente" && d.periodo === ultimoPeriodo) vigente[key] = (vigente[key] || 0) + d.monto;
  });

  const jurisVistasEnBD = new Set(filteredRows.map((d) => (d.jurisdiccion || "").trim()));
  const jurisdicciones = ORDEN_JURISDICCIONES.filter((j) => jurisVistasEnBD.has(j));

  let visibleJuris = jurisdicciones.filter((j) => {
    if (jurisGroup === "TODAS") return true;
    const isMin = j.includes("MINISTERIO");
    if (jurisGroup === "MINISTERIOS") return isMin;
    if (jurisGroup === "RESTO") return !isMin;
    return true;
  });

  visibleJuris.sort((a, b) => {
    let vigA = 0;
    let vigB = 0;
    ORDEN_PARTIDAS.forEach((p) => {
      vigA += vigente[`${p}|${a}`] || 0;
      vigB += vigente[`${p}|${b}`] || 0;
    });
    if (vigB !== vigA) return vigB - vigA;
    return ORDEN_JURISDICCIONES.indexOf(a) - ORDEN_JURISDICCIONES.indexOf(b);
  });

  const rows = ORDEN_PARTIDAS.map((p) => {
    const code = CODIGOS_PARTIDA[p];
    const cells = visibleJuris.map((j) => {
      const key = `${p}|${j}`;
      const comp = estadoAcum[key] || 0;
      const vig = vigente[key] || 0;
      const ratio = vig > 0 ? comp / vig : 0;
      const pct = Math.round(ratio * 100);
      const color = heatmapColor(ratio);
      return { j, pct, color, title: `${p}\n${j}\n${estado}/Vigente: ${formatPctNoDecimals(pct)}` };
    });
    return { partida: p, code, cells };
  });

  return {
    ultimoPeriodo,
    visibleJuris,
    rows,
    heatmapTitle: ultimoPeriodo
      ? `Mapa de Calor de Compromiso por Jurisdicción Acumulado hasta ${formatPeriodo(ultimoPeriodo)}`
      : "Mapa de Calor",
    shortName: (j: string) => SHORT_JURISDICCIONES[j] || j,
  };
}

export type TableInput = {
  rawData: GastoRow[];
  periodoSel: string[] | null;
  fuenteSel: string[] | null;
  jurisSel: string[] | null;
};

export function computeCompositionTable(inp: TableInput) {
  const allPeriodos = [...new Set(inp.rawData.map((d) => d.periodo))].sort();
  let selectedPeriodos = allPeriodos;
  if (inp.periodoSel && inp.periodoSel.length > 0 && inp.periodoSel.length < allPeriodos.length) {
    const sel = inp.periodoSel;
    selectedPeriodos = allPeriodos.filter((p) => sel.includes(p));
  }
  const maxPeriodo =
    selectedPeriodos.length > 0 ? selectedPeriodos[selectedPeriodos.length - 1] : "";

  const matchPeriodo = (d: GastoRow) =>
    !inp.periodoSel ||
    inp.periodoSel.length === 0 ||
    inp.periodoSel.length === allPeriodos.length
      ? true
      : inp.periodoSel.includes(d.periodo);

  const matchJuris = (d: GastoRow) => {
    if (
      !inp.jurisSel ||
      inp.jurisSel.length === 0 ||
      inp.jurisSel.length >= ORDEN_JURISDICCIONES.length
    )
      return true;
    return inp.jurisSel.includes((d.jurisdiccion || "").trim());
  };

  const matchFuente = (d: GastoRow) => {
    if (!inp.fuenteSel || inp.fuenteSel.length === 0 || inp.fuenteSel.length === FUENTE_VALUES.length)
      return true;
    return inp.fuenteSel.includes(String(d.tipo_financ));
  };

  const title =
    selectedPeriodos.length === 1
      ? `Composición del Gasto de ${formatPeriodo(selectedPeriodos[0])}`
      : selectedPeriodos.length > 0
        ? `Composición del Gasto (Acumulado hasta ${formatPeriodo(maxPeriodo)})`
        : "Composición del Gasto";

  const dataV = inp.rawData.filter(
    (d) =>
      d.periodo === maxPeriodo &&
      d.estado === "Credito Vigente" &&
      matchJuris(d) &&
      matchFuente(d),
  );
  const dataC = inp.rawData.filter(
    (d) => matchPeriodo(d) && d.estado === "Comprometido" && matchJuris(d) && matchFuente(d),
  );
  const dataO = inp.rawData.filter(
    (d) => matchPeriodo(d) && d.estado === "Ordenado" && matchJuris(d) && matchFuente(d),
  );

  const gV: Record<string, number> = {};
  const gC: Record<string, number> = {};
  const gO: Record<string, number> = {};
  ORDEN_PARTIDAS.forEach((p) => {
    gV[p] = 0;
    gC[p] = 0;
    gO[p] = 0;
  });
  dataV.forEach((d) => {
    if (gV[d.partida] !== undefined) gV[d.partida] += d.monto;
  });
  dataC.forEach((d) => {
    if (gC[d.partida] !== undefined) gC[d.partida] += d.monto;
  });
  dataO.forEach((d) => {
    if (gO[d.partida] !== undefined) gO[d.partida] += d.monto;
  });

  let tV = 0;
  let tC = 0;
  let tO = 0;
  const rows = ORDEN_PARTIDAS.map((p) => {
    tV += gV[p];
    tC += gC[p];
    tO += gO[p];
    return {
      partida: p,
      codigo: CODIGOS_PARTIDA[p],
      vigente: gV[p],
      comprometido: gC[p],
      ordenado: gO[p],
      pesoComp: gV[p] > 0 ? (gC[p] / gV[p]) * 100 : 0,
      pesoOrd: gV[p] > 0 ? (gO[p] / gV[p]) * 100 : 0,
      colorDot: partidaColors[p] || "#fff",
    };
  });

  return {
    title,
    rows,
    tV,
    tC,
    tO,
    totalPesoComp: tV > 0 ? formatPctOneDecimal((tC / tV) * 100) : formatPctOneDecimal(0),
    totalPesoOrd: tV > 0 ? formatPctOneDecimal((tO / tV) * 100) : formatPctOneDecimal(0),
  };
}

export type RatioInput = TableInput;

export function computeRatioChartData(inp: RatioInput): {
  chartData: ChartData<"bar" | "line">;
  options: ChartOptions<"bar">;
  subtitle: string;
} {
  const allPeriodos = [...new Set(inp.rawData.map((d) => d.periodo))].sort();
  let selectedPeriodos = allPeriodos;
  if (inp.periodoSel && inp.periodoSel.length > 0 && inp.periodoSel.length < allPeriodos.length) {
    selectedPeriodos = allPeriodos.filter((p) => inp.periodoSel!.includes(p));
  }
  const maxPeriodo =
    selectedPeriodos.length > 0 ? selectedPeriodos[selectedPeriodos.length - 1] : "";
  const numMeses = selectedPeriodos.length;

  const subtitle =
    numMeses === 1
      ? `Comprometido y Ordenado respecto al Crédito Vigente — ${formatPeriodo(selectedPeriodos[0])}`
      : `Comprometido y Ordenado respecto al Crédito Vigente (Acumulado de ${numMeses} meses)`;

  const matchPeriodo = (d: GastoRow) =>
    !inp.periodoSel ||
    inp.periodoSel.length === 0 ||
    inp.periodoSel.length === allPeriodos.length
      ? true
      : inp.periodoSel.includes(d.periodo);

  const matchJuris = (d: GastoRow) => {
    if (
      !inp.jurisSel ||
      inp.jurisSel.length === 0 ||
      inp.jurisSel.length >= ORDEN_JURISDICCIONES.length
    )
      return true;
    return inp.jurisSel.includes((d.jurisdiccion || "").trim());
  };

  const matchFuente = (d: GastoRow) => {
    if (!inp.fuenteSel || inp.fuenteSel.length === 0 || inp.fuenteSel.length === FUENTE_VALUES.length)
      return true;
    return inp.fuenteSel.includes(String(d.tipo_financ));
  };

  const fC = inp.rawData.filter(
    (d) =>
      matchPeriodo(d) && d.estado === "Comprometido" && matchJuris(d) && matchFuente(d),
  );
  const fV = inp.rawData.filter(
    (d) =>
      d.periodo === maxPeriodo &&
      d.estado === "Credito Vigente" &&
      matchJuris(d) &&
      matchFuente(d),
  );
  const fO = inp.rawData.filter(
    (d) => matchPeriodo(d) && d.estado === "Ordenado" && matchJuris(d) && matchFuente(d),
  );

  const gC: Record<string, number> = {};
  const gV: Record<string, number> = {};
  const gO: Record<string, number> = {};
  ORDEN_PARTIDAS.forEach((p) => {
    gC[p] = 0;
    gV[p] = 0;
    gO[p] = 0;
  });
  fC.forEach((d) => {
    if (gC[d.partida] !== undefined) gC[d.partida] += d.monto;
  });
  fV.forEach((d) => {
    if (gV[d.partida] !== undefined) gV[d.partida] += d.monto;
  });
  fO.forEach((d) => {
    if (gO[d.partida] !== undefined) gO[d.partida] += d.monto;
  });

  const active = ORDEN_PARTIDAS.filter((p) => gV[p] > 0 || gC[p] > 0 || gO[p] > 0);
  const rC = active.map((p) => (gV[p] > 0 ? (gC[p] / gV[p]) * 100 : 0));
  const rO = active.map((p) => (gV[p] > 0 ? (gO[p] / gV[p]) * 100 : 0));
  const labels = active.map((p) => `${CODIGOS_PARTIDA[p]} - ${p}`);
  const origLabels = labels.map((l) => l.split(" - ")[1] || l);
  const targetRatio = (numMeses / 12) * 100;

  const chartData: ChartData<"bar" | "line"> = {
    labels,
    datasets: [
      {
        type: "line",
        label: `Ejecución Teórica (${numMeses}/12)`,
        data: labels.map(() => targetRatio),
        borderColor: "#ef4444",
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
        order: 1,
      },
      {
        type: "bar",
        label: "% Comprometido",
        data: rC,
        backgroundColor: origLabels.map((p) => (partidaColors[p] || "#3b82f6") + "b3"),
        borderRadius: 4,
        order: 2,
      },
      {
        type: "bar",
        label: "% Ordenado",
        data: rO,
        backgroundColor: origLabels.map((p) => partidaColors[p] || "#3b82f6"),
        borderRadius: 4,
        order: 3,
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label(ctx) {
            const y = ctx.parsed.y;
            if (y === undefined || y === null) return "";
            return ` ${ctx.dataset.label}: ${formatPctOneDecimal(Number(y))}`;
          },
        },
      },
      legend: {
        position: "top",
        labels: { color: "#64748b", usePointStyle: true, boxWidth: 8, padding: 10, font: { size: 10 } },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#64748b",
          font: { size: 10, weight: 600 },
          maxRotation: 45,
          minRotation: 45,
        },
        grid: { display: false },
      },
      y: {
        min: 0,
        suggestedMax: 100,
        ticks: {
          callback: (v) => formatPctOneDecimal(Number(v)),
          color: "#9CA3AF",
        },
        grid: { color: "rgba(0,0,0,0.05)" },
      },
    },
  };

  return { chartData, options, subtitle };
}

export type WaterfallInput = {
  rawData: GastoRow[];
  estado: string;
  year: string;
  jurisFilter: string[] | null;
  partidaFilter: string[] | null;
  fuente: string[] | null;
};

export function computeWaterfall(inp: WaterfallInput): {
  chartData: ChartData<"bar" | "line">;
  options: ChartOptions<"bar">;
} {
  const mj = (d: GastoRow) => {
    if (!inp.jurisFilter || inp.jurisFilter.length === 0) return true;
    return inp.jurisFilter.includes((d.jurisdiccion || "").trim());
  };
  const mp = (d: GastoRow) => {
    if (!inp.partidaFilter || inp.partidaFilter.length === 0) return true;
    return inp.partidaFilter.includes(d.partida);
  };
  const mf = (d: GastoRow) => {
    if (!inp.fuente || inp.fuente.length === 0) return true;
    return inp.fuente.includes(String(d.tipo_financ));
  };

  const periodos = [...new Set(inp.rawData.map((d) => d.periodo))].sort();
  if (periodos.length === 0) {
    return {
      chartData: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false },
    };
  }

  const year = inp.year || periodos[periodos.length - 1].split("-")[0];
  const lastPeriod = periodos[periodos.length - 1];
  const periodosDelAnio = periodos.filter((p) => p.startsWith(`${year}-`));
  const lastPeriodOfYear = periodosDelAnio.length
    ? periodosDelAnio[periodosDelAnio.length - 1]
    : lastPeriod;

  const vigData = inp.rawData.filter(
    (d) =>
      d.periodo === lastPeriodOfYear &&
      d.estado === "Credito Vigente" &&
      mj(d) &&
      mp(d) &&
      mf(d),
  );
  const creditoVigente = vigData.reduce((s, d) => s + d.monto, 0);

  const mesesNombres = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const periodoKeys: string[] = [];
  for (let m = 1; m <= 12; m++) periodoKeys.push(`${year}-${String(m).padStart(2, "0")}`);

  const monthlyData = periodoKeys.map((pk) => {
    const rows = inp.rawData.filter(
      (d) => d.periodo === pk && d.estado === inp.estado && mj(d) && mp(d) && mf(d),
    );
    return rows.reduce((s, d) => s + d.monto, 0);
  });

  const floatingBars = monthlyData.map((monto, idx) => {
    const base = idx / 12;
    const height = creditoVigente > 0 ? monto / creditoVigente : 0;
    return [base, base + height] as [number, number];
  });

  const hasData = periodoKeys.map((pk) =>
    inp.rawData.some(
      (d) => d.periodo === pk && d.estado === inp.estado && mj(d) && mp(d) && mf(d),
    ),
  );

  const barData = floatingBars.map((bar, idx) => (hasData[idx] ? bar : null));

  const lineDatasets = [];
  for (let i = 1; i <= 12; i++) {
    lineDatasets.push({
      type: "line" as const,
      label: i === 12 ? "Techos mensuales (1/12)" : "",
      data: mesesNombres.map(() => i / 12),
      borderColor: "rgba(100,116,139,0.3)",
      borderWidth: 1,
      borderDash: [3, 3],
      pointRadius: 0,
      fill: false,
      order: 1,
    });
  }

  const barColors = floatingBars.map((bar, idx) => {
    if (!hasData[idx]) return "rgba(0,0,0,0)";
    return bar[1] > ((idx + 1) / 12) * 1.05 ? "#f97316" : "#10b981";
  });

  const fmtARS = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const chartData: ChartData<"bar" | "line"> = {
    labels: mesesNombres,
    datasets: [
      {
        type: "bar",
        label: `% ${inp.estado} Acumulado`,
        data: barData as unknown as number[],
        backgroundColor: barColors,
        borderRadius: 4,
        order: 2,
        barPercentage: 0.7,
      },
      ...lineDatasets,
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label(ctx) {
            if (ctx.datasetIndex > 0) return "";
            const raw = ctx.raw as [number, number] | null;
            if (!raw || !Array.isArray(raw)) return "Sin datos";
            const idx = ctx.dataIndex;
            const monto = monthlyData[idx];
            const height = raw[1] - raw[0];
            return [
              `${inp.estado} del mes: ${fmtARS.format(monto)}`,
              `Ejecutado: ${formatPctOneDecimal(height * 100)} del Crédito Vigente`,
            ];
          },
        },
      },
      legend: {
        labels: {
          color: "#64748b",
          usePointStyle: true,
          boxWidth: 8,
          padding: 10,
          font: { size: 10 },
          filter: (item) => item.text !== "",
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#64748b", font: { size: 11, weight: 600 } },
        grid: { display: false },
      },
      y: {
        min: 0,
        max: 1,
        ticks: {
          callback: (v) => {
            const n = Math.round(Number(v) * 12);
            return n === 0 ? "0" : `${n}/12`;
          },
          stepSize: 1 / 12,
          color: "#9CA3AF",
          font: { size: 11 },
        },
        grid: { display: false },
      },
    },
  };

  return { chartData, options };
}
