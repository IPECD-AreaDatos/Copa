"use client";

import "@/lib/chart/registerChartJs";

import type { ChartData, ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

type PersonalJson = {
  meta: { default_period_id: string; available_periods: { id: string; label: string; year: number }[] };
  data: Record<
    string,
    {
      kpi: {
        empleados: number;
        periodo_actual: string;
        periodo_anterior: string;
        is_incomplete?: boolean;
        salario_promedio?: number;
        masa_salarial?: number;
        var_nominal_ia?: number;
        var_real_ia?: number | null;
        cbt_valor?: number | null;
        cbt_ratio?: number | null;
      };
      charts: {
        labels: string[];
        salario_promedio: number[];
        ripte_valor: number[];
      };
    }
  >;
};

function fmtCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPct(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

function fmtDecimal(value: number, digits = 1) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export default function AnalisisPersonalDashboard() {
  const [data, setData] = useState<PersonalJson | null>(null);
  const [periodId, setPeriodId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [wide768, setWide768] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const s = () => setWide768(mq.matches);
    s();
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);

  useEffect(() => {
    let c = false;
    fetch("/data/data_personal_v1.json")
      .then((r) => {
        if (!r.ok) throw new Error("No se pudieron cargar los datos.");
        return r.json() as Promise<PersonalJson>;
      })
      .then((j) => {
        if (c) return;
        setData(j);
        setPeriodId(j.meta.default_period_id || "");
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
    return () => {
      c = true;
    };
  }, []);

  const periods = data?.meta.available_periods ?? [];
  const defaultIndex = periods.findIndex((p) => p.id === data?.meta.default_period_id);
  const row = data && periodId ? data.data[periodId] : undefined;
  const kpi = row?.kpi;
  const charts = row?.charts;

  const lineData = useMemo((): ChartData<"line"> | null => {
    if (!charts) return null;
    const maxPeriods = wide768 ? 6 : charts.labels.length;
    const labels = charts.labels.slice(-maxPeriods);
    const sal = charts.salario_promedio.slice(-maxPeriods);
    const rip = charts.ripte_valor.slice(-maxPeriods);

    return {
      labels,
      datasets: [
        {
          label: "Salario Promedio Provincial",
          data: sal,
          borderColor: "#10b981",
          backgroundColor: "transparent",
          borderWidth: 3,
          pointBackgroundColor: "#10b981",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: false,
          yAxisID: "y",
        },
        {
          label: "RIPTE (Nacional)",
          data: rip,
          borderColor: "#0277BD",
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 3,
          tension: 0.3,
          fill: false,
          yAxisID: "y",
          spanGaps: true,
        },
      ],
    };
  }, [charts, wide768]);

  const lineOpts = useMemo(
    (): ChartOptions<"line"> => ({
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
          mode: "index",
          intersect: false,
          callbacks: {
            label(ctx) {
              let label = ctx.dataset.label || "";
              if (label) label += ": ";
              const y = ctx.parsed.y;
              if (y != null) {
                label += fmtCurrency(y);
              }
              return label;
            },
          },
        },
      },
      interaction: { mode: "nearest", axis: "x", intersect: false },
      scales: {
        y: {
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            font: { size: 11 },
            callback: (value) =>
              new Intl.NumberFormat("es-AR", {
                notation: "compact",
                style: "currency",
                currency: "ARS",
                maximumFractionDigits: 0,
              }).format(Number(value)),
          },
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
      },
    }),
    [],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      const idx = periods.findIndex((p) => p.id === v);
      if (defaultIndex >= 0 && idx > defaultIndex) {
        alert(
          "Atención: El periodo seleccionado aún cuenta con datos incompletos. Las variaciones y proyecciones pueden cambiar significativamente hasta el cierre definitivo.",
        );
      }
      setPeriodId(v);
    },
    [periods, defaultIndex],
  );

  if (err) {
    return (
      <div className="chart-container">
        <p style={{ color: "var(--accent-danger)" }}>{err}</p>
      </div>
    );
  }

  if (!data || !periodId || !kpi || !charts || !lineData) {
    return (
      <div className="chart-container">
        <p style={{ color: "var(--text-secondary)" }}>Cargando…</p>
      </div>
    );
  }

  const reversed = [...periods].reverse();
  const incomplete = kpi.is_incomplete;

  return (
    <>
      <div
        className="header-content"
        style={{
          marginBottom: "3rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          textAlign: "left",
        }}
      >
        <h1 className="text-gradient dashboard-title" style={{ marginBottom: 0 }}>
          Análisis de Empleo Público Provincial
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <label htmlFor="monthSelectorAp" style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
            Período:
          </label>
          <select
            id="monthSelectorAp"
            className="period-select"
            value={periodId}
            onChange={onChange}
            aria-label="Seleccionar periodo"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--card-bg)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-family)",
              fontSize: "1rem",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {reversed.map((p) => {
              const pi = periods.findIndex((x) => x.id === p.id);
              const inc = defaultIndex >= 0 && pi > defaultIndex;
              return (
                <option key={p.id} value={p.id} style={inc ? { color: "#ef4444" } : undefined}>
                  {p.label} {p.year}
                  {inc ? " (Incompleto)" : ""}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <p id="header-period" style={{ color: "var(--text-secondary)", marginBottom: "2rem", fontSize: "1rem" }}>
        Análisis de puestos de trabajo y masa salarial | {kpi.periodo_actual}
      </p>

      <section className="hero-grid-flex">
        <article className="kpi-card">
          <div className="info-tooltip" data-tooltip="Salario promedio y cantidad de empleados públicos.">?</div>
          <div className="kpi-label">Salario Promedio Bruto</div>
          <div className="kpi-value">{incomplete ? "Sin datos" : fmtCurrency(kpi.salario_promedio ?? 0)}</div>
          <div className="kpi-sub" id="kpi-employees">
            Empleados: {new Intl.NumberFormat("es-AR").format(kpi.empleados)} | {kpi.periodo_actual}
          </div>
        </article>
        <article className="kpi-card">
          <div className="info-tooltip" data-tooltip="Masa salarial total liquidada.">?</div>
          <div className="kpi-label">Masa Salarial</div>
          <div className="kpi-value">
            {incomplete
              ? "Sin datos"
              : new Intl.NumberFormat("es-AR", {
                  style: "currency",
                  currency: "ARS",
                  maximumFractionDigits: 0,
                  minimumFractionDigits: 0,
                }).format(kpi.masa_salarial ?? 0) + " M"}
          </div>
          <div className="kpi-sub">Total mensual liquidado</div>
        </article>
        <article className="kpi-card">
          <div className="info-tooltip" data-tooltip="Variación nominal interanual del salario promedio.">?</div>
          <div className="kpi-label">Variación Nominal</div>
          <div
            className={
              incomplete ? "kpi-value text-secondary" : `kpi-value ${(kpi.var_nominal_ia ?? 0) >= 0 ? "text-success" : "text-danger"}`
            }
          >
            {incomplete ? "Sin datos" : fmtPct(kpi.var_nominal_ia ?? 0)}
          </div>
          <div className="kpi-sub">{incomplete ? "-" : `vs ${kpi.periodo_anterior}`}</div>
        </article>
        <article className="kpi-card">
          <div className="info-tooltip" data-tooltip="Variación real interanual (IPC NEA).">?</div>
          <div className="kpi-label">Variación Real</div>
          <div
            className={
              incomplete
                ? "kpi-value text-secondary"
                : kpi.var_real_ia == null
                  ? "kpi-value text-secondary text-missing"
                  : `kpi-value ${(kpi.var_real_ia ?? 0) >= 0 ? "text-success" : "text-danger"}`
            }
          >
            {incomplete ? "Sin datos" : kpi.var_real_ia == null ? "Sin IPC completo" : fmtPct(kpi.var_real_ia)}
          </div>
          <div className="kpi-sub" style={{ color: "var(--text-secondary)" }}>
            {incomplete || kpi.var_real_ia == null ? "-" : "Variación i.a. Deflactada"}
          </div>
        </article>
      </section>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", paddingLeft: 10, marginTop: "-3rem", marginBottom: "4rem" }}>
        Fuente: Cálculo en base a datos de Contaduría General de la Provincia de Corrientes e INDEC
      </p>

      <div className="header-content" style={{ textAlign: "left", marginTop: "4rem", marginBottom: "2rem" }}>
        <h2 className="text-gradient dashboard-title" style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
          Relación Salario vs Canasta Básica
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>
          Comparativa con la Canasta Básica Total (CBT) por adulto equivalente calculada por el IPECD.
        </p>
      </div>

      <section className="hero-grid-flex">
        <article className="kpi-card">
          <div className="info-tooltip" data-tooltip="Valor CBT período seleccionado.">?</div>
          <div className="kpi-label">{`Valor CBT (${kpi.periodo_actual})`}</div>
          <div
            className={
              kpi.cbt_valor == null || kpi.cbt_valor === 0
                ? "kpi-value text-secondary text-missing"
                : "kpi-value"
            }
          >
            {kpi.cbt_valor == null || kpi.cbt_valor === 0 ? "Sin IPC completo" : fmtCurrency(kpi.cbt_valor)}
          </div>
          <div className="kpi-sub">Línea de Pobreza Individual</div>
        </article>
        <article className="kpi-card">
          <div className="info-tooltip" data-tooltip="Salario promedio en unidades de CBT.">?</div>
          <div className="kpi-label">Poder de Compra</div>
          <div
            className={
              incomplete || kpi.cbt_ratio == null || kpi.cbt_ratio === 0
                ? kpi.cbt_ratio === 0 || kpi.cbt_ratio == null
                  ? "kpi-value text-secondary text-missing"
                  : "kpi-value text-secondary"
                : `kpi-value ${kpi.cbt_ratio >= 1.5 ? "text-success" : "text-danger"}`
            }
          >
            {incomplete || kpi.cbt_ratio == null || kpi.cbt_ratio === 0
              ? kpi.cbt_ratio === 0 || kpi.cbt_ratio == null
                ? "Sin IPC completo"
                : "Sin datos"
              : fmtDecimal(kpi.cbt_ratio)}
          </div>
          <div className="kpi-sub">Canastas Básicas por Salario</div>
        </article>
      </section>

      <section className="chart-container" style={{ marginTop: "6rem" }}>
        <div className="info-tooltip" data-tooltip="Evolución salario promedio vs RIPTE.">?</div>
        <div className="section-header">
          <div>
            <h2 className="section-title">Evolución Salario Promedio vs RIPTE</h2>
            <p className="section-subtitle">Comparativa últimos 12 meses</p>
          </div>
        </div>
        <div className="chart-wrapper">
          <Line data={lineData} options={lineOpts} />
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "1rem" }}>
          Fuente: Contaduría General de la Provincia de Corrientes / Ministerio de Economía de la Nación (RIPTE)
        </p>
      </section>
    </>
  );
}
