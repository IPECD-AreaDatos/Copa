"use client";

import "@/lib/chart/registerChartJs";
import type { ChartData } from "chart.js";
import { Bar, Chart } from "react-chartjs-2";
import { useEffect, useMemo, useState } from "react";

import {
  computeCompositionTable,
  computeHeatmap,
  computeRatioChartData,
  computeWaterfall,
  format1M,
} from "@/lib/gasto/logic";

import {
  FUENTE_VALUES,
  ORDEN_JURISDICCIONES,
  ORDEN_PARTIDAS,
} from "@/lib/gasto/constants";

export type GastoRow = {
  periodo: string;
  jurisdiccion: string;
  tipo_financ: string | number;
  partida: string;
  estado: string;
  monto: number;
};

const FUENTE_OPTS = [
  { label: "Todas las Fuentes", value: "TODAS" },
  { label: "10 - TESORO DE LA PROVINCIA", value: "10" },
  { label: "11 - RECURSOS PROPIOS", value: "11" },
  { label: "12 - FINANCIAMIENTO INTERNO", value: "12" },
  { label: "13 - NACIONAL CON AFECTACIÓN ESPECÍFICA", value: "13" },
  { label: "14 - PROVINCIAL CON AFECTACIÓN ESPECÍFICA", value: "14" },
];

export default function GastoDashboard() {
  const [rawData, setRawData] = useState<GastoRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Heatmap filters
  const [hmEstado, setHmEstado] = useState("Comprometido");
  const [hmJurisGroup, setHmJurisGroup] = useState("MINISTERIOS");
  const [hmFuente, setHmFuente] = useState<string>("10");

  const allPeriodos = useMemo(
    () => [...new Set(rawData.map((d) => d.periodo))].sort(),
    [rawData],
  );
  const lastPeriodo = allPeriodos.length ? allPeriodos[allPeriodos.length - 1] : "";

  // Table filters
  const [tblPeriodo, setTblPeriodo] = useState<string>("");
  const [tblFuente, setTblFuente] = useState<string>("10");
  const [tblJuris, setTblJuris] = useState<string>("");

  // Avance filters
  const [avPeriodo, setAvPeriodo] = useState<string>("");
  const [avFuente, setAvFuente] = useState<string>("10");
  const [avJuris, setAvJuris] = useState<string>("");

  // Waterfall filters
  const [wfEstado, setWfEstado] = useState("Comprometido");
  const [wfJuris, setWfJuris] = useState("TODAS");
  const [wfPartida, setWfPartida] = useState("TODAS");
  const [wfFuente, setWfFuente] = useState("TODAS");

  useEffect(() => {
    let c = false;
    fetch("/data/gasto_data.json")
      .then((r) => {
        if (!r.ok) throw new Error("No se pudieron cargar los datos de gasto.");
        return r.json() as Promise<GastoRow[]>;
      })
      .then((rows) => { if (!c) setRawData(rows); })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
    return () => { c = true; };
  }, []);

  useEffect(() => {
    if (lastPeriodo && !tblPeriodo) setTblPeriodo(lastPeriodo);
    if (lastPeriodo && !avPeriodo) setAvPeriodo(lastPeriodo);
  }, [lastPeriodo, tblPeriodo, avPeriodo]);

  const jurisEnBD = useMemo(() => {
    const s = new Set(rawData.map((d) => (d.jurisdiccion || "").trim()));
    return ORDEN_JURISDICCIONES.filter((j) => s.has(j));
  }, [rawData]);

  const heatmap = useMemo(() => {
    if (!rawData.length) return null;
    const fuenteFilter = hmFuente === "TODAS" ? null : [hmFuente];
    return computeHeatmap({ rawData, estado: hmEstado, jurisGroup: hmJurisGroup, fuenteFilter });
  }, [rawData, hmEstado, hmJurisGroup, hmFuente]);

  const table = useMemo(() => {
    if (!rawData.length) return null;
    const periodoSel = tblPeriodo === "TODAS" || !tblPeriodo ? null : [tblPeriodo];
    const fuenteSel = tblFuente === "TODAS" || !tblFuente ? null : [tblFuente];
    const jurisSel = tblJuris === "TODAS" || !tblJuris ? null : [tblJuris];
    return computeCompositionTable({ rawData, periodoSel, fuenteSel, jurisSel });
  }, [rawData, tblPeriodo, tblFuente, tblJuris]);

  const ratio = useMemo(() => {
    if (!rawData.length) return null;
    const periodoSel = avPeriodo === "TODAS" || !avPeriodo ? null : [avPeriodo];
    const fuenteSel = avFuente === "TODAS" || !avFuente ? null : [avFuente];
    const jurisSel = avJuris === "TODAS" || !avJuris ? null : [avJuris];
    return computeRatioChartData({ rawData, periodoSel, fuenteSel, jurisSel });
  }, [rawData, avPeriodo, avFuente, avJuris]);

  const waterfall = useMemo(() => {
    if (!rawData.length) return null;
    return computeWaterfall({ rawData, estado: wfEstado, jurisFilter: wfJuris, partidaFilter: wfPartida, fuente: wfFuente });
  }, [rawData, wfEstado, wfJuris, wfPartida, wfFuente]);

  if (err) {
    return (
      <div className="chart-container">
        <p style={{ color: "var(--accent-danger)" }}>{err}</p>
      </div>
    );
  }

  if (!rawData.length) {
    return (
      <div className="chart-container">
        <p style={{ color: "var(--text-secondary)" }}>Cargando datos de gasto…</p>
      </div>
    );
  }

  return (
    <>
      {/* ENCABEZADO */}
      <header className="dashboard-header" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="dashboard-title" style={{ textAlign: "left", margin: 0 }}>
          Análisis de Gasto Público
        </h1>
        <div className="period-select-wrapper" style={{ position: "static" }}>
          <label className="period-label">Última Actualización:</label>
          <strong style={{ color: "var(--text-primary)" }}>{lastPeriodo}</strong>
        </div>
      </header>

      {/* 1. HEATMAP */}
      <section className="chart-container heatmap-section" style={{ marginBottom: "3rem" }}>
        <div
          className="info-tooltip"
          data-tooltip="Mapa de calor del ratio acumulado / Crédito Vigente. Tocá una jurisdicción para ocultarla."
        >?</div>
        <div className="section-header">
          <div>
            <h2 className="section-title">{heatmap?.heatmapTitle ?? "Mapa de Calor de Ejecución"}</h2>
            <p className="section-subtitle">Ratio acumulado / Crédito Vigente por partida y organismo</p>
          </div>
        </div>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label>Estado</label>
            <select value={hmEstado} onChange={(e) => setHmEstado(e.target.value)}>
              <option value="Comprometido">Comprometido</option>
              <option value="Ordenado">Ordenado</option>
            </select>
          </div>
          <div className="sf-group">
            <label>Jurisdicción</label>
            <select value={hmJurisGroup} onChange={(e) => setHmJurisGroup(e.target.value)}>
              <option value="TODAS">TODAS LAS JURISDICCIONES</option>
              <option value="MINISTERIOS">MINISTERIOS</option>
              <option value="RESTO">RESTO</option>
            </select>
          </div>
          <div className="sf-group">
            <label>Fuente</label>
            <select
              value={hmFuente}
              onChange={(e) => setHmFuente(e.target.value)}
            >
              <option value="TODAS">TODAS LAS FUENTES</option>
              {FUENTE_OPTS.filter(f => f.value !== "TODAS").map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="heatmap-scroll-wrapper">
          {heatmap && (
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th className="heatmap-corner" />
                  {heatmap.visibleJuris.map((j) => (
                    <th key={j} className="heatmap-juris-header" title={j}>
                      <span>{heatmap.shortName(j)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.rows.map((row) => (
                  <tr key={row.partida}>
                    <td className="heatmap-partida-label">
                      {row.partida} - {row.code}
                    </td>
                    {row.cells.map((c) => (
                      <td
                        key={c.j}
                        className="heatmap-cell"
                        style={{ backgroundColor: c.color }}
                        title={c.title}
                      >
                        {c.pct}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "1rem" }}>
          Fuente: Ministerio de Hacienda y Finanzas de Corrientes.
        </p>
      </section>

      {/* 2. TABLA COMPOSICIÓN */}
      <section className="chart-container" style={{ marginBottom: "3rem" }}>
        <div className="info-tooltip" data-tooltip="Composición del Gasto por partida con Crédito Vigente, Comprometido y Ordenado.">?</div>
        <div className="section-header">
          <div>
            <h2 className="section-title">{table?.title ?? "Composición del Gasto"}</h2>
            <p className="section-subtitle">Crédito vigente, comprometido y ordenado por partida</p>
          </div>
        </div>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label>Período</label>
            <select
              value={tblPeriodo}
              onChange={(e) => setTblPeriodo(e.target.value)}
            >
              {allPeriodos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label>Fuente</label>
            <select
              value={tblFuente}
              onChange={(e) => setTblFuente(e.target.value)}
            >
              {FUENTE_OPTS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label>Jurisdicción</label>
            <select
              value={tblJuris}
              onChange={(e) => setTblJuris(e.target.value)}
            >
              <option value="">Todas las Jurisdicciones</option>
              {jurisEnBD.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-container">
          <table className="data-table" id="gasto-table">
            <thead>
              <tr>
                <th>Partida de Gasto</th>
                <th className="numeric">Crédito Vigente</th>
                <th className="numeric">Comprometido</th>
                <th className="numeric">Ordenado</th>
                <th className="numeric">Comp/Vigente (%)</th>
                <th className="numeric">Ord/Vigente (%)</th>
              </tr>
            </thead>
            <tbody>
              {table?.rows.map((r) => (
                <tr key={r.partida}>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: r.colorDot,
                        marginRight: 8,
                        flexShrink: 0,
                      }}
                    />
                    {r.partida}
                  </td>
                  <td className="numeric">{format1M(r.vigente)}</td>
                  <td className="numeric">{format1M(r.comprometido)}</td>
                  <td className="numeric">{format1M(r.ordenado)}</td>
                  <td className="numeric">{r.pesoComp.toFixed(2)}%</td>
                  <td className="numeric">{r.pesoOrd.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td>
                <td className="numeric">{table ? format1M(table.tV) : ""}</td>
                <td className="numeric">{table ? format1M(table.tC) : ""}</td>
                <td className="numeric">{table ? format1M(table.tO) : ""}</td>
                <td className="numeric">{table?.totalPesoComp}</td>
                <td className="numeric">{table?.totalPesoOrd}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
          Fuente: Ministerio de Hacienda y Finanzas de Corrientes.
        </p>
      </section>

      {/* 3. AVANCE DE EJECUCIÓN */}
      <section className="chart-container full-width-chart" style={{ marginBottom: "3rem" }}>
        <div className="info-tooltip" data-tooltip="Comprometido y Ordenado vs Crédito Vigente. Línea roja = ejecución teórica.">?</div>
        <div className="section-header">
          <div>
            <h2 className="section-title">Avance de Ejecución por Partida (Acumulado)</h2>
            <p className="section-subtitle">{ratio?.subtitle ?? "Comprometido y Ordenado respecto al Crédito Vigente"}</p>
          </div>
        </div>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label>Período</label>
            <select
              value={avPeriodo}
              onChange={(e) => setAvPeriodo(e.target.value)}
            >
              {allPeriodos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label>Fuente</label>
            <select
              value={avFuente}
              onChange={(e) => setAvFuente(e.target.value)}
            >
              {FUENTE_OPTS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label>Jurisdicción</label>
            <select
              value={avJuris}
              onChange={(e) => setAvJuris(e.target.value)}
            >
              <option value="">Todas las Jurisdicciones</option>
              {jurisEnBD.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="chart-wrapper" style={{ height: 400 }}>
          {ratio && (
            <Chart type="bar" data={ratio.chartData as ChartData<"bar">} options={ratio.options} />
          )}
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "1rem" }}>
          Fuente: Ministerio de Hacienda y Finanzas de Corrientes.
        </p>
      </section>

      {/* 4. CASCADA */}
      <section className="chart-container full-width-chart" style={{ marginBottom: "3rem" }}>
        <div className="info-tooltip" data-tooltip="Barras flotantes de ejecución mensual vs techos teóricos (1/12).">?</div>
        <div className="section-header">
          <div>
            <h2 className="section-title">Ejecución Acumulada Gráfico Cascada</h2>
            <p className="section-subtitle">Barras flotantes de ejecución mensual vs techos teóricos</p>
          </div>
        </div>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label>Estado</label>
            <select value={wfEstado} onChange={(e) => setWfEstado(e.target.value)}>
              <option value="Comprometido">Comprometido</option>
              <option value="Ordenado">Ordenado</option>
            </select>
          </div>
          <div className="sf-group">
            <label>Jurisdicción</label>
            <select value={wfJuris} onChange={(e) => setWfJuris(e.target.value)}>
              <option value="TODAS">Todas</option>
              {jurisEnBD.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label>Partida</label>
            <select value={wfPartida} onChange={(e) => setWfPartida(e.target.value)}>
              <option value="TODAS">Todas</option>
              {ORDEN_PARTIDAS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label>Fuente</label>
            <select value={wfFuente} onChange={(e) => setWfFuente(e.target.value)}>
              <option value="TODAS">TODAS</option>
              {FUENTE_OPTS.filter(f => f.value !== "TODAS").map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="chart-wrapper" style={{ height: 400 }}>
          {waterfall && waterfall.chartData.datasets?.length ? (
            <Chart
              type="bar"
              data={waterfall.chartData as ChartData<"bar">}
              options={waterfall.options}
            />
          ) : (
            <div className="chart-placeholder">Cargando gráfico…</div>
          )}
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "1rem" }}>
          Fuente: Ministerio de Hacienda y Finanzas de Corrientes.
        </p>
      </section>
    </>
  );
}
