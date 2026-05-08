import { formatMillions, formatPercentage, formatPercentageUnsigned } from "./format";

export type PeriodMeta = { id: string; label: string; year: number; month: number };

export type MonitorJson = {
  meta: {
    default_period_id: string;
    available_periods: PeriodMeta[];
  };
  data: Record<
    string,
    {
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
  };
  copa_vs_salario: CopaVsSalarioShape;
};

export type CopaVsSalarioShape = {
  labels: string[];
  cumulative_copa: number[];
  cumulative_rop?: number[];
  cumulative_esperada?: (number | null)[];
  cumulative_neta?: (number | null)[];
  salario_target: number[];
  copa_label?: string;
  salario_label?: string;
};

type KpiShape = {
  meta?: { periodo?: string };
  resumen?: {
    total_disponible_current?: number;
    post_sueldos_current?: number;
    ron_disponible?: number;
    rop_disponible?: number;
  };
  recaudacion: {
    disponible_current?: number;
    disponible_prev?: number;
    current?: number;
    prev?: number;
    neta_current?: number;
    neta_prev?: number;
    bruta_current?: number;
    bruta_prev?: number;
    var_nom?: number;
    var_real?: number;
    diff_nom?: number;
    ipc_missing?: boolean;
    ipc_used_for_calc?: number;
    esperada?: number;
  };
  rop?: {
    disponible_current?: number;
    disponible_prev?: number;
    bruta_current?: number;
    bruta_prev?: number;
    var_nom?: number;
    var_real?: number;
    diff_nom?: number;
    diff_real?: number;
    ipc_missing?: boolean;
    esperada_prov?: number;
    brecha_abs_prov?: number;
    brecha_pct_prov?: number;
  };
  distribucion_municipal?: {
    current?: number;
    prev?: number;
    nacion_current?: number;
    nacion_current_millons?: number;
    provincia_current?: number;
    provincia_current_millons?: number;
    nacion_prev?: number;
    nacion_prev_millons?: number;
    provincia_prev?: number;
    provincia_prev_millons?: number;
    diff_nom?: number;
    var_nom?: number;
    var_real?: number;
    diff_real?: number;
    ipc_missing?: boolean;
  };
  masa_salarial: {
    current?: number;
    prev?: number;
    cobertura_current?: number;
    cobertura_prev?: number;
    var_nom?: number;
    var_real?: number;
    diff_nom?: number;
    ipc_missing?: boolean;
    is_incomplete?: boolean;
  };
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
  grid: {
    copaCols: string | undefined;
    muniCols: string | undefined;
    recaProvCols: string | undefined;
    masaCols: string | undefined;
  };
  showVarCards: {
    copaNom: boolean;
    copaReal: boolean;
    muniNom: boolean;
    muniReal: boolean;
    recaProvNom: boolean;
    recaProvReal: boolean;
    masaReal: boolean;
  };
  resumen: {
    totalDisp: string;
    ronDisp: string;
    ropDisp: string;
    postSueldos: string;
    postClass: string;
  };
  muni:
    | {
        current: string;
        prev: string;
        breakdownCurrNat: string;
        breakdownCurrProv: string;
        breakdownPrevNat: string;
        breakdownPrevProv: string;
        varNomAbs: string;
        varNomPct: string;
        varNomClass: string;
        realPct: string;
        realPctClass: string;
        realAbs: string;
        realAbsClass: string;
      }
    | undefined;
  rop:
    | {
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
      }
    | undefined;
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
  presupuesto:
    | {
        diffAbs: string;
        diffAbsClass: string;
        diffPct: string;
        diffPctClass: string;
        recaudado: string;
        esperada: string;
        rop?: {
          diffAbs: string;
          diffAbsClass: string;
          diffPct: string;
          diffPctClass: string;
          recaudado: string;
          esperada: string;
        };
      }
    | undefined;
};

export function buildMonitorViewModel(
  dashboard: MonitorJson,
  periodId: string,
  kpi: KpiShape,
  isMobileLayout: boolean,
): MonitorViewModel {
  const isNonNegativeForDisplay = (value: number | null | undefined) => (value ?? 0) >= -0.05;
  const [yearStr] = periodId.split("-");
  const currentYear = parseInt(yearStr, 10);
  const prevYear = currentYear - 1;

  const periods = dashboard.meta.available_periods;
  const defaultIndex = periods.findIndex((p) => p.id === dashboard.meta.default_period_id);
  const pIndex = periods.findIndex((p) => p.id === periodId);
  const isPeriodComplete = defaultIndex >= 0 && pIndex <= defaultIndex;

  const periodLabel = kpi.meta?.periodo ?? "";
  const monthName = periodLabel.split(" ")[0] || "";

  const isIncomplete = !!kpi.masa_salarial.is_incomplete;

  const emptyGrid = isMobileLayout ? undefined : "";
  const grid = isIncomplete
    ? {
        copaCols: isMobileLayout ? undefined : "repeat(2, 1fr)",
        muniCols: isMobileLayout ? undefined : "repeat(2, 1fr)",
        recaProvCols: isMobileLayout ? undefined : "repeat(2, 1fr)",
        masaCols: isMobileLayout ? undefined : "repeat(3, 1fr)",
      }
    : {
        copaCols: emptyGrid,
        muniCols: emptyGrid,
        recaProvCols: emptyGrid,
        masaCols: emptyGrid,
      };

  const showVarCards = {
    copaNom: !isIncomplete,
    copaReal: !isIncomplete,
    muniNom: !isIncomplete,
    muniReal: !isIncomplete,
    recaProvNom: !isIncomplete,
    recaProvReal: !isIncomplete,
    masaReal: !isIncomplete,
  };

  const totalDispCurr = kpi.resumen?.total_disponible_current ?? 0;
  const postSueldosCurr = kpi.resumen?.post_sueldos_current ?? 0;

  const currentDisp =
    kpi.recaudacion.disponible_current ?? kpi.recaudacion.current ?? 0;
  const prevDisp = kpi.recaudacion.disponible_prev ?? kpi.recaudacion.prev ?? 0;

  const isIpcNacionMissing = !!kpi.recaudacion.ipc_missing;
  const isIpcNeaMissingMuni = kpi.distribucion_municipal
    ? !!kpi.distribucion_municipal.ipc_missing
    : true;
  const isIpcNeaMissingMasa = !!kpi.masa_salarial.ipc_missing;

  let recaudacionRealAbs = "--";
  let recaudacionRealAbsClass = "";
  if (!isIpcNacionMissing && kpi.recaudacion.ipc_used_for_calc != null) {
    const inflacionPct = kpi.recaudacion.ipc_used_for_calc / 100;
    const prevAjustado = prevDisp * (1 + inflacionPct);
    const diffReal = currentDisp - prevAjustado;
    const diffRealSign = diffReal >= 0 ? "+" : "-";
    recaudacionRealAbs = diffRealSign + formatMillions(Math.abs(diffReal));
    recaudacionRealAbsClass = diffReal >= 0 ? "text-success" : "text-danger";
  }

  let muniVm: MonitorViewModel["muni"];
  if (kpi.distribucion_municipal) {
    const dm = kpi.distribucion_municipal;
    const nacCurr = dm.nacion_current ?? dm.nacion_current_millons ?? 0;
    const provCurr = dm.provincia_current ?? dm.provincia_current_millons ?? 0;
    const nacPrev = dm.nacion_prev ?? dm.nacion_prev_millons ?? 0;
    const provPrev = dm.provincia_prev ?? dm.provincia_prev_millons ?? 0;

    let realPct = "";
    let realPctClass = "";
    let realAbs = "";
    let realAbsClass = "";
    if (isIpcNeaMissingMuni) {
      realPct = "Sin IPC completo";
      realPctClass = "kpi-value text-secondary text-missing";
      realAbs = "--";
    } else {
      realPct = formatPercentage(dm.var_real ?? 0);
      realPctClass = `kpi-value ${(dm.var_real ?? 0) >= 0 ? "text-success" : "text-danger"}`;
      const muniDiffReal = dm.diff_real ?? 0;
      const muniDiffSign = muniDiffReal >= 0 ? "+" : "-";
      realAbs = muniDiffSign + formatMillions(Math.abs(muniDiffReal));
      realAbsClass = muniDiffReal >= 0 ? "text-success" : "text-danger";
    }

    const muniDiffNom = dm.diff_nom ?? 0;
    const muniDiffSign = muniDiffNom >= 0 ? "+" : "-";

    muniVm = {
      current: formatMillions(dm.current),
      prev: formatMillions(dm.prev),
      breakdownCurrNat: formatMillions(nacCurr),
      breakdownCurrProv: formatMillions(provCurr),
      breakdownPrevNat: formatMillions(nacPrev),
      breakdownPrevProv: formatMillions(provPrev),
      varNomAbs: muniDiffSign + formatMillions(Math.abs(muniDiffNom)),
      varNomPct:
        ((dm.var_nom ?? 0) >= 0 ? "+" : "-") +
        formatPercentageUnsigned(Math.abs(dm.var_nom ?? 0)),
      varNomClass: `kpi-value ${(dm.var_nom ?? 0) >= 0 ? "text-success" : "text-danger"}`,
      realPct,
      realPctClass,
      realAbs,
      realAbsClass,
    };
  }

  let ropVm: MonitorViewModel["rop"];
  if (kpi.rop) {
    const rp = kpi.rop;
    const isIpcNeaMissingProv = !!rp.ipc_missing;

    let realPct = "";
    let realPctClass = "";
    let realAbs = "";
    let realAbsClass = "";
    if (isIpcNeaMissingProv) {
      realPct = "Sin IPC completo";
      realPctClass = "kpi-value text-secondary text-missing";
      realAbs = "--";
    } else {
      realPct = formatPercentage(rp.var_real ?? 0);
      realPctClass = `kpi-value ${isNonNegativeForDisplay(rp.var_real) ? "text-success" : "text-danger"}`;
      const provDiffReal = rp.diff_real;
      if (provDiffReal !== undefined) {
        const provDiffRealSign = provDiffReal >= 0 ? "+" : "-";
        realAbs = provDiffRealSign + formatMillions(Math.abs(provDiffReal));
        realAbsClass = provDiffReal >= 0 ? "text-success" : "text-danger";
      }
    }

    const provDiffNom = rp.diff_nom ?? 0;
    const provDiffSign = provDiffNom >= 0 ? "+" : "-";

    ropVm = {
      dispCurr: formatMillions(rp.disponible_current),
      brutaCurr: formatMillions(rp.bruta_current),
      dispPrev: formatMillions(rp.disponible_prev),
      brutaPrev: formatMillions(rp.bruta_prev),
      varNomAbs: provDiffSign + formatMillions(Math.abs(provDiffNom)),
      varNomPct:
        ((rp.var_nom ?? 0) >= 0 ? "+" : "-") +
        formatPercentageUnsigned(Math.abs(rp.var_nom ?? 0)),
      varNomClass: `kpi-value ${(rp.var_nom ?? 0) >= 0 ? "text-success" : "text-danger"}`,
      realPct,
      realPctClass,
      realAbs,
      realAbsClass,
    };
  }

  const diffNomNet = kpi.recaudacion.diff_nom ?? 0;
  const diffSign = diffNomNet >= 0 ? "+" : "-";

  let masaVarNomPct = "";
  let masaVarNomPctClass = "";
  let masaVarNomAbs = "";
  if (isIncomplete) {
    masaVarNomPct = "Sin datos";
    masaVarNomPctClass = "kpi-value text-secondary";
    masaVarNomAbs = " - ";
  } else {
    const masaDiffSign = (kpi.masa_salarial.diff_nom ?? 0) >= 0 ? "+" : "-";
    masaVarNomAbs = masaDiffSign + formatMillions(Math.abs(kpi.masa_salarial.diff_nom ?? 0));
    masaVarNomPct =
      ((kpi.masa_salarial.var_nom ?? 0) >= 0 ? "+" : "-") +
      formatPercentageUnsigned(Math.abs(kpi.masa_salarial.var_nom ?? 0));
    masaVarNomPctClass = `kpi-value ${(kpi.masa_salarial.var_nom ?? 0) >= 0 ? "text-success" : "text-danger"}`;
  }

  let masaRealPct = "";
  let masaRealPctClass = "";
  let masaRealAbs = "--";
  let masaRealAbsClass = "";
  if (isIncomplete || isIpcNeaMissingMasa) {
    masaRealPct = isIpcNeaMissingMasa ? "Sin IPC completo" : "Sin datos";
    masaRealPctClass = "kpi-value text-secondary text-missing";
  } else {
    masaRealPct = formatPercentage(kpi.masa_salarial.var_real ?? 0);
    masaRealPctClass = `kpi-value ${(kpi.masa_salarial.var_real ?? 0) >= 0 ? "text-success" : "text-danger"}`;
    if (kpi.recaudacion.ipc_used_for_calc != null) {
      const inflacionPct = kpi.recaudacion.ipc_used_for_calc / 100;
      const prevAjustado = (kpi.masa_salarial.prev ?? 0) * (1 + inflacionPct);
      const diffReal = (kpi.masa_salarial.current ?? 0) - prevAjustado;
      const diffRealSign = diffReal >= 0 ? "+" : "-";
      masaRealAbs = diffRealSign + formatMillions(Math.abs(diffReal));
      masaRealAbsClass = diffReal >= 0 ? "text-success" : "text-danger";
    }
  }

  const showPresupuestoSection =
    (periodId.startsWith("2026") || periodId.startsWith("2025")) && isPeriodComplete;

  let presupuesto: MonitorViewModel["presupuesto"];
  if (showPresupuestoSection) {
    const bruta = kpi.recaudacion.bruta_current ?? 0;
    const esperada = kpi.recaudacion.esperada ?? 0;
    const diffAbs = bruta - esperada;
    const diffPct = esperada > 0 ? (bruta / esperada - 1) * 100 : 0;
    const pctSign = diffPct > 0 ? "+" : "";
    const absSign = diffAbs > 0 ? "+" : diffAbs < 0 ? "-" : "";

    presupuesto = {
      diffAbs: absSign + formatMillions(Math.abs(diffAbs)),
      diffAbsClass: `kpi-value ${diffAbs >= 0 ? "text-success" : "text-danger"}`,
      diffPct: pctSign + formatPercentage(diffPct).replace("+", ""),
      diffPctClass: `kpi-value ${diffPct >= 0 ? "text-success" : "text-danger"}`,
      recaudado: formatMillions(bruta),
      esperada: formatMillions(esperada),
    };

    if (kpi.rop) {
      const recaProvCurr = kpi.rop.bruta_current ?? 0;
      const esperadaProv = kpi.rop.esperada_prov ?? 0;
      const diffAbsProv = kpi.rop.brecha_abs_prov ?? 0;
      const diffPctProv = kpi.rop.brecha_pct_prov ?? 0;
      const pctSignProv = diffPctProv > 0 ? "+" : "";
      const absSignProv = diffAbsProv > 0 ? "+" : "";

      presupuesto.rop = {
        diffAbs: absSignProv + formatMillions(Math.abs(diffAbsProv)),
        diffAbsClass: `kpi-value ${diffAbsProv >= 0 ? "text-success" : "text-danger"}`,
        diffPct: pctSignProv + formatPercentage(diffPctProv).replace("+", ""),
        diffPctClass: `kpi-value ${diffPctProv >= 0 ? "text-success" : "text-danger"}`,
        recaudado: formatMillions(recaProvCurr),
        esperada: formatMillions(esperadaProv),
      };
    }
  }

  return {
    monthName,
    currentYear,
    prevYear,
    mainSubtitle: `Análisis comparativo del comportamiento de transferencias nacionales (CFI Neta de Ley 26075) para el período ${monthName} ${prevYear} vs ${monthName} ${currentYear}.`,
    labelSuffix: isIncomplete ? " (incompleto)" : "",
    isIncomplete,
    isPeriodComplete,
    showPresupuestoSection: !!presupuesto,
    grid,
    showVarCards,
    resumen: {
      totalDisp: formatMillions(totalDispCurr),
      ronDisp: formatMillions(kpi.resumen?.ron_disponible ?? 0),
      ropDisp: formatMillions(kpi.resumen?.rop_disponible ?? 0),
      postSueldos: formatMillions(postSueldosCurr),
      postClass: postSueldosCurr >= 0 ? "text-success" : "text-danger",
    },
    muni: muniVm,
    rop: ropVm,
    recaudacion: {
      current: formatMillions(currentDisp),
      prev: formatMillions(prevDisp),
      netaCurr: formatMillions(kpi.recaudacion.neta_current ?? 0),
      netaPrev: formatMillions(kpi.recaudacion.neta_prev ?? 0),
      brutaCurr: formatMillions(kpi.recaudacion.bruta_current ?? 0),
      brutaPrev: formatMillions(kpi.recaudacion.bruta_prev ?? 0),
      varNomAbs: diffSign + formatMillions(Math.abs(diffNomNet)),
      varNomPct:
        ((kpi.recaudacion.var_nom ?? 0) >= 0 ? "+" : "-") +
        formatPercentageUnsigned(Math.abs(kpi.recaudacion.var_nom ?? 0)),
      varNomClass: `kpi-value ${(kpi.recaudacion.var_nom ?? 0) >= 0 ? "text-success" : "text-danger"}`,
      realPct: isIpcNacionMissing
        ? "Sin IPC completo"
        : formatPercentage(kpi.recaudacion.var_real ?? 0),
      realPctClass: isIpcNacionMissing
        ? "kpi-value text-secondary text-missing"
        : `kpi-value ${(kpi.recaudacion.var_real ?? 0) >= 0 ? "text-success" : "text-danger"}`,
      realAbs: isIpcNacionMissing ? "--" : recaudacionRealAbs,
      realAbsClass: isIpcNacionMissing ? "" : recaudacionRealAbsClass,
    },
    masa: {
      current: isIncomplete ? "Sin datos" : formatMillions(kpi.masa_salarial.current),
      prev: formatMillions(kpi.masa_salarial.prev),
      cobCurr: `Cobertura: ${(kpi.masa_salarial.cobertura_current ?? 0).toFixed(1)}%`,
      cobPrev: `Cobertura: ${(kpi.masa_salarial.cobertura_prev ?? 0).toFixed(1)}%`,
      varNomPct: masaVarNomPct,
      varNomPctClass: masaVarNomPctClass,
      varNomAbs: masaVarNomAbs,
      realPct: masaRealPct,
      realPctClass: masaRealPctClass,
      realAbs: masaRealAbs,
      realAbsClass: masaRealAbsClass,
    },
    presupuesto,
  };
}
