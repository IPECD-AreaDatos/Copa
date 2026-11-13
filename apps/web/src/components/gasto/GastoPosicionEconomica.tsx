import { useEffect, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useAnalytics } from "@/hooks/useAnalytics";
import { fetchWithAuth } from "@/lib/api";
import { format1M } from "@/lib/gasto/logic";
import { MONTHS } from "./GastoEvolucion";
import GastoMultiSelect from "./GastoMultiSelect";
import type { DesagregadoResponse } from "./GastosDesagregadosDashboard";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const API_URL = "/copa/copa-api/api/gastos/desagregados/posicion-economica";

type Period = {
  anio: number;
  mesDesde: number;
  mesHasta: number;
};

type FilterOptions = DesagregadoResponse["meta"]["available"];
type FilterCatalog = { period: Period; available: FilterOptions };

type Filters = Period & {
  fuentes: number[];
  estado: string;
  jurisdiccion: string;
  partidas: number[];
};

type Position = {
  monthly: {
    mes: number;
    ron: number | null;
    rop: number | null;
    ingresos: number | null;
    gastos: number | null;
    diferencia: number | null;
    ingresos_completos: boolean;
  }[];
  totals: {
    ingresos: number | null;
    gastos: number | null;
    diferencia: number | null;
  };
  income_scope: string;
  sources: string[];
};

export default function GastoPosicionEconomica() {
  const [selection, setSelection] = useState<{
    available: FilterOptions;
    filters: Filters;
  } | null>(null);
  const [error, setError] = useState("");
  const { logAction } = useAnalytics();

  useEffect(() => {
    void logAction("Posición económica", "Acceso a apartado");
  }, [logAction]);

  useEffect(() => {
    const controller = new AbortController();
    fetchWithAuth(`${API_URL}/filtros`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.message ?? "No se pudieron cargar los filtros.");
        }
        return payload as FilterCatalog;
      })
      .then(({ period, available }) => {
        if (controller.signal.aborted) return;
        setSelection({
          available,
          filters: {
            anio: period.anio,
            mesDesde: period.mesDesde,
            mesHasta: period.mesHasta,
            fuentes: [10],
            estado: "Comprometido",
            jurisdiccion: "",
            partidas: [],
          },
        });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error ? reason.message : "Error al cargar los filtros.",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const heading = (
    <header className="desagregado-heading">
      <h1 className="dashboard-title">Posición económica</h1>
    </header>
  );
  if (!selection) {
    return (
      <div className="desagregado-page">
        {heading}
        <section className="chart-container">
          {error ? (
            <p role="alert" className="desagregado-error">{error}</p>
          ) : (
            <p role="status">Cargando el último corte completo…</p>
          )}
        </section>
      </div>
    );
  }

  const { available, filters } = selection;
  const states = available.estados.filter(
    ({ codigo }) => codigo === "Comprometido" || codigo === "Ordenado",
  );
  const update = (changes: Partial<Filters>) => {
    setSelection({ available, filters: { ...filters, ...changes } });
  };
  const params = new URLSearchParams({
    anio: String(filters.anio),
    mesDesde: String(filters.mesDesde),
    mesHasta: String(filters.mesHasta),
    estado: filters.estado,
  });
  if (filters.fuentes.length) params.set("fuente", filters.fuentes.join(","));
  if (filters.jurisdiccion) params.set("jurisdiccion", filters.jurisdiccion);
  if (filters.partidas.length) params.set("partid", filters.partidas.join(","));
  const query = params.toString();

  return (
    <div className="desagregado-page">
      {heading}
      <section className="chart-container desagregado-controls">
        <h2 className="section-title">Alcance de la consulta</h2>
        <div className="section-filters gasto-filters">
          <div className="sf-group">
            <label htmlFor="posicion-year">Año</label>
            <select
              id="posicion-year"
              value={filters.anio}
              onChange={(event) => update({ anio: Number(event.target.value) })}
            >
              {[...available.years].sort((a, b) => b - a).map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="posicion-from">Desde</label>
            <select
              id="posicion-from"
              value={filters.mesDesde}
              onChange={(event) => {
                const month = Number(event.target.value);
                update({ mesDesde: month, mesHasta: Math.max(month, filters.mesHasta) });
              }}
            >
              {MONTHS.map((month, i) => <option key={month} value={i + 1}>{month}</option>)}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="posicion-to">Hasta</label>
            <select
              id="posicion-to"
              value={filters.mesHasta}
              onChange={(event) => {
                const month = Number(event.target.value);
                update({ mesDesde: Math.min(month, filters.mesDesde), mesHasta: month });
              }}
            >
              {MONTHS.map((month, i) => <option key={month} value={i + 1}>{month}</option>)}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="posicion-state">Estado del gasto</label>
            <select
              id="posicion-state"
              value={filters.estado}
              onChange={(event) => update({ estado: event.target.value })}
            >
              {states.map(({ codigo, nombre }) => (
                <option key={codigo} value={codigo}>{nombre}</option>
              ))}
            </select>
          </div>
          <div className="sf-group">
            <label htmlFor="posicion-jurisdiccion">Jurisdicción</label>
            <select
              id="posicion-jurisdiccion"
              value={filters.jurisdiccion}
              onChange={(event) => update({ jurisdiccion: event.target.value })}
            >
              <option value="">Todas</option>
              {available.jurisdicciones.map(({ codigo, nombre }) => (
                <option key={codigo} value={codigo}>{nombre}</option>
              ))}
            </select>
          </div>
          <GastoMultiSelect
            label="Partidas"
            options={available.partidas}
            selected={filters.partidas}
            onChange={(partidas) => update({ partidas })}
            allLabel="Todas las partidas"
          />
          <button
            type="button"
            className="gasto-toggle"
            aria-pressed={
              filters.partidas.length === 2 &&
              filters.partidas.includes(200) &&
              filters.partidas.includes(300)
            }
            onClick={() => update({ partidas: [200, 300] })}
          >
            200 + 300 · Bienes y servicios
          </button>
          <GastoMultiSelect
            label="Fuentes del gasto"
            options={available.fuentes}
            selected={filters.fuentes}
            onChange={(fuentes) => update({ fuentes })}
            allLabel="Todas las fuentes"
          />
          <button
            type="button"
            className="gasto-toggle"
            aria-pressed={filters.fuentes.length === 1 && filters.fuentes[0] === 10}
            onClick={() => update({ fuentes: [10] })}
          >
            Sólo Tesoro · fuente 10
          </button>
        </div>
      </section>
      <ComparacionEconomica key={query} query={query} filters={filters} />
    </div>
  );
}

function ComparacionEconomica({ query, filters }: { query: string; filters: Filters }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetchWithAuth(`${API_URL}?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.message ?? "No se pudo cargar la comparación.",
          );
        return payload as Position;
      })
      .then((result) => {
        if (!controller.signal.aborted) setPosition(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Error al cargar la comparación.",
          );
      });
    return () => controller.abort();
  }, [query]);
  const money = (v: number | null) =>
    v === null ? "Sin datos completos" : format1M(v);
  if (error || !position)
    return (
      <section className="chart-container">
        {error ? (
          <p role="alert" className="desagregado-error">
            {error}
          </p>
        ) : (
          <p role="status">Cargando gastos e ingresos…</p>
        )}
      </section>
    );
  const incomplete = position.monthly.some(
    (r) => !r.ingresos_completos || r.gastos === null,
  );
  return (
    <div className="ministerial-analysis">
      <section className="chart-container">
        <h2 className="section-title">Gastos e ingresos</h2>
        <p className="desagregado-scope-note">
          {position.income_scope} La diferencia es ingresos provinciales menos
          gasto seleccionado; con un gasto parcial no representa el resultado
          fiscal provincial.
        </p>
        <p className="source-text">
          Mismo período: {MONTHS[filters.mesDesde - 1]}–
          {MONTHS[filters.mesHasta - 1]} {filters.anio}. Gasto en estado{" "}
          {filters.estado}.
        </p>
        <div className="desagregado-kpi-grid gasto-economic-kpis">
          <article className="kpi-card">
            <span className="kpi-label">
              Ingresos provinciales · RON + ROP brutos
            </span>
            <strong className="kpi-value">
              {money(position.totals.ingresos)}
            </strong>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Gasto seleccionado</span>
            <strong className="kpi-value">
              {money(position.totals.gastos)}
            </strong>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Ingresos menos gasto seleccionado</span>
            <strong className="kpi-value">
              {money(position.totals.diferencia)}
            </strong>
          </article>
        </div>
        {incomplete && (
          <p className="desagregado-warning-box">
            {position.monthly
              .filter((r) => !r.ingresos_completos || r.gastos === null)
              .map(
                (r) =>
                  `${MONTHS[r.mes - 1]}: ${r.rop === null ? "falta ROP" : r.ron === null ? "falta RON" : r.gastos === null ? "falta gasto" : "ingresos incompletos"}`,
              )
              .join("; ")}
            . No se calcula un total comparable ni una diferencia para los
            períodos con información faltante.
          </p>
        )}
        <div
          style={{ height: 340 }}
          role="img"
          aria-label="Comparación mensual de ingresos provinciales y gasto seleccionado"
        >
          <Bar
            data={{
              labels: position.monthly.map((r) => MONTHS[r.mes - 1]),
              datasets: [
                {
                  label: "RON + ROP brutos (M$)",
                  data: position.monthly.map((r) =>
                    r.ingresos === null ? null : r.ingresos / 1e6,
                  ),
                  backgroundColor: "#0f766e",
                },
                {
                  label: "Gasto seleccionado (M$)",
                  data: position.monthly.map((r) =>
                    r.gastos === null ? null : r.gastos / 1e6,
                  ),
                  backgroundColor: "#2563eb",
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: { y: { beginAtZero: true } },
            }}
          />
        </div>
      </section>
      <section className="chart-container">
        <h2 className="section-title">Detalle mensual</h2>
        <div className="desagregado-table-scroll">
          <table className="data-table gasto-fit-table">
            <thead>
              <tr>
                <th>Mes</th>
                <th>RON bruto</th>
                <th>ROP bruta</th>
                <th>Ingresos completos</th>
                <th>Gasto seleccionado</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {position.monthly.map((r) => (
                <tr key={r.mes}>
                  <td>{MONTHS[r.mes - 1]}</td>
                  <td className="numeric">{money(r.ron)}</td>
                  <td className="numeric">{money(r.rop)}</td>
                  <td className="numeric">{money(r.ingresos)}</td>
                  <td className="numeric">{money(r.gastos)}</td>
                  <td className="numeric">{money(r.diferencia)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total comparable</th>
                <td colSpan={2} />
                <td className="numeric">{money(position.totals.ingresos)}</td>
                <td className="numeric">{money(position.totals.gastos)}</td>
                <td className="numeric">{money(position.totals.diferencia)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="source-text">
          Fuentes: {position.sources.join("; ")}. ROP suma los tributos
          registrados, con nulos individuales como cero. La completitud de
          ingresos mantiene el criterio comparativo del tablero.
        </p>
      </section>
    </div>
  );
}
