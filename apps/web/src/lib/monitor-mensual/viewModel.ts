import { formatMillions, formatPercentage } from "./format";

type MaybeNumber = number | null | undefined;

export type PeriodMeta = {
  id: string;
  label: string;
  year: number;
  month?: number;
  is_complete: boolean;
  incomplete?: boolean;
};

export type CompletenessShape = {
  is_complete: boolean;
  variables: {
    ron: { is_complete: boolean };
    rop: { is_complete: boolean };
    masa_salarial: { is_complete: boolean };
  };
};

export type MonitorJson = {
  meta: {
    default_period_id: string;
    available_periods: PeriodMeta[];
  };
  data: Record<
    string,
    {
      completeness: CompletenessShape;
      kpi: KpiShape;
      charts: ChartsShape;
    }
  >;
};

export type ChartsShape = {
  daily: {
    labels: string[];
    data_curr: number[];
    data_prev_nom: number[];
    is_complete: boolean;
  };
  copa_vs_salario: CopaVsSalarioShape;
};

export type CopaVsSalarioShape = {
  labels: string[];
  cumulative_copa: (number | null)[];
  cumulative_rop?: (number | null)[];
  cumulative_esperada?: (number | null)[];
  cumulative_neta?: (number | null)[];
  salario_target: (number | null)[];
  copa_label?: string;
  salario_label?: string;
  salario_line_label?: string;
  rop_dia_imputacion?: number;
  chart_last_day?: number;
  chart_dias_mes?: number;
  is_complete: boolean;
  periodo_incompleto?: boolean;
  masa_objetivo_es_fallback?: boolean;
};

type InflationMeta = {
  ipc_missing?: boolean;
  ipc_projected?: boolean;
  ipc_source?: "official" | "rem_bcra" | "unavailable";
  ipc_rem_published_at?: string | null;
  ipc_used_for_calc?: MaybeNumber;
};

type KpiShape = {
  meta?: { periodo?: string; is_complete?: boolean };
  resumen?: {
    total_disponible_current?: MaybeNumber;
    post_sueldos_current?: MaybeNumber;
    ron_disponible?: MaybeNumber;
    rop_disponible?: MaybeNumber;
  };
  recaudacion: InflationMeta & {
    is_complete: boolean;
    disponible_current?: MaybeNumber;
    disponible_prev?: MaybeNumber;
    current?: MaybeNumber;
    prev?: MaybeNumber;
    neta_current?: MaybeNumber;
    neta_prev?: MaybeNumber;
    bruta_current?: MaybeNumber;
    bruta_prev?: MaybeNumber;
    var_nom?: MaybeNumber;
    var_real?: MaybeNumber;
    diff_nom?: MaybeNumber;
    esperada?: MaybeNumber;
  };
  rop?: InflationMeta & {
    is_complete: boolean;
    disponible_current?: MaybeNumber;
    disponible_prev?: MaybeNumber;
    bruta_current?: MaybeNumber;
    bruta_prev?: MaybeNumber;
    var_nom?: MaybeNumber;
    var_real?: MaybeNumber;
    diff_nom?: MaybeNumber;
    diff_real?: MaybeNumber;
    esperada_prov?: MaybeNumber;
    brecha_abs_prov?: MaybeNumber;
    brecha_pct_prov?: MaybeNumber;
  };
  distribucion_municipal?: InflationMeta & {
    is_complete: boolean;
    current?: MaybeNumber;
    prev?: MaybeNumber;
    nacion_current?: MaybeNumber;
    nacion_current_millons?: MaybeNumber;
    provincia_current?: MaybeNumber;
    provincia_current_millons?: MaybeNumber;
    nacion_prev?: MaybeNumber;
    nacion_prev_millons?: MaybeNumber;
    provincia_prev?: MaybeNumber;
    provincia_prev_millons?: MaybeNumber;
    diff_nom?: MaybeNumber;
    var_nom?: MaybeNumber;
    var_real?: MaybeNumber;
    diff_real?: MaybeNumber;
  };
  masa_salarial: InflationMeta & {
    is_complete: boolean;
    current?: MaybeNumber;
    prev?: MaybeNumber;
    cobertura_current?: MaybeNumber;
    cobertura_prev?: MaybeNumber;
    var_nom?: MaybeNumber;
    var_real?: MaybeNumber;
    diff_nom?: MaybeNumber;
  };
};

type MetricStrings = {
  current: string;
  prev: string;
  varNomAbs: string;
  varNomPct: string;
  varNomClass: string;
  realPct: string;
  realPctClass: string;
  realAbs: string;
  realAbsClass: string;
};

type BudgetStrings = {
  diffAbs: string;
  diffAbsClass: string;
  diffPct: string;
  diffPctClass: string;
  recaudado: string;
  esperada: string;
};

export type MonitorViewModel = {
  monthName: string;
  currentYear: number;
  prevYear: number;
  mainSubtitle: string;
  labelSuffix: string;
  isIncomplete: boolean;
  isPeriodComplete: boolean;
  showPresupuestoSection: boolean;
  resumen: {
    totalDisp: string;
    ronDisp: string;
    ropDisp: string;
    postSueldos: string;
    postClass: string;
  };
  muni:
    | (MetricStrings & {
        breakdownCurrNat: string;
        breakdownCurrProv: string;
        breakdownPrevNat: string;
        breakdownPrevProv: string;
      })
    | undefined;
  rop:
    | (MetricStrings & {
        dispCurr: string;
        brutaCurr: string;
        dispPrev: string;
        brutaPrev: string;
      })
    | undefined;
  recaudacion: MetricStrings & {
    netaCurr: string;
    netaPrev: string;
    brutaCurr: string;
    brutaPrev: string;
  };
  masa: {
    current: string;
    prev: string;
    cobCurr: string;
    cobPrev: string;
    varNomPct: string;
    varNomPctClass: string;
    varNomAbs: string;
    realPct: string;
    realPctClass: string;
    realAbs: string;
    realAbsClass: string;
  };
  presupuesto: (BudgetStrings & { rop?: BudgetStrings }) | undefined;
};

const MISSING = "Sin datos";
const MISSING_CLASS = "kpi-value text-secondary text-missing";

function hasNumber(value: MaybeNumber): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function money(value: MaybeNumber): string {
  return hasNumber(value) ? formatMillions(value) : MISSING;
}

function signedMoney(value: MaybeNumber): string {
  if (!hasNumber(value)) return MISSING;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return sign + formatMillions(Math.abs(value));
}

function signedPercentage(value: MaybeNumber): string {
  return hasNumber(value) ? formatPercentage(value) : MISSING;
}

function metricClass(value: MaybeNumber): string {
  if (!hasNumber(value)) return MISSING_CLASS;
  return `kpi-value ${value >= -0.05 ? "text-success" : "text-danger"}`;
}

function realMetric(
  realPercentage: MaybeNumber,
  realDifference: MaybeNumber,
  ipcMissing: boolean,
  inputsComplete: boolean,
): Pick<MetricStrings, "realPct" | "realPctClass" | "realAbs" | "realAbsClass"> {
  if (!inputsComplete || !hasNumber(realPercentage)) {
    const text = inputsComplete && ipcMissing ? "Sin IPC completo" : MISSING;
    return { realPct: text, realPctClass: MISSING_CLASS, realAbs: MISSING, realAbsClass: "" };
  }
  return {
    realPct: formatPercentage(realPercentage),
    realPctClass: metricClass(realPercentage),
    realAbs: signedMoney(realDifference),
    realAbsClass: hasNumber(realDifference)
      ? realDifference >= 0 ? "text-success" : "text-danger"
      : "",
  };
}

function budgetMetric(
  actual: MaybeNumber,
  expected: MaybeNumber,
  suppliedDifference?: MaybeNumber,
  suppliedPercentage?: MaybeNumber,
): BudgetStrings {
  if (!hasNumber(expected)) {
    return {
      diffAbs: MISSING,
      diffAbsClass: MISSING_CLASS,
      diffPct: MISSING,
      diffPctClass: MISSING_CLASS,
      recaudado: money(actual),
      esperada: MISSING,
    };
  }
  if (!hasNumber(actual)) {
    return {
      diffAbs: MISSING,
      diffAbsClass: MISSING_CLASS,
      diffPct: MISSING,
      diffPctClass: MISSING_CLASS,
      recaudado: MISSING,
      esperada: formatMillions(expected),
    };
  }

  const difference = hasNumber(suppliedDifference) ? suppliedDifference : actual - expected;
  const percentage = hasNumber(suppliedPercentage)
    ? suppliedPercentage
    : expected > 0 ? (actual / expected - 1) * 100 : 0;
  return {
    diffAbs: signedMoney(difference),
    diffAbsClass: metricClass(difference),
    diffPct: signedPercentage(percentage),
    diffPctClass: metricClass(percentage),
    recaudado: formatMillions(actual),
    esperada: formatMillions(expected),
  };
}

function coverage(value: MaybeNumber): string {
  if (!hasNumber(value)) return "Cobertura: Sin datos";
  return `Cobertura: ${new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

export function buildMonitorViewModel(
  dashboard: MonitorJson,
  periodId: string,
  kpi: KpiShape,
): MonitorViewModel {
  const [yearStr] = periodId.split("-");
  const currentYear = Number(yearStr);
  const prevYear = currentYear - 1;
  const period = dashboard.meta.available_periods.find((item) => item.id === periodId);
  const completeness = dashboard.data[periodId]?.completeness;
  const isPeriodComplete = completeness?.is_complete ?? period?.is_complete ?? false;
  const isIncomplete = !isPeriodComplete;
  const periodLabel = kpi.meta?.periodo ?? "";
  const monthName = periodLabel.split(" ")[0] || period?.label || "";

  const ronCurrent = kpi.recaudacion.disponible_current ?? kpi.recaudacion.current;
  const ronPrevious = kpi.recaudacion.disponible_prev ?? kpi.recaudacion.prev;
  const ronVariationComplete = hasNumber(kpi.recaudacion.var_nom);
  const ronInflation = kpi.recaudacion.ipc_used_for_calc;
  const ronRealDifference = ronVariationComplete && hasNumber(ronInflation)
    && hasNumber(ronCurrent) && hasNumber(ronPrevious)
    ? ronCurrent - ronPrevious * (1 + ronInflation / 100)
    : null;
  const ronReal = realMetric(
    kpi.recaudacion.var_real,
    ronRealDifference,
    !!kpi.recaudacion.ipc_missing,
    ronVariationComplete,
  );

  const recaudacion = {
    current: money(ronCurrent),
    prev: money(ronPrevious),
    netaCurr: money(kpi.recaudacion.neta_current),
    netaPrev: money(kpi.recaudacion.neta_prev),
    brutaCurr: money(kpi.recaudacion.bruta_current),
    brutaPrev: money(kpi.recaudacion.bruta_prev),
    varNomAbs: signedMoney(kpi.recaudacion.diff_nom),
    varNomPct: signedPercentage(kpi.recaudacion.var_nom),
    varNomClass: metricClass(kpi.recaudacion.var_nom),
    ...ronReal,
  };

  let rop: MonitorViewModel["rop"];
  if (kpi.rop) {
    const ropVariationComplete = hasNumber(kpi.rop.var_nom);
    const ropReal = realMetric(
      kpi.rop.var_real,
      kpi.rop.diff_real,
      !!kpi.rop.ipc_missing,
      ropVariationComplete,
    );
    rop = {
      current: money(kpi.rop.disponible_current),
      prev: money(kpi.rop.disponible_prev),
      dispCurr: money(kpi.rop.disponible_current),
      brutaCurr: money(kpi.rop.bruta_current),
      dispPrev: money(kpi.rop.disponible_prev),
      brutaPrev: money(kpi.rop.bruta_prev),
      varNomAbs: signedMoney(kpi.rop.diff_nom),
      varNomPct: signedPercentage(kpi.rop.var_nom),
      varNomClass: metricClass(kpi.rop.var_nom),
      ...ropReal,
    };
  }

  let muni: MonitorViewModel["muni"];
  if (kpi.distribucion_municipal) {
    const value = kpi.distribucion_municipal;
    const variationComplete = hasNumber(value.var_nom);
    const muniReal = realMetric(
      value.var_real,
      value.diff_real,
      !!value.ipc_missing,
      variationComplete,
    );
    muni = {
      current: money(value.current),
      prev: money(value.prev),
      breakdownCurrNat: money(value.nacion_current ?? value.nacion_current_millons),
      breakdownCurrProv: money(value.provincia_current ?? value.provincia_current_millons),
      breakdownPrevNat: money(value.nacion_prev ?? value.nacion_prev_millons),
      breakdownPrevProv: money(value.provincia_prev ?? value.provincia_prev_millons),
      varNomAbs: signedMoney(value.diff_nom),
      varNomPct: signedPercentage(value.var_nom),
      varNomClass: metricClass(value.var_nom),
      ...muniReal,
    };
  }

  const salaryVariationComplete = hasNumber(kpi.masa_salarial.var_nom);
  const salaryInflation = kpi.masa_salarial.ipc_used_for_calc
    ?? kpi.recaudacion.ipc_used_for_calc;
  const salaryRealDifference = salaryVariationComplete && hasNumber(salaryInflation)
    && hasNumber(kpi.masa_salarial.current) && hasNumber(kpi.masa_salarial.prev)
    ? kpi.masa_salarial.current - kpi.masa_salarial.prev * (1 + salaryInflation / 100)
    : null;
  const salaryReal = realMetric(
    kpi.masa_salarial.var_real,
    salaryRealDifference,
    !!kpi.masa_salarial.ipc_missing,
    salaryVariationComplete,
  );

  const expectedRon = kpi.recaudacion.esperada;
  const expectedRop = kpi.rop?.esperada_prov;
  const hasBudget = hasNumber(expectedRon) || hasNumber(expectedRop);
  let presupuesto: MonitorViewModel["presupuesto"];
  if (hasBudget) {
    presupuesto = budgetMetric(kpi.recaudacion.bruta_current, expectedRon);
    if (kpi.rop && hasNumber(expectedRop)) {
      presupuesto.rop = budgetMetric(
        kpi.rop.bruta_current,
        expectedRop,
        kpi.rop.brecha_abs_prov,
        kpi.rop.brecha_pct_prov,
      );
    }
  }

  const postSueldos = kpi.resumen?.post_sueldos_current;
  return {
    monthName,
    currentYear,
    prevYear,
    mainSubtitle: `Análisis comparativo del comportamiento de transferencias nacionales (CFI Neta de Ley 26075) para el período ${monthName} ${prevYear} vs ${monthName} ${currentYear}.`,
    labelSuffix: isIncomplete ? " (incompleto)" : "",
    isIncomplete,
    isPeriodComplete,
    showPresupuestoSection: !!presupuesto,
    resumen: {
      totalDisp: money(kpi.resumen?.total_disponible_current),
      ronDisp: money(kpi.resumen?.ron_disponible),
      ropDisp: money(kpi.resumen?.rop_disponible),
      postSueldos: money(postSueldos),
      postClass: hasNumber(postSueldos)
        ? postSueldos >= 0 ? "text-success" : "text-danger"
        : "text-secondary text-missing",
    },
    muni,
    rop,
    recaudacion,
    masa: {
      current: money(kpi.masa_salarial.current),
      prev: money(kpi.masa_salarial.prev),
      cobCurr: coverage(kpi.masa_salarial.cobertura_current),
      cobPrev: coverage(kpi.masa_salarial.cobertura_prev),
      varNomPct: signedPercentage(kpi.masa_salarial.var_nom),
      varNomPctClass: metricClass(kpi.masa_salarial.var_nom),
      varNomAbs: signedMoney(kpi.masa_salarial.diff_nom),
      ...salaryReal,
    },
    presupuesto,
  };
}
