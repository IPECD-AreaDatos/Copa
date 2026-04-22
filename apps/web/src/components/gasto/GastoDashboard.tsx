"use client";

import "@/lib/chart/registerChartJs";
import type { ChartData } from "chart.js";
import { Bar, Chart } from "react-chartjs-2";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

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

const FUENTE_OPTS = [
  { label: "Todas", value: "TODAS" },
  { label: "10 — Rentas Generales (Prov)", value: "10" },
  { label: "11 — Tesoro Nacional", value: "11" },
  { label: "12 — Rec. Propios", value: "12" },
  { label: "13 — Transf. Internas", value: "13" },
  { label: "14 — Otros", value: "14" },
];

type GastoRow = {
  jurisdiccion: string;
  fuente: string;
  partida: string;
  periodo: string;
  importe_vigente: number;
  importe_comprometido: number;
  importe_ordenado: number;
};

function MultiFuente({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <select
      multiple
      className="period-select multi"
      value={value}
      onChange={(e) => {
        const sel = Array.from(e.target.selectedOptions).map((o) => o.value);
        onChange(sel);
      }}
    >
      {FUENTE_OPTS.map((f) => (
        <option key={f.v} value={f.v}>
          {f.l}
        </option>
      ))}
    </select>
  );
}

function MultiPeriodo({
  periodos,
  value,
  onChange,
}: {
  periodos: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <select
      multiple
      className="period-select multi"
      value={value}
      onChange={(e) => {
        const sel = Array.from(e.target.selectedOptions).map((o) => o.value);
        onChange(sel);
      }}
    >
      {periodos.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}

function MultiJuris({
  juris,
  value,
  onChange,
}: {
  juris: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <select
      multiple
      className="period-select multi"
      value={value}
      onChange={(e) => {
        const sel = Array.from(e.target.selectedOptions).map((o) => o.value);
        onChange(sel);
      }}
    >
      {juris.map((j) => (
        <option key={j} value={j}>
          {j}
        </option>
      ))}
    </select>
  );
}

export default function GastoDashboard() {
  const [rawData, setRawData] = useState<GastoRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [hmEstado, setHmEstado] = useState("Comprometido");
  const [hmJurisGroup, setHmJurisGroup] = useState("MINISTERIOS");
  const [hmFuente, setHmFuente] = useState<string[]>(["10"]);

  const allPeriodos = useMemo(
    () => [...new Set(rawData.map((d) => d.periodo))].sort(),
    [rawData],
  );
  const lastPeriodo = allPeriodos.length ? allPeriodos[allPeriodos.length - 1] : "";

  const [tblPeriodo, setTblPeriodo] = useState<string[]>([]);
  const [tblFuente, setTblFuente] = useState<string[]>(["10"]);
  const [tblJuris, setTblJuris] = useState<string[]>([]);

  const [avPeriodo, setAvPeriodo] = useState<string[]>([]);
  const [avFuente, setAvFuente] = useState<string[]>(["10"]);
  const [avJuris, setAvJuris] = useState<string[]>([]);

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
      .then((rows) => {
        if (c) return;
        setRawData(rows);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (lastPeriodo && tblPeriodo.length === 0) setTblPeriodo([lastPeriodo]);
    if (lastPeriodo && avPeriodo.length === 0) setAvPeriodo([lastPeriodo]);
  }, [lastPeriodo, tblPeriodo.length, avPeriodo.length]);

  const jurisEnBD = useMemo(() => {
    const s = new Set(rawData.map((d) => (d.jurisdiccion || "").trim()));
    return ORDEN_JURISDICCIONES.filter((j) => s.has(j));
  }, [rawData]);

  const heatmap = useMemo(() => {
    if (!rawData.length) return null;
    const fuenteFilter =
      hmFuente.length === 0 || hmFuente.length === FUENTE_VALUES.length ? null : hmFuente;
    return computeHeatmap({
      rawData,
      estado: hmEstado,
      jurisGroup: hmJurisGroup,
      fuenteFilter,
    });
  }, [rawData, hmEstado, hmJurisGroup, hmFuente]);

  const table = useMemo(() => {
    if (!rawData.length) return null;
    const periodoSel =
      tblPeriodo.length === 0 || tblPeriodo.length === allPeriodos.length ? null : tblPeriodo;
    const fuenteSel =
      tblFuente.length === 0 || tblFuente.length === FUENTE_VALUES.length ? null : tblFuente;
    const jurisSel =
      tblJuris.length === 0 || tblJuris.length === jurisEnBD.length ? null : tblJuris;
    return computeCompositionTable({ rawData, periodoSel, fuenteSel, jurisSel });
  }, [rawData, tblPeriodo, tblFuente, tblJuris, allPeriodos.length, jurisEnBD.length]);

  const ratio = useMemo(() => {
    if (!rawData.length) return null;
    const periodoSel =
      avPeriodo.length === 0 || avPeriodo.length === allPeriodos.length ? null : avPeriodo;
    const fuenteSel =
      avFuente.length === 0 || avFuente.length === FUENTE_VALUES.length ? null : avFuente;
    const jurisSel =
      avJuris.length === 0 || avJuris.length === jurisEnBD.length ? null : avJuris;
    return computeRatioChartData({
      rawData,
      periodoSel,
      fuenteSel,
      jurisSel,
    });
  }, [rawData, avPeriodo, avFuente, avJuris, allPeriodos.length, jurisEnBD.length]);

  const waterfall = useMemo(() => {
    if (!rawData.length) return null;
    return computeWaterfall({
      rawData,
      estado: wfEstado,
      jurisFilter: wfJuris,
      partidaFilter: wfPartida,
      fuente: wfFuente,
    });
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
      <header className="dashboard-header">
        <div className="title-block">
          <h1 className="text-gradient dashboard-title">Análisis de Gasto Público</h1>
        </div>
        <div className="period-select-wrapper">
          <label className="period-label">Última Actualización:</label>
          <strong>{lastPeriodo}</strong>
        </div>
      </header>

      {/* SECCIÓN 1: HEATMAP */}
      <section className="section-group">
        <div className="chart-container heatmap-section">
          <div
            className="info-tooltip"
            data-tooltip="Mapa de calor del ratio acumulado / Crédito Vigente. Muestra el nivel de ejecución presupuestaria por partida."
          >
            ?
          </div>
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
              <MultiFuente value={hmFuente} onChange={setHmFuente} />
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
        </div>
        <p className="source-text">Fuente: Contaduría General de la Provincia de Corrientes</p>
      </section>

      {/* SECCIÓN 2: COMPOSICIÓN */}
      <section className="section-group">
        <div className="chart-container composition-section">
          <div className="info-tooltip" data-tooltip="Tabla detallada de ejecución por fuente y jurisdicción.">
            ?
          </div>
          <div className="section-header">
            <div>
              <h2 className="section-title">Composición de Ejecución</h2>
              <p className="section-subtitle">Detalle por fuente de financiamiento y organismo</p>
            </div>
          </div>
          <div className="section-filters gasto-filters">
            <div className="sf-group">
              <label>Período</label>
              <MultiPeriodo periodos={allPeriodos} value={tblPeriodo} onChange={setTblPeriodo} />
            </div>
            <div className="sf-group">
              <label>Fuente</label>
              <MultiFuente value={tblFuente} onChange={setTblFuente} />
            </div>
            <div className="sf-group">
              <label>Jurisdicción</label>
              <MultiJuris juris={jurisEnBD} value={tblJuris} onChange={setTblJuris} />
            </div>
          </div>
          <div className="heatmap-scroll-wrapper">
            <table className="composition-table">
              <thead>
                <tr>
                  <th>Organismo</th>
                  <th className="numeric">C. Vigente (M)</th>
                  <th className="numeric">Comprom. (M)</th>
                  <th className="numeric">Ordenado (M)</th>
                  <th className="numeric">% Comp.</th>
                  <th className="numeric">% Ord.</th>
                </tr>
              </thead>
              <tbody>
                {table?.rows.map((r) => (
                  <tr key={r.juris}>
                    <td>{r.juris}</td>
                    <td className="numeric">{format1M(r.cVig)}</td>
                    <td className="numeric">{format1M(r.cComp)}</td>
                    <td className="numeric">{format1M(r.cOrd)}</td>
                    <td className="numeric">{r.pComp}</td>
                    <td className="numeric">{r.pOrd}</td>
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
        </div>
        <p className="source-text">Fuente: Ministerio de Hacienda y Finanzas de Corrientes</p>
      </section>

      {/* SECCIÓN 3: RATIO / AVANCE */}
      <section className="section-group">
        <div className="chart-container full-width-chart">
          <div className="info-tooltip" data-tooltip="Avance de ejecución por partida.">?</div>
          <div className="section-header">
            <div>
              <h2 className="section-title">Avance de Ejecución por Partida (Acumulado)</h2>
              <p className="section-subtitle">{ratio?.subtitle}</p>
            </div>
          </div>
          <div className="section-filters gasto-filters">
            <div className="sf-group">
              <label>Período</label>
              <MultiPeriodo periodos={allPeriodos} value={avPeriodo} onChange={setAvPeriodo} />
            </div>
            <div className="sf-group">
              <label>Fuente</label>
              <MultiFuente value={avFuente} onChange={setAvFuente} />
            </div>
            <div className="sf-group">
              <label>Jurisdicción</label>
              <MultiJuris juris={jurisEnBD} value={avJuris} onChange={setAvJuris} />
            </div>
          </div>
          <div className="chart-wrapper" style={{ height: 400 }}>
            {ratio && (
              <Chart type="bar" data={ratio.chartData as ChartData<"bar">} options={ratio.options} />
            )}
          </div>
        </div>
        <p className="source-text">Fuente: Ministerio de Hacienda y Finanzas de Corrientes</p>
      </section>

      {/* SECCIÓN 4: CASCADA */}
      <section className="section-group">
        <div className="chart-container full-width-chart">
          <div className="info-tooltip" data-tooltip="Gráfico cascada de ejecución mensual.">?</div>
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
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
            <div className="sf-group">
              <label>Partida</label>
              <select value={wfPartida} onChange={(e) => setWfPartida(e.target.value)}>
                <option value="TODAS">Todas</option>
                {ORDEN_PARTIDAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="sf-group">
              <label>Fuente</label>
              <select value={wfFuente} onChange={(e) => setWfFuente(e.target.value)}>
                <option value="TODAS">Todas</option>
                {FUENTE_OPTS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
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
        </div>
        <p className="source-text">Fuente: Contaduría General de la Provincia</p>
      </section>
    </>
  );
}
