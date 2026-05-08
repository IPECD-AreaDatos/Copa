/** IPC para deflactar: el JSON anual usa `avg_ipc_used` si no viene `ipc_used_for_calc`. */
export function recaudacionIpcPct(kpi: {
  recaudacion: { ipc_used_for_calc?: number; avg_ipc_used?: number };
}): number {
  const r = kpi.recaudacion;
  return r.ipc_used_for_calc ?? r.avg_ipc_used ?? 0;
}

export function formatBillions(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  const valInBillions = value / 1_000_000;
  return (
    "$" +
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(valInBillions) +
    " Billones"
  );
}

export function formatMillions(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return (
    "$" +
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value) +
    " M"
  );
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  const sign = value >= 0 ? "+" : "";
  const formattedValue = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
  return `${sign}${formattedValue}%`;
}

export function formatPctUnsigned(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      Math.abs(value),
    ) + "%"
  );
}
