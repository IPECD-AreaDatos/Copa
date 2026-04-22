"use client";

import "@/lib/chart/registerChartJs";

import { Bar, Line } from "react-chartjs-2";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type { ChartOptions } from "chart.js";

type Period = {
  id: string;
  label: string;
  year: number;
  month: number;
};

type MainJson = {
  meta: {
    default_period_id: string;
    available_periods: Period[];
  };
  data: Record<
    string,
    {
      kpi: {
        recaudacion: { bruta_current: number; ipc_missing: boolean };
        rop?: { bruta_current: number };
        resumen: { total_recursos_brutos_var_real: number | null };
        masa_salarial: {
          cobertura_current: number;
          var_real: number | null;
          is_incomplete: boolean;
          ipc_missing: boolean;
          current: number;
        };
        distribucion_municipal?: { current: number };
      };
    }
  >;
  global_charts: {
    labels: string[];
    total_var_interanual?: number[];
    copa_var_interanual?: number[];
    ipc_var_interanual: number[];
  };
};

function fmtPct(value: number | null | undefined, opts: { coverage?: boolean; signed?: boolean } = {}) {
  if (value === null || value === undefined) return null;
  const formatter = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (opts.coverage) {
    return { text: formatter.format(value) + "%", className: "text-accent" };
  }
  const formatted = formatter.format(Math.abs(value)) + "%";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  let className = "";
  if (opts.signed !== false) {
    if (value > 0) className = "text-success";
    else if (value < 0) className = "text-danger";
  }
  return { text: sign + formatted, className };
}

function fmtMissing(reason?: string | null) {
  if (reason === "IPC") {
    return { text: "Sin IPC completo", className: "text-secondary text-missing" };
  }
  return { text: "Sin datos", className: "text-secondary" };
}

function KpiCard({
  tooltip,
  label,
  value,
  valueClassName = "",
  subtitle,
}: {
  tooltip: string;
  label: string;
  value: string;
  valueClassName?: string;
  subtitle?: ReactNode;
}) {
  return (
    <article className="kpi-card" style={{ flex: "1 1 300px", maxWidth: "350px" }}>
      <div className="info-tooltip" data-tooltip={tooltip}>
        ?
      </div>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${valueClassName}`.trim()}>{value}</div>
      {subtitle ? <div className="kpi-sub">{subtitle}</div> : <div className="kpi-sub" />}
    </article>
  );
}

function buildExecutiveChart(mainData: MainJson, isMobile: boolean) {
  const chartData = mainData.global_charts;
  const maxPeriods = isMobile ? 6 : chartData.labels.length;
  const labels = chartData.labels.slice(-maxPeriods);
  const totalRaw = chartData.total_var_interanual ?? chartData.copa_var_interanual ?? [];
  const total_var_interanual = totalRaw.slice(-maxPeriods);
  const ipc_var_interanual = chartData.ipc_var_interanual.slice(-maxPeriods);

  return {
    labels,
    datasets: [
      {
        label: "Var. Interanual Rec. Totales (%)",
        data: total_var_interanual,
        borderColor: "#10b981",
        backgroundColor: "transparent",
        borderWidth: 3,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false,
      },
      {
        label: "Inflación Interanual (%)",
        data: ipc_var_interanual,
        borderColor: "#94a3b8",
        backgroundColor: "transparent",
        borderWidth: 2,
        borderDash: [5, 5],
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: false,
      },
    ],
  };
}

function buildCoverageChart(mainData: MainJson, periodId: string, isMobile: boolean) {
  const periods = mainData.meta.available_periods;
  const selectedIdx = periods.findIndex((p) => p.id === periodId);
  if (selectedIdx === -1) return null;

  const numMonths = isMobile ? 6 : 12;
  const startIndex = Math.max(0, selectedIdx - (numMonths - 1));
  const chartPeriods = periods.slice(startIndex, selectedIdx + 1);

  const labels: string[] = [];
  const masaSalarialPctData: number[] = [];
  const municipiosPctData: number[] = [];
  const restoCopaPctData: number[] = [];

  chartPeriods.forEach((p) => {
    const pData = mainData.data[p.id];
    if (!pData) return;

    const shortLabel = p.label.substring(0, 3) + " " + p.year.toString().slice(-2);
    labels.push(shortLabel);

    const ronBrutaM = pData.kpi.recaudacion.bruta_current || 0;
    const ropBrutaM = pData.kpi.rop ? pData.kpi.rop.bruta_current || 0 : 0;
    const masaSalarialM = pData.kpi.masa_salarial.current;
    const distMuniM = pData.kpi.distribucion_municipal?.current ?? ronBrutaM * 0.19;
    const isMasaIncomplete = pData.kpi.masa_salarial.is_incomplete;

    let masaSalarial = masaSalarialM * 1000000;
    let recaudacionTotal = (ronBrutaM + ropBrutaM) * 1000000;
    let municipios = distMuniM * 1000000;

    let restoCopa = Math.max(0, recaudacionTotal - masaSalarial - municipios);

    if (isMasaIncomplete || masaSalarial === 0) {
      masaSalarial = 0;
      restoCopa = Math.max(0, recaudacionTotal - municipios);
    }

    const total = recaudacionTotal;
    let masaPct = 0;
    let municipiosPct = 0;
    let restoPct = 0;

    if (total > 0) {
      masaPct = (masaSalarial / total) * 100;
      municipiosPct = (municipios / total) * 100;
      restoPct = Math.max(0, 100 - (masaPct + municipiosPct));
    }

    masaSalarialPctData.push(masaPct);
    municipiosPctData.push(municipiosPct);
    restoCopaPctData.push(restoPct);
  });

  let subtitle = "Masa Salarial, Municipios vs Resto de RON (Evolución)";
  if (chartPeriods.length > 0) {
    const startLabel = `${chartPeriods[0].label} ${chartPeriods[0].year}`;
    const endLabel = `${chartPeriods[chartPeriods.length - 1].label} ${chartPeriods[chartPeriods.length - 1].year}`;
    subtitle =
      startLabel !== endLabel
        ? `Evolución Cobertura (${startLabel} a ${endLabel})`
        : `Evolución Cobertura (${startLabel})`;
  }

  return {
    subtitle,
    data: {
      labels,
      datasets: [
        {
          label: "Masa Salarial",
          data: masaSalarialPctData,
          backgroundColor: "#10b981",
          borderWidth: 0,
          barPercentage: 0.6,
        },
        {
          label: "Municipios",
          data: municipiosPctData,
          backgroundColor: "#fdba74",
          borderWidth: 0,
          barPercentage: 0.6,
        },
        {
          label: "Resto Recursos Totales",
          data: restoCopaPctData,
          backgroundColor: "#94a3b8",
          borderWidth: 0,
          barPercentage: 0.6,
        },
      ],
    },
  };
}

const lineChartOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: "index",
    intersect: false,
  },
  plugins: {
    legend: {
      position: "top",
      labels: {
        color: "#64748b",
        font: { weight: "bold" },
        usePointStyle: true,
        padding: 20,
      },
    },
    tooltip: {
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      titleColor: "#1e293b",
      bodyColor: "#475569",
      borderColor: "rgba(0,0,0,0.1)",
      borderWidth: 1,
      padding: 12,
      callbacks: {
        label: (ctx) => {
          let label = ctx.dataset.label || "";
          if (label) label += ": ";
          const y = ctx.parsed.y;
          if (y !== null && y !== undefined) {
            label += Math.round(Number(y)) + "%";
          }
          return label;
        },
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: "rgba(0,0,0,0.05)" },
      ticks: {
        callback: (val) =>
          Number(val).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "%",
      },
    },
    x: {
      grid: { display: false },
    },
  },
};

const barCoverageOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: { usePointStyle: true, padding: 20 },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const raw = ctx.raw as number;
          const pctVal = raw.toFixed(1);
          return `${ctx.dataset.label}: ${pctVal}%`;
        },
      },
    },
  },
  scales: {
    x: {
      stacked: true,
      grid: { display: false },
    },
    y: {
      stacked: true,
      beginAtZero: true,
      max: 100,
      ticks: {
        callback: (value) => value + "%",
      },
      grid: { color: "rgba(0,0,0,0.05)" },
    },
  },
};

export default function HomeDashboard() {
  const [mainData, setMainData] = useState<MainJson | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPeriodId, setCurrentPeriodId] = useState<string>("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    fetch("/data/_data_ipce_v1.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: MainJson) => {
        setMainData(d);
        setCurrentPeriodId(d.meta.default_period_id);
      })
      .catch(() => setLoadError("No se pudieron cargar los datos del tablero."));
  }, []);

  const defaultPeriodIndex = useMemo(() => {
    if (!mainData) return -1;
    return mainData.meta.available_periods.findIndex((p) => p.id === mainData.meta.default_period_id);
  }, [mainData]);

  const kpis = useMemo(() => {
    if (!mainData || !currentPeriodId || !mainData.data[currentPeriodId]) {
      return null;
    }
    const row = mainData.data[currentPeriodId];
    const periods = mainData.meta.available_periods;
    const periodObj = periods.find((p) => p.id === currentPeriodId);
    const year = currentPeriodId.split("-")[0];
    const periodLabel = periodObj?.label ?? "Periodo";

    const isPeriodIncomplete = row.kpi.masa_salarial.is_incomplete;
    const periodStatus = isPeriodIncomplete ? " (incompleto)" : "";
    const periodLabelFinal = `${periodLabel} ${year}${periodStatus}`;

    const resumen = row.kpi.resumen;
    const isIpcNacionMissing = row.kpi.recaudacion.ipc_missing;
    const kpiTotalReal = isIpcNacionMissing ? null : resumen.total_recursos_brutos_var_real;

    let copa: ReturnType<typeof fmtPct> | ReturnType<typeof fmtMissing>;
    if (kpiTotalReal === null || kpiTotalReal === undefined) {
      copa = fmtMissing(isIpcNacionMissing ? "IPC" : null);
    } else {
      copa = fmtPct(kpiTotalReal)!;
    }

    const masaData = row.kpi.masa_salarial;
    const kpiCobertura = masaData.cobertura_current;
    const cobertura = fmtPct(kpiCobertura, { coverage: true })!;

    const isIpcNeaMissingMasa = masaData.ipc_missing;
    const kpiMasaReal =
      masaData.is_incomplete || isIpcNeaMissingMasa ? null : masaData.var_real;

    let masa: ReturnType<typeof fmtPct> | ReturnType<typeof fmtMissing>;
    if (kpiMasaReal === null || kpiMasaReal === undefined) {
      masa = fmtMissing(isIpcNeaMissingMasa ? "IPC" : null);
    } else {
      masa = fmtPct(kpiMasaReal)!;
    }

    const subStyleIncomplete = isPeriodIncomplete ? "#ef4444" : "#1e293b";

    return {
      copa: { ...copa, subtitleColor: subStyleIncomplete, periodLabelFinal },
      cobertura,
      masa: { ...masa, subtitleColor: subStyleIncomplete, periodLabelFinal },
    };
  }, [mainData, currentPeriodId]);

  const executiveData = useMemo(() => {
    if (!mainData) return null;
    return buildExecutiveChart(mainData, isMobile);
  }, [mainData, isMobile]);

  const coverage = useMemo(() => {
    if (!mainData || !currentPeriodId) return null;
    return buildCoverageChart(mainData, currentPeriodId, isMobile);
  }, [mainData, currentPeriodId, isMobile]);

  const onPeriodChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const selectedId = e.target.value;
      setCurrentPeriodId(selectedId);

      const opt = e.target.selectedOptions[0];
      if (opt?.dataset.incomplete === "true") {
        e.target.style.color = "#ef4444";
        alert(
          "Atención: El periodo seleccionado aún cuenta con datos incompletos. Las variaciones y proyecciones pueden cambiar significativamente hasta el cierre definitivo.",
        );
      } else {
        e.target.style.color = "";
      }
    },
    [],
  );

  const periodOptions = useMemo(() => {
    if (!mainData || defaultPeriodIndex < 0) return [];
    const reversed = [...mainData.meta.available_periods].reverse();
    return reversed.map((p) => {
      const pIndex = mainData.meta.available_periods.findIndex((per) => per.id === p.id);
      const incomplete = pIndex > defaultPeriodIndex;
      let label = `${p.label} ${p.year}`;
      if (incomplete) label += " (Incompleto)";
      return { period: p, label, incomplete };
    });
  }, [mainData, defaultPeriodIndex]);

  useEffect(() => {
    if (!mainData || !currentPeriodId) return;
    const sel = document.getElementById("monthSelector") as HTMLSelectElement | null;
    const opt = sel?.selectedOptions[0];
    if (opt?.dataset.incomplete === "true") sel!.style.color = "#ef4444";
    else if (sel) sel.style.color = "";
  }, [mainData, currentPeriodId]);

  return (
    <>
      <header className="dashboard-header">
        <div className="title-block">
          <h1 className="text-gradient dashboard-title">Tablero Ejecutivo Provincial</h1>
        </div>
        <div className="period-select-wrapper">
          <label htmlFor="monthSelector" className="period-label">
            Período:
          </label>
          <select
            id="monthSelector"
            className="period-select"
            value={currentPeriodId}
            onChange={onPeriodChange}
            disabled={!mainData}
          >
            {!mainData ? (
              <option value="">Cargando…</option>
            ) : (
              periodOptions.map(({ period, label, incomplete }) => (
                <option key={period.id} value={period.id}>
                  {label}
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      <section className="section-group">
        <div className="hero-grid-flex">
          <KpiCard
            tooltip={`Muestra la variación porcentual interanual de los ingresos provinciales totales provenientes tanto de los Recursos de Origen Nacional disponibles (RON) como de los Recursos de Origen Provincial (ROP) en términos reales del período seleccionado respecto al mismo período del año anterior. 
Para ello, primero se ajustan (deflactan) los ingresos provenientes de los Recursos de Origen Nacional y Recursos de Origen Provincial utilizando el IPC nivel general del total País, con el objetivo de eliminar el efecto de la inflación. Luego, se calcula la variación entre el período elegido y el mismo período del año anterior. De esta manera, el indicador refleja si hubo un aumento o una disminución en el poder de compra de esos recursos.`}
            label="VARIACIÓN REAL RECURSOS TOTALES"
            value={kpis?.copa.text ?? "Loading..."}
            valueClassName={kpis?.copa.className ?? ""}
            subtitle={
              kpis ? (
                <span style={{ color: kpis.copa.subtitleColor }}>
                  Variación i.a. Deflactada | {kpis.copa.periodLabelFinal}
                </span>
              ) : (
                <span style={{ color: "var(--text-secondary)" }}>Variación i.a. Deflactada</span>
              )
            }
          />
          <KpiCard
            tooltip={`Muestra que proporción de los recursos de origen nacional disponibles se utilizan para pagar el total de la masa salarial liquidada. Masa salarial total/Recursos totales

La masa salarial incluye los conceptos de salarios,  plus y bonos para los 3 poderes del estado.

El valor de Recursos totales incluye todos los ingresos provenientes de Recursos de Origen Nacional (RON) y los Recursos de Origen Provincial (ROP).`}
            label="Cobertura Salarial"
            value={kpis?.cobertura.text ?? "Loading..."}
            valueClassName={kpis?.cobertura.className ?? ""}
          />
          <KpiCard
            tooltip={`Muestra la variación porcentual interanual de la masa salarial total liquidada en términos reales del período seleccionado respecto al mismo período del año anterior.
Para ello, la masa salarial liquidada se ajusta por inflación utilizando el IPC general del NEA, con el objetivo de obtener su valor real. Luego se compara el período seleccionado con el mismo período del año previo. De esta manera, el indicador permite analizar la evolución de la masa salarial en términos de poder adquisitivo.
La masa salarial total incluye los conceptos de salarios,  plus y bonos para los 3 poderes del estado.`}
            label="VARIACIÓN REAL MASA SALARIAL"
            value={kpis?.masa.text ?? "Loading..."}
            valueClassName={kpis?.masa.className ?? ""}
            subtitle={
              kpis ? (
                <span style={{ color: kpis.masa.subtitleColor }}>
                  Variación i.a. Deflactada | {kpis.masa.periodLabelFinal}
                </span>
              ) : (
                <span style={{ color: "var(--text-secondary)" }}>* Ajustado por inflación</span>
              )
            }
          />
        </div>
        <p className="source-text">
          Fuente: INDEC, Ministerio de Economía de la Nación y Contaduría General de la Provincia de Corrientes
        </p>
      </section>

      <section className="section-group">
        <div className="charts-grid-half">
          <div className="chart-container" style={{ marginBottom: 0 }}>
            <div
              className="info-tooltip"
              data-tooltip="Permite comparar la evolución de la variación interanual de los ingresos provinciales tanto los provenientes de los Recursos de Origen Nacional como los de Recursos de Origen Provincial.  y el IPC nivel general del total país."
            >
              ?
            </div>
            <div className="section-header">
              <div>
                <h2 className="section-title">Recursos Totales vs Inflación</h2>
                <p className="section-subtitle">Relación de variaciones interanuales últimos 12 meses</p>
              </div>
            </div>
            <div className="chart-wrapper">
              {executiveData ? (
                <Line data={executiveData} options={lineChartOptions} />
              ) : (
                <div className="chart-placeholder">Cargando gráfico…</div>
              )}
            </div>
            <p className="source-text">
              Fuente: INDEC y Ministerio de Economía de la Nación
            </p>
          </div>

          <div className="chart-container" style={{ marginBottom: 0 }}>
            <div
              className="info-tooltip"
              data-tooltip="Muestra la evolución a lo largo del tiempo del porcentaje de los ingresos provinciales provenientes de los recursos tanto de RON como de ROP, que se utilizan para pagar el total de la masa salarial y la distribución a municipios."
            >
              ?
            </div>
            <div className="section-header">
              <div>
                <h2 className="section-title">Cobertura de Gastos</h2>
                <p className="section-subtitle">{coverage?.subtitle ?? "Masa Salarial, Municipios vs Resto de RON (Evolución)"}</p>
              </div>
            </div>
            <div className="chart-wrapper">
              {coverage?.data ? (
                <Bar data={coverage.data} options={barCoverageOptions} />
              ) : (
                <div className="chart-placeholder">Cargando gráfico…</div>
              )}
            </div>
            <p className="source-text">
              Fuente: Contaduría General de la Provincia de Corrientes y Ministerio de Economía de la Nación
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
