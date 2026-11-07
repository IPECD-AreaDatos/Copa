import { useMemo, useState } from "react";
import {
  buildGroupedRubros,
  buildProjectionRows,
  monthlyRubroValues,
} from "@/lib/gasto/desagregadoVm";
import { format1M } from "@/lib/gasto/logic";
import type { DesagregadoResponse } from "./GastosDesagregadosDashboard";

export const MONTHS = [
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
export function GastoEvolucion({ data }: { data: DesagregadoResponse }) {
  const rubros = useMemo(() => buildGroupedRubros(data), [data]);
  const values = useMemo(() => monthlyRubroValues(data), [data]);
  return (
    <section className="chart-container">
      <h2 className="section-title">Evolución mensual por rubro</h2>
      <p className="section-subtitle">
        Montos en millones de pesos. Otros reúne activos financieros, otros
        gastos, seguridad social, deuda y gastos figurativos.
      </p>
      <div className="desagregado-table-scroll gasto-desktop-table">
        <table className="data-table gasto-fit-table gasto-month-table">
          <thead>
            <tr>
              <th>Mes</th>
              {rubros.map((r) => (
                <th className="numeric" key={r.codigo}>
                  {r.nombre}
                </th>
              ))}
              <th className="numeric">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.monthly.map((m) => (
              <tr key={m.mes}>
                <th scope="row">{MONTHS[m.mes - 1]}</th>
                {rubros.map((r) => (
                  <td className="numeric" key={r.codigo}>
                    {format1M(values.get(`${m.mes}|${r.codigo}`) ?? 0)}
                  </td>
                ))}
                <td className="numeric">
                  <strong>{format1M(m.total)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total del corte</th>
              {rubros.map((r) => (
                <td className="numeric" key={r.codigo}>
                  {format1M(r.total)}
                </td>
              ))}
              <td className="numeric">{format1M(data.total)}</td>
            </tr>
          </tfoot>
        </table>
        {!data.monthly.length && (
          <p>No hay registros mensuales para este corte.</p>
        )}
      </div>
      <div className="gasto-mobile-cards">
        {data.monthly.map((month) => (
          <article className="gasto-mobile-card" key={month.mes}>
            <h3>{MONTHS[month.mes - 1]}</h3>
            <dl>
              {rubros.map((r) => (
                <div key={r.codigo}>
                  <dt>{r.nombre}</dt>
                  <dd>
                    {format1M(values.get(`${month.mes}|${r.codigo}`) ?? 0)}
                  </dd>
                </div>
              ))}
              <div className="gasto-mobile-total">
                <dt>Total</dt>
                <dd>{format1M(month.total)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

type ProjectionRow = ReturnType<typeof buildProjectionRows>[number];
const projectionMoney = (value: number | null) =>
  value === null ? "Sin registros" : format1M(value);

function ProjectionGroup({
  rows,
  personal,
}: {
  rows: ProjectionRow[];
  personal: boolean;
}) {
  if (!rows.length) return null;
  return (
    <div className="gasto-projection-group">
      <h3 className="gasto-projection-subtitle">
        {personal
          ? "Personal · referencia del mes anterior"
          : "Resto del gasto · promedios y máximos"}
      </h3>
      <div className="desagregado-table-scroll desagregado-detail-scroll gasto-desktop-table">
        <table className="data-table gasto-fit-table gasto-projection-table">
          <thead>
            <tr>
              <th>Jurisdicción</th>
              {!personal && <th>Rubro</th>}
              <th className="numeric">Total corte</th>
              <th className="numeric">Promedio mensual</th>
              {personal ? (
                <th className="numeric">Mes anterior · referencia</th>
              ) : (
                <>
                  <th className="numeric">Promedio 3 más altos</th>
                  <th className="numeric">Punto máximo</th>
                </>
              )}
              <th className="numeric">Ritmo × 12</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.jurisdiction}</td>
                {!personal && <td>{row.rubro}</td>}
                <td className="numeric">{format1M(row.total)}</td>
                <td className="numeric">{format1M(row.average)}</td>
                {personal ? (
                  <td className="numeric">
                    <strong>{projectionMoney(row.referenceAmount)}</strong>
                    <small> · {MONTHS[row.referenceMonth - 1]}</small>
                  </td>
                ) : (
                  <>
                    <td className="numeric">
                      {projectionMoney(row.topAverage)}
                      {row.topCount < 3 && (
                        <small> · {row.topCount} {row.topCount === 1 ? "mes" : "meses"}</small>
                      )}
                    </td>
                    <td className="numeric">
                      {projectionMoney(row.maximum)}
                      {row.maximumMonth && <small> · {MONTHS[row.maximumMonth - 1]}</small>}
                    </td>
                  </>
                )}
                <td className="numeric">{projectionMoney(row.annual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="gasto-mobile-cards">
        {rows.map((row) => (
          <article className="gasto-mobile-card" key={row.id}>
            <h3>{row.jurisdiction} · {row.rubro}</h3>
            <dl>
              {personal && (
                <div className="gasto-mobile-total">
                  <dt>Mes anterior · {MONTHS[row.referenceMonth - 1]}</dt>
                  <dd>{projectionMoney(row.referenceAmount)}</dd>
                </div>
              )}
              <div><dt>Total del corte</dt><dd>{format1M(row.total)}</dd></div>
              <div><dt>Promedio mensual</dt><dd>{format1M(row.average)}</dd></div>
              {!personal && (
                <>
                  <div>
                    <dt>Promedio 3 más altos{row.topCount < 3 ? ` (${row.topCount} meses)` : ""}</dt>
                    <dd>{projectionMoney(row.topAverage)}</dd>
                  </div>
                  <div>
                    <dt>Punto máximo{row.maximumMonth ? ` · ${MONTHS[row.maximumMonth - 1]}` : ""}</dt>
                    <dd>{projectionMoney(row.maximum)}</dd>
                  </div>
                </>
              )}
              <div><dt>Ritmo × 12</dt><dd>{projectionMoney(row.annual)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

export function GastoProyeccion({ data }: { data: DesagregadoResponse }) {
  const [selected, setSelected] = useState("");
  const [goal, setGoal] = useState("");
  const rows = useMemo(() => buildProjectionRows(data), [data]);
  if (data.meta.is_snapshot) return null;
  const personalRows = rows.filter((row) => row.personal);
  const otherRows = rows.filter((row) => !row.personal);
  const current = rows.find((row) => row.id === selected) ?? rows[0];
  const comparisonAmount = current?.personal ? current.referenceAmount : current?.average;
  const goalMillions = goal.trim() ? Number(goal.replace(",", ".")) : NaN;
  const goalAmount = Number.isFinite(goalMillions) && goalMillions >= 0 ? goalMillions * 1e6 : null;
  return (
    <section className="chart-container">
      <h2 className="section-title">Promedio mensual y proyección simple</h2>
      <p className="source-text">
        El promedio divide el total por los {data.meta.requested_months} meses seleccionados.
        {personalRows.length > 0 && (
          <> En Personal, el indicador principal es el mes anterior: el último mes del corte seleccionado.
            Su ritmo de referencia multiplica ese importe por 12.</>
        )}
        {otherRows.length > 0 && (
          <> En el resto del gasto se conservan el promedio de los 3 meses más altos y el punto máximo.
            Si hay menos de tres meses cargados se indica cuántos; el ritmo anual usa el promedio mensual por 12.</>
        )}
        {" "}Estos ritmos son referencias simples, no pronósticos.
      </p>
      {data.meta.missing_months.length > 0 && (
        <p className="desagregado-warning-box">
          Meses sin registros: {data.meta.missing_months.map((month) => MONTHS[month - 1]).join(", ")}.
          El promedio conserva el rango solicitado. En Personal no se reemplaza un mes de referencia faltante por uno anterior.
        </p>
      )}
      {current && (
        <>
          <div className="analysis-controls">
            <label>
              Jurisdicción y rubro para comparar
              <select
                value={current.id}
                onChange={(event) => { setSelected(event.target.value); setGoal(""); }}
              >
                {rows.map((row) => <option key={row.id} value={row.id}>{row.jurisdiction} · {row.rubro}</option>)}
              </select>
            </label>
            <label>
              Meta mensual de comparación (M$)
              <input
                type="text" inputMode="decimal" value={goal}
                onChange={(event) => setGoal(event.target.value)} placeholder="Ingresar monto"
              />
            </label>
          </div>
          {current.personal ? (
            <p className="gasto-personal-reference">
              <strong>Mes anterior: {projectionMoney(current.referenceAmount)}</strong>
              <span>Último mes del corte: {MONTHS[current.referenceMonth - 1]} {data.meta.selected?.anio}.</span>
            </p>
          ) : (
            <p className="source-text">
              Promedio mensual: {format1M(current.average)}. Promedio de los 3 más altos: {projectionMoney(current.topAverage)}.
              Punto máximo: {projectionMoney(current.maximum)}{current.maximumMonth ? ` (${MONTHS[current.maximumMonth - 1]})` : ""}.
            </p>
          )}
          <p className="source-text">
            {goalAmount !== null
              ? comparisonAmount === null || comparisonAmount === undefined
                ? "Sin registros del mes de referencia para comparar con la meta."
                : `Diferencia frente a la meta: ${comparisonAmount < goalAmount ? "−" : "+"}${format1M(Math.abs(comparisonAmount - goalAmount))}.`
              : goal.trim()
                ? "Ingrese un monto no negativo en millones, sin separadores de miles."
                : "La meta es opcional y no se guarda."}
          </p>
        </>
      )}
      <ProjectionGroup rows={personalRows} personal />
      <ProjectionGroup rows={otherRows} personal={false} />
      {!rows.length && <p>Sin registros de ejecución en este corte.</p>}
    </section>
  );
}
