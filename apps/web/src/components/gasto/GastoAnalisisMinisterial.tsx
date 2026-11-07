"use client";

import { useMemo, useState } from "react";
import { format1M, formatPctOneDecimal } from "@/lib/gasto/logic";
import { scopeDashboardJurisdictions } from "@/lib/gasto/desagregadoVm";
import GastoConcentracion from "./GastoConcentracion";
import GastoCuentas from "./GastoCuentas";
import GastoMatriz from "./GastoMatriz";
import { GastoEvolucion, GastoProyeccion, MONTHS } from "./GastoEvolucion";
import type { DesagregadoResponse } from "./GastosDesagregadosDashboard";

type Ranked = {
  id: string;
  label: string;
  total: number;
  rank: number;
  share: number | null;
  cumulative: number | null;
};
type Analysis = {
  labels: Record<string, string>;
  total: number;
  universes: {
    id: string;
    label: string;
    total: number;
    rubros: Ranked[];
    ranking: Ranked[];
  }[];
  top8: {
    total: number;
    universeTotal: number;
    rows: (Ranked & {
      shareTop: number | null;
      cumulativeTop: number | null;
    })[];
  };
  concentration: {
    id: string;
    label: string;
    n: number;
    total: number;
    topTotal: number;
    rows: Ranked[];
  }[];
  matrix: {
    id: string;
    label: string;
    total: number;
    rubros: Record<string, number>;
    withoutPersonal: number;
    withoutPersonalCop: number;
  }[];
  partida100: { total: number; rows: Ranked[] };
  accountsTotal: number;
  accounts: (Ranked & { rows: Ranked[] })[];
  ministryRankings: {
    id: string;
    label: string;
    total: number;
    jurisdiction: string;
    combined: boolean;
    rows: Ranked[];
  }[];
};
export type MinisterialAnalysis = {
  all: Analysis;
  reference: Analysis;
  referenceJurisdictions: number[];
};
const pct = (value: number | null) =>
  value === null ? "—" : formatPctOneDecimal(value);
const money = (value: number | null) =>
  value === null ? "Sin registros" : format1M(value);
function RankTable({
  rows,
  denominator,
}: {
  rows: Ranked[];
  denominator: string;
}) {
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  return (
    <>
      <p className="source-text">
        Porcentajes sobre {denominator}. Orden por monto de mayor a menor,
        conservando los ajustes negativos.
      </p>
      <div className="desagregado-table-scroll analysis-detail-scroll">
        <table className="data-table gasto-fit-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Concepto</th>
              <th className="numeric">Monto</th>
              <th className="numeric">%</th>
              <th className="numeric">% acumulado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.rank}</td>
                <td>{r.label}</td>
                <td className="numeric">{format1M(r.total)}</td>
                <td className="numeric">{pct(r.share)}</td>
                <td className="numeric">{pct(r.cumulative)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>Total mostrado</th>
              <td className="numeric">{format1M(total)}</td>
              <td className="numeric">
                {pct(
                  rows.length
                    ? rows.reduce((sum, r) => sum + (r.share ?? 0), 0)
                    : null,
                )}
              </td>
              <td className="numeric">—</td>
            </tr>
          </tfoot>
        </table>
        {!rows.length && <p>Sin registros en este corte.</p>}
      </div>
    </>
  );
}
export default function GastoAnalisisMinisterial({
  data,
}: {
  data: DesagregadoResponse;
}) {
  const institutionOnly = data.meta.access?.scope === "institution";
  const [scope, setScope] = useState<"reference" | "all">(
    institutionOnly ? "all" : "reference",
  );
  const [universe, setUniverse] = useState("operating");
  const [jurisdiction, setJurisdiction] = useState("1");
  const [combined, setCombined] = useState(true);
  const hasJurisdictionFilter = Boolean(
    data.meta.selected.jurisdicciones?.length,
  );
  const activeScope = institutionOnly || hasJurisdictionFilter ? "all" : scope;
  const analysis = data.ministerial_analysis[activeScope];
  const scopedData = useMemo(
    () =>
      activeScope === "all"
        ? data
        : scopeDashboardJurisdictions(
            data,
            data.ministerial_analysis.referenceJurisdictions,
          ),
    [data, activeScope],
  );
  const single = analysis.matrix.length <= 1;
  const current = analysis.universes.find((u) => u.id === universe)!;
  const selectedJurisdiction = analysis.matrix.some(
    (j) => j.id === jurisdiction,
  )
    ? jurisdiction
    : analysis.matrix[0]?.id;
  const modifications = data.modificaciones_presupuestarias.filter(
    (r) =>
      activeScope === "all" ||
      data.ministerial_analysis.referenceJurisdictions.includes(r.codigo),
  );
  const completeMods = modifications.filter((r) => r.modificacion !== null);
  return (
    <div className="ministerial-analysis">
      <section className="chart-container">
        <h2 className="section-title">Análisis consolidado del gasto</h2>
        <article className="kpi-card gasto-total-card">
          <span className="kpi-label">Total del gasto seleccionado</span>
          <strong className="kpi-value">{format1M(analysis.total)}</strong>
        </article>
        {!institutionOnly && !hasJurisdictionFilter && (
          <div className="analysis-controls">
            <label>
              Universo de organismos
              <select
                aria-label="Universo de organismos"
                value={scope}
                onChange={(event) =>
                  setScope(event.target.value as "reference" | "all")
                }
              >
                <option value="reference">
                  Selección de{" "}
                  {data.ministerial_analysis.referenceJurisdictions.length}{" "}
                  jurisdicciones
                </option>
                <option value="all">Todos los organismos con datos</option>
              </select>
            </label>
          </div>
        )}
        <p className="desagregado-scope-note">
          Se aplican los filtros superiores y el universo de organismos elegido.
          En los resúmenes, Transferencias incluye seguridad social y excluye
          coparticipación. Los montos se expresan en millones de pesos.
        </p>
        {activeScope === "reference" && (
          <details className="analysis-block">
            <summary>Ver jurisdicciones incluidas</summary>
            <ul>
              {data.ministerial_analysis.referenceJurisdictions.map((code) => (
                <li key={code}>
                  {data.meta.available.jurisdicciones.find(
                    (item) => item.codigo === code,
                  )?.nombre ?? `Jurisdicción ${code}`}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="desagregado-card-grid">
          {analysis.universes.map((u) => (
            <article key={u.id} className="ministerial-universe">
              <h3>{u.label}</h3>
              <strong>{format1M(u.total)}</strong>
              <RankTable
                rows={u.rubros}
                denominator={`el total de «${u.label}»`}
              />
            </article>
          ))}
        </div>
      </section>
      <GastoEvolucion data={scopedData} />
      <GastoProyeccion data={scopedData} />
      <GastoMatriz
        rows={analysis.matrix}
        labels={analysis.labels}
        consolidated
      />
      {!single && (
        <>
          <GastoConcentracion data={scopedData} />
          <section className="chart-container">
            <h2 className="section-title">Concentración por rubro</h2>
            {analysis.concentration.map((c) => (
              <details className="analysis-block" key={c.id} open>
                <summary>
                  {c.label} ·{" "}
                  {c.rows.length <= c.n
                    ? `${c.rows.length} jurisdicciones`
                    : `Top ${c.n}`}
                  : {format1M(c.topTotal)} ·{" "}
                  {pct(c.total === 0 ? null : (c.topTotal / c.total) * 100)} del
                  rubro
                </summary>
                <RankTable
                  rows={c.rows.slice(0, c.n)}
                  denominator={`el rubro completo (${format1M(c.total)})`}
                />
                {c.rows.length > c.n && (
                  <details>
                    <summary>Ver todas las jurisdicciones</summary>
                    <RankTable
                      rows={c.rows}
                      denominator={`el rubro completo (${format1M(c.total)})`}
                    />
                  </details>
                )}
              </details>
            ))}
          </section>
        </>
      )}
      <GastoCuentas data={scopedData} consolidated />
      {!single && (
        <section className="chart-container">
          <h2 className="section-title">Ranking jurisdicción × rubro</h2>
          <div className="analysis-controls">
            <label>
              Personal y coparticipación
              <select
                value={universe}
                onChange={(event) => setUniverse(event.target.value)}
              >
                {analysis.universes.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <RankTable
            rows={current.ranking}
            denominator={`el universo seleccionado (${format1M(current.total)})`}
          />
        </section>
      )}
      <section className="chart-container">
        <h2 className="section-title">
          {single ? "Cuentas por partida" : "Rankings por ministerio y partida"}
        </h2>
        <div className="analysis-controls">
          {!single && (
            <label>
              Ministerio / organismo
              <select
                aria-label="Ministerio del ranking"
                value={selectedJurisdiction ?? ""}
                onChange={(event) => setJurisdiction(event.target.value)}
              >
                {analysis.matrix.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Tratamiento de bienes y servicios
            <select
              value={String(combined)}
              onChange={(event) => setCombined(event.target.value === "true")}
            >
              <option value="true">Consolidar 200 + 300</option>
              <option value="false">Separar partidas 200 y 300</option>
            </select>
          </label>
        </div>
        {analysis.ministryRankings
          .filter(
            (g) =>
              g.jurisdiction === selectedJurisdiction &&
              g.combined === combined,
          )
          .map((g) => (
            <details
              className="analysis-block"
              key={g.id}
              open={g.id === "200+300" || g.id === "200"}
            >
              <summary>
                {g.id} · {g.label} · {format1M(g.total)}
              </summary>
              <RankTable
                rows={g.rows}
                denominator={`este bloque del organismo (${format1M(g.total)})`}
              />
            </details>
          ))}
      </section>
      <section className="chart-container">
        <h2 className="section-title">Modificaciones presupuestarias</h2>
        <p className="source-text">
          Crédito vigente menos crédito original del último mes con créditos
          dentro del rango solicitado, con los mismos filtros de fuente,
          jurisdicción y partida. Las modificaciones no se suman al gasto.
        </p>
        <div className="desagregado-table-scroll">
          <table className="data-table gasto-fit-table">
            <thead>
              <tr>
                <th>Jurisdicción</th>
                <th>Mes del crédito</th>
                <th>Original</th>
                <th>Vigente</th>
                <th>Modificación</th>
              </tr>
            </thead>
            <tbody>
              {modifications.map((r) => (
                <tr key={r.codigo}>
                  <td>{r.nombre}</td>
                  <td>{MONTHS[r.mes - 1]}</td>
                  <td className="numeric">{money(r.original)}</td>
                  <td className="numeric">{money(r.vigente)}</td>
                  <td className="numeric">{money(r.modificacion)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total con ambas bases</th>
                <td>—</td>
                <td className="numeric">
                  {format1M(
                    completeMods.reduce((sum, r) => sum + (r.original ?? 0), 0),
                  )}
                </td>
                <td className="numeric">
                  {format1M(
                    completeMods.reduce((sum, r) => sum + (r.vigente ?? 0), 0),
                  )}
                </td>
                <td className="numeric">
                  {format1M(
                    completeMods.reduce(
                      (sum, r) => sum + (r.modificacion ?? 0),
                      0,
                    ),
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
          {!modifications.length && (
            <p>No hay registros de crédito para este corte.</p>
          )}
        </div>
      </section>
    </div>
  );
}
