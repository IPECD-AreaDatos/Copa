"use client";

import "@/lib/chart/registerChartJs";

import type { ChartData } from "chart.js";
import { Bar, Chart } from "react-chartjs-2";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  barComparisonOptions,
  buildBarComparison,
  buildBrechaStacked,
  buildCopaVsSalarioMixed,
  buildDailyBarData,
  buildRealEvolutionSeries,
  brechaOptions,
  copaVsSalarioOptions,
  dailyBarOptions,
} from "@/lib/monitor-mensual/chartData";
import {
  buildMonitorViewModel,
  type MonitorJson,
} from "@/lib/monitor-mensual/viewModel";

function useViewportFlags() {
  const [wide768, setWide768] = useState(false);
  const [wide640, setWide640] = useState(false);

  useEffect(() => {
    const mq768 = window.matchMedia("(max-width: 768px)");
    const mq640 = window.matchMedia("(max-width: 640px)");
    const sync = () => {
      setWide768(mq768.matches);
      setWide640(mq640.matches);
    };
    sync();
    mq768.addEventListener("change", sync);
    mq640.addEventListener("change", sync);
    return () => {
      mq768.removeEventListener("change", sync);
      mq640.removeEventListener("change", sync);
    };
  }, []);

  return { isMobile768: wide768, isMobile640: wide640 };
}

export default function MonitorMensualDashboard() {
  const [data, setData] = useState<MonitorJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState<string>("");
  const { isMobile768, isMobile640 } = useViewportFlags();

  useEffect(() => {
    let cancelled = false;
    fetch("/data/_data_ipce_v1.json")
      .then((r) => {
        if (!r.ok) throw new Error("No se pudieron cargar los datos.");
        return r.json() as Promise<MonitorJson>;
      })
      .then((j) => {
        if (cancelled) return;
        setData(j);
        const def = j.meta.default_period_id;
        setPeriodId(def || j.meta.available_periods[j.meta.available_periods.length - 1]?.id || "");
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar datos.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const periodMeta = data?.meta.available_periods ?? [];
  const defaultIndex = periodMeta.findIndex((p) => p.id === data?.meta.default_period_id);

  const chosen = data && periodId ? data.data[periodId] : undefined;
  const vm = useMemo(() => {
    if (!data || !chosen) return null;
    return buildMonitorViewModel(data, periodId, chosen.kpi, isMobile640);
  }, [data, periodId, chosen, isMobile640]);

  const charts = chosen?.charts;

  const dailyData = useMemo(() => {
    if (!charts || !vm) return null;
    return buildDailyBarData(charts.daily, vm.monthName, vm.currentYear, vm.prevYear, isMobile768);
  }, [charts, vm, isMobile768]);

  const dailyOpts = useMemo(() => {
    if (!vm) return null;
    return dailyBarOptions(vm.monthName);
  }, [vm]);

  const copaVsData = useMemo(() => {
    if (!charts) return null;
    return buildCopaVsSalarioMixed(charts.copa_vs_salario, isMobile768);
  }, [charts, isMobile768]);

  const copaVsOpts = useMemo(() => copaVsSalarioOptions(), []);

  const brechaData = useMemo(() => {
    if (!charts) return null;
    return buildBrechaStacked(charts.copa_vs_salario);
  }, [charts]);

  const brechaOpts = useMemo(() => {
    if (!charts) return null;
    const dataCopa = charts.copa_vs_salario;
    const neta = dataCopa.cumulative_neta;
    const useNeta = neta?.some((v) => v != null);
    const actualDataRaw = useNeta ? neta! : dataCopa.cumulative_copa;
    const expectedData = dataCopa.cumulative_esperada ?? [];
    return brechaOptions(expectedData, actualDataRaw ?? []);
  }, [charts]);

  const realEvol = useMemo(() => {
    if (!data || !periodId) return null;
    return buildRealEvolutionSeries(data, periodId);
  }, [data, periodId]);

  const chartCopaReal = useMemo(() => {
    if (!realEvol) return null;
    return buildBarComparison(
      realEvol.labels,
      "RON Disponible Real",
      realEvol.copaCurrent,
      realEvol.copaPrevReal,
      "#10b981",
      realEvol.barPeriods,
    );
  }, [realEvol]);

  const chartMasaReal = useMemo(() => {
    if (!realEvol) return null;
    return buildBarComparison(
      realEvol.labels,
      "Masa Salarial Real",
      realEvol.masaCurrent,
      realEvol.masaPrevReal,
      "#3b82f6",
      realEvol.barPeriods,
    );
  }, [realEvol]);

  const optCopaReal = useMemo(() => {
    if (!realEvol) return null;
    return barComparisonOptions("RON Disponible Real", realEvol.barPeriods);
  }, [realEvol]);

  const optMasaReal = useMemo(() => {
    if (!realEvol) return null;
    return barComparisonOptions("Masa Salarial Real", realEvol.barPeriods);
  }, [realEvol]);

  const onPeriodChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value;
      const idx = periodMeta.findIndex((p) => p.id === next);
      const incomplete = defaultIndex >= 0 && idx > defaultIndex;
      if (incomplete) {
        alert(
          "Atención: El periodo seleccionado aún cuenta con datos incompletos. Las variaciones y proyecciones pueden cambiar significativamente hasta el cierre definitivo.",
        );
      }
      setPeriodId(next);
    },
    [periodMeta, defaultIndex],
  );

  if (error) {
    return (
      <div className="chart-container">
        <p style={{ color: "var(--accent-danger)" }}>{error}</p>
      </div>
    );
  }

  if (!data || !periodId || !vm || !chosen) {
    return (
      <div className="chart-container">
        <p style={{ color: "var(--text-secondary)" }}>Cargando datos…</p>
      </div>
    );
  }

  const reversedPeriods = [...periodMeta].reverse();

  return (
    <>
      <header className="dashboard-header">
        <div className="title-block">
          <h1 className="text-gradient dashboard-title">Análisis Mensual RON</h1>
        </div>
        <div className="period-select-wrapper">
          <label htmlFor="month-selector-monitor" className="period-label">
            Período:
          </label>
          <select
            id="month-selector-monitor"
            className="period-select"
            value={periodId}
            onChange={onPeriodChange}
          >
            {reversedPeriods.map((p) => {
              const pIndex = periodMeta.findIndex((x) => x.id === p.id);
              const incomplete = defaultIndex >= 0 && pIndex > defaultIndex;
              return (
                <option key={p.id} value={p.id}>
                  {p.label} {p.year}
                  {incomplete ? " (Incompleto)" : ""}
                </option>
              );
            })}
          </select>
        </div>
      </header>

      {/* SECCIÓN: RESUMEN TOTAL */}
      <section className="section-group">
        <div className="section-header-block">
          <h2>Recursos Disponibles Totales</h2>
          <p>{vm.mainSubtitle}</p>
        </div>
        <div className="hero-grid-flex">
          <article className="kpi-card" style={{ borderTop: "4px solid var(--accent-primary)" }}>
            <div className="info-tooltip" data-tooltip="Suma de RON Disponible + ROP Disponible.">?</div>
            <div className="kpi-label">Recaudación Total Disponible</div>
            <div className="kpi-value">{vm.resumen.totalDisp}</div>
            <div className="kpi-sub">
              RON: <strong>{vm.resumen.ronDisp}</strong> | ROP: <strong>{vm.resumen.ropDisp}</strong>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: "4px solid var(--accent-success)" }}>
            <div className="info-tooltip" data-tooltip="Monto tras descontar Masa Salarial.">?</div>
            <div className="kpi-label">Recursos para Gastos Operativos e Inversión</div>
            <div className={`kpi-value ${vm.resumen.postClass}`.trim()}>{vm.resumen.postSueldos}</div>
            <div className="kpi-sub">Monto remanente tras cubrir salarios</div>
          </article>
        </div>
        <p className="source-text">Fuente: INDEC y Ministerio de Economía de la Nación</p>
      </section>

      {/* SECCIÓN: RON */}
      <section className="section-group">
        <div className="section-header-block">
          <h2>Recursos de Origen Nacional (RON)</h2>
          <p>Análisis de transferencias automáticas nacionales del período.</p>
        </div>
        <div className="hero-grid-flex">
          <article className="kpi-card">
            <div className="kpi-label">{`RON Disponible ${vm.monthName} ${vm.currentYear}`}</div>
            <div className="kpi-value">{vm.recaudacion.current}</div>
            <div className="kpi-sub">
              RON Neta: <strong>{vm.recaudacion.netaCurr}</strong>
            </div>
          </article>
          <article className="kpi-card">
            <div className="kpi-label">{`RON Disponible ${vm.monthName} ${vm.prevYear}`}</div>
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
            <div className="kpi-label">Variación Real RON</div>
            <div className={vm.recaudacion.realPctClass}>{vm.recaudacion.realPct}</div>
            <div className="kpi-sub">
              <strong>{vm.recaudacion.realAbs}</strong> * Ajustado por inflación
            </div>
          </article>
        </div>
        <p className="source-text">Fuente: INDEC y Ministerio de Economía de la Nación</p>
      </section>

      {/* SECCIÓN: ROP */}
      {vm.rop && (
        <section className="section-group">
          <div className="section-header-block">
            <h2>Recaudación de Origen Provincial (ROP)</h2>
            <p>Comportamiento de la recaudación propia de la provincia.</p>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card">
              <div className="kpi-label">{`ROP Disponible ${vm.monthName} ${vm.currentYear}`}</div>
              <div className="kpi-value">{vm.rop.dispCurr}</div>
              <div className="kpi-sub">
                ROP Bruta: <strong>{vm.rop.brutaCurr}</strong>
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">{`ROP Disponible ${vm.monthName} ${vm.prevYear}`}</div>
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

      {/* SECCIÓN: MUNI */}
      {vm.muni && (
        <section className="section-group">
          <div className="section-header-block">
            <h2>Distribución Municipal</h2>
            <p>Transferencias realizadas a municipios de la provincia.</p>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card">
              <div className="kpi-label">{`Distribución Municipal ${vm.monthName} ${vm.currentYear}`}</div>
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

      {/* SECCIÓN: GRÁFICOS */}
      <section className="section-group">
        <div className="section-header-block">
          <h2>Evolución Interanual en Términos Reales</h2>
          <p>Comparación histórica ajustada por inflación.</p>
        </div>
        <div className="charts-grid-half">
          <div className="chart-container">
            <h3 className="chart-title">RON Disponible Real</h3>
            <div className="chart-wrapper">
              <Bar data={chartCopaReal!} options={optCopaReal!} />
            </div>
            <p className="source-text">Fuente: INDEC y Ministerio de Economía de la Nación</p>
          </div>
          <div className="chart-container">
            <h3 className="chart-title">Masa Salarial Real</h3>
            <div className="chart-wrapper">
              <Bar data={chartMasaReal!} options={optMasaReal!} />
            </div>
            <p className="source-text">Fuente: Ministerio de Economía de la Provincia</p>
          </div>
        </div>
      </section>

      {/* SECCIÓN: DAILY */}
      {dailyData && (
        <section className="section-group">
          <div className="section-header-block">
            <h2>Ingresos Diarios Acumulados</h2>
            <p>Seguimiento diario de los ingresos en comparación con el mes anterior.</p>
          </div>
          <div className="chart-container" style={{ padding: "1.5rem" }}>
            <div className="chart-wrapper">
              <Chart type="bar" data={dailyData} options={dailyOpts!} />
            </div>
            <p className="source-text">Fuente: Ministerio de Economía de la Nación</p>
          </div>
        </section>
      )}
    </>
  );
}
