"use client";

import { useState } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { format1M, formatPctOneDecimal } from "@/lib/gasto/logic";
import type { DesagregadoResponse } from "./GastosDesagregadosDashboard";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Ranked = { id: string; label: string; total: number; rank: number; share: number | null; cumulative: number | null };
type Analysis = {
  labels: Record<string, string>; total: number;
  universes: { id: string; label: string; total: number; rubros: Ranked[]; ranking: Ranked[] }[];
  top8: { total: number; universeTotal: number; rows: (Ranked & { shareTop: number | null; cumulativeTop: number | null })[] };
  concentration: { id: string; label: string; n: number; total: number; topTotal: number; rows: Ranked[] }[];
  matrix: { id: string; label: string; total: number; rubros: Record<string, number>; withoutPersonal: number; withoutPersonalCop: number }[];
  partida100: { total: number; rows: Ranked[] };
  accountsTotal: number;
  accounts: (Ranked & { rows: Ranked[] })[];
  ministryRankings: { id: string; label: string; total: number; jurisdiction: string; combined: boolean; rows: Ranked[] }[];
};
export type MinisterialAnalysis = { all: Analysis; reference: Analysis; referenceJurisdictions: number[] };
const pct = (v: number | null) => v === null ? "—" : formatPctOneDecimal(v);
const money = (v: number | null) => v === null ? "Sin registros" : format1M(v);
function RankTable({ rows, denominator }: { rows: Ranked[]; denominator: string }) {
  return <><p className="source-text">Porcentajes sobre {denominator}. Orden por monto de mayor a menor, conservando los ajustes negativos.</p><div className="desagregado-table-scroll analysis-detail-scroll"><table className="data-table"><thead><tr><th>#</th><th>Concepto</th><th>Monto (M$)</th><th>%</th><th>% acumulado</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.rank}</td><td>{r.label}</td><td className="numeric">{format1M(r.total)}</td><td className="numeric">{pct(r.share)}</td><td className="numeric">{pct(r.cumulative)}</td></tr>)}</tbody></table>{!rows.length && <p>Sin registros en este corte.</p>}</div></>;
}
export default function GastoAnalisisMinisterial({ data }: { data: DesagregadoResponse }) {
  const [scope, setScope] = useState<"reference" | "all">("reference");
  const [universe, setUniverse] = useState("operating");
  const [jurisdiction, setJurisdiction] = useState("1");
  const [combined, setCombined] = useState(true);
  const [search, setSearch] = useState("");
  const analysis = data.ministerial_analysis[scope];
  const current = analysis.universes.find((u) => u.id === universe)!;
  const selectedJurisdiction = analysis.matrix.some((j) => j.id === jurisdiction) ? jurisdiction : analysis.matrix[0]?.id;
  const accountGroups = analysis.accounts.filter((a) => a.label.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
  const totalMods = data.modificaciones_presupuestarias.filter((r) => scope === "all" || data.ministerial_analysis.referenceJurisdictions.includes(r.codigo));
  return <div className="ministerial-analysis">
    <section className="chart-container">
      <h2 className="section-title">Análisis consolidado del gasto</h2>
      <div className="analysis-controls"><label>Universo de organismos<select aria-label="Universo de organismos" value={scope} onChange={(e) => setScope(e.target.value as "reference" | "all")}><option value="reference">Selección de {data.ministerial_analysis.referenceJurisdictions.length} jurisdicciones</option><option value="all">Todos los organismos con datos</option></select></label></div>
      <p className="desagregado-scope-note">Se aplican los filtros superiores y el universo de organismos elegido. Transferencias incluye la cuenta de seguridad social 533 y excluye coparticipación (571/587). Los montos se expresan en millones de pesos.</p>
      {scope === "reference" && <details className="analysis-block"><summary>Ver las {data.ministerial_analysis.referenceJurisdictions.length} jurisdicciones incluidas</summary><ul>{data.ministerial_analysis.referenceJurisdictions.map((code) => <li key={code}>{data.meta.available.jurisdicciones.find((item) => item.codigo === code)?.nombre ?? `Jurisdicción ${code}`}</li>)}</ul></details>}
      {!data.meta.is_snapshot && data.meta.missing_months.length > 0 && <p className="desagregado-warning-box">Meses sin registros: {data.meta.missing_months.join(", ")}. Los promedios mantienen los {data.meta.requested_months} meses solicitados; no se asume que la carga esté completa.</p>}
      <div className="desagregado-card-grid">{analysis.universes.map((u) => <article key={u.id} className="ministerial-universe"><h3>{u.label}</h3><strong>{format1M(u.total)}</strong><RankTable rows={u.rubros} denominator={`el total de «${u.label}»`} /></article>)}</div>
    </section>
    <section className="chart-container"><h2 className="section-title">Matriz y subtotales por jurisdicción</h2><p className="source-text">Ejecución por rubro, total y subtotales con exclusiones explícitas. Las modificaciones de crédito se muestran por separado.</p><div className="desagregado-table-scroll"><table className="data-table"><thead><tr><th>Jurisdicción</th>{Object.entries(analysis.labels).map(([k, label]) => <th key={k}>{label}</th>)}<th>Total</th><th>Sin personal</th><th>Sin personal ni coparticipación</th></tr></thead><tbody>{analysis.matrix.map((j) => <tr key={j.id}><td>{j.label}</td>{Object.keys(analysis.labels).map((k) => <td className="numeric" key={k}>{format1M(j.rubros[k] ?? 0)}</td>)}<td className="numeric">{format1M(j.total)}</td><td className="numeric">{format1M(j.withoutPersonal)}</td><td className="numeric">{format1M(j.withoutPersonalCop)}</td></tr>)}</tbody><tfoot><tr><th>Total</th>{Object.keys(analysis.labels).map((k) => <td className="numeric" key={k}>{format1M(analysis.matrix.reduce((n, j) => n + (j.rubros[k] ?? 0), 0))}</td>)}<td className="numeric">{format1M(analysis.total)}</td><td className="numeric">{format1M(analysis.universes[1].total)}</td><td className="numeric">{format1M(analysis.universes[2].total)}</td></tr></tfoot></table></div></section>
    <section className="chart-container"><h2 className="section-title">Concentración Top 8</h2><p className="source-text">Partidas 200–600 y 800, sin personal, coparticipación ni deuda. Ranking de los organismos del corte seleccionado. Universo: {format1M(analysis.top8.universeTotal)} · Top 8: {format1M(analysis.top8.total)}. El acumulado suma los organismos en el orden mostrado y toma el Top 8 como 100 %.</p><div style={{ height: 340 }}><Bar data={{ labels: analysis.top8.rows.map((r) => r.label), datasets: [{ label: "Millones de pesos", data: analysis.top8.rows.map((r) => r.total / 1e6), backgroundColor: "#0f766e" }] }} options={{ indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div><div className="desagregado-table-scroll"><table className="data-table"><thead><tr><th>Jurisdicción</th><th>Monto</th><th>% universo</th><th>% acumulado dentro del Top 8</th></tr></thead><tbody>{analysis.top8.rows.map((r) => <tr key={r.id}><td>{r.label}</td><td className="numeric">{format1M(r.total)}</td><td className="numeric">{pct(r.share)}</td><td className="numeric">{pct(r.cumulativeTop)}</td></tr>)}</tbody></table></div></section>
    <section className="chart-container"><h2 className="section-title">Por rubro · Top 5, Top 6 y Top 7</h2><p className="source-text">Se muestran los principales organismos de cada rubro y su participación sobre el total del rubro seleccionado.</p>{analysis.concentration.map((c) => <details className="analysis-block" key={c.id} open><summary>{c.label} · Top {c.n}: {format1M(c.topTotal)} · {pct(c.total === 0 ? null : c.topTotal / c.total * 100)} del rubro</summary><RankTable rows={c.rows.slice(0, c.n)} denominator={`el rubro completo (${format1M(c.total)})`} /><details><summary>Ver las {c.rows.length} jurisdicciones del rubro</summary><RankTable rows={c.rows} denominator={`el rubro completo (${format1M(c.total)})`} /></details></details>)}</section>
    <section className="chart-container"><h2 className="section-title">Ranking jurisdicción × rubro</h2><div className="analysis-controls"><label>Personal y coparticipación<select value={universe} onChange={(e) => setUniverse(e.target.value)}>{analysis.universes.map((u) => <option value={u.id} key={u.id}>{u.label}</option>)}</select></label></div><RankTable rows={current.ranking} denominator={`el universo seleccionado (${format1M(current.total)})`} /></section>
    <section className="chart-container"><h2 className="section-title">Rankings por ministerio y partida</h2><div className="analysis-controls"><label>Ministerio / organismo<select aria-label="Ministerio del ranking" value={selectedJurisdiction ?? ""} onChange={(e) => setJurisdiction(e.target.value)}>{analysis.matrix.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label><label>Tratamiento de bienes y servicios<select value={String(combined)} onChange={(e) => setCombined(e.target.value === "true")}><option value="true">Consolidar 200 + 300</option><option value="false">Separar partidas 200 y 300</option></select></label></div>{analysis.ministryRankings.filter((g) => g.jurisdiction === selectedJurisdiction && g.combined === combined).map((g) => <details className="analysis-block" key={g.id} open={g.id === "200+300" || g.id === "200"}><summary>{g.id} · {g.label} · {format1M(g.total)}</summary><RankTable rows={g.rows} denominator={`este bloque del organismo (${format1M(g.total)})`} /></details>)}</section>
    <section className="chart-container">
      <h2 className="section-title">Cuenta → jurisdicciones y subtotales</h2>
      <p className="source-text">La partida 100 se muestra sólo como total por ministerio o jurisdicción, sin apertura por subpartidas. Las demás cuentas conservan su apertura; sus porcentajes se calculan sobre las partidas distintas de 100 ({format1M(analysis.accountsTotal)}). La búsqueda no cambia los denominadores.</p>
      {analysis.partida100.rows.length > 0 && <div className="analysis-block">
        <h3>Partida 100 · Personal por ministerio / jurisdicción</h3>
        <div className="desagregado-table-scroll">
          <table className="data-table" style={{ minWidth: 0 }}>
            <thead><tr><th>Ministerio / jurisdicción</th><th className="numeric">Total</th></tr></thead>
            <tbody>{analysis.partida100.rows.map((row) => <tr key={row.id}><td>{row.label}</td><td className="numeric" style={{ whiteSpace: "nowrap" }}>{format1M(row.total)}</td></tr>)}</tbody>
            <tfoot><tr><th>Total partida 100</th><td className="numeric" style={{ whiteSpace: "nowrap" }}>{format1M(analysis.partida100.total)}</td></tr></tfoot>
          </table>
        </div>
      </div>}
      <div className="analysis-controls"><label>Buscar cuenta<input placeholder="Código o descripción" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div>
      {accountGroups.map((a) => <details className="analysis-block" key={a.id}><summary>{a.label} · subtotal {format1M(a.total)} · {pct(a.share)} del universo sin partida 100</summary><RankTable rows={a.rows} denominator={`el subtotal de la cuenta ${a.id} (${format1M(a.total)})`} /></details>)}
      {!accountGroups.length && <p>{analysis.accounts.length ? "Sin cuentas para esta búsqueda." : "No hay cuentas fuera de la partida 100 en este corte."}</p>}
    </section>
    <section className="chart-container"><h2 className="section-title">Modificaciones presupuestarias</h2><p className="source-text">Crédito vigente − crédito original del último mes con créditos dentro del rango solicitado, con los mismos filtros de fuente, jurisdicción y partida. No se suman valores de distintos meses ni se agregan estas modificaciones al gasto.</p><div className="desagregado-table-scroll"><table className="data-table"><thead><tr><th>Jurisdicción</th><th>Mes del crédito</th><th>Original</th><th>Vigente</th><th>Modificación</th></tr></thead><tbody>{totalMods.map((r) => <tr key={r.codigo}><td>{r.nombre}</td><td>{r.mes}</td><td className="numeric">{money(r.original)}</td><td className="numeric">{money(r.vigente)}</td><td className="numeric">{money(r.modificacion)}</td></tr>)}</tbody><tfoot><tr><th>Total con ambas bases</th><td>—</td><td className="numeric">{format1M(totalMods.filter((r) => r.modificacion !== null).reduce((n, r) => n + (r.original ?? 0), 0))}</td><td className="numeric">{format1M(totalMods.filter((r) => r.modificacion !== null).reduce((n, r) => n + (r.vigente ?? 0), 0))}</td><td className="numeric">{format1M(totalMods.reduce((n, r) => n + (r.modificacion ?? 0), 0))}</td></tr></tfoot></table>{!totalMods.length && <p>No hay registros de crédito para este corte.</p>}</div></section>
  </div>;
}
