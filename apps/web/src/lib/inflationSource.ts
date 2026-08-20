export type InflationSourceMeta = {
  ipc_missing?: boolean;
  ipc_projected?: boolean;
  ipc_source?: "official" | "rem_bcra" | "unavailable";
  ipc_rem_published_at?: string | null;
};

function formatPublishedAt(value: string | null | undefined) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function describeInflationSource(meta: InflationSourceMeta | null | undefined) {
  if (!meta) return null;

  const source = meta.ipc_source ?? (meta.ipc_projected ? "rem_bcra" : meta.ipc_missing ? "unavailable" : "official");
  if (source === "rem_bcra") {
    const publishedAt = formatPublishedAt(meta.ipc_rem_published_at);
    const publication = publishedAt ? `publicación del ${publishedAt}` : "última publicación disponible";
    return `Fuente del IPC para este cálculo: proyección construida desde el último IPC oficial del INDEC, encadenando la mediana mensual del REM (expectativas de mercado publicadas por el BCRA), ${publication}.`;
  }
  if (source === "unavailable") {
    return "Fuente del IPC para este cálculo: no disponible; no se completa el indicador real.";
  }
  return "Fuente del IPC para este cálculo: dato oficial publicado por el INDEC.";
}

export function withInflationSource(
  tooltip: string,
  meta: InflationSourceMeta | null | undefined,
) {
  const source = describeInflationSource(meta);
  return source ? `${tooltip}\n\n${source}` : tooltip;
}
