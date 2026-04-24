"use client";

import "@/lib/chart/registerChartJs";

import type { ChartData } from "chart.js";
import { Bar, Chart } from "react-chartjs-2";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent
} from "react";

import {
  brechaAnnualChartOptions,
  buildBrechaAnnualStacked,
  buildCopaVsAnnualMixed,
  buildMonthlyAnnualData,
  copaVsAnnualOptions,
  monthlyAnnualOptions,
  type CopaVsAnnualShape,
  type MonthlyAnnualShape,
} from "@/lib/analisis-anual/annualCharts";
import { buildAnnualVm } from "@/lib/analisis-anual/annualVm";

type AnnualMeta = {
  annual_monitor: {
    meta: {
      default_period_id: string;
      available_periods: { id: string; label: string; year: number; incomplete?: boolean }[];
    };
    data: Record<
      string,
      {
        kpi: Parameters<typeof buildAnnualVm>[0];
        charts: {
          monthly: MonthlyAnnualShape;
          copa_vs_salario: CopaVsAnnualShape;
        };
      }
    >;
  };
};

function useMobile768() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => setM(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return m;
}

export default function AnalisisAnualDashboard() {
  const [payload, setPayload] = useState<AnnualMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [yearId, setYearId] = useState("");
  const isMobile = useMobile768();

  useEffect(() => {
    let c = false;
    fetch("/data/_data_ipce_v1.json")
      .then((r) => {
        if (!r.ok) throw new Error("No se pudieron cargar los datos.");
        return r.json() as Promise<AnnualMeta>;
      })
      .then((j) => {
        if (c) return;
        setPayload(j);
        const def = j.annual_monitor.meta.default_period_id;
        setYearId(def || "");
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
    return () => { c = true; };
  }, []);

  const mon = payload?.annual_monitor;
  const periods = mon?.meta.available_periods ?? [];

  const periodRow = mon && yearId ? mon.data[yearId] : undefined;
  const iterYear = yearId ? parseInt(yearId, 10) : NaN;
  const prevYear = Number.isFinite(iterYear) ? iterYear - 1 : 0;

  const vm = useMemo(() => {
    if (!periodRow) return null;
    return buildAnnualVm(periodRow.kpi, iterYear);
  }, [periodRow, iterYear]);

  const monthlyData = useMemo(() => {
    if (!periodRow || !Number.isFinite(iterYear)) return null;
    return buildMonthlyAnnualData(periodRow.charts.monthly, iterYear, prevYear, isMobile);
  }, [periodRow, iterYear, prevYear, isMobile]);

  const monthlyOpts = useMemo(() => monthlyAnnualOptions(), []);

  const copaVsMixed = useMemo(() => {
    if (!periodRow) return null;
    return buildCopaVsAnnualMixed(periodRow.charts.copa_vs_salario, isMobile);
  }, [periodRow, isMobile]);

  const copaVsOpts = useMemo(() => copaVsAnnualOptions(), []);

  const brechaBundle = useMemo(() => {
    if (!periodRow || !Number.isFinite(iterYear)) return null;
    const k = periodRow.kpi;
    return buildBrechaAnnualStacked(
      periodRow.charts.copa_vs_salario,
      iterYear,
      k.meta?.max_month,
      k.meta?.is_complete,
      isMobile,
    );
  }, [periodRow, iterYear, isMobile]);

  const brechaOpts = useMemo(() => brechaAnnualChartOptions(), []);

  const onYear = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      const idx = periods.findIndex((p) => p.id === v);
      const incomplete = periods[idx]?.incomplete;
      if (incomplete) {
        alert(
          "Atención: El año seleccionado aún cuenta con datos incompletos. Las comparativas se realizan contra los mismos meses del año anterior.",
        );
      }
      setYearId(v);
    },
    [periods],
  );

  if (err) {
    return (
      <div className="chart-container">
        <p style={{ color: "var(--accent-danger)" }}>{err}</p>
      </div>
    );
  }

  if (!payload || !mon || !yearId || !periodRow || !vm || !Number.isFinite(iterYear)) {
    return (
      <div className="chart-container">
        <p style={{ color: "var(--text-secondary)" }}>Cargando datos anuales…</p>
      </div>
    );
  }

  return (
    <>
      {/* ENCABEZADO */}
      <header className="dashboard-header" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="dashboard-title" style={{ textAlign: "left", margin: 0 }}>
          Recursos de Origen Nacional (RON)
        </h1>
        <div className="period-select-wrapper" style={{ position: "static" }}>
          <label htmlFor="year-selector-aa" className="period-label">Período:</label>
          <select
            id="year-selector-aa"
            className="period-select"
            value={yearId}
            onChange={onYear}
          >
            {periods
              .filter((p) => p.id !== "2022" && p.year !== 2022)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.incomplete ? p.label.replace(" (YTD)", "") + " (incompleto)" : p.label}
                </option>
              ))}
          </select>
        </div>
      </header>

      {/* 1. SECCIÓN: RON */}
      <section className="section-group" style={{ marginTop: "1rem" }}>
        <div className="hero-grid-flex">
          <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
            <div className="info-tooltip" data-tooltip="Monto total, en billones de pesos corrientes, de los ingresos por RON disponible para el año seleccionado.">?</div>
            <div className="kpi-label">{`RON Disponible ${vm.periodLabel}`}</div>
            <div className="kpi-value">{vm.recaudacion.current}</div>
            <div className="kpi-sub" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.85rem" }}>
              <span>RON Neta: <strong>{vm.recaudacion.netaCurr}</strong></span>
              <span>RON Bruta: <strong>{vm.recaudacion.brutaCurr}</strong></span>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: "4px solid #e2e8f0" }}>
            <div className="info-tooltip" data-tooltip="Monto total, en billones de pesos corrientes, de los ingresos por RON disponible para el año anterior.">?</div>
            <div className="kpi-label">{`RON Disponible Año ${prevYear}`}</div>
            <div className="kpi-value" style={{ color: "#64748b" }}>{vm.recaudacion.prev}</div>
            <div className="kpi-sub" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.85rem", color: "#64748b" }}>
              <span>RON Neta: <strong>{vm.recaudacion.netaPrev}</strong></span>
              <span>RON Bruta: <strong>{vm.recaudacion.brutaPrev}</strong></span>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
            <div className="kpi-label">Variación Nominal RON</div>
            <div className={vm.recaudacion.varNomClass} style={{ color: "#10b981" }}>{vm.recaudacion.varNomPct}</div>
            <div className="kpi-sub">
              <strong>{vm.recaudacion.varNomAbs}</strong>{" "}
              <span style={{ color: "var(--text-secondary)", marginLeft: "5px" }}>Interanual</span>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
            <div className="info-tooltip" data-tooltip="Variación real interanual ajustada por IPC nacional.">?</div>
            <div className="kpi-label">Variación Real RON</div>
            <div className={vm.recaudacion.realPctClass} style={{ color: "#10b981" }}>{vm.recaudacion.realPct}</div>
            <div className="kpi-sub">
              <strong>{vm.recaudacion.realAbs}</strong>{" "}
              <span style={{ color: "var(--text-secondary)", marginLeft: "5px" }}>* Ajustado por inflación</span>
            </div>
          </article>
        </div>
        <p className="source-text" style={{ padding: "0 3%" }}>Fuente: INDEC y Ministerio de Economía de la Nación</p>
      </section>

      {/* 2. SECCIÓN: ROP */}
      {vm.rop && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="section-header-block">
            <h2>Recaudación de Origen Provincial (ROP)</h2>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
              <div className="kpi-label">{`ROP Disponible ${vm.periodLabel}`}</div>
              <div className="kpi-value">{vm.rop.dispCurr}</div>
              <div className="kpi-sub">ROP Bruta: <strong>{vm.rop.brutaCurr}</strong></div>
            </article>
            <article className="kpi-card" style={{ borderTop: "4px solid #e2e8f0" }}>
              <div className="kpi-label">{`ROP Disponible Año ${prevYear}`}</div>
              <div className="kpi-value" style={{ color: "#64748b" }}>{vm.rop.dispPrev}</div>
              <div className="kpi-sub">ROP Bruta: <strong>{vm.rop.brutaPrev}</strong></div>
            </article>
            <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
              <div className="kpi-label">Variación Nominal ROP</div>
              <div className={vm.rop.varNomClass} style={{ color: "#10b981" }}>{vm.rop.varNomPct}</div>
              <div className="kpi-sub">
                <strong>{vm.rop.varNomAbs}</strong>{" "}
                <span style={{ color: "var(--text-secondary)", marginLeft: "5px" }}>Interanual</span>
              </div>
            </article>
            <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
              <div className="kpi-label">Variación Real ROP</div>
              <div className={vm.rop.realPctClass} style={{ color: "#10b981" }}>{vm.rop.realPct}</div>
              <div className="kpi-sub">
                <strong>{vm.rop.realAbs}</strong>{" "}
                <span style={{ color: "var(--text-secondary)", marginLeft: "5px" }}>* Ajustado por inflación</span>
              </div>
            </article>
          </div>
          <p className="source-text" style={{ padding: "0 3%" }}>Fuente: Ministerio de Economía de la Provincia</p>
        </section>
      )}

      {/* 3. SECCIÓN: DISTRIBUCIÓN MUNICIPAL */}
      {vm.muni && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="section-header-block">
            <h2>Distribución Municipal</h2>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
              <div className="kpi-label">{`Distrib. Municipal ${vm.periodLabel}`}</div>
              <div className="kpi-value">{vm.muni.current}</div>
              <div className="kpi-sub" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.85rem", color: "#64748b" }}>
                <span>Orig. Nac.: <strong>{vm.muni.natCurr}</strong></span>
                <span>Orig. Prov.: <strong>{vm.muni.provCurr}</strong></span>
              </div>
            </article>
            <article className="kpi-card" style={{ borderTop: "4px solid #e2e8f0" }}>
              <div className="kpi-label">{`Distrib. Municipal Año ${prevYear}`}</div>
              <div className="kpi-value" style={{ color: "#64748b" }}>{vm.muni.prev}</div>
              <div className="kpi-sub" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.85rem", color: "#64748b" }}>
                <span>Orig. Nac.: <strong>{vm.muni.natPrev}</strong></span>
                <span>Orig. Prov.: <strong>{vm.muni.provPrev}</strong></span>
              </div>
            </article>
            <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
              <div className="kpi-label">Variación Nominal Distrib. Municipal</div>
              <div className={vm.muni.varNomClass} style={{ color: "#10b981" }}>{vm.muni.varNomPct}</div>
              <div className="kpi-sub">
                <strong>{vm.muni.varNomAbs}</strong>{" "}
                <span style={{ color: "var(--text-secondary)", marginLeft: "5px" }}>Interanual</span>
              </div>
            </article>
            <article className="kpi-card" style={{ borderTop: "4px solid #b45309" }}>
              <div className="kpi-label">Variación Real Distrib. Municipal</div>
              <div className={vm.muni.realPctClass} style={{ color: "#b45309" }}>{vm.muni.realPct}</div>
              <div className="kpi-sub">
                <strong>{vm.muni.realAbs}</strong>{" "}
                <span style={{ color: "var(--text-secondary)", marginLeft: "5px" }}>* Ajustado por inflación</span>
              </div>
            </article>
          </div>
          <p className="source-text" style={{ padding: "0 3%" }}>Fuente: INDEC y Ministerio de Economía de la Nación</p>
        </section>
      )}

      {/* 4. SECCIÓN: MASA SALARIAL */}
      <section className="section-group" style={{ marginTop: "2rem" }}>
        <div className="section-header-block">
          <h2>Masa Salarial Total Empleo Provincial</h2>
        </div>
        <div className="hero-grid-flex">
          <article className="kpi-card" style={{ borderTop: "4px solid #3b82f6" }}>
            <div className="kpi-label">{`Masa Salarial Año ${iterYear}`}</div>
            <div className="kpi-value">{vm.masa.current}</div>
            <div className="kpi-sub">
              <strong style={{ color: "#3b82f6" }}>{vm.masa.cobCurr}</strong>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: "4px solid #e2e8f0" }}>
            <div className="kpi-label">{`Masa Salarial Año ${prevYear}`}</div>
            <div className="kpi-value" style={{ color: "#64748b" }}>{vm.masa.prev}</div>
            <div className="kpi-sub" style={{ color: "#64748b" }}>
              <span>{vm.masa.cobPrev}</span>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: "4px solid #3b82f6" }}>
            <div className="kpi-label">Variación Nominal Masa Salarial</div>
            <div className={vm.masa.varNomPctClass} style={{ color: "#3b82f6" }}>{vm.masa.varNomPct}</div>
            <div className="kpi-sub">
              <strong>{vm.masa.varNomAbs}</strong>{" "}
              <span style={{ color: "var(--text-secondary)", marginLeft: "5px" }}>Interanual</span>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: "4px solid #3b82f6" }}>
            <div className="kpi-label">Variación Real Masa Salarial</div>
            <div className={vm.masa.realPctClass} style={{ color: "#3b82f6" }}>{vm.masa.realPct}</div>
            <div className="kpi-sub">
              <strong>{vm.masa.realAbs}</strong>{" "}
              <span style={{ color: "var(--text-secondary)", marginLeft: "5px" }}>* Ajustado por inflación</span>
            </div>
          </article>
        </div>
        <p className="source-text" style={{ padding: "0 3%" }}>Fuente: Contaduría General de la Provincia de Corrientes</p>
      </section>

      {/* 5. SECCIÓN: GRÁFICOS */}
      <section className="section-group" style={{ marginTop: "2rem" }}>
        <div className="section-header-block">
          <h2>RON Disponible vs Sueldos</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Evolución acumulada mensual</p>
        </div>
        <div className="chart-container" style={{ padding: "1rem 3%" }}>
          <div className="chart-wrapper">
            {copaVsMixed && <Chart type="bar" data={copaVsMixed} options={copaVsOpts} />}
          </div>
          <p className="source-text" style={{ marginTop: "1rem" }}>
            Fuente: Ministerio de Economía de la Provincia (RON) / Contaduría General de la Provincia (Salarios)
          </p>
        </div>
      </section>

      <section className="section-group" style={{ marginTop: "2rem" }}>
        <div className="section-header-block">
          <h2>Comportamiento de RON Disponible Mensual</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Comparativa de ingresos mensuales nominales (Billones de pesos)</p>
        </div>
        <div className="chart-container" style={{ padding: "1rem 3%" }}>
          <div className="chart-wrapper">
            {monthlyData && <Bar data={monthlyData} options={monthlyOpts} />}
          </div>
          <p className="source-text" style={{ marginTop: "1rem" }}>Fuente: INDEC y Ministerio de Economía de la Nación</p>
        </div>
      </section>

      {/* 6. SECCIÓN: PRESUPUESTO (oculta por ahora) */}
      {/* 
      {vm.presupuestoProv && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="section-header-block">
            <h2>Desempeño Frente a Presupuesto Anual</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Análisis comparativo de la RON neta efectiva acumulada frente a los fondos presupuestados acumulados del año.
            </p>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
              <div className="kpi-label">ROP: DIFERENCIA NOMINAL ACUMULADA</div>
              <div className={vm.presupuestoProv.diffAbsClass}>{vm.presupuestoProv.diffAbs}</div>
              <div className="kpi-sub" style={{ display: "flex", gap: "8px", fontSize: "0.85rem", flexWrap: "wrap" }}>
                <span>Recaudado: <strong style={{ color: "#0f172a" }}>{vm.presupuestoProv.recaudado}</strong></span>
                <span>Presupuestado: <strong style={{ color: "#0f172a" }}>{vm.presupuestoProv.esperada}</strong></span>
              </div>
            </article>
            <article className="kpi-card" style={{ borderTop: "4px solid #10b981" }}>
              <div className="info-tooltip" data-tooltip="Refleja qué porcentaje del presupuesto esperado acumulado de Recaudación Provincial para el año fue efectivamente cubierto por la recaudación real.">?</div>
              <div className="kpi-label">ROP: DIFERENCIA PORCENTUAL ACUMULADA</div>
              <div className={vm.presupuestoProv.diffPctClass}>{vm.presupuestoProv.diffPct}</div>
              <div className="kpi-sub">
                <span style={{ color: "var(--text-secondary)", marginLeft: "5px" }}>Brecha Porcentual respecto al monto presupuestado acumulado provincial</span>
              </div>
            </article>
          </div>
          <p className="source-text" style={{ padding: "0 3%" }}>Fuente: Ministerio de Economía de la Provincia</p>
        </section>
      )}
      */}

      {/* 7. SECCIÓN: BRECHA (si hay datos) */}
      {brechaBundle && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="section-header-block">
            <h2>Brecha Recaudación Acumulada Anual</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Efectiva vs Esperada</p>
          </div>
          <div className="chart-container" style={{ padding: "1rem 3%" }}>
            <div className="chart-wrapper">
              <Bar data={brechaBundle.chartData} options={brechaOpts} />
            </div>
            <p className="source-text" style={{ marginTop: "1rem" }}>Fuente: Ministerio de Economía de la Provincia</p>
          </div>
        </section>
      )}
    </>
  );
}
