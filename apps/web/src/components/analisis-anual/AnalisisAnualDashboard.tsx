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
import { useAnalytics } from "@/hooks/useAnalytics";
import { fetchWithAuth } from "@/lib/api";

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

const getBorderColorByValue = (valStr: string | undefined) => {
  if (!valStr || valStr.includes("Sin datos") || valStr.includes("Sin IPC") || valStr === "--") return "#e2e8f0";
  if (valStr.includes("-")) return "#ef4444";
  const cleanStr = valStr.replace(/[^0-9,]/g, "").replace(",", ".");
  const num = parseFloat(cleanStr);
  if (isNaN(num) || num === 0) return "#e2e8f0";
  return "#10b981";
};

export default function AnalisisAnualDashboard() {
  const [payload, setPayload] = useState<AnnualMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [yearId, setYearId] = useState("");
  const isMobile = useMobile768();
  const { logAction } = useAnalytics();

  useEffect(() => {
    logAction("Análisis Anual RON", "Acceso a apartado");
  }, [logAction]);

  useEffect(() => {
    let c = false;
    fetchWithAuth("/copa/copa-api/api/ron/annual-monitor")
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

  const monthlyOpts = useMemo(() => {
    const base = monthlyAnnualOptions();
    return {
      ...base,
      onClick: (_: any, elements: any[]) => {
        if (elements.length > 0) {
          logAction("Análisis Anual RON", "Interacción con Gráfico Mensual");
        }
      }
    };
  }, [logAction]);

  const copaVsMixed = useMemo(() => {
    if (!periodRow) return null;
    return buildCopaVsAnnualMixed(periodRow.charts.copa_vs_salario, isMobile);
  }, [periodRow, isMobile]);

  const copaVsOpts = useMemo(() => {
    const base = copaVsAnnualOptions();
    return {
      ...base,
      onClick: (_: any, elements: any[]) => {
        if (elements.length > 0) {
          logAction("Análisis Anual RON", "Interacción con Gráfico RON vs Sueldos");
        }
      }
    };
  }, [logAction]);

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
      logAction("Análisis Anual RON", "Cambio de Período", { period_id: v });
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
    <div className="annual-dashboard">
      {/* ENCABEZADO */}
      <header className="dashboard-header" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="dashboard-title" style={{ textAlign: "left", fontSize: "1.5rem", margin: 0, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Recursos de Origen Nacional (RON)
        </h2>
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
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.recaudacion.current)}` }}>
            <div
              className="info-tooltip"
              data-tooltip={`Monto total anual acumulado, en pesos corrientes, de los ingresos provinciales disponibles provenientes de los Recursos de Origen Nacional (RON) para el año seleccionado.

El RON bruto incluye el total recibido de los Recursos de Origen Nacional, es decir el total que recibe la provincia para redistribuir a los municipios, aquellos con afectación específica y de libre disponibilidad.

El RON neto surge del RON total descontado los recursos con afectación específica. Es decir  incluye la suma de los conceptos de: C.F.I. Neta de Ley N° 26.075, Financiamiento Educativo Ley N° 26.075, Régimen Simplificado para Pequeños Contribuyentes Ley N° 24.977 y Compensación Consenso Fiscal. 

El RON  disponible surge de restar al RON neto el 19% que se redistribuye a los municipios.  `}
            >
              ?
            </div>
            <div className="kpi-label">{`RON Disponible ${vm.periodLabel}`}</div>
            <div className="kpi-value">{vm.recaudacion.current}</div>
            <div className="kpi-sub" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", fontSize: "0.85rem" }}>
              <span>RON Neta: <strong>{vm.recaudacion.netaCurr}</strong></span>
              <span>RON Bruta: <strong>{vm.recaudacion.brutaCurr}</strong></span>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.recaudacion.prev)}` }}>
            <div
              className="info-tooltip"
              data-tooltip={`Monto total anual acumulado, en pesos corrientes, de los ingresos provinciales disponibles provenientes de los Recursos de Origen Nacional (RON) para el año anterior al seleccionado.

El RON bruto incluye el total recibido de los Recursos de Origen Nacional, es decir el total que recibe la provincia para redistribuir a los municipios, aquellos con afectación específica y de libre disponibilidad.

El RON neto surge del RON total descontado los recursos con afectación específica. Es decir  incluye la suma de los conceptos de: C.F.I. Neta de Ley N° 26.075, Financiamiento Educativo Ley N° 26.075, Régimen Simplificado para Pequeños Contribuyentes Ley N° 24.977 y Compensación Consenso Fiscal. 

El RON  disponible surge de restar al RON neto el 19% que se redistribuye a los municipios.  `}
            >
              ?
            </div>
            <div className="kpi-label">{`RON Disponible Año ${prevYear}`}</div>
            <div className="kpi-value">{vm.recaudacion.prev}</div>
            <div className="kpi-sub" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", fontSize: "0.85rem" }}>
              <span>RON Neta: <strong>{vm.recaudacion.netaPrev}</strong></span>
              <span>RON Bruta: <strong>{vm.recaudacion.brutaPrev}</strong></span>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.recaudacion.varNomPct)}` }}>
            <div
              className="info-tooltip"
              data-tooltip={`Muestra la variación absoluta, en pesos corrientes, entre los ingresos provinciales disponibles provenientes de los Recursos de Origen Nacional (RON) anuales totales del período seleccionado y los correspondientes al año anterior.

El indicador refleja la diferencia en valores nominales entre ambos años, es decir, sin realizar ajustes por inflación, permitiendo cuantificar el incremento o la disminución nominal de los recursos.

El valor de los Recursos de Origen Nacional disponibles, surge del RON total descontado los recursos con afectación específica y el porcentaje coparticipable con los municipios. Es decir  incluye la suma de los conceptos de: C.F.I. Neta de Ley N° 26.075, Financiamiento Educativo Ley N° 26.075, Régimen Simplificado para Pequeños Contribuyentes Ley N° 24.977 y Compensación Consenso Fiscal menos el 19% que se redistribuye a municipios. `}
            >
              ?
            </div>
            <div className="kpi-label">Variación Nominal RON</div>
            <div className={vm.recaudacion.varNomClass}>{vm.recaudacion.varNomPct}</div>
            <div className="kpi-sub">Interanual</div>
          </article>
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.recaudacion.realPct)}` }}>
            <div
              className="info-tooltip"
              data-tooltip={`Muestra la variación absoluta, en pesos en términos reales, entre los ingresos provinciales disponibles provenientes de los Recursos de Origen Nacional (RON) anuales totales del período seleccionado y los del año anterior.

Primero se deflactan los valores nominales mediante el IPC general del nivel Nacional, con el objetivo de expresarlos en términos reales. Luego, se calcula la diferencia entre el período seleccionado y el año anterior, a fin de obtener la variación absoluta en el poder de compra de los recursos.

El valor de los Recursos de Origen Nacional disponibles, surge del RON total descontado los recursos con afectación específica y el porcentaje coparticipable con los municipios. Es decir  incluye la suma de los conceptos de: C.F.I. Neta de Ley N° 26.075, Financiamiento Educativo Ley N° 26.075, Régimen Simplificado para Pequeños Contribuyentes Ley N° 24.977 y Compensación Consenso Fiscal menos el 19% que se redistribuye a municipios.`}
            >
              ?
            </div>
            <div className="kpi-label">Variación Real RON</div>
            <div className={vm.recaudacion.realPctClass}>{vm.recaudacion.realPct}</div>
            <div className="kpi-sub">* Ajustado por inflación</div>
          </article>
        </div>
        <p className="source-text" style={{ padding: "0 3%", textAlign: "left" }}>Fuente: INDEC y Ministerio de Economía de la Nación</p>
      </section>

      {/* 2. SECCIÓN: ROP */}
      {vm.rop && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="section-header-block">
            <h2>Recaudación de Origen Provincial (ROP)</h2>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.rop.dispCurr)}` }}>
              <div
                className="info-tooltip"
                data-tooltip={`Monto total anual acumulado, en pesos corrientes, de los ingresos provinciales disponibles provenientes de la Recaudación de Origen Provincial para el año seleccionado.

La Recaudación de Origen Provincial (ROP) disponible incluye lo recaudado en conceptos de impuestos inmobiliario rural, sellos, ingresos brutos directos e ingresos brutos convenio multilateral menos el 19% correspondiente a los municipios. `}
              >
                ?
              </div>
              <div className="kpi-label">{`ROP Disponible ${vm.periodLabel}`}</div>
              <div className="kpi-value">{vm.rop.dispCurr}</div>
              <div className="kpi-sub" style={{ alignItems: "flex-start" }}>ROP Bruta: <strong>{vm.rop.brutaCurr}</strong></div>
            </article>
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.rop.dispPrev)}` }}>
              <div
                className="info-tooltip"
                data-tooltip={`Monto total anual acumulado, en pesos corrientes, de los ingresos provinciales disponibles provenientes de la Recaudación de Origen Provincial para el año anterior al seleccionado.

La Recaudación de Origen Provincial (ROP) disponible incluye lo recaudado en conceptos de impuestos inmobiliario rural, sellos, ingresos brutos directos e ingresos brutos convenio multilateral menos el 19% correspondiente a los municipios. `}
              >
                ?
              </div>
              <div className="kpi-label">{`ROP Disponible Año ${prevYear}`}</div>
              <div className="kpi-value">{vm.rop.dispPrev}</div>
              <div className="kpi-sub" style={{ alignItems: "flex-start" }}>ROP Bruta: <strong>{vm.rop.brutaPrev}</strong></div>
            </article>
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.rop.varNomPct)}` }}>
              <div
                className="info-tooltip"
                data-tooltip={`Muestra la variación porcentual interanual de los ingresos provinciales anuales disponibles provenientes de la Recaudación provincial, en términos nominales, respecto al año anterior. 

El indicador compara el monto recaudado en el período elegido con el registrado en el mismo período del año previo, sin realizar ajustes por inflación. De esta manera, refleja el crecimiento o la disminución de los recursos en valores corrientes. 

La Recaudación provincial disponible incluye lo recaudado en conceptos de impuestos inmobiliario rural, sellos, ingresos brutos directos e ingresos brutos convenio multilateral menos el 19% correspondiente a los municipios. `}
              >
                ?
              </div>
              <div className="kpi-label">Variación Nominal ROP</div>
              <div className={vm.rop.varNomClass}>{vm.rop.varNomPct}</div>
              <div className="kpi-sub">Interanual</div>
            </article>
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.rop.realPct)}` }}>
              <div
                className="info-tooltip"
                data-tooltip={`Muestra la variación porcentual interanual de los ingresos provinciales anuales disponibles provenientes de la Recaudación provincial ,en términos reales, respecto al año anterior. 

Para ello, primero se ajustan (deflactan) los ingresos provinciales disponibles provenientes de la Recaudación provincial utilizando IPC general del nivel Nacional, con el objetivo de eliminar el efecto de la inflación. Luego, se calcula la variación entre el período elegido y el mismo período del año anterior. De esta manera, el indicador refleja si hubo un aumento o una disminución en el poder de compra de esos recursos.

La Recaudación provincial disponible incluye lo recaudado en conceptos de impuestos inmobiliario rural, sellos, ingresos brutos directos e ingresos brutos convenio multilateral menos el 19% correspondiente a los municipios. `}
              >
                ?
              </div>
              <div className="kpi-label">Variación Real ROP</div>
              <div className={vm.rop.realPctClass}>{vm.rop.realPct}</div>
              <div className="kpi-sub">* Ajustado por inflación</div>
            </article>
          </div>
          <p className="source-text" style={{ padding: "0 3%", textAlign: "left" }}>Fuente: Ministerio de Economía de la Provincia</p>
        </section>
      )}

      {/* 3. SECCIÓN: DISTRIBUCIÓN MUNICIPAL */}
      {vm.muni && (
        <section className="section-group" style={{ marginTop: "2rem" }}>
          <div className="section-header-block">
            <h2>Distribución Municipal</h2>
          </div>
          <div className="hero-grid-flex">
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.muni.current)}` }}>
              <div
                className="info-tooltip"
                data-tooltip={`Monto total  anual acumulado, en pesos corrientes, transferido a municipios en concepto de distribución del 19% de la Recaudación de Origen Provincial y de los Recursos de Origen Nacional correspondiente al año seleccionado.`}
              >
                ?
              </div>
              <div className="kpi-label">{`Distrib. Municipal ${vm.periodLabel}`}</div>
              <div className="kpi-value">{vm.muni.current}</div>
              <div className="kpi-sub" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", fontSize: "0.85rem" }}>
                <span>Orig. Nac.: <strong>{vm.muni.natCurr}</strong></span>
                <span>Orig. Prov.: <strong>{vm.muni.provCurr}</strong></span>
              </div>
            </article>
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.muni.prev)}` }}>
              <div
                className="info-tooltip"
                data-tooltip={`Monto total  anual acumulado, en pesos corrientes, transferido a municipios en concepto de distribución del 19% de la Recaudación de Origen Provincial y de los Recursos de Origen Nacional correspondiente al año anterior al seleccionado.`}
              >
                ?
              </div>
              <div className="kpi-label">{`Distrib. Municipal Año ${prevYear}`}</div>
              <div className="kpi-value">{vm.muni.prev}</div>
              <div className="kpi-sub" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", fontSize: "0.85rem" }}>
                <span>Orig. Nac.: <strong>{vm.muni.natPrev}</strong></span>
                <span>Orig. Prov.: <strong>{vm.muni.provPrev}</strong></span>
              </div>
            </article>
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.muni.varNomPct)}` }}>
              <div
                className="info-tooltip"
                data-tooltip={`Muestra la variación porcentual interanual de la distribución municipal, en términos nominales, respecto al año anterior. 

El indicador compara el monto distribuido en el período elegido con el registrado en el mismo período del año previo, sin realizar ajustes por inflación. De esta manera, refleja el crecimiento o la disminución de los recursos en valores corrientes.`}
              >
                ?
              </div>
              <div className="kpi-label">Variación Nominal Distrib. Municipal</div>
              <div className={vm.muni.varNomClass}>{vm.muni.varNomPct}</div>
              <div className="kpi-sub">Interanual</div>
            </article>
            <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.muni.realPct)}` }}>
              <div
                className="info-tooltip"
                data-tooltip={`Muestra la variación porcentual interanual  de la distribución municipal ,en términos reales, respecto al año anterior. 

Para ello, primero se ajustan (deflactan) los montos en concepto de distribución municipal utilizando IPC general del nivel Nacional, con el objetivo de eliminar el efecto de la inflación. Luego, se calcula la variación entre el período elegido y el mismo período del año anterior. De esta manera, el indicador refleja si hubo un aumento o una disminución en el poder de compra de esos recursos.`}
              >
                ?
              </div>
              <div className="kpi-label">Variación Real Distrib. Municipal</div>
              <div className={vm.muni.realPctClass}>{vm.muni.realPct}</div>
              <div className="kpi-sub">* Ajustado por inflación</div>
            </article>
          </div>
          <p className="source-text" style={{ padding: "0 3%", textAlign: "left" }}>Fuente: INDEC y Ministerio de Economía de la Nación</p>
        </section>
      )}

      {/* 4. SECCIÓN: MASA SALARIAL */}
      <section className="section-group" style={{ marginTop: "2rem" }}>
        <div className="section-header-block">
          <h2>Masa Salarial Total Empleo Provincial</h2>
        </div>
        <div className="hero-grid-flex">
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.masa.current)}` }}>
            <div
              className="info-tooltip"
              data-tooltip={`Muestra la masa salarial total liquidada acumulada en el año, en pesos corrientes, correspondiente al período seleccionado.

El indicador representa la suma total de los salarios abonados en dicho período, expresados en valores nominales, es decir, sin ajuste por inflación.

La masa salarial total incluye los conceptos de salarios,  plus y bonos para los 3 poderes del estado.`}
            >
              ?
            </div>
            <div className="kpi-label">{`Masa Salarial Año ${iterYear}`}</div>
            <div className="kpi-value">{vm.masa.current}</div>
            <div className="kpi-sub" style={{ alignItems: "flex-start" }}>
              <strong>{vm.masa.cobCurr}</strong>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.masa.prev)}` }}>
            <div
              className="info-tooltip"
              data-tooltip={`Muestra la masa salarial total liquidada acumulada en el año, en pesos corrientes, correspondiente al año anterior al seleccionado.

El indicador representa la suma total de los salarios abonados en dicho período, expresados en valores nominales, es decir, sin ajuste por inflación.

La masa salarial total incluye los conceptos de salarios,  plus y bonos para los 3 poderes del estado.`}
            >
              ?
            </div>
            <div className="kpi-label">{`Masa Salarial Año ${prevYear}`}</div>
            <div className="kpi-value">{vm.masa.prev}</div>
            <div className="kpi-sub" style={{ alignItems: "flex-start" }}>
              <span>{vm.masa.cobPrev}</span>
            </div>
          </article>
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.masa.varNomPct)}` }}>
            <div
              className="info-tooltip"
              data-tooltip={`Muestra la variación porcentual interanual de la masa salarial total liquidada en el año en términos nominales del período seleccionado respecto al mismo período del año anterior.

El indicador compara el monto total de salarios liquidados en el período elegido con el registrado en el mismo período del año previo, sin realizar ajustes por inflación. De esta manera, refleja el crecimiento o la disminución de la masa salarial en valores corrientes.

La masa salarial total incluye los conceptos de salarios,  plus y bonos para los 3 poderes del estado.`}
            >
              ?
            </div>
            <div className="kpi-label">Variación Nominal Masa Salarial</div>
            <div className={vm.masa.varNomPctClass}>{vm.masa.varNomPct}</div>
            <div className="kpi-sub">Interanual</div>
          </article>
          <article className="kpi-card" style={{ borderTop: `4px solid ${getBorderColorByValue(vm.masa.realPct)}` }}>
            <div
              className="info-tooltip"
              data-tooltip={`Muestra la variación porcentual interanual de la masa salarial total liquidada en el año en términos reales del período seleccionado respecto al mismo período del año anterior.

Para ello, la masa salarial liquidada se ajusta por inflación utilizando el IPC general del nivel Nacional, con el objetivo de obtener su valor real. Luego se compara el período seleccionado con el mismo período del año previo. De esta manera, el indicador permite analizar la evolución de la masa salarial en términos de poder adquisitivo.

La masa salarial total incluye los conceptos de salarios,  plus y bonos para los 3 poderes del estado.`}
            >
              ?
            </div>
            <div className="kpi-label">Variación Real Masa Salarial</div>
            <div className={vm.masa.realPctClass}>{vm.masa.realPct}</div>
            <div className="kpi-sub">* Ajustado por inflación</div>
          </article>
        </div>
        <p className="source-text" style={{ padding: "0 3%", textAlign: "left" }}>Fuente: Contaduría General de la Provincia de Corrientes</p>
      </section>

      {/* 5. SECCIÓN: GRÁFICOS */}
      <section className="section-group" style={{ marginTop: "2rem" }}>
        <div className="chart-container" style={{ padding: "1rem 3%" }}>
          <div className="section-header-block" style={{ marginBottom: "0.75rem", textAlign: "left" }}>
            <h2>RON Disponible vs Sueldos</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", textAlign: "left" }}>Evolución acumulada mensual</p>
          </div>
          <div
            className="info-tooltip"
            data-tooltip={`Comparación de la recaudación acumulada mes a mes de los ingresos provinciales provenientes de los Recursos de Origen Nacional (RON) frente al monto objetivo para el pago de la masa salarial a lo largo del año.

El valor de los Recursos de Origen Nacional disponibles, surge del RON total descontado los recursos con afectación específica y el porcentaje coparticipable con los municipios. Es decir  incluye la suma de los conceptos de: C.F.I. Neta de Ley N° 26.075, Financiamiento Educativo Ley N° 26.075, Régimen Simplificado para Pequeños Contribuyentes Ley N° 24.977 y Compensación Consenso Fiscal menos el 19% que se redistribuye a municipios.`}
          >
            ?
          </div>
          <div className="chart-wrapper">
            {copaVsMixed && <Chart type="bar" data={copaVsMixed as any} options={copaVsOpts as any} />}
          </div>
          <p className="source-text" style={{ marginTop: "1rem", textAlign: "left" }}>
            Fuente: Ministerio de Economía de la Provincia (RON) / Contaduría General de la Provincia (Salarios)
          </p>
        </div>
      </section>

      <section className="section-group" style={{ marginTop: "2rem" }}>
        <div className="chart-container" style={{ padding: "1rem 3%" }}>
          <div className="section-header-block" style={{ marginBottom: "0.75rem", textAlign: "left" }}>
            <h2>Comportamiento de RON Disponible Mensual</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", textAlign: "left" }}>Comparativa de ingresos mensuales nominales (Billones de pesos)</p>
          </div>
          <div
            className="info-tooltip"
            data-tooltip={`Comparación de la evolución mensual de los ingresos provinciales provenientes de los Recursos de Origen Nacional (RON) en pesos en términos nominales para el año actual seleccionado y el año anterior.

El valor de los Recursos de Origen Nacional disponibles, surge del RON total descontado los recursos con afectación específica y el porcentaje coparticipable con los municipios. Es decir  incluye la suma de los conceptos de: C.F.I. Neta de Ley N° 26.075, Financiamiento Educativo Ley N° 26.075, Régimen Simplificado para Pequeños Contribuyentes Ley N° 24.977 y Compensación Consenso Fiscal menos el 19% que se redistribuye a municipios.`}
          >
            ?
          </div>
          <div className="chart-wrapper">
            {monthlyData && <Bar data={monthlyData} options={monthlyOpts} />}
          </div>
          <p className="source-text" style={{ marginTop: "1rem", textAlign: "left" }}>Fuente: INDEC y Ministerio de Economía de la Nación</p>
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
          <div className="chart-container" style={{ padding: "1rem 3%" }}>
            <div className="section-header-block" style={{ marginBottom: "0.75rem", textAlign: "left" }}>
              <h2>Brecha Recaudación Acumulada Anual</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", textAlign: "left" }}>Efectiva vs Esperada</p>
            </div>
            <div className="info-tooltip" data-tooltip="Comparación acumulada entre los ingresos observados frente a la recaudación que debería haber ingresado (Esperada = 100%) a lo largo de los meses.">?</div>
            <div className="chart-wrapper">
              <Bar data={brechaBundle.chartData} options={brechaOpts} />
            </div>
            <p className="source-text" style={{ marginTop: "1rem", textAlign: "left" }}>Fuente: Ministerio de Economía de la Provincia</p>
          </div>
        </section>
      )}
    </div>
  );
}
