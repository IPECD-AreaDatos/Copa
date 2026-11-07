"use client";

import { useEffect, useState } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { fetchWithAuth } from "@/lib/api";
import type { CopaUser } from "@/hooks/useDashboardSession";
import { canAccessEconomicPosition } from "@/lib/access";
import GastoAnalisisMinisterial, {
  type MinisterialAnalysis,
} from "./GastoAnalisisMinisterial";
import GastoExplorador from "./GastoExplorador";
import GastoMultiSelect from "./GastoMultiSelect";
import GastoPosicionEconomica from "./GastoPosicionEconomica";
import { MONTHS } from "./GastoEvolucion";

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
    access?: CopaUser["access"];
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
  monthly_jurisdicciones_rubros: {
    codigo: number;
    nombre: string;
    mes: number;
    rubro: { codigo: string };
    total: number;
  }[];
  jurisdiccion_subpartidas: JurisdictionSubpartidaRow[];
  controles: Controls;
  ministerial_analysis: MinisterialAnalysis;
  modificaciones_presupuestarias: {
    codigo: number;
    nombre: string;
    mes: number;
    original: number | null;
    vigente: number | null;
    modificacion: number | null;
  }[];
};

export default function GastosDesagregadosDashboard({
  user,
}: {
  user: CopaUser;
}) {
  const access = user.access;
  const economicAllowed = canAccessEconomicPosition(user);
  const institutionOnly = access?.scope === "institution";
  const singleInstitution =
    institutionOnly && access.jurisdictions.length === 1;
  const [view, setView] = useState<"ministerial" | "summary" | "economic">(
    "ministerial",
  );
  const [year, setYear] = useState("");
  const [monthFrom, setMonthFrom] = useState("1");
  const [monthTo, setMonthTo] = useState("");
  const [sources, setSources] = useState<number[]>([10]);
  const [state, setState] = useState("Comprometido");
  const [jurisdiction, setJurisdiction] = useState(
    singleInstitution ? String(access.jurisdictions[0].code) : "TODAS",
  );
  const [partidas, setPartidas] = useState<number[]>([]);
  const [data, setData] = useState<DesagregadoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { logAction } = useAnalytics();

  useEffect(() => {
    logAction("Gastos desagregados", "Acceso a apartado");
  }, [logAction]);
  useEffect(() => {
    const controller = new AbortController();
    fetchWithAuth(
      "/copa/copa-api/api/gastos/desagregados/periodo-predeterminado",
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.message ?? "No se pudo determinar el corte inicial.",
          );
        return payload as { anio: number; mesDesde: number; mesHasta: number };
      })
      .then((period) => {
        if (controller.signal.aborted) return;
        setYear(String(period.anio));
        setMonthFrom(String(period.mesDesde));
        setMonthTo(String(period.mesHasta));
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Error al determinar el período.",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!year || !monthTo) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      anio: year,
      mesDesde: monthFrom,
      mesHasta: monthTo,
      estado: state,
    });
    if (sources.length) params.set("fuente", sources.join(","));
    if (jurisdiction !== "TODAS") params.set("jurisdiccion", jurisdiction);
    if (partidas.length) params.set("partid", partidas.join(","));
    fetchWithAuth(`/copa/copa-api/api/gastos/desagregados?${params}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.message ?? "No se pudo cargar el desglose de gastos.",
          );
        return payload as DesagregadoResponse;
      })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "Error al cargar datos.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [year, monthFrom, monthTo, sources, state, jurisdiction, partidas]);

  const markChange = () => {
    setLoading(true);
    setError("");
  };
  const updatePartidas = (values: number[]) => {
    if (values.join(",") === partidas.join(",")) return;
    markChange();
    setPartidas(values);
    logAction("Gastos desagregados", "Cambio capítulos", {
      capitulos: values.length ? values : "todos",
    });
  };
  if (!data)
    return (
      <section className="chart-container desagregado-page-state">
        <h1 className="section-title">Gastos desagregados</h1>
        {error ? (
          <p role="alert" className="desagregado-error">
            {error}
          </p>
        ) : (
          <p role="status">Cargando el último corte completo…</p>
        )}
      </section>
    );
  const years = [...new Set([...data.meta.available.years, Number(year)])].sort(
    (a, b) => b - a,
  );
  const chapterLabel = partidas.length
    ? `Partidas ${partidas.join(" + ")}`
    : "Todas las partidas";
  const sourceLabel = sources.length
    ? `Fuentes ${sources.join(" + ")}`
    : "Todas las fuentes";
  return (
    <div className="desagregado-page" aria-busy={loading}>
      <header className="desagregado-heading">
        <div>
          <h1 className="dashboard-title">Gastos desagregados</h1>
          <p className="section-subtitle">
            Composición por rubro, jurisdicción, partida y cuenta presupuestaria
          </p>
        </div>
        {loading && (
          <span role="status" className="desagregado-loading">
            Actualizando…
          </span>
        )}
      </header>
      <section className="chart-container desagregado-controls">
        <h2 className="section-title">Alcance de la consulta</h2>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label htmlFor="desagregado-year">Año</label>
            <select
              id="desagregado-year"
              value={year}
              onChange={(e) => {
                markChange();
                setYear(e.target.value);
              }}
            >
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="desagregado-month-from">Desde</label>
            <select
              id="desagregado-month-from"
              value={monthFrom}
              onChange={(e) => {
                const value = e.target.value;
                markChange();
                setMonthFrom(value);
                if (Number(value) > Number(monthTo)) setMonthTo(value);
              }}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="desagregado-month-to">Hasta</label>
            <select
              id="desagregado-month-to"
              value={monthTo}
              onChange={(e) => {
                const value = e.target.value;
                markChange();
                setMonthTo(value);
                if (Number(value) < Number(monthFrom)) setMonthFrom(value);
              }}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <GastoMultiSelect
            label="Fuentes"
            options={data.meta.available.fuentes}
            selected={sources}
            allLabel="Todas las fuentes"
            onChange={(values) => {
              if (values.join(",") !== sources.join(",")) {
                markChange();
                setSources(values);
                logAction("Gastos desagregados", "Cambio fuente", {
                  fuentes: values.length ? values : "todas",
                });
              }
            }}
          />
          <div className="sf-group">
            <label htmlFor="desagregado-state">Estado</label>
            <select
              id="desagregado-state"
              value={state}
              onChange={(e) => {
                markChange();
                setState(e.target.value);
              }}
            >
              {data.meta.available.estados.map((value) => (
                <option key={value.codigo} value={value.codigo}>
                  {value.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="desagregado-jurisdiction">Jurisdicción</label>
            <select
              id="desagregado-jurisdiction"
              value={jurisdiction}
              disabled={singleInstitution}
              onChange={(e) => {
                markChange();
                setJurisdiction(e.target.value);
              }}
            >
              {!singleInstitution && (
                <option value="TODAS">
                  {institutionOnly
                    ? "Instituciones autorizadas"
                    : "Todas las jurisdicciones"}
                </option>
              )}
              {(institutionOnly
                ? access.jurisdictions.map((j) => ({
                    codigo: j.code,
                    nombre: j.name,
                  }))
                : data.meta.available.jurisdicciones
              ).map((j) => (
                <option key={j.codigo} value={j.codigo}>
                  {j.nombre}
                </option>
              ))}
            </select>
          </div>
          <GastoMultiSelect
            label="Partidas"
            options={data.meta.available.partidas}
            selected={partidas}
            onChange={updatePartidas}
            allLabel="Todas las partidas"
          />
          <button
            type="button"
            className="gasto-toggle"
            onClick={() => updatePartidas([200, 300])}
            aria-pressed={
              partidas.length === 2 &&
              partidas.includes(200) &&
              partidas.includes(300)
            }
          >
            200 + 300 · Bienes y servicios
          </button>
        </div>
        <p className="desagregado-scope-note">
          Corte: {MONTHS[Number(monthFrom) - 1]}–{MONTHS[Number(monthTo) - 1]}{" "}
          {year} · {state} · {sourceLabel} · {chapterLabel}
          {data.meta.is_snapshot &&
            ` · Se usa el último crédito disponible del rango${data.meta.snapshot_month ? `: ${MONTHS[data.meta.snapshot_month - 1]}` : ""}.`}
        </p>
      </section>
      {error && (
        <p className="desagregado-error" role="alert">
          {error} No se muestran resultados del corte anterior.
        </p>
      )}
      <div hidden={Boolean(error) || loading}>
        <nav
          className="desagregado-tabs"
          aria-label="Vistas de gastos desagregados"
        >
          <button
            type="button"
            aria-pressed={view === "ministerial"}
            onClick={() => setView("ministerial")}
          >
            Análisis consolidado
          </button>
          <button
            type="button"
            aria-pressed={view === "summary"}
            onClick={() => setView("summary")}
          >
            Explorador general
          </button>
          {economicAllowed && (
            <button
              type="button"
              aria-pressed={view === "economic"}
              onClick={() => setView("economic")}
            >
              Posición económica
            </button>
          )}
        </nav>
        {view === "ministerial" && <GastoAnalisisMinisterial data={data} />}
        {view === "summary" && <GastoExplorador data={data} />}
        {view === "economic" && economicAllowed && (
          <GastoPosicionEconomica
            key={JSON.stringify(data.meta.requested)}
            data={data}
          />
        )}
        <p className="source-text desagregado-source-line">
          Fuente del gasto: {data.meta.source_table}. Montos en pesos
          corrientes, expresados en millones.
        </p>
      </div>
    </div>
  );
}
