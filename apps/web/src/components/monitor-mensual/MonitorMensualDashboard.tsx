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
import { useAnalytics } from "@/hooks/useAnalytics";
import { fetchWithAuth } from "@/lib/api";

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

const getBorderColorByValue = (valStr: string | undefined) => {
  if (!valStr || valStr.includes("Sin datos") || valStr.includes("Sin IPC") || valStr === "--") return "#e2e8f0";
  if (valStr.includes("-")) return "#ef4444";
  const cleanStr = valStr.replace(/[^0-9,]/g, '').replace(',', '.');
  const num = parseFloat(cleanStr);
  if (isNaN(num) || num === 0) return "#e2e8f0";
  return "#10b981";
};

export default function MonitorMensualDashboard() {
  const [data, setData] = useState<MonitorJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState<string>("");
  const { isMobile768, isMobile640 } = useViewportFlags();
  const { logAction } = useAnalytics();

  useEffect(() => {
    logAction("Análisis Mensual RON", "Acceso a apartado");
  }, [logAction]);

  useEffect(() => {
    let cancelled = false;
    fetchWithAuth(`/copa/copa-api/api/dashboard/monthly?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    })
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
    if (!data || !chosen) return undefined;
    return buildMonitorViewModel(data, periodId, chosen.kpi, isMobile640);
  }, [data, periodId, chosen, isMobile640]);

  const charts = chosen?.charts;

  const dailyData = useMemo(() => {
    if (!charts || !vm) return undefined;
    return buildDailyBarData(charts.daily, vm.monthName, vm.currentYear, vm.prevYear, isMobile768);
  }, [charts, vm, isMobile768]);

  const dailyOpts = useMemo(() => {
    if (!vm) return undefined;
    const base = dailyBarOptions(vm.monthName);
    return {
      ...base,
      onClick: (_: any, elements: any[]) => {
        if (elements.length > 0) {
          logAction("Análisis Mensual RON", "Interacción con Gráfico Diario");
        }
      }
    };
  }, [vm, logAction]);

  const copaVsData = useMemo(() => {
    if (!charts) return undefined;
    return buildCopaVsSalarioMixed(charts.copa_vs_salario, isMobile768);
  }, [charts, isMobile768]);

  const copaVsOpts = useMemo(() => copaVsSalarioOptions(), []);

  const brechaData = useMemo(() => {
    if (!charts) return undefined;
    return buildBrechaStacked(charts.copa_vs_salario);
  }, [charts]);

  const brechaOpts = useMemo(() => {
    if (!charts) return undefined;
    const dataCopa = charts.copa_vs_salario;
    const neta = dataCopa.cumulative_neta;
    const useNeta = neta?.some((v) => v != null);
    const actualDataRaw = useNeta ? neta! : dataCopa.cumulative_copa;
    const expectedData = dataCopa.cumulative_esperada ?? [];
    return brechaOptions(expectedData, actualDataRaw ?? []);
  }, [charts]);

  const realEvol = useMemo(() => {
    if (!data || !periodId) return undefined;
    return buildRealEvolutionSeries(data, periodId);
  }, [data, periodId]);

  const chartCopaReal = useMemo(() => {
    if (!realEvol) return undefined;
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
    if (!realEvol) return undefined;
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
    if (!realEvol) return undefined;
    return barComparisonOptions("RON Disponible Real", realEvol.barPeriods);
  }, [realEvol]);

  const optMasaReal = useMemo(() => {
    if (!realEvol) return undefined;
    return barComparisonOptions("Masa Salarial Real", realEvol.barPeriods);
  }, [realEvol]);

  const onPeriodChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value;
      logAction("Análisis Mensual RON", "Cambio de Período", { period_id: next });
      const idx = periodMeta.findIndex((p) => p.id === next);
      const incomplete = periodMeta[idx]?.incomplete ?? (defaultIndex >= 0 && idx > defaultIndex);
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
      <header className="dashboard-header" style={{ justifyContent: "space-between", alignItems: "center", padding: "0 3%" }}>
        <h2
          className="dashboard-title"
          style={{ textAlign: "left", fontSize: "1.5rem", margin: 0, fontWeight: 700, letterSpacing: "-0.01em" }}
        >
          Recursos Disponibles Totales
        </h2>
        <div className="period-select-wrapper" style={{ position: "static" }}>
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
              const incomplete = p.incomplete ?? (defaultIndex >= 0 && pIndex > defaultIndex);
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
        <div className="hero-grid-flex" style={{ marginTop: "1rem" }}>
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.resumen.totalDisp)}` }}>
            <div
              className="info-tooltip"
              data-tooltip="Suma de RON Disponible + ROP Disponible. Representa el total de recursos líquidos de libre disponibilidad para el periodo."
            >
              ?
            </div>
            <div className="kpi-label">Recaudación Total Disponible</div>
            <div className="kpi-value">{vm.resumen.totalDisp}</div>
            <div className="kpi-sub">
              RON: <strong>{vm.resumen.ronDisp}</strong> | ROP: <strong>{vm.resumen.ropDisp}</strong>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.resumen.postSueldos)}` }}>
            <div
              className="info-tooltip"
              data-tooltip="Monto remanente tras descontar la Masa Salarial del total de recursos disponibles (Recaudación Total Disponible - Masa Salarial)."
            >
              ?
            </div>
            <div className="kpi-label">Recursos para Gastos Operativos e Inversión</div>
            <div className={`kpi-value ${vm.resumen.postClass}`.trim()}>{vm.resumen.postSueldos}</div>
            <div className="kpi-sub">Monto remanente tras cubrir salarios</div>
          </article>
        </div>
        <p className="source-text" style={{ padding: "0 3%", textAlign: "left", marginTop: "1rem" }}>
          Fuente: INDEC y Ministerio de Economía de la Nación
        </p>
      </section>


      {/* SECCIÓN: RON */}
      <section className="section-group" style={{ marginTop: "2rem" }}>
        <div className="section-header-block">
          <h2 className="dashboard-title" style={{ textAlign: "left", fontSize: "1.5rem", margin: 0 }}>Recursos de Origen Nacional (RON)</h2>
        </div>

        <div className="hero-grid-flex">
          {/* RON Curr */}
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.recaudacion.current)}` }}>
            <div
              className="info-tooltip"
              data-tooltip="Monto total, en pesos corrientes, de los ingresos provinciales disponibles provenientes de los Recursos de Origen Nacional (RON) para el periodo actual seleccionado."
            >
              ?
            </div>
            <div className="kpi-label">{`RON Disponible ${vm.monthName} ${vm.currentYear}`}</div>
            <div className="kpi-value">{vm.recaudacion.current}</div>
            <div className="kpi-sub" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
              <span>RON Neta: <strong>{vm.recaudacion.netaCurr}</strong></span>
              <span>RON Bruta: <strong>{vm.recaudacion.brutaCurr}</strong></span>
            </div>
          </article>
          {/* RON Prev */}
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.recaudacion.prev)}` }}>
            <div className="info-tooltip" data-tooltip="Comparación interanual del RON disponible (mismo mes del año anterior).">?</div>
            <div className="kpi-label">{`RON Disponible ${vm.monthName} ${vm.prevYear}`}</div>
            <div className="kpi-value">{vm.recaudacion.prev}</div>

            <div className="kpi-sub" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
              <span>RON Neta: <strong>{vm.recaudacion.netaPrev}</strong></span>
              <span>RON Bruta: <strong>{vm.recaudacion.brutaPrev}</strong></span>
            </div>
          </article>
          {!vm.isIncomplete && (
            <>
              <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.recaudacion.varNomPct)}` }}>
                <div className="info-tooltip" data-tooltip="Variación nominal interanual del RON disponible.">?</div>
                <div className="kpi-label">Variación Nominal RON</div>
                <div className={vm.recaudacion.varNomClass}>{vm.recaudacion.varNomPct}</div>
                <div className="kpi-sub">
                  <strong>{vm.recaudacion.varNomAbs}</strong> Interanual
                </div>
              </article>
              <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.recaudacion.realPct)}` }}>
                <div className="info-tooltip" data-tooltip="Variación real interanual del RON disponible (IPC país).">?</div>
                <div className="kpi-label">Variación Real RON</div>
                <div className={vm.recaudacion.realPctClass}>{vm.recaudacion.realPct}</div>
                <div className="kpi-sub">
                  <strong>{vm.recaudacion.realAbs}</strong> * Ajustado por inflación
                </div>
              </article>
            </>
          )}
        </div>
        <p className="source-text" style={{ padding: "0 3%", textAlign: "left" }}>Fuente: INDEC y Ministerio de Economía de la Nación</p>

      </section>

      {/* SECCIÓN: ROP */}
      {vm.rop && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="section-header-block">
            <h2 className="dashboard-title" style={{ textAlign: "left", fontSize: "1.5rem", margin: 0 }}>Recaudación de Origen Provincial (ROP)</h2>
          </div>

          <div className="hero-grid-flex">
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.rop.dispCurr)}` }}>
              <div className="info-tooltip" data-tooltip="Recaudación provincial disponible (periodo actual).">?</div>
              <div className="kpi-label">{`ROP Disponible ${vm.monthName} ${vm.currentYear}`}</div>
              <div className="kpi-value">{vm.rop.dispCurr}</div>
              <div className="kpi-sub">
                ROP Bruta: <strong>{vm.rop.brutaCurr}</strong>
              </div>
            </article>
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.rop.dispPrev)}` }}>
              <div className="info-tooltip" data-tooltip="Recaudación provincial disponible (mismo mes del año anterior).">?</div>
              <div className="kpi-label">{`ROP Disponible ${vm.monthName} ${vm.prevYear}`}</div>
              <div className="kpi-value">{vm.rop.dispPrev}</div>

              <div className="kpi-sub">
                ROP Bruta: <strong>{vm.rop.brutaPrev}</strong>
              </div>
            </article>
            {!vm.isIncomplete && (
              <>
                <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.rop.varNomPct)}` }}>
                  <div className="info-tooltip" data-tooltip="Variación nominal interanual de la recaudación provincial disponible.">?</div>
                  <div className="kpi-label">Variación Nominal ROP</div>
                  <div className={vm.rop.varNomClass}>{vm.rop.varNomPct}</div>
                  <div className="kpi-sub">
                    <strong>{vm.rop.varNomAbs}</strong> Interanual
                  </div>
                </article>
                <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.rop.realPct)}` }}>
                  <div className="info-tooltip" data-tooltip="Variación real interanual (IPC NEA).">?</div>
                  <div className="kpi-label">Variación Real ROP</div>
                  <div className={vm.rop.realPctClass}>{vm.rop.realPct}</div>
                  <div className="kpi-sub">
                    <strong>{vm.rop.realAbs}</strong> * Ajustado por inflación
                  </div>
                </article>
              </>
            )}
          </div>
          <p className="source-text" style={{ padding: "0 3%", textAlign: "left" }}>Fuente: Ministerio de Economía de la Provincia</p>

        </section>
      )}

      {/* SECCIÓN: MUNI */}
      {vm.muni && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="section-header-block">
            <h2 className="dashboard-title" style={{ textAlign: "left", fontSize: "1.5rem", margin: 0 }}>Distribución Municipal</h2>
          </div>

          <div className="hero-grid-flex">
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.muni.current)}` }}>
              <div className="info-tooltip" data-tooltip="Distribución municipal — periodo actual.">?</div>
              <div className="kpi-label">{`Distribución Municipal ${vm.monthName} ${vm.currentYear}`}</div>
              <div className="kpi-value">{vm.muni.current}</div>
              <div className="kpi-sub" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                <span>Orig. Nac.: <strong>{vm.muni.breakdownCurrNat}</strong></span>
                <span>Orig. Prov.: <strong>{vm.muni.breakdownCurrProv}</strong></span>
              </div>
            </article>

            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.muni.prev)}` }}>
              <div className="info-tooltip" data-tooltip="Distribución municipal — mismo mes del año anterior.">?</div>
              <div className="kpi-label">{`Distribución Municipal ${vm.monthName} ${vm.prevYear}`}</div>
              <div className="kpi-value" style={{ color: "#64748b" }}>{vm.muni.prev}</div>
              <div className="kpi-sub" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                <span>Orig. Nac.: <strong>{vm.muni.breakdownPrevNat}</strong></span>
                <span>Orig. Prov.: <strong>{vm.muni.breakdownPrevProv}</strong></span>
              </div>
            </article>
            {!vm.isIncomplete && (
              <>
                <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.muni.varNomPct)}` }}>
                  <div className="info-tooltip" data-tooltip="Variación nominal interanual de la distribución municipal.">?</div>
                  <div className="kpi-label">Variación Nominal</div>
                  <div className={vm.muni.varNomClass}>{vm.muni.varNomPct}</div>
                  <div className="kpi-sub">
                    <strong>{vm.muni.varNomAbs}</strong> Interanual
                  </div>
                </article>
                <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.muni.realPct)}` }}>
                  <div className="info-tooltip" data-tooltip="Variación real interanual (IPC NEA).">?</div>
                  <div className="kpi-label">Variación Real</div>
                  <div className={vm.muni.realPctClass}>{vm.muni.realPct}</div>
                  <div className="kpi-sub">
                    <strong>{vm.muni.realAbs}</strong> * Ajustado por inflación
                  </div>
                </article>
              </>
            )}
          </div>
          <p className="source-text" style={{ padding: "0 3%", textAlign: "left" }}>Fuente: INDEC y Ministerio de Economía de la Nación</p>
        </section>
      )}

      {/* SECCIÓN: PRESUPUESTO */}
      {vm.showPresupuestoSection && vm.presupuesto && !vm.isIncomplete && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="section-header-block">
            <h2 className="dashboard-title" style={{ textAlign: "left", fontSize: "1.5rem", margin: 0 }}>Desempeño Frente a Presupuesto</h2>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.presupuesto.diffAbs)}` }}>
              <div className="info-tooltip" data-tooltip="Diferencia nominal entre el RON disponible efectivo y el monto presupuestado para el mes.">?</div>
              <div className="kpi-label">RON: DIFERENCIA NOMINAL</div>
              <div className={vm.presupuesto.diffAbsClass}>{vm.presupuesto.diffAbs}</div>
              <div className="kpi-sub" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                <span>Recaudado: <strong>{vm.presupuesto.recaudado}</strong></span>
                <span>Presupuestado: <strong>{vm.presupuesto.esperada}</strong></span>
              </div>
            </article>
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.presupuesto.diffPct)}` }}>
              <div className="info-tooltip" data-tooltip="Brecha porcentual respecto al presupuesto mensual de RON disponible.">?</div>
              <div className="kpi-label">RON: DIFERENCIA PORCENTUAL</div>
              <div className={vm.presupuesto.diffPctClass}>{vm.presupuesto.diffPct}</div>
              <div className="kpi-sub">Brecha respecto al monto presupuestado</div>
            </article>

            {vm.presupuesto.rop && (
              <>
                <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.presupuesto.rop.diffAbs)}` }}>
                  <div className="info-tooltip" data-tooltip="Diferencia nominal de la ROP disponible frente al presupuesto provincial del mes.">?</div>
                  <div className="kpi-label">ROP: DIFERENCIA NOMINAL</div>
                  <div className={vm.presupuesto.rop.diffAbsClass}>{vm.presupuesto.rop.diffAbs}</div>
                  <div className="kpi-sub" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                    <span>Recaudado: <strong>{vm.presupuesto.rop.recaudado}</strong></span>
                    <span>Presupuestado: <strong>{vm.presupuesto.rop.esperada}</strong></span>
                  </div>
                </article>
                <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.presupuesto.rop.diffPct)}` }}>
                  <div className="info-tooltip" data-tooltip="Brecha porcentual de la ROP disponible respecto al presupuesto provincial.">?</div>
                  <div className="kpi-label">ROP: DIFERENCIA PORCENTUAL</div>
                  <div className={vm.presupuesto.rop.diffPctClass}>{vm.presupuesto.rop.diffPct}</div>
                  <div className="kpi-sub">Brecha respecto al monto presupuestado provincial</div>
                </article>
              </>
            )}
          </div>
          <p className="source-text" style={{ padding: "0 3%", textAlign: "left" }}>Fuente: Ministerio de Economía de la Provincia</p>
        </section>
      )}

      {/* SECCIÓN: MASA SALARIAL */}
      <section className="section-group" style={{ marginTop: "2rem" }}>
        <div className="section-header-block">
          <h2 className="dashboard-title" style={{ textAlign: "left", fontSize: "1.5rem", margin: 0 }}>Masa Salarial Total Empleo Provincial</h2>
        </div>
        <div className="hero-grid-flex">
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.masa.current)}` }}>
            <div className="info-tooltip" data-tooltip="Masa salarial total liquidada en el periodo seleccionado.">?</div>
            <div className="kpi-label">{`Masa Salarial ${vm.monthName} ${vm.currentYear}`}</div>
            <div className="kpi-value">{vm.masa.current}</div>
            <div className="kpi-sub">
              <strong style={{ color: "#10b981" }}>{vm.masa.cobCurr}</strong>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.masa.prev)}` }}>
            <div className="info-tooltip" data-tooltip="Masa salarial liquidada en el mismo mes del año anterior.">?</div>
            <div className="kpi-label">{`Masa Salarial ${vm.monthName} ${vm.prevYear}`}</div>
            <div className="kpi-value" style={{ color: "#64748b" }}>{vm.masa.prev}</div>
            <div className="kpi-sub">
              <strong>{vm.masa.cobPrev}</strong>
            </div>
          </article>
          {!vm.isIncomplete && (
            <>
              <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.masa.varNomPct)}` }}>
                <div className="info-tooltip" data-tooltip="Variación nominal interanual de la masa salarial.">?</div>
                <div className="kpi-label">Variación Nominal Masa Salarial</div>
                <div className={vm.masa.varNomPctClass} style={{ color: "#10b981" }}>{vm.masa.varNomPct}</div>
                <div className="kpi-sub">
                  <strong>{vm.masa.varNomAbs}</strong> Interanual
                </div>
              </article>
              <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.masa.realPct)}` }}>
                <div className="info-tooltip" data-tooltip="Variación real interanual (IPC NEA).">?</div>
                <div className="kpi-label">Variación Real Masa Salarial</div>
                <div className={vm.masa.realPctClass}>{vm.masa.realPct}</div>
                <div className="kpi-sub">
                  <strong>{vm.masa.realAbs}</strong> * Ajustado por inflación
                </div>
              </article>
            </>
          )}
        </div>
        <p className="source-text" style={{ padding: "0 3%", textAlign: "left" }}>Fuente: Contaduría General de la Provincia de Corrientes</p>
      </section>



      {/* SECCIÓN: RON ACUMULADA + ROP vs MASA SALARIAL OBJETIVO */}
      {copaVsData && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="chart-container" style={{ margin: "0 3%", width: "94%" }}>
            <div
              className="info-tooltip"
              data-tooltip="Comparación de la recaudación acumulada diaria de coparticipación disponible frente al monto objetivo para el pago de salarios."
            >
              ?
            </div>
            <h3 className="chart-title" style={{ lineHeight: 1.35 }}>
              {charts?.copa_vs_salario.copa_label && charts?.copa_vs_salario.salario_label
                ? `Recursos Disponibles ${charts.copa_vs_salario.copa_label} vs Sueldos ${charts.copa_vs_salario.salario_label}`
                : `Recursos Disponibles ${vm.monthName} vs Sueldos ${vm.monthName}`}
            </h3>
            <div className="chart-wrapper">
              <Chart
                type="bar"
                data={copaVsData as ChartData<"bar">}
                options={copaVsOpts as Parameters<typeof Chart>[0]["options"]}
              />
            </div>
            <p className="source-text" style={{ textAlign: "left" }}>
              Fuente: Ministerio de Economía de la Provincia (RON/ROP) y Contaduría General de la Provincia de Corrientes (Salarios)
            </p>
          </div>
        </section>
      )}

      {/* SECCIÓN: GRÁFICOS */}
      {realEvol && (
        <section className="section-group">
          <div className="charts-grid-half" style={{ padding: "0 3%" }}>
            <div className="chart-container">
              <div className="info-tooltip" data-tooltip="Evolución del RON disponible real — últimos 3 meses (pesos constantes).">?</div>
              <h3 className="chart-title">RON Disponible Real</h3>
              <p className="chart-subtitle" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>Evolución últimos 3 meses (Pesos constantes)</p>
              <div className="chart-wrapper">
                <Bar data={chartCopaReal!} options={optCopaReal} />
              </div>
              <p className="source-text" style={{ textAlign: "left" }}>Fuente: INDEC y Ministerio de Economía de la Nación</p>
            </div>
            <div className="chart-container">
              <div className="info-tooltip" data-tooltip="Evolución de la masa salarial real — últimos 3 meses (pesos constantes).">?</div>
              <h3 className="chart-title">Masa Salarial Real</h3>
              <p className="chart-subtitle" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>Evolución últimos 3 meses (Pesos constantes)</p>
              <div className="chart-wrapper">
                <Bar data={chartMasaReal!} options={optMasaReal} />
              </div>
              <p className="source-text" style={{ textAlign: "left" }}>Fuente: Ministerio de Economía de la Provincia</p>
            </div>
          </div>
        </section>
      )}

      {/* SECCIÓN: DAILY */}
      {dailyData && (
        <section className="section-group">

          <div className="chart-container" style={{ margin: "0 3%", width: "94%" }}>
            <div className="info-tooltip" data-tooltip="Ingresos diarios de coparticipación disponible — comparación interanual.">?</div>
            <h3 className="chart-title">{`Comportamiento de RON Disponible Diario ${vm.monthName}`}</h3>
            <p className="chart-subtitle" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>Comparativa de ingresos diarios nominales (Millones de pesos)</p>
            <div className="chart-wrapper">
              <Chart type="bar" data={dailyData} options={dailyOpts} />
            </div>
            <p className="source-text" style={{ textAlign: "left" }}>Fuente: Ministerio de Economía de la Nación</p>
          </div>
        </section>
      )}
    </>
  );
}
