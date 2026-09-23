"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { fetchWithAuth } from "@/lib/api";
import { format1M, formatPctOneDecimal } from "@/lib/gasto/logic";
import GastoAnalisisMinisterial, { type MinisterialAnalysis } from "./GastoAnalisisMinisterial";

type NumericOption = {
  codigo: number;
  nombre: string;
};

type StateOption = {
  codigo: string;
  nombre: string;
};

type SelectedFilters = {
  anio: number;
  mesDesde: number;
  mesHasta: number;
  fuentes: number[] | null;
  estados: string[] | null;
  jurisdicciones: number[] | null;
  partidas: number[] | null;
  subPartidas: number[] | null;
};

type ChapterRow = {
  codigo: number;
  nombre: string;
  total: number;
  participacion: number;
  filas: number;
  subpartidas: number;
};

type SubpartidaRow = {
  codigo: number;
  nombre: string;
  descripcionReferencia: boolean;
  partida: NumericOption;
  rubro: { codigo: string; nombre: string };
  total: number;
  participacionPartida: number;
  participacionTotal: number;
  acumuladoPartida: number;
  rankPartida: number;
  filas: number;
  jurisdicciones: number;
};

type JurisdictionRow = {
  codigo: number;
  nombre: string;
  mapeada: boolean;
  total: number;
  filas: number;
  partidas: Record<string, number>;
};

type MonthlyRow = {
  mes: number;
  total: number;
  filas: number;
};

type RubroRow = {
  codigo: string;
  nombre: string;
  total: number;
  participacion: number;
  filas: number;
  partidas: number;
  subpartidas: number;
};

type JurisdictionRubroRow = {
  codigo: number;
  nombre: string;
  mapeada: boolean;
  rubro: { codigo: string; nombre: string };
  total: number;
  filas: number;
  partidas: number;
  subpartidas: number;
};

type MonthlyRubroRow = {
  mes: number;
  rubro: { codigo: string; nombre: string };
  total: number;
  filas: number;
};

type JurisdictionSubpartidaRow = {
  jurisdiccion: NumericOption & { mapeada: boolean };
  partida: NumericOption;
  subpartida: {
    codigo: number;
    nombre: string;
    descripcionReferencia: boolean;
  };
  rubro: { codigo: string; nombre: string };
  total: number;
  participacionJurisdiccion: number;
  acumuladoJurisdiccion: number;
  rankJurisdiccion: number;
  filas: number;
  meses: number;
};

type Controls = {
  total_vs_capitulos: number;
  total_vs_rubros: number;
  total_vs_jurisdicciones_rubros: number;
};

export type DesagregadoResponse = {
  meta: {
    source_table: string;
    grain: string;
    requested: SelectedFilters;
    selected: SelectedFilters;
    is_snapshot: boolean;
    snapshot_month: number | null;
    available: {
      years: number[];
      fuentes: NumericOption[];
      estados: StateOption[];
      jurisdicciones: (NumericOption & { mapeada: boolean })[];
      partidas: NumericOption[];
    };
    unmapped_jurisdictions: number[];
    raw_rows: number;
    grouped_rows: number;
    jurisdiction_account_rows: number;
    response_at: string;
    requested_months: number;
    missing_months: number[];
  };
  total: number;
  chapters: ChapterRow[];
  subpartidas: SubpartidaRow[];
  jurisdicciones: JurisdictionRow[];
  monthly: MonthlyRow[];
  rubros: RubroRow[];
  jurisdicciones_rubros: JurisdictionRubroRow[];
  monthly_rubros: MonthlyRubroRow[];
  jurisdiccion_subpartidas: JurisdictionSubpartidaRow[];
  controles: Controls;
  ministerial_analysis: MinisterialAnalysis;
  modificaciones_presupuestarias: { codigo: number; nombre: string; mes: number; original: number | null; vigente: number | null; modificacion: number | null }[];
};

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const FALLBACK_SOURCES: NumericOption[] = [
  { codigo: 10, nombre: "Tesoro de la Provincia" },
  { codigo: 11, nombre: "Recursos propios" },
  { codigo: 12, nombre: "Financiamiento interno" },
  { codigo: 13, nombre: "Nacional con afectación específica" },
  { codigo: 14, nombre: "Provincial con afectación específica" },
];

const RUBRO_COLORS: Record<string, string> = {
  personal: "#2563eb",
  bienes_servicios: "#0f766e",
  transferencias: "#7c3aed",
  coparticipacion: "#b45309",
  seguridad_social: "#db2777",
  bienes_uso: "#0891b2",
  deuda: "#475569",
  otros: "#64748b",
  figurativos: "#94a3b8",
};

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function shortMonth(month: number) {
  return MONTHS[month - 1]?.slice(0, 3) ?? String(month);
}

function formatDifference(value: number) {
  if (Math.abs(value) < 0.01) return format1M(0);
  return `${value < 0 ? "−" : "+"}${format1M(Math.abs(value))}`;
}

function formatControl(value: number) {
  return Math.abs(value) < 0.01 ? "OK" : formatDifference(value);
}

function matchesAccountGroup(row: SubpartidaRow, group: string) {
  if (group === "200+300") return [200, 300].includes(row.partida.codigo);
  if (group === "transferencias") return row.partida.codigo === 500 && ![571, 587].includes(row.codigo);
  if (group === "coparticipacion") return row.partida.codigo === 500 && [571, 587].includes(row.codigo);
  if (group.startsWith("partida:")) return row.partida.codigo === Number(group.slice(8));
  return false;
}

export default function GastosDesagregadosDashboard() {
  const [view, setView] = useState<"ministerial" | "summary">("ministerial");
  const [year, setYear] = useState("2026");
  const [monthFrom, setMonthFrom] = useState("1");
  const [monthTo, setMonthTo] = useState("6");
  const [source, setSource] = useState("10");
  const [state, setState] = useState("Comprometido");
  const [jurisdiction, setJurisdiction] = useState("TODAS");
  // An empty selection means no chapter restriction, as in the API contract.
  const [selectedPartidas, setSelectedPartidas] = useState<number[]>([]);
  const [subpartidaSearch, setSubpartidaSearch] = useState("");
  const [jurisdictionAccountSearch, setJurisdictionAccountSearch] = useState("");
  const [accountGroup, setAccountGroup] = useState("200+300");
  const [goalRowKey, setGoalRowKey] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [data, setData] = useState<DesagregadoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { logAction } = useAnalytics();

  useEffect(() => {
    logAction("Gastos desagregados", "Acceso a apartado");
  }, [logAction]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      anio: year,
      mesDesde: monthFrom,
      mesHasta: monthTo,
      estado: state,
    });
    if (source !== "TODAS") params.set("fuente", source);
    if (jurisdiction !== "TODAS") params.set("jurisdiccion", jurisdiction);
    if (selectedPartidas.length) params.set("partid", selectedPartidas.join(","));

    fetchWithAuth(`/copa/copa-api/api/gastos/desagregados?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { message?: string } | null;
          throw new Error(payload?.message || "No se pudo cargar el desglose de gastos.");
        }
        return response.json() as Promise<DesagregadoResponse>;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Error al cargar datos.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [year, monthFrom, monthTo, source, state, jurisdiction, selectedPartidas]);

  const years = useMemo(() => {
    const values = data?.meta.available.years ?? [2026];
    return [...new Set(values)].sort((a, b) => b - a);
  }, [data]);

  const sources = data?.meta.available.fuentes?.length
    ? data.meta.available.fuentes
    : FALLBACK_SOURCES;
  const states = data?.meta.available.estados?.length
    ? data.meta.available.estados
    : [{ codigo: "Comprometido", nombre: "Comprometido" }];
  const jurisdictions = data?.meta.available.jurisdicciones ?? [];
  const chapters = data?.chapters ?? [];
  // Keep all choices available after filtering, including when the cut is empty.
  const chapterOptions = data?.meta.available.partidas ?? [];
  const chapterSelectionLabel = selectedPartidas.length === 0
    ? "Todas las partidas"
    : selectedPartidas.length === 2 && selectedPartidas.includes(200) && selectedPartidas.includes(300)
      ? "200 + 300 · Bienes y servicios"
      : selectedPartidas.length === 1
        ? `${selectedPartidas[0]} · ${chapterOptions.find((item) => item.codigo === selectedPartidas[0])?.nombre ?? "Partida"}`
        : `Partidas ${selectedPartidas.join(" + ")}`;
  const rubros = data?.rubros ?? [];

  const visibleSubpartidas = useMemo(() => {
    const search = normalizeText(subpartidaSearch.trim());
    return (data?.subpartidas ?? []).filter((row) => {
      if (!search) return true;
      return normalizeText(`${row.codigo} ${row.nombre} ${row.partida.nombre}`).includes(search);
    });
  }, [data, subpartidaSearch]);

  const visibleJurisdictionSubpartidas = useMemo(() => {
    const search = normalizeText(jurisdictionAccountSearch.trim());
    return (data?.jurisdiccion_subpartidas ?? []).filter((row) => {
      if (!search) return true;
      return normalizeText(`${row.jurisdiccion.nombre} ${row.partida.codigo} ${row.subpartida.codigo} ${row.subpartida.nombre} ${row.rubro.nombre}`).includes(search);
    });
  }, [data, jurisdictionAccountSearch]);

  const periodsInScope = data?.meta.requested_months ?? 6;

  const projectionRows = useMemo(() => {
    if (!data || data.meta.is_snapshot) return [];
    return data.jurisdicciones_rubros
      .map((row) => {
        const promedioMensual = row.total / periodsInScope;
        return {
          ...row,
          promedioMensual,
          proyeccionAnual: promedioMensual * 12,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [data, periodsInScope]);

  const selectedProjectionRow = projectionRows.find((row) => `${row.codigo}|${row.rubro.codigo}` === goalRowKey) ?? projectionRows[0];
  const goalMillions = goalInput.trim() ? Number(goalInput.replace(",", ".")) : NaN;
  const goalAmount = Number.isFinite(goalMillions) && goalMillions >= 0 ? goalMillions * 1e6 : null;

  const accountRanking = useMemo(() => {
    const rows = (data?.subpartidas ?? [])
      .filter((row) => matchesAccountGroup(row, accountGroup))
      .sort((a, b) => b.total - a.total || a.codigo - b.codigo);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    return {
      total,
      rows: rows.map((row, index) => {
        const accumulated = rows.slice(0, index + 1).reduce((sum, item) => sum + item.total, 0);
        return {
          ...row,
          rankGroup: index + 1,
          shareGroup: total === 0 ? null : row.total / total * 100,
          cumulativeGroup: total === 0 ? null : accumulated / total * 100,
        };
      }),
    };
  }, [data, accountGroup]);

  const monthlyRubroLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    (data?.monthly_rubros ?? []).forEach((row) => {
      lookup.set(`${row.mes}|${row.rubro.codigo}`, row.total);
    });
    return lookup;
  }, [data]);

  const jurisdictionRubroLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    (data?.jurisdicciones_rubros ?? []).forEach((row) => {
      lookup.set(`${row.codigo}|${row.rubro.codigo}`, row.total);
    });
    return lookup;
  }, [data]);

  const rubroConcentration = useMemo(() => {
    if (!data) return [];
    return data.rubros.map((rubro) => {
      const rows = data.jurisdicciones_rubros
        .filter((row) => row.rubro.codigo === rubro.codigo && row.total !== 0)
        .sort((a, b) => b.total - a.total);
      const topRows = rows.slice(0, 7);
      const topTotal = topRows.reduce((sum, row) => sum + row.total, 0);
      return {
        ...rubro,
        topRows,
        topTotal,
        topShare: rubro.total === 0 ? 0 : (topTotal / rubro.total) * 100,
      };
    });
  }, [data]);

  const maxChapter = Math.max(...chapters.map((row) => Math.abs(row.total)), 1);
  const maxMonthly = Math.max(...(data?.monthly ?? []).map((row) => Math.abs(row.total)), 1);
  const maxJurisdiction = Math.max(...(data?.jurisdicciones ?? []).map((row) => Math.abs(row.total)), 1);
  const selectedChapterCodes = chapters.map((row) => row.codigo);
  const selectedRubroCodes = rubros.map((row) => row.codigo);

  const updateYear = (value: string) => {
    setLoading(true);
    setError(null);
    setGoalInput("");
    setYear(value);
    logAction("Gastos desagregados", "Cambio año", { anio: value });
  };

  const updateState = (value: string) => {
    setLoading(true);
    setError(null);
    setGoalInput("");
    setState(value);
    logAction("Gastos desagregados", "Cambio estado", { estado: value });
  };

  const markFilterChange = () => {
    setLoading(true);
    setError(null);
    setGoalInput("");
  };

  const updatePartidas = (values: number[]) => {
    const next = [...new Set(values)].sort((a, b) => a - b);
    if (next.join(",") === selectedPartidas.join(",")) return;
    markFilterChange();
    setSelectedPartidas(next);
    logAction("Gastos desagregados", "Cambio capítulos", { capitulos: next.length ? next : "todos" });
  };

  if (error && !data) {
    return (
      <section className="chart-container desagregado-page-state">
        <h1 className="section-title">Gastos desagregados</h1>
        <p className="desagregado-error">{error}</p>
      </section>
    );
  }

  if (!data && loading) {
    return (
      <section className="chart-container desagregado-page-state">
        <h1 className="section-title">Gastos desagregados</h1>
        <p className="text-secondary">Cargando el detalle de gastos…</p>
      </section>
    );
  }

  return (
    <div className="desagregado-page" aria-busy={loading}>
      <header className="desagregado-heading">
        <div>
          <h1 className="dashboard-title">Gastos desagregados</h1>
          <p className="section-subtitle">
            Composición por rubro, jurisdicción, partida y cuenta presupuestaria
          </p>
        </div>
        {loading && <span className="desagregado-loading">Actualizando…</span>}
      </header>

      <section className="chart-container desagregado-controls">
        <div className="info-tooltip" data-tooltip="La vista consulta copa_gastos_fte y agrupa los registros en el mismo alcance de los filtros. Los estados son alternativas de ejecución presupuestaria y no deben sumarse entre sí.">?</div>
        <div className="section-header">
          <div>
            <h2 className="section-title">Alcance de la consulta</h2>
            <p className="section-subtitle">Seleccione un corte para explorar el gasto sin perder el código de cuenta.</p>
          </div>
        </div>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label htmlFor="desagregado-year">Año</label>
            <select id="desagregado-year" value={year} onChange={(event) => updateYear(event.target.value)}>
              {years.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="desagregado-month-from">Desde</label>
            <select
              id="desagregado-month-from"
              value={monthFrom}
              onChange={(event) => {
                const value = event.target.value;
                markFilterChange();
                setMonthFrom(value);
                if (Number(value) > Number(monthTo)) setMonthTo(value);
              }}
            >
              {MONTHS.map((value, index) => <option key={value} value={index + 1}>{value}</option>)}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="desagregado-month-to">Hasta</label>
            <select
              id="desagregado-month-to"
              value={monthTo}
              onChange={(event) => {
                const value = event.target.value;
                markFilterChange();
                setMonthTo(value);
                if (Number(value) < Number(monthFrom)) setMonthFrom(value);
              }}
            >
              {MONTHS.map((value, index) => <option key={value} value={index + 1}>{value}</option>)}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="desagregado-source">Fuente</label>
            <select
              id="desagregado-source"
              value={source}
              onChange={(event) => {
                markFilterChange();
                setSource(event.target.value);
                logAction("Gastos desagregados", "Cambio fuente", { fuente: event.target.value });
              }}
            >
              <option value="TODAS">Todas las fuentes</option>
              {sources.map((value) => <option key={value.codigo} value={value.codigo}>{value.codigo} - {value.nombre}</option>)}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="desagregado-state">Estado</label>
            <select id="desagregado-state" value={state} onChange={(event) => updateState(event.target.value)}>
              {states.map((value) => <option key={value.codigo} value={value.codigo}>{value.nombre}</option>)}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="desagregado-jurisdiction">Jurisdicción</label>
            <select
              id="desagregado-jurisdiction"
              value={jurisdiction}
              onChange={(event) => {
                markFilterChange();
                setJurisdiction(event.target.value);
              }}
            >
              <option value="TODAS">Todas las jurisdicciones</option>
              {jurisdictions.map((value) => <option key={value.codigo} value={value.codigo}>{value.nombre}</option>)}
            </select>
          </div>
          <div className="sf-group desagregado-chapter-filter">
            <span className="desagregado-filter-label" id="desagregado-partida-label">Partidas</span>
            <details className="gasto-multi-dropdown" onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}>
              <summary id="desagregado-partida" className="gasto-multi-trigger" aria-label={`Partidas: ${chapterSelectionLabel}`} title={chapterSelectionLabel}>
                <span>{chapterSelectionLabel}</span><span aria-hidden="true">⌄</span>
              </summary>
              <div className="gasto-multi-menu" role="group" aria-labelledby="desagregado-partida-label">
                <button type="button" className="desagregado-chapter-preset" aria-pressed={selectedPartidas.length === 0} onClick={() => updatePartidas([])}>Todas las partidas</button>
                <button type="button" className="desagregado-chapter-preset" aria-pressed={selectedPartidas.length === 2 && selectedPartidas.includes(200) && selectedPartidas.includes(300)} onClick={() => updatePartidas([200, 300])}>200 + 300 · Bienes y servicios</button>
                <p className="desagregado-chapter-help">Seleccione una o varias partidas del gasto (100, 200, 300, etc.). Sin selección se incluyen todas.</p>
                {chapterOptions.map((value) => <label key={value.codigo} className="gasto-multi-option">
                  <input type="checkbox" checked={selectedPartidas.includes(value.codigo)} onChange={(event) => updatePartidas(event.target.checked ? [...selectedPartidas, value.codigo] : selectedPartidas.filter((code) => code !== value.codigo))} />
                  <span>{value.codigo} - {value.nombre}</span>
                </label>)}
              </div>
            </details>
          </div>
        </div>
        {data && (
          <p className="desagregado-scope-note">
            {data.meta.is_snapshot && data.meta.snapshot_month
              ? `Snapshot: ${MONTHS[data.meta.snapshot_month - 1]} ${year}`
              : `Corte: ${MONTHS[Number(monthFrom) - 1]}–${MONTHS[Number(monthTo) - 1]} ${year}`}
            {" · "}{state} · {source === "TODAS" ? "todas las fuentes" : `fuente ${source}`}
            {" · "}{chapterSelectionLabel}
            {data.meta.is_snapshot && " · se usa el último crédito disponible del rango"}
          </p>
        )}
      </section>

      {error && <p className="desagregado-error" role="alert">{error} No se muestran resultados del corte anterior.</p>}
      {data && !error && !loading && (
        <>
          <nav className="desagregado-tabs" aria-label="Vistas de gastos desagregados">
            <button type="button" aria-pressed={view === "ministerial"} onClick={() => setView("ministerial")}>Análisis consolidado</button>
            <button type="button" aria-pressed={view === "summary"} onClick={() => setView("summary")}>Explorador general</button>
          </nav>
          {view === "ministerial" && <GastoAnalisisMinisterial data={data} />}
          {view === "summary" && <>
          <p className="desagregado-scope-note">Vista integral del corte seleccionado para comparar rubros, jurisdicciones, partidas y cuentas, seguir la evolución mensual y controlar los totales.</p>
          <section className="desagregado-kpi-grid" aria-label="Resumen del corte seleccionado">
            <article className="kpi-card">
              <span className="kpi-label">Total seleccionado</span>
              <strong className="kpi-value">{format1M(data.total)}</strong>
              <span className="kpi-sub">Millones de pesos</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Partidas con datos</span>
              <strong className="kpi-value">{formatInteger(data.chapters.length)}</strong>
              <span className="kpi-sub">Sobre {data.meta.available.partidas.length} disponibles</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Cuentas desagregadas</span>
              <strong className="kpi-value">{formatInteger(data.subpartidas.length)}</strong>
              <span className="kpi-sub">Código de subpartida</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Filas de origen</span>
              <strong className="kpi-value">{formatInteger(data.meta.raw_rows)}</strong>
              <span className="kpi-sub">Agrupadas en {formatInteger(data.meta.grouped_rows)} cuentas</span>
            </article>
          </section>

          <section className="desagregado-card-grid">
            <article className="chart-container">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Lectura por rubro</h2>
                  <p className="section-subtitle">Distribución del gasto del corte seleccionado</p>
                </div>
              </div>
              <div className="desagregado-bars">
                {data.rubros.map((row) => (
                  <div className="desagregado-bar-row" key={row.codigo}>
                    <div className="desagregado-bar-label">
                      <span><b>{row.nombre}</b></span>
                      <strong>{format1M(row.total)}</strong>
                    </div>
                    <div className="desagregado-bar-track">
                      <span
                        style={{
                          width: `${Math.min(100, (Math.abs(row.total) / Math.max(...data.rubros.map((item) => Math.abs(item.total)), 1)) * 100)}%`,
                          background: RUBRO_COLORS[row.codigo] || "var(--brand-green)",
                        }}
                      />
                    </div>
                    <div className="desagregado-bar-meta">
                      <span>{formatPctOneDecimal(row.participacion)}</span>
                      <span>{row.subpartidas} cuentas · {row.filas} filas</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="source-text desagregado-inline-note">
                Bienes y servicios agrupa las partidas 200 y 300. Transferencias excluye las cuentas 533, 571 y 587, que se muestran por separado.
              </p>
            </article>

            <article className="chart-container">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Evolución mensual por rubro</h2>
                  <p className="section-subtitle">Montos mensuales de cada rubro en el corte seleccionado</p>
                </div>
              </div>
              <div className="desagregado-table-scroll">
                <table className="data-table desagregado-table desagregado-rubro-month-table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      {selectedRubroCodes.map((code) => (
                        <th className="numeric" key={code}>{data.rubros.find((row) => row.codigo === code)?.nombre}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map((month) => (
                      <tr key={month.mes}>
                        <td><strong>{MONTHS[month.mes - 1]}</strong></td>
                        {selectedRubroCodes.map((code) => (
                          <td className="numeric" key={code}>{format1M(monthlyRubroLookup.get(`${month.mes}|${code}`) ?? 0)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="chart-container">
            <div className="section-header">
              <div>
                <h2 className="section-title">Concentración por rubro</h2>
                <p className="section-subtitle">Ranking de jurisdicciones y participación acumulada dentro de cada rubro</p>
              </div>
            </div>
            <div className="desagregado-table-scroll">
              <table className="data-table desagregado-table desagregado-concentration-table">
                <thead>
                  <tr>
                    <th>Rubro</th>
                    <th className="numeric">Total rubro</th>
                    <th className="numeric">Top 7</th>
                    <th className="numeric">Participación top 7</th>
                    <th>Principales jurisdicciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rubroConcentration.map((row) => (
                    <tr key={row.codigo}>
                      <td><strong>{row.nombre}</strong></td>
                      <td className="numeric">{format1M(row.total)}</td>
                      <td className="numeric">{format1M(row.topTotal)}</td>
                      <td className="numeric">{formatPctOneDecimal(row.topShare)}</td>
                      <td className="desagregado-description-cell">
                        {row.topRows.map((jurisdictionRow) => `${jurisdictionRow.nombre} (${format1M(jurisdictionRow.total)})`).join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="chart-container">
            <div className="section-header">
              <div>
                <h2 className="section-title">Ejecución por jurisdicción y rubro</h2>
                <p className="section-subtitle">Seguridad social se presenta por separado. En «Análisis consolidado» se integra en Transferencias.</p>
              </div>
            </div>
            <div className="desagregado-table-scroll">
              <table className="data-table desagregado-table desagregado-matrix-table">
                <thead>
                  <tr>
                    <th>Jurisdicción</th>
                    {data.rubros.map((row) => <th className="numeric" key={row.codigo}>{row.nombre}</th>)}
                    <th className="numeric">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jurisdicciones.map((jurisdictionRow) => (
                    <tr key={jurisdictionRow.codigo}>
                      <td title={jurisdictionRow.mapeada ? undefined : "Código de jurisdicción sin equivalencia en la tabla de dimensiones"}>
                        <span className={!jurisdictionRow.mapeada ? "desagregado-unmapped" : undefined}>{jurisdictionRow.nombre}</span>
                      </td>
                      {data.rubros.map((rubro) => (
                        <td className="numeric" key={rubro.codigo}>
                          {format1M(jurisdictionRubroLookup.get(`${jurisdictionRow.codigo}|${rubro.codigo}`) ?? 0)}
                        </td>
                      ))}
                      <td className="numeric"><strong>{format1M(jurisdictionRow.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {!data.meta.is_snapshot && <section className="chart-container">
            <div className="section-header">
              <div>
                <h2 className="section-title">Promedio mensual y proyección simple</h2>
                <p className="section-subtitle">Total del corte, promedio observado y ritmo anualizado por jurisdicción y rubro</p>
              </div>
            </div>
            <p className="desagregado-scope-note">
              El promedio divide el total por {periodsInScope} {periodsInScope === 1 ? "mes seleccionado" : "meses seleccionados"}; el ritmo anual multiplica ese promedio por 12. Puede ingresar una meta mensual para comparar un organismo y rubro del corte actual.
            </p>
            {selectedProjectionRow && <div className="analysis-controls">
              <label>Jurisdicción y rubro para comparar
                <select value={`${selectedProjectionRow.codigo}|${selectedProjectionRow.rubro.codigo}`} onChange={(event) => { setGoalRowKey(event.target.value); setGoalInput(""); }}>
                  {projectionRows.map((row) => <option key={`${row.codigo}|${row.rubro.codigo}`} value={`${row.codigo}|${row.rubro.codigo}`}>{row.nombre} · {row.rubro.nombre}</option>)}
                </select>
              </label>
              <label>Meta mensual de comparación (M$)
                <input inputMode="decimal" type="text" value={goalInput} onChange={(event) => setGoalInput(event.target.value)} placeholder="Ingresar monto" aria-label="Meta mensual de comparación en millones de pesos" />
              </label>
            </div>}
            {selectedProjectionRow && <p className="source-text desagregado-inline-note">
              Promedio mensual: {format1M(selectedProjectionRow.promedioMensual)}.
              {goalAmount !== null
                ? ` Diferencia frente a la meta ingresada: ${formatDifference(selectedProjectionRow.promedioMensual - goalAmount)}.`
                : goalInput.trim()
                  ? " Ingrese un monto no negativo en millones de pesos, sin separadores de miles."
                  : " La meta es opcional, se usa sólo para esta comparación y no se guarda."}
            </p>}
            <div className="desagregado-table-scroll desagregado-detail-scroll">
              <table className="data-table desagregado-table desagregado-projection-table">
                <thead>
                  <tr>
                    <th>Jurisdicción</th>
                    <th>Rubro</th>
                    <th className="numeric">Total corte</th>
                    <th className="numeric">Prom. mensual</th>
                    <th className="numeric">Ritmo × 12</th>
                  </tr>
                </thead>
                <tbody>
                  {projectionRows.map((row) => (
                    <tr key={`${row.codigo}-${row.rubro.codigo}`}>
                      <td>{row.nombre}</td>
                      <td>{row.rubro.nombre}</td>
                      <td className="numeric">{format1M(row.total)}</td>
                      <td className="numeric">{format1M(row.promedioMensual)}</td>
                      <td className="numeric">{format1M(row.proyeccionAnual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>}

          <section className="chart-container">
            <div className="section-header">
              <div>
                <h2 className="section-title">Ranking de cuentas por jurisdicción</h2>
                <p className="section-subtitle">Detalle completo con porcentaje dentro de cada jurisdicción.</p>
              </div>
              <div className="desagregado-search-wrap">
                <label htmlFor="desagregado-jurisdiction-account-search">Buscar cuenta o jurisdicción</label>
                <input
                  id="desagregado-jurisdiction-account-search"
                  className="gasto-multi-search desagregado-search"
                  type="search"
                  value={jurisdictionAccountSearch}
                  onChange={(event) => setJurisdictionAccountSearch(event.target.value)}
                  placeholder="Código, descripción u organismo"
                />
              </div>
            </div>
            <div className="desagregado-table-scroll desagregado-detail-scroll">
              <table className="data-table desagregado-table desagregado-account-jurisdiction-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Jurisdicción</th>
                    <th>Rubro</th>
                    <th>Partida</th>
                    <th>Cuenta</th>
                    <th>Descripción</th>
                    <th className="numeric">Monto</th>
                    <th className="numeric">% jurisdicción</th>
                    <th className="numeric">% acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleJurisdictionSubpartidas.map((row) => (
                    <tr key={`${row.jurisdiccion.codigo}-${row.partida.codigo}-${row.subpartida.codigo}`}>
                      <td className="numeric">{row.rankJurisdiccion}</td>
                      <td>{row.jurisdiccion.nombre}</td>
                      <td>{row.rubro.nombre}</td>
                      <td>{row.partida.codigo}</td>
                      <td><strong>{row.subpartida.codigo}</strong></td>
                      <td>
                        {row.subpartida.nombre}
                        {!row.subpartida.descripcionReferencia && <span className="desagregado-reference-note"> · etiqueta pendiente</span>}
                      </td>
                      <td className={`numeric ${row.total < 0 ? "desagregado-negative" : ""}`}>{format1M(row.total)}</td>
                      <td className="numeric">{formatPctOneDecimal(row.participacionJurisdiccion)}</td>
                      <td className="numeric">{formatPctOneDecimal(row.acumuladoJurisdiccion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleJurisdictionSubpartidas.length && <p className="desagregado-empty">No hay cuentas para esa búsqueda.</p>}
            </div>
            <p className="source-text desagregado-inline-note">
              Se muestran {formatInteger(visibleJurisdictionSubpartidas.length)} de {formatInteger(data.meta.jurisdiction_account_rows)} combinaciones jurisdicción-cuenta disponibles en el corte.
            </p>
          </section>

          <section className="desagregado-card-grid">
            <article className="chart-container">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Composición por partida</h2>
                  <p className="section-subtitle">Participación del total seleccionado</p>
                </div>
              </div>
              <div className="desagregado-bars">
                {data.chapters.map((row) => (
                  <div className="desagregado-bar-row" key={row.codigo}>
                    <div className="desagregado-bar-label">
                      <span><b>{row.codigo}</b> · {row.nombre}</span>
                      <strong>{format1M(row.total)}</strong>
                    </div>
                    <div className="desagregado-bar-track">
                      <span style={{ width: `${Math.min(100, (Math.abs(row.total) / maxChapter) * 100)}%` }} />
                    </div>
                    <div className="desagregado-bar-meta">
                      <span>{formatPctOneDecimal(row.participacion)}</span>
                      <span>{row.subpartidas} cuentas</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="chart-container">
              <div className="section-header">
                <div>
                  <h2 className="section-title">{data.meta.is_snapshot ? "Snapshot mensual" : "Evolución mensual"}</h2>
                  <p className="section-subtitle">
                    {data.meta.is_snapshot ? "Crédito del último mes disponible del rango" : "Monto del mismo alcance por mes"}
                  </p>
                </div>
              </div>
              <div className="desagregado-monthly-chart" role="img" aria-label="Evolución mensual del gasto seleccionado">
                {data.monthly.map((row) => (
                  <div className="desagregado-month-column" key={row.mes}>
                    <span className="desagregado-month-value">{format1M(row.total)}</span>
                    <div className="desagregado-month-track">
                      <span style={{ height: `${Math.min(100, (Math.abs(row.total) / maxMonthly) * 100)}%` }} />
                    </div>
                    <span className="desagregado-month-label">{shortMonth(row.mes)}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="chart-container">
            <div className="section-header">
              <div>
                <h2 className="section-title">Desglose por jurisdicción y partida</h2>
                <p className="section-subtitle">Comparación del mismo corte entre organismos</p>
              </div>
            </div>
            <div className="desagregado-table-scroll">
              <table className="data-table desagregado-table">
                <thead>
                  <tr>
                    <th>Jurisdicción</th>
                    {selectedChapterCodes.map((code) => <th className="numeric" key={code}>{code}</th>)}
                    <th className="numeric">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jurisdicciones.map((row) => (
                    <tr key={row.codigo}>
                      <td title={row.mapeada ? undefined : "Código de jurisdicción sin equivalencia en la tabla de dimensiones"}>
                        <span className={!row.mapeada ? "desagregado-unmapped" : undefined}>{row.nombre}</span>
                      </td>
                      {selectedChapterCodes.map((code) => (
                        <td className="numeric" key={code}>{format1M(row.partidas[String(code)] ?? 0)}</td>
                      ))}
                      <td className="numeric"><strong>{format1M(row.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="chart-container">
            <div className="section-header">
              <div>
                <h2 className="section-title">Cuentas presupuestarias</h2>
                <p className="section-subtitle">Ordenadas por monto dentro de cada partida; las participaciones conservan el signo del monto.</p>
              </div>
              <div className="desagregado-search-wrap">
                <label htmlFor="desagregado-subpartida-search">Buscar cuenta</label>
                <input
                  id="desagregado-subpartida-search"
                  className="gasto-multi-search desagregado-search"
                  type="search"
                  value={subpartidaSearch}
                  onChange={(event) => setSubpartidaSearch(event.target.value)}
                  placeholder="Código o descripción"
                />
              </div>
            </div>
            <div className="desagregado-table-scroll desagregado-detail-scroll">
              <table className="data-table desagregado-table">
                <thead>
                  <tr>
                    <th>Partida</th>
                    <th>Rubro</th>
                    <th className="numeric">Rank</th>
                    <th>Cuenta</th>
                    <th>Descripción</th>
                    <th className="numeric">Monto</th>
                    <th className="numeric">% partida</th>
                    <th className="numeric">% acum. partida</th>
                    <th className="numeric">% total</th>
                    <th className="numeric">Jurisdicciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSubpartidas.map((row) => (
                    <tr key={`${row.partida.codigo}-${row.codigo}`}>
                      <td>{row.partida.codigo} · {row.partida.nombre}</td>
                      <td>{row.rubro.nombre}</td>
                      <td className="numeric">{row.rankPartida}</td>
                      <td><strong>{row.codigo}</strong></td>
                      <td className="desagregado-description-cell">
                        {row.nombre}
                        {!row.descripcionReferencia && <span className="desagregado-reference-note"> · etiqueta pendiente</span>}
                      </td>
                      <td className={`numeric ${row.total < 0 ? "desagregado-negative" : ""}`}>{format1M(row.total)}</td>
                      <td className="numeric">{formatPctOneDecimal(row.participacionPartida)}</td>
                      <td className="numeric">{formatPctOneDecimal(row.acumuladoPartida)}</td>
                      <td className="numeric">{formatPctOneDecimal(row.participacionTotal)}</td>
                      <td className="numeric">{row.jurisdicciones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleSubpartidas.length && <p className="desagregado-empty">No hay cuentas para esa búsqueda.</p>}
            </div>
            <p className="source-text">Las cuentas sin descripción disponible se identifican por su código.</p>
          </section>

          <section className="chart-container">
            <div className="section-header">
              <div>
                <h2 className="section-title">Ranking global de cuentas</h2>
                <p className="section-subtitle">Monto, participación y porcentaje acumulado dentro del grupo elegido.</p>
              </div>
              <div className="desagregado-search-wrap">
                <label htmlFor="desagregado-account-group">Grupo de cuentas</label>
                <select id="desagregado-account-group" value={accountGroup} onChange={(event) => setAccountGroup(event.target.value)}>
                  <option value="200+300">Bienes y servicios · 200 + 300</option>
                  <option value="transferencias">Transferencias · 500 sin coparticipación</option>
                  <option value="coparticipacion">Coparticipación · cuentas 571 y 587</option>
                  {chapterOptions.map((partida) => <option key={partida.codigo} value={`partida:${partida.codigo}`}>Partida {partida.codigo} · {partida.nombre}</option>)}
                </select>
              </div>
            </div>
            <p className="source-text desagregado-inline-note">Total del grupo: {format1M(accountRanking.total)}. El ranking usa todas las cuentas del corte y conserva los ajustes negativos.</p>
            <div className="desagregado-table-scroll desagregado-detail-scroll">
              <table className="data-table desagregado-table">
                <thead><tr><th className="numeric">#</th><th>Cuenta</th><th>Descripción</th><th>Partida</th><th className="numeric">Monto</th><th className="numeric">% del grupo</th><th className="numeric">% acumulado</th><th className="numeric">Jurisdicciones</th></tr></thead>
                <tbody>{accountRanking.rows.map((row) => <tr key={`${row.partida.codigo}-${row.codigo}`}>
                  <td className="numeric">{row.rankGroup}</td>
                  <td><strong>{row.codigo}</strong></td>
                  <td>{row.nombre}</td>
                  <td>{row.partida.codigo}</td>
                  <td className={`numeric ${row.total < 0 ? "desagregado-negative" : ""}`}>{format1M(row.total)}</td>
                  <td className="numeric">{row.shareGroup === null ? "—" : formatPctOneDecimal(row.shareGroup)}</td>
                  <td className="numeric">{row.cumulativeGroup === null ? "—" : formatPctOneDecimal(row.cumulativeGroup)}</td>
                  <td className="numeric">{row.jurisdicciones}</td>
                </tr>)}</tbody>
              </table>
              {!accountRanking.rows.length && <p className="desagregado-empty">No hay cuentas de este grupo en el corte seleccionado.</p>}
            </div>
          </section>

          <section className="chart-container">
            <div className="section-header">
              <div>
                <h2 className="section-title">Concentración por jurisdicción</h2>
                <p className="section-subtitle">Total del corte seleccionado por organismo</p>
              </div>
            </div>
            <div className="desagregado-jurisdiction-list">
              {data.jurisdicciones.slice(0, 12).map((row) => (
                <div className="desagregado-jurisdiction-row" key={row.codigo}>
                  <div className="desagregado-jurisdiction-heading">
                    <span>{row.nombre}</span>
                    <strong>{format1M(row.total)}</strong>
                  </div>
                  <div className="desagregado-bar-track">
                    <span style={{ width: `${Math.min(100, (Math.abs(row.total) / maxJurisdiction) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="chart-container">
            <div className="section-header">
              <div>
                <h2 className="section-title">Controles de consistencia</h2>
                <p className="section-subtitle">Diferencia entre el total seleccionado y sus aperturas por partida, rubro y jurisdicción.</p>
              </div>
            </div>
            <div className="desagregado-control-grid">
              <div>
                <span className="desagregado-control-label">Total vs. partidas</span>
                <strong>{formatControl(data.controles.total_vs_capitulos)}</strong>
              </div>
              <div>
                <span className="desagregado-control-label">Total vs. rubros</span>
                <strong>{formatControl(data.controles.total_vs_rubros)}</strong>
              </div>
              <div>
                <span className="desagregado-control-label">Total vs. matriz jurisdicción</span>
                <strong>{formatControl(data.controles.total_vs_jurisdicciones_rubros)}</strong>
              </div>
            </div>
          </section>

          </>}
          <p className="source-text desagregado-source-line">
            Fuente de datos: {data.meta.source_table}. Grano: {data.meta.grain}. La respuesta se actualizó en la consulta actual.
          </p>
        </>
      )}
    </div>
  );
}
