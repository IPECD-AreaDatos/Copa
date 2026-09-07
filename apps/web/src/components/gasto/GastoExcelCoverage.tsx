"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { fetchWithAuth } from "@/lib/api";
import { format1M, formatPctOneDecimal } from "@/lib/gasto/logic";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export type ExcelAnalysisRow = {
  ref: string; label: string; reference: number | null; live: number | null;
  difference: number | null; originalShare: number | null; originalCumulative: number | null; share: number | null; cumulative: number | null;
  missing: string | null; repeated: boolean; projection?: boolean; average: number | null; annual: number | null;
  target?: number | null; targetRef?: string | null; targetDifference: number | null;
  scope: { jurisdictions?: number[]; chapters?: number[]; accounts?: number[]; excludeAccounts?: number[]; manual?: boolean; unresolved?: boolean };
};
export type ExcelSheetAnalysis = {
  id: string; name: string; bookId: string; book: string; summary: string; destination: string;
  cellCount: number; formulaCount: number; chartCount: number;
  blocks: { title: string; note: string; liveTotal: number | null; referenceTotal: number; rows: ExcelAnalysisRow[]; accountSubtotals: { account: number; reference: number; live: number | null; jurisdictions: number }[] }[];
};
type SourceCell = { ref: string; row: number; col: number; value: string | number | boolean | null; formula?: string; comment?: string; format: string; bold?: boolean; fill?: string };
type SourceChart = { title: string; series: { name: string; categories: string[]; values: (number | null)[]; categoryRef: string; valueRef: string }[] };
type SourceSheet = { id: string; range: string; columns: string[]; cells: SourceCell[]; charts: SourceChart[]; hiddenColumns: string[]; hiddenRows: number[] };
const money = (v: number | null | undefined) => v === null || v === undefined ? "—" : format1M(v);
const pct = (v: number | null) => v === null ? "—" : formatPctOneDecimal(v);

const observations: Record<string, string[]> = {
  "3-1": ["H es un subtotal sin personal. J reinicia el acumulado en varias filas: no es un Pareto continuo. Los seis gráficos del archivo se muestran debajo con sus series de origen."],
  "3-2": ["Hay un segundo bloque del ranking en filas 221–297. Sus porcentajes siguen referenciando C50:C126. C213 está rotulado como deuda pero referencia C63 (bienes y servicios de Secretaría General)."],
  "3-3": ["P4:P27 suma B:N, mezclando ejecución semestral, promedios, necesidades y diferencias. No usar ese subtotal como gasto. El tablero calcula el gasto sumando sólo los montos de ejecución.", "C32:C33 no declara concepto ni unidad. Se conserva en los auxiliares sin atribuirle una interpretación presupuestaria."],
  "3-4": ["Los grupos de concentración tienen 5, 6 y 7 jurisdicciones, respectivamente. Transferencias incluye 533 en Hacienda. Los porcentajes originales se refieren al total del rubro, no sólo al grupo seleccionado."],
  "3-5": ["J26 está vacío: omite $831.183.366,06 en J27. C26 es Personal ($291.841.782,06), no Bienes y servicios. B contiene modificaciones presupuestarias y no se suma al gasto."],
  "4-1": ["La hoja 200 mezcla cuentas 200 y 300. D5:D53 divide sólo por C5:C53, aunque hay importes hasta la fila 117. No sumar esta hoja a la 300."],
  "4-4": ["Esta hoja incluye seguridad social (533) y excluye coparticipación (571/587). No equivale a todas las cuentas del capítulo 500."],
  "2-9": ["La cuenta 363 vuelve a aparecer en la segunda presentación. El original conserva las repeticiones; el total de claves únicas evita contarlas dos veces."],
  "2-11": ["La cuenta 363 aparece en dos grupos. Los subtotales de la selección no deben sumarse a los de las otras hojas."],
};

function storedValue(cell?: SourceCell) {
  if (!cell || cell.value === null) return "";
  if (typeof cell.value !== "number") return String(cell.value);
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: cell.format.includes("%") ? 4 : 6 }).format(cell.value * (cell.format.includes("%") ? 100 : 1)) + (cell.format.includes("%") ? "%" : "");
}

function SourceCharts({ charts }: { charts: SourceChart[] }) {
  return <div className="excel-chart-grid">{charts.map((chart, i) => <article key={i}>
    <h3>{chart.title.startsWith("Gráfico") ? chart.series[0]?.name : chart.title}</h3>
    <div style={{ height: 380 }}><Bar options={{ indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: chart.series.length > 1 } }, scales: { x: { title: { display: true, text: "Millones de pesos · referencia Excel" } }, y: { ticks: { font: { size: 10 } } } } }}
      data={{ labels: chart.series[0]?.categories ?? [], datasets: chart.series.map((s, j) => ({ label: s.name, data: s.values.map((v) => v === null ? null : v / 1e6), backgroundColor: ["#0f766e", "#b45309", "#2563eb", "#7c3aed"][j % 4] })) }} /></div>
    <p className="source-text">{chart.series.map((s) => s.valueRef).join(" · ")}</p>
  </article>)}</div>;
}

export default function GastoExcelCoverage({ sheets, comparable, isSnapshot }: { sheets: ExcelSheetAnalysis[]; comparable: boolean; isSnapshot: boolean }) {
  const [selected, setSelected] = useState("3-1");
  const [source, setSource] = useState<SourceSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cellRef, setCellRef] = useState("");
  const sheet = sheets.find((s) => s.id === selected) ?? sheets[0];
  useEffect(() => {
    const controller = new AbortController();
    fetchWithAuth(`/copa/copa-api/api/gastos/desagregados/excel/${selected}`, { signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error("No se pudo abrir la hoja de referencia."); return r.json() as Promise<SourceSheet>; })
      .then((r) => { if (!controller.signal.aborted) { setSource(r); setError(null); } })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Error de lectura"); });
    return () => controller.abort();
  }, [selected]);
  const currentSource = source?.id === selected ? source : null;
  const sourceRows = useMemo(() => {
    const rows = new Map<number, Map<number, SourceCell>>();
    currentSource?.cells.forEach((c) => { if (!rows.has(c.row)) rows.set(c.row, new Map()); rows.get(c.row)!.set(c.col, c); });
    return [...rows.entries()];
  }, [currentSource]);
  const selectedCell = currentSource?.cells.find((c) => c.ref === cellRef);
  if (!sheet) return <p>No hay referencias Excel disponibles.</p>;
  const totalCells = sheets.reduce((n, s) => n + s.cellCount, 0);
  return <section className="chart-container excel-coverage" id="excel-coverage">
    <h2 className="section-title">Los cuatro Excel, hoja por hoja</h2>
    <p className="section-subtitle">{sheets.length} hojas · {totalCells.toLocaleString("es-AR")} celdas · {sheets.reduce((n, s) => n + s.formulaCount, 0).toLocaleString("es-AR")} fórmulas · {sheets.reduce((n, s) => n + s.chartCount, 0)} gráficos</p>
    <p className="desagregado-scope-note">Cada análisis conserva la selección del ministro y permite consultar sus valores y fórmulas originales. Los importes de las tablas de análisis están en millones de pesos y responden a los filtros superiores. El año de los Excel no está confirmado.</p>
    <div className="excel-controls">
      <label>Archivo<select aria-label="Archivo Excel" value={sheet.bookId} onChange={(e) => { setSelected(sheets.find((s) => s.bookId === e.target.value)!.id); setQuery(""); setCellRef(""); }}>
        {[...new Map(sheets.map((s) => [s.bookId, s.book])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label>Hoja<select aria-label="Hoja Excel" value={selected} onChange={(e) => { setSelected(e.target.value); setQuery(""); setCellRef(""); }}>{sheets.filter((s) => s.bookId === sheet.bookId).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
      <label>Buscar en los análisis<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cuenta, organismo o concepto" /></label>
    </div>
    <p>{sheet.summary}</p>
    {(observations[sheet.id] ?? []).map((note) => <p key={note} className="desagregado-warning-box">{note}</p>)}
    {!comparable && <p className="desagregado-scope-note">Referencia informativa para este corte: se omiten las diferencias con el Excel y sus metas. Para una comparación orientativa, usar enero–junio 2026, fuente 10, Comprometido y sin filtros de jurisdicción o capítulo.</p>}
    {sheet.blocks.map((block, i) => {
      const rows = block.rows.filter((r) => r.label.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")));
      if (!rows.length) return null;
      const projection = block.rows.some((r) => r.projection);
      const manual = block.rows.every((r) => r.scope.manual);
      return <details key={`${selected}-${i}`} className="excel-block" open={i === 0}>
        <summary>{block.title} <span>({block.rows.length} filas)</span></summary>
        <p className="source-text">{block.note}</p>
        {!manual && <p className="source-text">Claves únicas: referencia {money(block.referenceTotal)} · corte vivo {money(block.liveTotal)}. Las filas sin registros se indican como tales. La búsqueda sólo oculta filas; no cambia porcentajes ni totales.</p>}
        {projection && isSnapshot && <p>Crédito presupuestario: no corresponde dividirlo por meses ni anualizarlo.</p>}
        <div className="desagregado-table-scroll excel-detail-scroll"><table className="data-table">
          <thead><tr><th>Celda</th><th>Concepto / selección</th><th>Referencia Excel</th>{!manual && <><th>Corte vivo</th><th>Diferencia orientativa</th><th>% original</th><th>% acum. original</th><th>% selección viva</th><th>% acum. vivo (orden Excel)</th></>}{projection && <><th>Prom. mensual vivo</th><th>Ritmo ×12</th><th>Meta mensual Excel</th><th>Prom. − meta</th></>}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.ref}>
            <td><button type="button" className="excel-cell-link" onClick={() => setCellRef(r.ref)}>{r.ref}</button></td><td>{r.label}{r.repeated && <small> · repetida, excluida del subtotal</small>}</td>
            <td className="numeric">{r.scope.manual && selected === "3-3" && ["C32", "C33"].includes(r.ref) ? String(r.reference) : money(r.reference)}</td>
            {!manual && <><td className="numeric">{r.live === null ? r.missing : money(r.live)}</td><td className="numeric">{comparable ? money(r.difference) : "—"}</td><td className="numeric">{pct(r.originalShare)}</td><td className="numeric">{pct(r.originalCumulative)}</td><td className="numeric">{pct(r.share)}</td><td className="numeric">{pct(r.cumulative)}</td></>}
            {projection && <><td className="numeric">{money(r.average)}</td><td className="numeric">{money(r.annual)}</td><td className="numeric">{money(r.target)}</td><td className="numeric">{comparable ? money(r.targetDifference) : "—"}</td></>}
          </tr>)}</tbody>
        </table></div>
        {block.accountSubtotals.length > 0 && <details className="excel-block"><summary>Subtotales por cuenta de esta selección · sin duplicados</summary><div className="desagregado-table-scroll"><table className="data-table"><thead><tr><th>Cuenta</th><th>Jurisdicciones seleccionadas</th><th>Referencia Excel</th><th>Corte vivo</th></tr></thead><tbody>{block.accountSubtotals.map((r) => <tr key={r.account}><td>{r.account}</td><td>{r.jurisdictions}</td><td className="numeric">{money(r.reference)}</td><td className="numeric">{money(r.live)}</td></tr>)}</tbody></table></div></details>}
      </details>;
    })}
    {selectedCell && <aside className="excel-formula" aria-live="polite"><strong>{sheet.name}!{selectedCell.ref}</strong><p>Valor guardado: {storedValue(selectedCell)}</p><code>{selectedCell.formula ?? "Valor ingresado en el archivo, sin fórmula."}</code>{selectedCell.comment && <p>{selectedCell.comment}</p>}</aside>}
    {cellRef && currentSource && !selectedCell && <aside className="excel-formula" aria-live="polite">{sheet.name}!{cellRef}: celda vacía en el archivo original.</aside>}
    {error && <p role="alert">{error}</p>}
    {!currentSource && !error && <p>Cargando celdas originales…</p>}
    {currentSource && <>
      <details className="excel-block"><summary>Hoja original completa · {currentSource.range}</summary>
        <p className="source-text">Incluye todas las celdas con contenido, también las de filas o columnas ocultas. Valores almacenados en pesos, sin redondear a millones, salvo los porcentajes y auxiliares de unidad no declarada. Seleccioná una celda para consultar su fórmula. Se omiten únicamente filas vacías.</p>
        {(currentSource.hiddenColumns.length > 0 || currentSource.hiddenRows.length > 0) && <p className="source-text">Ocultas en el Excel: columnas {currentSource.hiddenColumns.join(", ") || "ninguna"}; filas {currentSource.hiddenRows.join(", ") || "ninguna"}.</p>}
        <div className="desagregado-table-scroll excel-detail-scroll"><table className="data-table excel-original"><thead><tr><th>Fila</th>{currentSource.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>
          {sourceRows.map(([row, cells]) => <tr key={row}><th>{row}</th>{currentSource.columns.map((col, i) => { const c = cells.get(i+1); return <td key={col} className={typeof c?.value === "number" ? "numeric" : ""} style={{ backgroundColor: c?.fill, color: c?.fill ? "#111827" : undefined, fontWeight: c?.bold ? 700 : undefined }}>{c && <button type="button" className="excel-cell-link" title={c.formula ?? c.ref} onClick={() => setCellRef(c.ref)}>{storedValue(c) || (c.formula ? "Sin valor guardado" : "")}</button>}</td>; })}</tr>)}
        </tbody></table></div>
      </details>
      {currentSource.charts.length > 0 && <details className="excel-block" open><summary>Los {currentSource.charts.length} gráficos del Excel</summary><SourceCharts charts={currentSource.charts} /></details>}
    </>}
    <details className="excel-block"><summary>Mapa de cobertura de las 29 hojas</summary><div className="desagregado-table-scroll"><table className="data-table"><thead><tr><th>Archivo</th><th>Hoja</th><th>Análisis incorporados</th><th>Celdas</th><th>Fórmulas</th><th>Gráficos</th></tr></thead><tbody>{sheets.map((s) => <tr key={s.id}><td>{s.book}</td><td><button className="excel-cell-link" onClick={() => { setSelected(s.id); setQuery(""); }}>{s.name}</button></td><td>{s.summary}</td><td>{s.cellCount}</td><td>{s.formulaCount}</td><td>{s.chartCount}</td></tr>)}</tbody></table></div></details>
  </section>;
}
