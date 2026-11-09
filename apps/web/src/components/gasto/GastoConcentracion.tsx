import { useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { buildConcentration } from "@/lib/gasto/desagregadoVm";
import { format1M, formatPctOneDecimal } from "@/lib/gasto/logic";
import type { DesagregadoResponse } from "./GastosDesagregadosDashboard";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function GastoConcentracion({
  data,
  explorer = false,
}: {
  data: DesagregadoResponse;
  explorer?: boolean;
}) {
  const [showAll, setShowAll] = useState(explorer);
  const [includePersonal, setIncludePersonal] = useState(false);
  const concentration = useMemo(
    () => buildConcentration(data, includePersonal, showAll),
    [data, includePersonal, showAll],
  );
  if (data.jurisdicciones.length <= 1) return null;
  const pct = (value: number | null) =>
    value === null ? "—" : formatPctOneDecimal(value);
  return (
    <section className="chart-container">
      <h2 className="section-title">
        {showAll ? "Concentración por jurisdicción" : "Concentración Top 8"}
      </h2>
      {explorer && (
        <div className="analysis-controls">
          <div
            className="desagregado-tabs"
            aria-label="Cantidad de jurisdicciones"
          >
            <button
              type="button"
              aria-pressed={showAll}
              onClick={() => setShowAll(true)}
            >
              Todas
            </button>
            <button
              type="button"
              aria-pressed={!showAll}
              onClick={() => setShowAll(false)}
            >
              Top 8
            </button>
          </div>
          <button
            type="button"
            className="gasto-toggle"
            aria-pressed={includePersonal}
            onClick={() => setIncludePersonal((value) => !value)}
          >
            {includePersonal ? "Con personal" : "Sin personal"}
          </button>
        </div>
      )}
      <p className="source-text">
        {includePersonal ? "Con personal" : "Sin personal"}, sin coparticipación
        ni deuda; partidas {includePersonal ? "100–600" : "200–600"} y 800.
        Universo: {format1M(concentration.total)}.{" "}
        {showAll
          ? "Se incluyen todos los organismos del corte."
          : `Los primeros ${concentration.rows.length} suman ${format1M(concentration.shownTotal)}.`}{" "}
        El acumulado toma la selección mostrada como 100 %.
      </p>
      {concentration.rows.length ? (
        <>
          <div
            style={{ height: Math.max(260, concentration.rows.length * 32) }}
            role="img"
            aria-label="Montos por jurisdicción"
          >
            <Bar
              data={{
                labels: concentration.rows.map((r) => r.label),
                datasets: [
                  {
                    label: "Millones de pesos",
                    data: concentration.rows.map((r) => r.total / 1e6),
                    backgroundColor: "#0f766e",
                  },
                ],
              }}
              options={{
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: { beginAtZero: true },
                  y: { ticks: { font: { size: 10 } } },
                },
                plugins: { legend: { display: false } },
              }}
            />
          </div>
          <div className="desagregado-table-scroll">
            <table className="data-table gasto-fit-table">
              <thead>
                <tr>
                  <th>Jurisdicción</th>
                  <th>Monto</th>
                  <th>% universo</th>
                  <th>% acumulado de la selección</th>
                </tr>
              </thead>
              <tbody>
                {concentration.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td className="numeric">{format1M(r.total)}</td>
                    <td className="numeric">{pct(r.share)}</td>
                    <td className="numeric">{pct(r.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total mostrado</th>
                  <td className="numeric">
                    {format1M(concentration.shownTotal)}
                  </td>
                  <td className="numeric">
                    {pct(
                      concentration.total === 0
                        ? null
                        : (concentration.shownTotal / concentration.total) *
                            100,
                    )}
                  </td>
                  <td className="numeric">
                    {pct(concentration.shownTotal === 0 ? null : 100)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <p>No hay registros en este universo.</p>
      )}
    </section>
  );
}
