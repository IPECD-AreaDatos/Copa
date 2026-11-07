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
import { fetchWithAuth } from "@/lib/api";
import { format1M } from "@/lib/gasto/logic";
import { MONTHS } from "./GastoEvolucion";
import type { DesagregadoResponse } from "./GastosDesagregadosDashboard";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

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
export default function GastoPosicionEconomica({
  data,
}: {
  data: DesagregadoResponse;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState("");
  const filters = data.meta.requested;
  const params = new URLSearchParams({
    anio: String(filters.anio),
    mesDesde: String(filters.mesDesde),
    mesHasta: String(filters.mesHasta),
    estado: filters.estados?.[0] ?? "Comprometido",
  });
  if (filters.fuentes?.length) params.set("fuente", filters.fuentes.join(","));
  if (filters.jurisdicciones?.length)
    params.set("jurisdiccion", filters.jurisdicciones.join(","));
  if (filters.partidas?.length)
    params.set("partid", filters.partidas.join(","));
  if (filters.subPartidas?.length)
    params.set("subPartid", filters.subPartidas.join(","));
  const query = params.toString();
  const snapshot = data.meta.is_snapshot;
  useEffect(() => {
    if (snapshot) return;
    const controller = new AbortController();
    fetchWithAuth(
      `/copa/copa-api/api/gastos/desagregados/posicion-economica?${query}`,
      { signal: controller.signal },
    )
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
  }, [query, snapshot]);
  const money = (v: number | null) =>
    v === null ? "Sin datos completos" : format1M(v);
  if (snapshot)
    return (
      <section className="chart-container">
        <h2 className="section-title">Posición económica</h2>
        <p>
          Seleccione Comprometido u Ordenado para comparar flujos de gastos e
          ingresos.
        </p>
      </section>
    );
  if (error)
    return (
      <p role="alert" className="desagregado-error">
        {error}
      </p>
    );
  if (!position) return <p role="status">Cargando gastos e ingresos…</p>;
  const incomplete = position.monthly.some(
    (r) => !r.ingresos_completos || r.gastos === null,
  );
  return (
    <div className="ministerial-analysis">
      <section className="chart-container">
        <h2 className="section-title">
          Posición económica · gastos vs. ingresos
        </h2>
        <p className="desagregado-scope-note">
          {position.income_scope} La diferencia es ingresos provinciales menos
          gasto seleccionado; con un gasto parcial no representa el resultado
          fiscal provincial.
        </p>
        <p className="source-text">
          Mismo período: {MONTHS[filters.mesDesde - 1]}–
          {MONTHS[filters.mesHasta - 1]} {filters.anio}. Gasto en estado{" "}
          {filters.estados?.[0]}.
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
