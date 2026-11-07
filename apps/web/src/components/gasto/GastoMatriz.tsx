import { useState } from "react";
import { sortMatrixRows, type MatrixRow } from "@/lib/gasto/desagregadoVm";
import { format1M } from "@/lib/gasto/logic";

export default function GastoMatriz({
  rows,
  labels,
  consolidated = false,
}: {
  rows: MatrixRow[];
  labels: Record<string, string>;
  consolidated?: boolean;
}) {
  const [sort, setSort] = useState({ key: "total", descending: true });
  const toggle = (key: string) =>
    setSort((previous) => ({
      key,
      descending: previous.key === key ? !previous.descending : true,
    }));
  const headers = [
    { key: "label", label: "Jurisdicción" },
    ...Object.entries(labels).map(([key, label]) => ({ key, label })),
    { key: "total", label: "Total" },
  ];
  return (
    <section className="chart-container">
      <h2 className="section-title">
        {consolidated
          ? "Matriz y subtotales por jurisdicción"
          : "Ejecución por jurisdicción y rubro"}
      </h2>
      <p className="source-text">
        Otros agrupa activos financieros, otros gastos, seguridad social,
        servicio de la deuda y gastos figurativos. Presione una columna para
        ordenar de mayor a menor; un segundo clic invierte el orden.
      </p>
      <div className="desagregado-table-scroll gasto-desktop-table">
        <table className="data-table gasto-fit-table gasto-matrix-table">
          <thead>
            <tr>
              {headers.map(({ key, label }) => (
                <th
                  key={key}
                  aria-sort={
                    sort.key === key
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="gasto-sort-button"
                    onClick={() => toggle(key)}
                  >
                    {label}
                    <span aria-hidden="true">
                      {sort.key === key
                        ? sort.descending
                          ? " ↓"
                          : " ↑"
                        : " ↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortMatrixRows(rows, sort.key, sort.descending).map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                {Object.keys(labels).map((key) => (
                  <td className="numeric" key={key}>
                    {format1M(r.rubros[key] ?? 0)}
                  </td>
                ))}
                <td className="numeric">
                  <strong>{format1M(r.total)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              {Object.keys(labels).map((key) => (
                <td className="numeric" key={key}>
                  {format1M(
                    rows.reduce((sum, r) => sum + (r.rubros[key] ?? 0), 0),
                  )}
                </td>
              ))}
              <td className="numeric">
                {format1M(rows.reduce((sum, r) => sum + r.total, 0))}
              </td>
            </tr>
            {consolidated && (
              <>
                <tr>
                  <th>Sin personal</th>
                  <td colSpan={Object.keys(labels).length} />
                  <td className="numeric">
                    {format1M(
                      rows.reduce(
                        (sum, r) => sum + r.total - (r.rubros.personal ?? 0),
                        0,
                      ),
                    )}
                  </td>
                </tr>
                <tr>
                  <th>Sin personal ni coparticipación</th>
                  <td colSpan={Object.keys(labels).length} />
                  <td className="numeric">
                    {format1M(
                      rows.reduce(
                        (sum, r) =>
                          sum +
                          r.total -
                          (r.rubros.personal ?? 0) -
                          (r.rubros.coparticipacion ?? 0),
                        0,
                      ),
                    )}
                  </td>
                </tr>
              </>
            )}
          </tfoot>
        </table>
        {!rows.length && <p>Sin registros en este corte.</p>}
      </div>
      <div className="gasto-mobile-cards">
        <label>
          Ordenar por
          <select
            value={sort.key}
            onChange={(event) => toggle(event.target.value)}
          >
            {headers.map((h) => (
              <option key={h.key} value={h.key}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="gasto-toggle"
          onClick={() => toggle(sort.key)}
        >
          {sort.descending ? "Mayor a menor ↓" : "Menor a mayor ↑"}
        </button>
        {sortMatrixRows(rows, sort.key, sort.descending).map((r) => (
          <article className="gasto-mobile-card" key={r.id}>
            <h3>{r.label}</h3>
            <dl>
              {Object.entries(labels).map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{format1M(r.rubros[key] ?? 0)}</dd>
                </div>
              ))}
              <div className="gasto-mobile-total">
                <dt>Total</dt>
                <dd>{format1M(r.total)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      {consolidated && rows.length > 0 && (
        <details className="analysis-block">
          <summary>
            Subtotales por jurisdicción sin personal y sin coparticipación
          </summary>
          <div className="desagregado-table-scroll">
            <table className="data-table gasto-fit-table">
              <thead>
                <tr>
                  <th>Jurisdicción</th>
                  <th>Total</th>
                  <th>Sin personal</th>
                  <th>Sin personal ni coparticipación</th>
                </tr>
              </thead>
              <tbody>
                {sortMatrixRows(rows, sort.key, sort.descending).map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td className="numeric">{format1M(r.total)}</td>
                    <td className="numeric">
                      {format1M(r.total - (r.rubros.personal ?? 0))}
                    </td>
                    <td className="numeric">
                      {format1M(
                        r.total -
                          (r.rubros.personal ?? 0) -
                          (r.rubros.coparticipacion ?? 0),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
