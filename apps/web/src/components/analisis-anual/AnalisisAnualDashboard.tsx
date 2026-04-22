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
    return () => {
      c = true;
    };
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

  const showBrechaBlock = brechaBundle !== null;

  return (
    <>
      <header className="dashboard-header">
        <div className="title-block">
          <h1 className="text-gradient dashboard-title">Análisis Anual RON</h1>
        </div>
        <div className="period-select-wrapper">
          <label htmlFor="year-selector-aa" className="period-label">
            Período:
          </label>
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

      {/* SECCIÓN: RON ANUAL */}
      <section className="section-group">
        <div className="section-header-block">
          <h2>Recursos de Origen Nacional (RON)</h2>
          <p>Evolución anual de los fondos de origen nacional acumulados.</p>
        </div>
        <div className="hero-grid-flex">
          <article className="kpi-card">
            <div className="info-tooltip" data-tooltip="Total RON acumulado año seleccionado.">?</div>
            <div className="kpi-label">{`RON Disponible ${vm.periodLabel}`}</div>
            <div className="kpi-value">{vm.recaudacion.current}</div>
            <div className="kpi-sub">
              RON Neta: <strong>{vm.recaudacion.netaCurr}</strong>
            </div>
          </article>
          <article className="kpi-card">
            <div className="info-tooltip" data-tooltip="Total RON acumulado año anterior.">?</div>
            <div className="kpi-label">{`RON Disponible Año ${prevYear}`}</div>
            <div className="kpi-value" style={{ color: "var(--text-secondary)" }}>{vm.recaudacion.prev}</div>
            <div className="kpi-sub">
              RON Neta: <strong>{vm.recaudacion.netaPrev}</strong>
            </div>
          </article>
          <article className="kpi-card">
            <div className="kpi-label">Variación Nominal RON</div>
            <div className={vm.recaudacion.varNomClass}>{vm.recaudacion.varNomPct}</div>
            <div className="kpi-sub">
              <strong>{vm.recaudacion.varNomAbs}</strong> Interanual
            </div>
          </article>
          <article className="kpi-card">
            <div className="info-tooltip" data-tooltip="Variación real interanual ajustada por IPC nacional.">?</div>
            <div className="kpi-label">Variación Real RON</div>
            <div className={vm.recaudacion.realPctClass}>{vm.recaudacion.realPct}</div>
            <div className="kpi-sub">
              <strong>{vm.recaudacion.realAbs}</strong> * Ajustado por inflación
            </div>
          </article>
        </div>
        <p className="source-text">Fuente: INDEC y Ministerio de Economía de la Nación</p>
      </section>

      {/* SECCIÓN: ROP ANUAL */}
      {vm.rop && (
        <section className="section-group">
          <div className="section-header-block">
            <h2>Recaudación de Origen Provincial (ROP)</h2>
            <p>Evolución anual de la recaudación propia de la provincia.</p>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card">
              <div className="kpi-label">{`ROP Disponible ${vm.periodLabel}`}</div>
              <div className="kpi-value">{vm.rop.dispCurr}</div>
              <div className="kpi-sub">
                ROP Bruta: <strong>{vm.rop.brutaCurr}</strong>
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">{`ROP Disponible Año ${prevYear}`}</div>
              <div className="kpi-value" style={{ color: "var(--text-secondary)" }}>{vm.rop.dispPrev}</div>
              <div className="kpi-sub">
                ROP Bruta: <strong>{vm.rop.brutaPrev}</strong>
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Variación Nominal ROP</div>
              <div className={vm.rop.varNomClass}>{vm.rop.varNomPct}</div>
              <div className="kpi-sub">
                <strong>{vm.rop.varNomAbs}</strong> Interanual
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Variación Real ROP</div>
              <div className={vm.rop.realPctClass}>{vm.rop.realPct}</div>
              <div className="kpi-sub">
                <strong>{vm.rop.realAbs}</strong> * Ajustado por inflación
              </div>
            </article>
          </div>
          <p className="source-text">Fuente: Ministerio de Economía de la Provincia</p>
        </section>
      )}

      {/* SECCIÓN: MUNI ANUAL */}
      {vm.muni && (
        <section className="section-group">
          <div className="section-header-block">
            <h2>Distribución Municipal</h2>
            <p>Transferencias anuales a municipios.</p>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card">
              <div className="kpi-label">{`Distribución Municipal ${vm.periodLabel}`}</div>
              <div className="kpi-value">{vm.muni.dispCurr}</div>
              <div className="kpi-sub">RON/ROP distribuida</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Variación Nominal</div>
              <div className={vm.muni.varNomClass}>{vm.muni.varNomPct}</div>
              <div className="kpi-sub">
                <strong>{vm.muni.varNomAbs}</strong> Interanual
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Variación Real</div>
              <div className={vm.muni.realPctClass}>{vm.muni.realPct}</div>
              <div className="kpi-sub">
                <strong>{vm.muni.realAbs}</strong> * Ajustado por inflación
              </div>
            </article>
          </div>
          <p className="source-text">Fuente: INDEC y Ministerio de Economía de la Nación</p>
        </section>
      )}

      {/* SECCIÓN: GRÁFICOS ANUALES */}
      <section className="section-group">
        <div className="section-header-block">
          <h2>Análisis Histórico Acumulado</h2>
          <p>Comparativo mensual de la evolución de recursos vs salarios.</p>
        </div>
        <div className="charts-grid-half">
          <div className="chart-container">
            <h3 className="chart-title">Recursos vs Salarios (Acumulado)</h3>
            <div className="chart-wrapper">
              {copaVsMixed && <Chart type="bar" data={copaVsMixed} options={copaVsOpts} />}
            </div>
          </div>
          <div className="chart-container">
            <h3 className="chart-title">Evolución Mensual Real</h3>
            <div className="chart-wrapper">
              {monthlyData && <Bar data={monthlyData} options={monthlyOpts} />}
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN: BRECHA */}
      {showBrechaBlock && brechaBundle && (
        <section className="section-group">
          <div className="section-header-block">
            <h2>Brecha Recaudación Acumulada Anual</h2>
            <p>Comparativo entre recaudación efectiva y esperada.</p>
          </div>
          <div className="chart-container" style={{ padding: "2rem" }}>
            <div className="chart-wrapper">
              <Bar data={brechaBundle.chartData} options={brechaOpts} />
            </div>
            <p className="source-text">Fuente: Ministerio de Economía de la Provincia</p>
          </div>
        </section>
      )}
    </>
  );
}
