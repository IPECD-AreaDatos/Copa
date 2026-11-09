import { useMemo, useState } from "react";
import { buildAccountGroups, normalizeSearch } from "@/lib/gasto/desagregadoVm";
import { format1M, formatPctOneDecimal } from "@/lib/gasto/logic";
import GastoMultiSelect from "./GastoMultiSelect";
import type { DesagregadoResponse } from "./GastosDesagregadosDashboard";

export default function GastoCuentas({
  data,
  consolidated = false,
}: {
  data: DesagregadoResponse;
  consolidated?: boolean;
}) {
  const [chapters, setChapters] = useState<number[]>([]);
  const [includeCop, setIncludeCop] = useState(true);
  const [search, setSearch] = useState("");
  const groups = useMemo(
    () =>
      buildAccountGroups(data.jurisdiccion_subpartidas, chapters, includeCop),
    [data, chapters, includeCop],
  );
  const accounts = groups.accounts.filter((a) =>
    normalizeSearch(`${a.id} ${a.label}`).includes(
      normalizeSearch(search.trim()),
    ),
  );
  const pct = (v: number | null) => (v === null ? "—" : formatPctOneDecimal(v));
  return (
    <>
      <section className="chart-container">
        <h2 className="section-title">
          {consolidated
            ? "Cuenta → jurisdicciones y subtotales"
            : "Cuentas presupuestarias"}
        </h2>
        <div className="analysis-controls gasto-account-controls">
          <GastoMultiSelect
            label="Partidas de las cuentas"
            options={data.meta.available.partidas}
            selected={chapters}
            onChange={setChapters}
            allLabel="Todas las partidas"
          />
          <button
            type="button"
            className="gasto-toggle"
            aria-pressed={includeCop}
            onClick={() => setIncludeCop((value) => !value)}
          >
            {includeCop ? "Con coparticipación" : "Sin coparticipación"}
          </button>
          <label>
            Buscar cuenta
            <input
              type="search"
              placeholder="Código o descripción"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <p className="source-text">
          Los filtros de cuentas se aplican dentro del alcance superior. 421 y
          423 se suman en una cuenta conjunta. La búsqueda conserva los
          denominadores de la selección.
        </p>
      </section>
      <section className="chart-container">
        <h2 className="section-title">Personal · partida 100</h2>
        <p className="source-text">
          Total por jurisdicción, sin apertura por subpartidas.
        </p>
        {groups.personal.length ? (
          <div className="desagregado-table-scroll">
            <table className="data-table gasto-fit-table">
              <thead>
                <tr>
                  <th>Jurisdicción</th>
                  <th className="numeric">Monto</th>
                </tr>
              </thead>
              <tbody>
                {groups.personal.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td className="numeric">{format1M(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total personal</th>
                  <td className="numeric">{format1M(groups.personalTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p>La selección no incluye gastos en personal.</p>
        )}
      </section>
      <section className="chart-container">
        <h2 className="section-title">
          Resto del gasto · cuentas y jurisdicciones
        </h2>
        <p className="source-text">
          Subtotal sin personal: {format1M(groups.restTotal)}. Las cuentas se
          ordenan de mayor a menor; al abrir una se muestran sus jurisdicciones.
          Las participaciones se calculan sobre este subtotal y las de cada
          jurisdicción sobre su cuenta.
        </p>
        {accounts.map((account) => (
          <details className="analysis-block" key={account.id}>
            <summary>
              {account.id.replace("+", " + ")} · {account.label} ·{" "}
              {format1M(account.total)} · {pct(account.share)}
            </summary>
            <p className="source-text">
              Partida {account.chapter} · Puesto {account.rank} · Acumulado:{" "}
              {pct(account.cumulative)} · Códigos de origen:{" "}
              {[...account.codes].sort((a, b) => a - b).join(" + ")}
            </p>
            <div className="desagregado-table-scroll">
              <table className="data-table gasto-fit-table">
                <thead>
                  <tr>
                    <th>Jurisdicción</th>
                    <th className="numeric">Monto</th>
                    <th className="numeric">% de la cuenta</th>
                  </tr>
                </thead>
                <tbody>
                  {account.jurisdictions.map((r) => (
                    <tr key={r.id}>
                      <td>{r.label}</td>
                      <td className="numeric">{format1M(r.total)}</td>
                      <td className="numeric">
                        {pct(
                          account.total === 0
                            ? null
                            : (r.total / account.total) * 100,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Subtotal cuenta {account.id.replace("+", " + ")}</th>
                    <td className="numeric">{format1M(account.total)}</td>
                    <td className="numeric">
                      {pct(account.total === 0 ? null : 100)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        ))}
        {!accounts.length && (
          <p>
            {groups.accounts.length
              ? "Sin cuentas para esta búsqueda."
              : "No hay cuentas fuera de personal en esta selección."}
          </p>
        )}
      </section>
    </>
  );
}
