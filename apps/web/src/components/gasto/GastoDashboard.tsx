"use client";

import "@/lib/chart/registerChartJs";
import type { ChartData } from "chart.js";
import { Chart } from "react-chartjs-2";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { fetchWithAuth } from "@/lib/api";

import {
  computeCompositionTable,
  computeHeatmap,
  computeRatioChartData,
  computeWaterfall,
  format1M,
  formatPctOneDecimal,
  formatPctNoDecimals,
} from "@/lib/gasto/logic";

import {
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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function GastoDashboard() {
  const [rawData, setRawData] = useState<GastoRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const { logAction } = useAnalytics();

  useEffect(() => {
    logAction("Gasto", "Acceso a apartado");
  }, [logAction]);

  // Heatmap filters
  const [hmEstado, setHmEstado] = useState("Comprometido");
  const [hmJurisGroup, setHmJurisGroup] = useState("MINISTERIOS");
  const [hmFuente, setHmFuente] = useState<string[]>(["10"]);

  const allPeriodos = useMemo(
    () => [...new Set(rawData.map((d) => d.periodo))].sort(),
    [rawData],
  );
  const allPeriodosDesc = useMemo(() => [...allPeriodos].reverse(), [allPeriodos]);
  const lastPeriodo = allPeriodos.length ? allPeriodos[allPeriodos.length - 1] : "";
  const currentYear = lastPeriodo ? lastPeriodo.split("-")[0] : "";
  const currentYearPeriodos = useMemo(
    () => allPeriodos.filter((p) => p.startsWith(`${currentYear}-`)),
    [allPeriodos, currentYear],
  );
  // Table filters
  const [tblPeriodo, setTblPeriodo] = useState<string[]>([]);
  const [tblFuente, setTblFuente] = useState<string[]>(["10"]);
  const [tblJuris, setTblJuris] = useState<string[]>(["TODAS"]);
  const [tblJurisSearch, setTblJurisSearch] = useState("");

  // Avance filters
  const [avPeriodo, setAvPeriodo] = useState<string[]>([]);
  const [avFuente, setAvFuente] = useState<string[]>(["10"]);
  const [avJuris, setAvJuris] = useState<string[]>(["TODAS"]);
  const [avJurisSearch, setAvJurisSearch] = useState("");

  // Waterfall filters
  const [wfEstado, setWfEstado] = useState("Comprometido");
  const [wfYear, setWfYear] = useState("");
  const [wfJuris, setWfJuris] = useState<string[]>(["TODAS"]);
  const [wfPartida, setWfPartida] = useState<string[]>(["TODAS"]);
  const [wfFuente, setWfFuente] = useState<string[]>(["10"]);
  const [wfJurisSearch, setWfJurisSearch] = useState("");

  useEffect(() => {
    let c = false;
    fetchWithAuth("/copa/copa-api/api/gastos/all-data")
      .then((r) => {
        if (!r.ok) throw new Error("No se pudieron cargar los datos de gasto.");
        return r.json() as Promise<GastoRow[]>;
      })
      .then((rows) => {
        if (c) return;
        setRawData(rows);

        const periodos = [...new Set(rows.map((d) => d.periodo))].sort();
        const last = periodos[periodos.length - 1] || "";
        const year = last ? last.split("-")[0] : "";
        const periodosAnio = year ? periodos.filter((p) => p.startsWith(`${year}-`)) : [];

        setTblPeriodo((prev) => (prev.length === 0 && last ? [last] : prev));
        setAvPeriodo((prev) => (prev.length === 0 && periodosAnio.length ? periodosAnio : prev));
        setWfYear((prev) => (prev || year));
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
    return () => { c = true; };
  }, []);

  const jurisEnBD = useMemo(() => {
    const s = new Set(rawData.map((d) => (d.jurisdiccion || "").trim()));
    return ORDEN_JURISDICCIONES.filter((j) => s.has(j));
  }, [rawData]);

  const heatmap = useMemo(() => {
    if (!rawData.length) return null;
    const fuenteFilter = hmFuente.includes("TODAS") ? null : hmFuente;
    return computeHeatmap({ rawData, estado: hmEstado, jurisGroup: hmJurisGroup, fuenteFilter });
  }, [rawData, hmEstado, hmJurisGroup, hmFuente]);

  const hmFuenteLabel = useMemo(() => {
    if (hmFuente.includes("TODAS")) return "TODAS LAS FUENTES";
    if (hmFuente.length === 1) {
      const opt = FUENTE_OPTS.find((f) => f.value === hmFuente[0]);
      return opt?.label ?? hmFuente[0];
    }
    return `${hmFuente.length} fuentes seleccionadas`;
  }, [hmFuente]);

  const table = useMemo(() => {
    if (!rawData.length) return null;
    const periodoSel = tblPeriodo.length === 0 ? null : tblPeriodo;
    const fuenteSel = tblFuente.includes("TODAS") || tblFuente.length === 0 ? null : tblFuente;
    const jurisSel = tblJuris.includes("TODAS") || tblJuris.length === 0 ? null : tblJuris;
    return computeCompositionTable({ rawData, periodoSel, fuenteSel, jurisSel });
  }, [rawData, tblPeriodo, tblFuente, tblJuris]);

  const filteredTblJuris = useMemo(() => {
    if (!tblJurisSearch.trim()) return jurisEnBD;
    const searchNorm = normalizeText(tblJurisSearch.trim());
    return jurisEnBD.filter((j) => normalizeText(j).includes(searchNorm));
  }, [jurisEnBD, tblJurisSearch]);

  const tblPeriodoLabel = useMemo(() => {
    if (tblPeriodo.length === 1) return tblPeriodo[0];
    return `${tblPeriodo.length} períodos seleccionados`;
  }, [tblPeriodo]);

  const tblFuenteLabel = useMemo(() => {
    if (tblFuente.includes("TODAS")) return "TODAS LAS FUENTES";
    if (tblFuente.length === 1) {
      const opt = FUENTE_OPTS.find((f) => f.value === tblFuente[0]);
      return opt?.label ?? tblFuente[0];
    }
    return `${tblFuente.length} fuentes seleccionadas`;
  }, [tblFuente]);

  const tblJurisLabel = useMemo(() => {
    if (tblJuris.includes("TODAS")) return "TODAS LAS JURISDICCIONES";
    if (tblJuris.length === 1) return tblJuris[0];
    return `${tblJuris.length} jurisdicciones seleccionadas`;
  }, [tblJuris]);

  const ratio = useMemo(() => {
    if (!rawData.length) return null;
    const periodoSel = avPeriodo.length === 0 ? null : avPeriodo;
    const fuenteSel = avFuente.includes("TODAS") || avFuente.length === 0 ? null : avFuente;
    const jurisSel = avJuris.includes("TODAS") || avJuris.length === 0 ? null : avJuris;
    return computeRatioChartData({ rawData, periodoSel, fuenteSel, jurisSel });
  }, [rawData, avPeriodo, avFuente, avJuris]);

  const filteredAvJuris = useMemo(() => {
    if (!avJurisSearch.trim()) return jurisEnBD;
    const searchNorm = normalizeText(avJurisSearch.trim());
    return jurisEnBD.filter((j) => normalizeText(j).includes(searchNorm));
  }, [jurisEnBD, avJurisSearch]);

  const avPeriodoLabel = useMemo(() => {
    if (avPeriodo.length === 1) return avPeriodo[0];
    return `${avPeriodo.length} períodos seleccionados`;
  }, [avPeriodo]);

  const avFuenteLabel = useMemo(() => {
    if (avFuente.includes("TODAS")) return "TODAS LAS FUENTES";
    if (avFuente.length === 1) {
      const opt = FUENTE_OPTS.find((f) => f.value === avFuente[0]);
      return opt?.label ?? avFuente[0];
    }
    return `${avFuente.length} fuentes seleccionadas`;
  }, [avFuente]);

  const avJurisLabel = useMemo(() => {
    if (avJuris.includes("TODAS")) return "TODAS LAS JURISDICCIONES";
    if (avJuris.length === 1) return avJuris[0];
    return `${avJuris.length} jurisdicciones seleccionadas`;
  }, [avJuris]);

  const waterfall = useMemo(() => {
    if (!rawData.length) return null;
    const jurisFilter = wfJuris.includes("TODAS") ? null : wfJuris;
    const partidaFilter = wfPartida.includes("TODAS") ? null : wfPartida;
    const fuenteFilter = wfFuente.includes("TODAS") ? null : wfFuente;
    return computeWaterfall({
      rawData,
      estado: wfEstado,
      year: wfYear || currentYear,
      jurisFilter,
      partidaFilter,
      fuente: fuenteFilter,
    });
  }, [rawData, wfEstado, wfYear, wfJuris, wfPartida, wfFuente, currentYear]);

  const years = useMemo(
    () => [...new Set(allPeriodos.map((p) => p.split("-")[0]))].sort().reverse(),
    [allPeriodos],
  );

  const filteredWfJuris = useMemo(() => {
    if (!wfJurisSearch.trim()) return jurisEnBD;
    const searchNorm = normalizeText(wfJurisSearch.trim());
    return jurisEnBD.filter((j) => normalizeText(j).includes(searchNorm));
  }, [jurisEnBD, wfJurisSearch]);

  const wfJurisLabel = useMemo(() => {
    if (wfJuris.includes("TODAS")) return "TODAS";
    if (wfJuris.length === 1) return wfJuris[0];
    return `${wfJuris.length} jurisdicciones`;
  }, [wfJuris]);

  const wfPartidaLabel = useMemo(() => {
    if (wfPartida.includes("TODAS")) return "Todas";
    if (wfPartida.length === 1) return wfPartida[0];
    return `${wfPartida.length} partidas`;
  }, [wfPartida]);

  const wfFuenteLabel = useMemo(() => {
    if (wfFuente.includes("TODAS")) return "TODAS";
    if (wfFuente.length === 1) {
      const opt = FUENTE_OPTS.find((f) => f.value === wfFuente[0]);
      return opt?.label ?? wfFuente[0];
    }
    return `${wfFuente.length} fuentes`;
  }, [wfFuente]);

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
      {/* 1. HEATMAP */}
      <section className="chart-container heatmap-section" style={{ marginBottom: "3rem" }}>
        <div
          className="info-tooltip"
          data-tooltip="Mapa de calor que muestra la relación entre el crédito comprometido acumulado y el crédito vigente, según partida y jurisdicción. Los colores representan distintos niveles de ejecución presupuestaria."
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
            <select value={hmEstado} onChange={(e) => {
              const v = e.target.value;
              setHmEstado(v);
              logAction("Gasto", "Cambio Estado Heatmap", { estado: v });
            }}>
              <option value="Comprometido">Comprometido</option>
              <option value="Ordenado">Ordenado</option>
            </select>
          </div>
          <div className="sf-group">
            <label>Jurisdicción</label>
            <select value={hmJurisGroup} onChange={(e) => {
              const v = e.target.value;
              setHmJurisGroup(v);
              logAction("Gastos", "Cambio Jurisdicción Heatmap", { grupo: v });
            }}>
              <option value="TODAS">TODAS LAS JURISDICCIONES</option>
              <option value="MINISTERIOS">MINISTERIOS</option>
              <option value="RESTO">RESTO</option>
            </select>
          </div>
          <div className="sf-group">
            <label>Fuente</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{hmFuenteLabel}</summary>
              <div className="gasto-multi-menu">
                <label className="gasto-multi-option">
                  <input
                    type="checkbox"
                    checked={hmFuente.includes("TODAS")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setHmFuente(["TODAS"]);
                      } else {
                        setHmFuente(["10"]);
                      }
                    }}
                  />
                  TODAS LAS FUENTES
                </label>
                {FUENTE_OPTS.filter((f) => f.value !== "TODAS").map((f) => {
                  const checked = hmFuente.includes(f.value);
                  return (
                    <label key={f.value} className="gasto-multi-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          const current = hmFuente.includes("TODAS") ? [] : hmFuente;
                          if (isChecked) {
                            setHmFuente([...new Set([...current, f.value])]);
                          } else {
                            const next = current.filter((v) => v !== f.value);
                            setHmFuente(next.length ? next : ["10"]);
                          }
                        }}
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
            </details>
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
                        className={`heatmap-cell ${c.pct <= 0 ? "is-empty" : ""}`}
                        style={{ backgroundColor: c.color, color: c.textColor }}
                        title={c.title}
                        onClick={c.pct <= 0 ? undefined : () => logAction("Gasto", "Interacción con Heatmap", { jurisdiccion: c.j, partida: row.partida })}
                      >
                        {c.pct <= 0 ? "" : formatPctNoDecimals(c.pct)}
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
        <div className="info-tooltip" data-tooltip="Muestra la composición del gasto por partida presupuestaria, incluyendo crédito vigente, crédito comprometido y gasto ordenado para el mes seleccionado. También se presentan los porcentajes que representan el comprometido y ordenado sobre el crédito vigente -.">?</div>
        <div className="section-header">
          <div>
            <h2 className="section-title">{table?.title ?? "Composición del Gasto"}</h2>
            <p className="section-subtitle">Crédito vigente, comprometido y ordenado por partida</p>
          </div>
        </div>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label>Período</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{tblPeriodoLabel}</summary>
              <div className="gasto-multi-menu">
                {allPeriodosDesc.map((p) => {
                  const checked = tblPeriodo.includes(p);
                  return (
                    <label key={p} className="gasto-multi-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTblPeriodo([...new Set([...tblPeriodo, p])]);
                          } else {
                            const next = tblPeriodo.filter((v) => v !== p);
                            setTblPeriodo(next.length ? next : [lastPeriodo]);
                          }
                        }}
                      />
                      {p}
                    </label>
                  );
                })}
              </div>
            </details>
          </div>
          <div className="sf-group">
            <label>Fuente</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{tblFuenteLabel}</summary>
              <div className="gasto-multi-menu">
                <label className="gasto-multi-option">
                  <input
                    type="checkbox"
                    checked={tblFuente.includes("TODAS")}
                    onChange={(e) => {
                      if (e.target.checked) setTblFuente(["TODAS"]);
                      else setTblFuente(["10"]);
                    }}
                  />
                  TODAS LAS FUENTES
                </label>
                {FUENTE_OPTS.filter((f) => f.value !== "TODAS").map((f) => (
                  <label key={f.value} className="gasto-multi-option">
                    <input
                      type="checkbox"
                      checked={tblFuente.includes(f.value)}
                      onChange={(e) => {
                        const current = tblFuente.includes("TODAS") ? [] : tblFuente;
                        if (e.target.checked) {
                          setTblFuente([...new Set([...current, f.value])]);
                        } else {
                          const next = current.filter((v) => v !== f.value);
                          setTblFuente(next.length ? next : ["10"]);
                        }
                      }}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="sf-group">
            <label>Jurisdicción</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{tblJurisLabel}</summary>
              <div className="gasto-multi-menu">
                <input
                  className="gasto-multi-search"
                  type="text"
                  value={tblJurisSearch}
                  onChange={(e) => setTblJurisSearch(e.target.value)}
                  placeholder="Buscar jurisdicción..."
                />
                <label className="gasto-multi-option">
                  <input
                    type="checkbox"
                    checked={tblJuris.includes("TODAS")}
                    onChange={(e) => {
                      if (e.target.checked) setTblJuris(["TODAS"]);
                      else setTblJuris(jurisEnBD);
                    }}
                  />
                  TODAS LAS JURISDICCIONES
                </label>
                {filteredTblJuris.map((j) => (
                  <label key={j} className="gasto-multi-option">
                    <input
                      type="checkbox"
                      checked={tblJuris.includes(j)}
                      onChange={(e) => {
                        const current = tblJuris.includes("TODAS") ? [] : tblJuris;
                        if (e.target.checked) {
                          setTblJuris([...new Set([...current, j])]);
                        } else {
                          const next = current.filter((v) => v !== j);
                          setTblJuris(next.length ? next : ["TODAS"]);
                        }
                      }}
                    />
                    {j}
                  </label>
                ))}
              </div>
            </details>
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
                <tr key={r.partida} onClick={() => logAction("Gasto", "Interacción con Tabla Composición", { partida: r.partida })}>
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
                  <td className="numeric">{formatPctOneDecimal(r.pesoComp)}</td>
                  <td className="numeric">{formatPctOneDecimal(r.pesoOrd)}</td>
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
        <div className="info-tooltip" data-tooltip="Muestra el porcentaje de crédito comprometido y ordenado respecto al crédito vigente para cada partida presupuestaria. La línea de referencia representa el nivel de ejecución teórico acumulado según la cantidad de meses transcurridos">?</div>
        <div className="section-header">
          <div>
            <h2 className="section-title">Avance de Ejecución por Partida (Acumulado)</h2>
            <p className="section-subtitle">{ratio?.subtitle ?? "Comprometido y Ordenado respecto al Crédito Vigente"}</p>
          </div>
        </div>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label>Período</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{avPeriodoLabel}</summary>
              <div className="gasto-multi-menu">
                {allPeriodosDesc.map((p) => (
                  <label key={p} className="gasto-multi-option">
                    <input
                      type="checkbox"
                      checked={avPeriodo.includes(p)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAvPeriodo([...new Set([...avPeriodo, p])]);
                        } else {
                          const next = avPeriodo.filter((v) => v !== p);
                          setAvPeriodo(next.length ? next : currentYearPeriodos);
                        }
                      }}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="sf-group">
            <label>Fuente</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{avFuenteLabel}</summary>
              <div className="gasto-multi-menu">
                <label className="gasto-multi-option">
                  <input
                    type="checkbox"
                    checked={avFuente.includes("TODAS")}
                    onChange={(e) => {
                      if (e.target.checked) setAvFuente(["TODAS"]);
                      else setAvFuente(["10"]);
                    }}
                  />
                  TODAS LAS FUENTES
                </label>
                {FUENTE_OPTS.filter((f) => f.value !== "TODAS").map((f) => (
                  <label key={f.value} className="gasto-multi-option">
                    <input
                      type="checkbox"
                      checked={avFuente.includes(f.value)}
                      onChange={(e) => {
                        const current = avFuente.includes("TODAS") ? [] : avFuente;
                        if (e.target.checked) {
                          setAvFuente([...new Set([...current, f.value])]);
                        } else {
                          const next = current.filter((v) => v !== f.value);
                          setAvFuente(next.length ? next : ["10"]);
                        }
                      }}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="sf-group">
            <label>Jurisdicción</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{avJurisLabel}</summary>
              <div className="gasto-multi-menu">
                <input
                  className="gasto-multi-search"
                  type="text"
                  value={avJurisSearch}
                  onChange={(e) => setAvJurisSearch(e.target.value)}
                  placeholder="Buscar jurisdicción..."
                />
                <label className="gasto-multi-option">
                  <input
                    type="checkbox"
                    checked={avJuris.includes("TODAS")}
                    onChange={(e) => {
                      if (e.target.checked) setAvJuris(["TODAS"]);
                      else setAvJuris(jurisEnBD);
                    }}
                  />
                  TODAS LAS JURISDICCIONES
                </label>
                {filteredAvJuris.map((j) => (
                  <label key={j} className="gasto-multi-option">
                    <input
                      type="checkbox"
                      checked={avJuris.includes(j)}
                      onChange={(e) => {
                        const current = avJuris.includes("TODAS") ? [] : avJuris;
                        if (e.target.checked) {
                          setAvJuris([...new Set([...current, j])]);
                        } else {
                          const next = current.filter((v) => v !== j);
                          setAvJuris(next.length ? next : ["TODAS"]);
                        }
                      }}
                    />
                    {j}
                  </label>
                ))}
              </div>
            </details>
          </div>
        </div>
        <div className="chart-wrapper" style={{ height: 400 }}>
          {ratio && (
            <Chart
              type="bar"
              data={ratio.chartData as ChartData<"bar">}
              options={{
                ...ratio.options,
                onClick: (_: any, elements: any[]) => {
                  if (elements.length > 0) {
                    logAction("Gasto", "Interacción con Gráfico Avance");
                  }
                }
              } as any}
            />
          )}
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "1rem" }}>
          Fuente: Ministerio de Hacienda y Finanzas de Corrientes.
        </p>
      </section>

      {/* 4. CASCADA */}
      <section className="chart-container full-width-chart" style={{ marginBottom: "3rem" }}>
        <div className="info-tooltip" data-tooltip="Permite observar el avance mensual acumulado de la ejecución presupuestaria respecto a los techos teóricos de ejecución esperado para cada mes.">?</div>
        <div className="section-header">
          <div>
            <h2 className="section-title">Ejecución Acumulada Gráfico Cascada</h2>
            <p className="section-subtitle">Barras flotantes de ejecución mensual vs techos teóricos</p>
          </div>
        </div>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label>Año</label>
            <select value={wfYear} onChange={(e) => setWfYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label>Estado</label>
            <select value={wfEstado} onChange={(e) => setWfEstado(e.target.value)}>
              <option value="Comprometido">Comprometido</option>
              <option value="Ordenado">Ordenado</option>
            </select>
          </div>
          <div className="sf-group">
            <label>Jurisdicción</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{wfJurisLabel}</summary>
              <div className="gasto-multi-menu">
                <input
                  className="gasto-multi-search"
                  type="text"
                  value={wfJurisSearch}
                  onChange={(e) => setWfJurisSearch(e.target.value)}
                  placeholder="Buscar jurisdicción..."
                />
                <label className="gasto-multi-option">
                  <input
                    type="checkbox"
                    checked={wfJuris.includes("TODAS")}
                    onChange={(e) => {
                      if (e.target.checked) setWfJuris(["TODAS"]);
                      else setWfJuris(jurisEnBD);
                    }}
                  />
                  TODAS
                </label>
                {filteredWfJuris.map((j) => (
                  <label key={j} className="gasto-multi-option">
                    <input
                      type="checkbox"
                      checked={wfJuris.includes(j)}
                      onChange={(e) => {
                        const current = wfJuris.includes("TODAS") ? [] : wfJuris;
                        if (e.target.checked) {
                          setWfJuris([...new Set([...current, j])]);
                        } else {
                          const next = current.filter((v) => v !== j);
                          setWfJuris(next.length ? next : ["TODAS"]);
                        }
                      }}
                    />
                    {j}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="sf-group">
            <label>Partida</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{wfPartidaLabel}</summary>
              <div className="gasto-multi-menu">
                <label className="gasto-multi-option">
                  <input
                    type="checkbox"
                    checked={wfPartida.includes("TODAS")}
                    onChange={(e) => {
                      if (e.target.checked) setWfPartida(["TODAS"]);
                      else setWfPartida(ORDEN_PARTIDAS.slice());
                    }}
                  />
                  TODAS
                </label>
                {ORDEN_PARTIDAS.map((p) => (
                  <label key={p} className="gasto-multi-option">
                    <input
                      type="checkbox"
                      checked={wfPartida.includes(p)}
                      onChange={(e) => {
                        const current = wfPartida.includes("TODAS") ? [] : wfPartida;
                        if (e.target.checked) {
                          setWfPartida([...new Set([...current, p])]);
                        } else {
                          const next = current.filter((v) => v !== p);
                          setWfPartida(next.length ? next : ["TODAS"]);
                        }
                      }}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="sf-group">
            <label>Fuente</label>
            <details className="gasto-multi-dropdown">
              <summary className="gasto-multi-trigger">{wfFuenteLabel}</summary>
              <div className="gasto-multi-menu">
                <label className="gasto-multi-option">
                  <input
                    type="checkbox"
                    checked={wfFuente.includes("TODAS")}
                    onChange={(e) => {
                      if (e.target.checked) setWfFuente(["TODAS"]);
                      else setWfFuente(["10"]);
                    }}
                  />
                  TODAS
                </label>
                {FUENTE_OPTS.filter((f) => f.value !== "TODAS").map((f) => (
                  <label key={f.value} className="gasto-multi-option">
                    <input
                      type="checkbox"
                      checked={wfFuente.includes(f.value)}
                      onChange={(e) => {
                        const current = wfFuente.includes("TODAS") ? [] : wfFuente;
                        if (e.target.checked) {
                          setWfFuente([...new Set([...current, f.value])]);
                        } else {
                          const next = current.filter((v) => v !== f.value);
                          setWfFuente(next.length ? next : ["10"]);
                        }
                      }}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </details>
          </div>
        </div>
        <div className="chart-wrapper" style={{ height: 400 }}>
          {waterfall && waterfall.chartData.datasets?.length ? (
            <Chart
              type="bar"
              data={waterfall.chartData as ChartData<"bar">}
              options={{
                ...waterfall.options,
                onClick: (_: any, elements: any[]) => {
                  if (elements.length > 0) {
                    logAction("Gasto", "Interacción con Gráfico Cascada");
                  }
                }
              } as any}
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
