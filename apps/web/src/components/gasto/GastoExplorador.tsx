import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import {
  buildMatrixRows,
  GROUPED_RUBRO_LABELS,
} from "@/lib/gasto/desagregadoVm";
import { format1M, formatPctOneDecimal } from "@/lib/gasto/logic";
import GastoConcentracion from "./GastoConcentracion";
import GastoCuentas from "./GastoCuentas";
import GastoMatriz from "./GastoMatriz";
import GastoLecturaRubro from "./GastoLecturaRubro";
import { GastoEvolucion, GastoProyeccion, MONTHS } from "./GastoEvolucion";
import type { DesagregadoResponse } from "./GastosDesagregadosDashboard";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function GastoExplorador({
  data,
}: {
  data: DesagregadoResponse;
}) {
  const matrix = useMemo(() => buildMatrixRows(data), [data]);
  const maxChapter = Math.max(
    ...data.chapters.map((r) => Math.abs(r.total)),
    1,
  );
  const single = data.jurisdicciones.length <= 1;
  const control = (v: number) => (Math.abs(v) < 0.01 ? "OK" : format1M(v));
  return (
    <div className="ministerial-analysis">
      <section
        className="desagregado-kpi-grid"
        aria-label="Resumen del corte seleccionado"
      >
        {[
          { label: "Total seleccionado", value: format1M(data.total) },
          { label: "Partidas con datos", value: data.chapters.length },
          { label: "Cuentas de origen", value: data.subpartidas.length },
          { label: "Jurisdicciones", value: data.jurisdicciones.length },
        ].map((kpi) => (
          <article className="kpi-card" key={kpi.label}>
            <span className="kpi-label">{kpi.label}</span>
            <strong className="kpi-value">{kpi.value}</strong>
          </article>
        ))}
      </section>
      <section className="desagregado-card-grid">
        <article className="chart-container">
          <h2 className="section-title">Composición por partida</h2>
          <div className="desagregado-bars">
            {data.chapters.map((r) => (
              <div className="desagregado-bar-row" key={r.codigo}>
                <div className="desagregado-bar-label">
                  <span>
                    <b>{r.codigo}</b> · {r.nombre}
                  </span>
                  <strong>{format1M(r.total)}</strong>
                </div>
                <div className="desagregado-bar-track">
                  <span
                    style={{
                      width: `${(Math.abs(r.total) / maxChapter) * 100}%`,
                    }}
                  />
                </div>
                <div className="desagregado-bar-meta">
                  <span>{formatPctOneDecimal(r.participacion)}</span>
                  <span>{r.subpartidas} cuentas</span>
                </div>
              </div>
            ))}
          </div>
          {!data.chapters.length && <p>Sin registros para este corte.</p>}
        </article>
        <article className="chart-container">
          <h2 className="section-title">
            {data.meta.is_snapshot ? "Crédito del mes" : "Evolución mensual"}
          </h2>
          <div
            style={{ height: 300 }}
            role="img"
            aria-label="Evolución mensual del gasto seleccionado"
          >
            <Bar
              data={{
                labels: data.monthly.map((r) => MONTHS[r.mes - 1].slice(0, 3)),
                datasets: [
                  {
                    label: "Millones de pesos",
                    data: data.monthly.map((r) => r.total / 1e6),
                    backgroundColor: "#0f766e",
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                locale: "es-AR",
                scales: { y: { beginAtZero: true } },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (context) =>
                        format1M(data.monthly[context.dataIndex].total),
                    },
                  },
                },
              }}
            />
          </div>
          {!data.monthly.length && <p>Sin registros mensuales.</p>}
        </article>
      </section>
      <GastoLecturaRubro data={data} />
      <GastoEvolucion data={data} />
      <GastoConcentracion data={data} explorer />
      <section className="chart-container">
        <h2 className="section-title">
          {single ? "Composición por rubro" : "Concentración por rubro"}
        </h2>
        <div className="desagregado-table-scroll">
          <table className="data-table gasto-fit-table">
            <thead>
              <tr>
                <th>Rubro</th>
                <th className="numeric">Total</th>
                <th className="numeric">% del corte</th>
                {!single && (
                  <>
                    <th className="numeric">Top 7</th>
                    <th className="numeric">% del rubro</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.rubros.map((r) => {
                const top = data.jurisdicciones_rubros
                  .filter((j) => j.rubro.codigo === r.codigo)
                  .sort((a, b) => b.total - a.total)
                  .slice(0, 7)
                  .reduce((sum, j) => sum + j.total, 0);
                return (
                  <tr key={r.codigo}>
                    <td>{r.nombre}</td>
                    <td className="numeric">{format1M(r.total)}</td>
                    <td className="numeric">
                      {formatPctOneDecimal(r.participacion)}
                    </td>
                    {!single && (
                      <>
                        <td className="numeric">{format1M(top)}</td>
                        <td className="numeric">
                          {r.total === 0
                            ? "—"
                            : formatPctOneDecimal((top / r.total) * 100)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <td className="numeric">{format1M(data.total)}</td>
                <td className="numeric">{data.total === 0 ? "—" : "100,0%"}</td>
                {!single && <td colSpan={2} />}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <GastoMatriz rows={matrix} labels={GROUPED_RUBRO_LABELS} />
      <GastoProyeccion data={data} />
      <GastoCuentas data={data} />
      <section className="chart-container">
        <h2 className="section-title">Desglose por jurisdicción y partida</h2>
        <div className="desagregado-table-scroll">
          <table className="data-table gasto-fit-table gasto-matrix-table">
            <thead>
              <tr>
                <th>Jurisdicción</th>
                {data.chapters.map((r) => (
                  <th key={r.codigo}>
                    {r.codigo} · {r.nombre}
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.jurisdicciones.map((j) => (
                <tr key={j.codigo}>
                  <td>{j.nombre}</td>
                  {data.chapters.map((r) => (
                    <td className="numeric" key={r.codigo}>
                      {format1M(j.partidas[String(r.codigo)] ?? 0)}
                    </td>
                  ))}
                  <td className="numeric">{format1M(j.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                {data.chapters.map((r) => (
                  <td className="numeric" key={r.codigo}>
                    {format1M(r.total)}
                  </td>
                ))}
                <td className="numeric">{format1M(data.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section className="chart-container">
        <h2 className="section-title">Controles de consistencia</h2>
        <div className="desagregado-control-grid">
          {[
            ["Total vs. partidas", data.controles.total_vs_capitulos],
            ["Total vs. rubros", data.controles.total_vs_rubros],
            ["Total vs. matriz", data.controles.total_vs_jurisdicciones_rubros],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <span className="desagregado-control-label">{label}</span>
              <strong>{control(Number(value))}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
