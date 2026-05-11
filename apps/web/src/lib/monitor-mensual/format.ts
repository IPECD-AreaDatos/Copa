export function formatMillions(value: number | null | undefined): string {
  if (value === undefined || value === null) return "N/A";
  return (
    "$" +
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value)) +
    " M"
  );
}

export type PercentageFormatOpts = { fractionDigits?: number };

export function formatPercentage(
  value: number | null | undefined,
  opts?: PercentageFormatOpts,
): string {
  if (value === undefined || value === null) return "N/A";
  const fd = opts?.fractionDigits ?? 1;
  const sign = value >= 0 ? "+" : "";
  const n = fd === 0 ? Math.round(value) : value;
  const formattedValue = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: fd,
    maximumFractionDigits: fd,
  }).format(n);
  return `${sign}${formattedValue}%`;
}

/** Igual que en script.js: saca signo duplicado al componer con + o - manual */
export function formatPercentageUnsigned(
  value: number | null | undefined,
  opts?: PercentageFormatOpts,
): string {
  if (value === undefined || value === null) return "N/A";
  const fd = opts?.fractionDigits ?? 1;
  const n = fd === 0 ? Math.round(Math.abs(value)) : Math.abs(value);
  const formattedValue = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: fd,
    maximumFractionDigits: fd,
  }).format(n);
  return `${formattedValue}%`;
}

export function groupByNDays(
  labels: string[],
  dataArr: (number | null)[],
  n: number,
): { labels: string[]; data: number[] } {
  const groupedLabels: string[] = [];
  const groupedData: number[] = [];
  for (let i = 0; i < dataArr.length; i += n) {
    const chunk = dataArr.slice(i, i + n).filter((v) => v != null && v > 0) as number[];
    const sum = chunk.reduce((a, b) => a + b, 0);
    const startLabel = labels[i] || (i + 1).toString();
    const endIdx = Math.min(i + n - 1, dataArr.length - 1);
    const endLabel = labels[endIdx] || (endIdx + 1).toString();
    groupedLabels.push(n > 1 ? `${startLabel}-${endLabel}` : startLabel);
    groupedData.push(sum);
  }
  return { labels: groupedLabels, data: groupedData };
}
