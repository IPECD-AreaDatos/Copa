import {
  formatBillions,
  formatMillions,
  formatPercentage,
  recaudacionIpcPct,
} from "./format";

/** KPI anual dentro de `_data_ipce_v1.json` → `annual_monitor.data[yearId]` */
export type AnnualKpiBundle = {
  meta?: {
    periodo?: string;
    max_month?: number;
    is_complete?: boolean;
    budget_through_month?: number;
    source?: "monthly";
  };
  recaudacion: {
    disponible_current?: number | null;
    disponible_prev?: number | null;
    current?: number | null;
    prev?: number | null;
    neta_current?: number | null;
    neta_prev?: number | null;
    bruta_current?: number | null;
    bruta_prev?: number | null;
    diff_nom?: number | null;
    var_nom?: number | null;
    var_real?: number | null;
    diff_real?: number | null;
    ipc_missing?: boolean;
    ipc_projected?: boolean;
    ipc_source?: "official" | "rem_bcra" | "unavailable";
    ipc_rem_published_at?: string | null;
    ipc_used_for_calc?: number | null;
    avg_ipc_used?: number | null;
    esperada?: number | null;
  };
  rop?: {
    bruta_current?: number | null;
    bruta_prev?: number | null;
    disponible_current?: number | null;
    disponible_prev?: number | null;
    diff_nom?: number | null;
    var_nom?: number | null;
    var_real?: number | null;
    diff_real?: number | null;
    ipc_missing?: boolean;
    ipc_projected?: boolean;
    ipc_source?: "official" | "rem_bcra" | "unavailable";
    ipc_rem_published_at?: string | null;
    esperada_prov?: number | null;
    brecha_abs_prov?: number | null;
    brecha_pct_prov?: number | null;
  };
  distribucion_municipal?: {
    current?: number | null;
    prev?: number | null;
    nacion_current?: number | null;
    nacion_prev?: number | null;
    provincia_current?: number | null;
    provincia_prev?: number | null;
    diff_nom?: number | null;
    var_nom?: number | null;
    var_real?: number | null;
    diff_real?: number | null;
    ipc_missing?: boolean;
    ipc_projected?: boolean;
    ipc_source?: "official" | "rem_bcra" | "unavailable";
    ipc_rem_published_at?: string | null;
  };
  masa_salarial: {
    current?: number | null;
    prev?: number | null;
    cobertura_current?: number | null;
    cobertura_prev?: number | null;
    diff_nom?: number | null;
    var_nom?: number | null;
    var_real?: number | null;
    diff_real?: number | null;
    ipc_missing?: boolean;
    ipc_projected?: boolean;
    ipc_source?: "official" | "rem_bcra" | "unavailable";
    ipc_rem_published_at?: string | null;
    is_incomplete?: boolean;
  };
  recaudacion_provincial?: {
    current?: number | null;
    esperada_prov?: number | null;
    brecha_abs_prov?: number | null;
    brecha_pct_prov?: number | null;
  };
};

export type AnnualVm = {
  periodLabel: string;
  prevYear: number;
  ipcPct: number;
  recaudacion: {
    current: string;
    prev: string;
    netaCurr: string;
    netaPrev: string;
    brutaCurr: string;
    brutaPrev: string;
    varNomAbs: string;
    varNomPct: string;
    varNomClass: string;
    realPct: string;
    realPctClass: string;
    realAbs: string;
    realAbsClass: string;
    showNomAbs: boolean;
    showRealAbs: boolean;
  };
  muni?: {
    current: string;
    prev: string;
    natCurr: string;
    provCurr: string;
    natPrev: string;
    provPrev: string;
    varNomAbs: string;
    varNomPct: string;
    varNomClass: string;
    realPct: string;
    realPctClass: string;
    realAbs: string;
    realAbsClass: string;
    showNomAbs: boolean;
    showRealAbs: boolean;
  };
  rop?: {
    dispCurr: string;
    brutaCurr: string;
    dispPrev: string;
    brutaPrev: string;
    varNomAbs: string;
    varNomPct: string;
    varNomClass: string;
    realPct: string;
    realPctClass: string;
    realAbs: string;
    realAbsClass: string;
    showNomAbs: boolean;
    showRealAbs: boolean;
  };
  masa: {
    current: string;
    prev: string;
    cobCurr: string;
    cobPrev: string;
    varNomPct: string;
    varNomPctClass: string;
    varNomAbs: string;
    showNomAbs: boolean;
    realPct: string;
    realPctClass: string;
    realAbs: string;
    realAbsClass: string;
    showRealAbs: boolean;
  };
  presupuestoRon?: {
    diffAbs: string;
    diffAbsClass: string;
    diffPct: string;
    diffPctClass: string;
    recaudado: string;
    esperada: string;
  };
  presupuestoProv?: {
    diffAbs: string;
    diffAbsClass: string;
    diffPct: string;
    diffPctClass: string;
    recaudado: string;
    esperada: string;
  };
};

type Amount = number | null | undefined;
const hasValue = (value: Amount): value is number => typeof value === "number" && Number.isFinite(value);
const missingClass = "kpi-value text-secondary text-missing";
const valueClass = (value: Amount) => hasValue(value)
  ? `kpi-value ${value >= 0 ? "text-success" : "text-danger"}` : missingClass;
const signedAmount = (value: Amount, format = formatMillions) => hasValue(value)
  ? (value >= 0 ? "+" : "-") + format(Math.abs(value)) : "Sin datos";
const diff = (current: Amount, previous: Amount) => hasValue(current) && hasValue(previous) ? current - previous : null;

function buildBudgetComparison(actual: Amount, expected: Amount) {
  if (!hasValue(expected) || expected <= 0) return undefined;
  const diffAbs = diff(actual, expected);
  const diffPct = hasValue(actual) ? (actual / expected - 1) * 100 : null;
  return {
    diffAbs: signedAmount(diffAbs), diffAbsClass: valueClass(diffAbs),
    diffPct: formatPercentage(diffPct), diffPctClass: valueClass(diffPct),
    recaudado: formatMillions(actual), esperada: formatMillions(expected),
  };
}

export function buildAnnualVm(kpi: AnnualKpiBundle, iterYear: number): AnnualVm {
  const ipcPct = recaudacionIpcPct(kpi);
  const rec = kpi.recaudacion;
  const current = rec.disponible_current ?? rec.current;
  const previous = rec.disponible_prev ?? rec.prev;
  const indicators = (
    item: { diff_nom?: Amount; var_nom?: Amount; var_real?: Amount; diff_real?: Amount; ipc_missing?: boolean },
    amountCurrent: Amount, amountPrevious: Amount, nominalFormat = formatMillions, realFormat = formatMillions,
  ) => {
    const comparable = hasValue(amountCurrent) && hasValue(amountPrevious);
    const realAvailable = comparable && !item.ipc_missing;
    const realDiff = realAvailable
      ? item.diff_real !== undefined ? item.diff_real : diff(amountCurrent, amountPrevious * (1 + ipcPct / 100))
      : null;
    const nominal = comparable ? item.var_nom : null;
    const real = realAvailable ? item.var_real : null;
    return {
      varNomAbs: signedAmount(comparable ? item.diff_nom : null, nominalFormat),
      varNomPct: formatPercentage(nominal), varNomClass: valueClass(nominal),
      realPct: comparable && item.ipc_missing ? "Sin IPC completo" : formatPercentage(real),
      realPctClass: valueClass(real), realAbs: signedAmount(realDiff, realFormat),
      realAbsClass: valueClass(realDiff), showNomAbs: true, showRealAbs: true,
    };
  };
  const salary = kpi.masa_salarial;
  const salaryIndicators = indicators(salary, salary.current, salary.prev);
  const coverage = (amount: Amount, ron: Amount, rop: Amount) =>
    hasValue(amount) && hasValue(ron) && hasValue(rop) && ron + rop > 0
      ? amount / (ron + rop) * 100 : null;
  const coverageLabel = (value: Amount) => hasValue(value) ? `Cobertura: ${value.toFixed(1)}%` : "Cobertura: Sin datos";
  const rp = kpi.rop;
  const dm = kpi.distribucion_municipal;
  return {
    periodLabel: (kpi.meta?.periodo ?? "").replace(" (YTD)", " (incompleto)"),
    prevYear: iterYear - 1, ipcPct,
    recaudacion: {
      ...indicators(rec, current, previous, formatBillions, formatBillions),
      current: formatBillions(current), prev: formatBillions(previous),
      netaCurr: formatMillions(rec.neta_current), netaPrev: formatMillions(rec.neta_prev),
      brutaCurr: formatMillions(rec.bruta_current), brutaPrev: formatMillions(rec.bruta_prev),
    },
    rop: rp ? {
      ...indicators(rp, rp.disponible_current, rp.disponible_prev),
      dispCurr: formatMillions(rp.disponible_current), dispPrev: formatMillions(rp.disponible_prev),
      brutaCurr: formatMillions(rp.bruta_current), brutaPrev: formatMillions(rp.bruta_prev),
    } : undefined,
    muni: dm ? {
      ...indicators(dm, dm.current, dm.prev, formatBillions),
      current: formatMillions(dm.current), prev: formatMillions(dm.prev),
      natCurr: formatMillions(dm.nacion_current), natPrev: formatMillions(dm.nacion_prev),
      provCurr: formatMillions(dm.provincia_current), provPrev: formatMillions(dm.provincia_prev),
    } : undefined,
    masa: {
      ...salaryIndicators,
      current: salary.is_incomplete ? "Sin datos" : formatMillions(salary.current),
      prev: formatMillions(salary.prev),
      cobCurr: coverageLabel(coverage(salary.current, rec.bruta_current, rp?.bruta_current)),
      cobPrev: coverageLabel(coverage(salary.prev, rec.bruta_prev, rp?.bruta_prev)),
      varNomPctClass: salaryIndicators.varNomClass,
    },
    presupuestoRon: buildBudgetComparison(rec.bruta_current, rec.esperada),
    presupuestoProv: kpi.recaudacion_provincial
      ? buildBudgetComparison(kpi.recaudacion_provincial.current, kpi.recaudacion_provincial.esperada_prov)
      : buildBudgetComparison(rp?.bruta_current, rp?.esperada_prov),
  };
}
