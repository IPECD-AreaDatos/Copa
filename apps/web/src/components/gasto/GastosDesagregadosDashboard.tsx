"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { fetchWithAuth } from "@/lib/api";
import { format1M, formatPctOneDecimal } from "@/lib/gasto/logic";

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
  total: number;
  participacionPartida: number;
  participacionTotal: number;
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

type DesagregadoResponse = {
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
    description_source: string;
    raw_rows: number;
    grouped_rows: number;
    response_at: string;
  };
  total: number;
  chapters: ChapterRow[];
  subpartidas: SubpartidaRow[];
  jurisdicciones: JurisdictionRow[];
  monthly: MonthlyRow[];
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

export default function GastosDesagregadosDashboard() {
  const [year, setYear] = useState("2026");
  const [monthFrom, setMonthFrom] = useState("1");
  const [monthTo, setMonthTo] = useState("6");
  const [source, setSource] = useState("10");
  const [state, setState] = useState("Comprometido");
  const [jurisdiction, setJurisdiction] = useState("TODAS");
  const [partida, setPartida] = useState("TODAS");
  const [subpartidaSearch, setSubpartidaSearch] = useState("");
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
    if (partida !== "TODAS") params.set("partid", partida);

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
  }, [year, monthFrom, monthTo, source, state, jurisdiction, partida]);

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

  const visibleSubpartidas = useMemo(() => {
    const search = normalizeText(subpartidaSearch.trim());
    return (data?.subpartidas ?? []).filter((row) => {
      if (!search) return true;
      return normalizeText(`${row.codigo} ${row.nombre} ${row.partida.nombre}`).includes(search);
    });
  }, [data, subpartidaSearch]);

  const maxChapter = Math.max(...chapters.map((row) => Math.abs(row.total)), 1);
  const maxMonthly = Math.max(...(data?.monthly ?? []).map((row) => Math.abs(row.total)), 1);
  const maxJurisdiction = Math.max(...(data?.jurisdicciones ?? []).map((row) => Math.abs(row.total)), 1);
  const selectedChapterCodes = chapters.map((row) => row.codigo);

  const updateYear = (value: string) => {
    setLoading(true);
    setError(null);
    setYear(value);
    logAction("Gastos desagregados", "Cambio año", { anio: value });
  };

  const updateState = (value: string) => {
    setLoading(true);
    setError(null);
    setState(value);
    logAction("Gastos desagregados", "Cambio estado", { estado: value });
  };

  const markFilterChange = () => {
    setLoading(true);
    setError(null);
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
            Composición por jurisdicción, capítulo y cuenta presupuestaria
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
          <div className="sf-group">
            <label htmlFor="desagregado-partida">Capítulo</label>
            <select
              id="desagregado-partida"
              value={partida}
              onChange={(event) => {
                markFilterChange();
                setPartida(event.target.value);
              }}
            >
              <option value="TODAS">Todos los capítulos</option>
              {chapters.map((value) => <option key={value.codigo} value={value.codigo}>{value.codigo} - {value.nombre}</option>)}
            </select>
          </div>
        </div>
        {data && (
          <p className="desagregado-scope-note">
            {data.meta.is_snapshot && data.meta.snapshot_month
              ? `Snapshot: ${MONTHS[data.meta.snapshot_month - 1]} ${year}`
              : `Corte: ${MONTHS[Number(monthFrom) - 1]}–${MONTHS[Number(monthTo) - 1]} ${year}`}
            {" · "}{state} · {source === "TODAS" ? "todas las fuentes" : `fuente ${source}`}
            {data.meta.is_snapshot && " · se usa el último crédito disponible del rango"}
          </p>
        )}
      </section>

      {data && (
        <>
          <section className="desagregado-kpi-grid" aria-label="Resumen del corte seleccionado">
            <article className="kpi-card">
              <span className="kpi-label">Total seleccionado</span>
              <strong className="kpi-value">{format1M(data.total)}</strong>
              <span className="kpi-sub">Millones de pesos</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Capítulos con datos</span>
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
                  <h2 className="section-title">Composición por capítulo</h2>
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
                <h2 className="section-title">Desglose por jurisdicción y capítulo</h2>
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
                <p className="section-subtitle">Ordenadas por monto dentro de cada capítulo; las participaciones conservan el signo del monto.</p>
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
                    <th>Capítulo</th>
                    <th>Cuenta</th>
                    <th>Descripción</th>
                    <th className="numeric">Monto</th>
                    <th className="numeric">% capítulo</th>
                    <th className="numeric">% total</th>
                    <th className="numeric">Jurisdicciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSubpartidas.map((row) => (
                    <tr key={`${row.partida.codigo}-${row.codigo}`}>
                      <td>{row.partida.codigo} · {row.partida.nombre}</td>
                      <td><strong>{row.codigo}</strong></td>
                      <td>
                        {row.nombre}
                        {!row.descripcionReferencia && <span className="desagregado-reference-note"> · etiqueta pendiente</span>}
                      </td>
                      <td className={`numeric ${row.total < 0 ? "desagregado-negative" : ""}`}>{format1M(row.total)}</td>
                      <td className="numeric">{formatPctOneDecimal(row.participacionPartida)}</td>
                      <td className="numeric">{formatPctOneDecimal(row.participacionTotal)}</td>
                      <td className="numeric">{row.jurisdicciones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleSubpartidas.length && <p className="desagregado-empty">No hay cuentas para esa búsqueda.</p>}
            </div>
            <p className="source-text">{data.meta.description_source}</p>
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

          <p className="source-text desagregado-source-line">
            Fuente de datos: {data.meta.source_table}. Grano: {data.meta.grain}. La respuesta se actualizó en la consulta actual.
          </p>
        </>
      )}
    </div>
  );
}
