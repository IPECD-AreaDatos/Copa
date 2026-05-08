import {
  formatBillions,
  formatMillions,
  formatPercentage,
  formatPctUnsigned,
  recaudacionIpcPct,
} from "./format";

/** KPI anual dentro de `_data_ipce_v1.json` → `annual_monitor.data[yearId]` */
export type AnnualKpiBundle = {
  meta?: {
    periodo?: string;
    max_month?: number;
    is_complete?: boolean;
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
    diff_nom?: number;
    var_nom?: number;
    var_real?: number;
    ipc_missing?: boolean;
    ipc_used_for_calc?: number;
    avg_ipc_used?: number;
    esperada?: number;
  };
  rop?: {
    bruta_current?: number;
    bruta_prev?: number;
    disponible_current?: number;
    disponible_prev?: number;
    diff_nom?: number;
    var_nom?: number;
    var_real?: number;
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
    nacion_prev?: number;
    provincia_current?: number;
    provincia_prev?: number;
    diff_nom?: number;
    var_nom?: number;
    var_real?: number;
    ipc_missing?: boolean;
  };
  masa_salarial: {
    current?: number;
    prev?: number;
    cobertura_current?: number;
    cobertura_prev?: number;
    diff_nom?: number;
    var_nom?: number;
    var_real?: number;
    ipc_missing?: boolean;
    is_incomplete?: boolean;
  };
  recaudacion_provincial?: {
    current?: number;
    esperada_prov?: number;
    brecha_abs_prov?: number;
    brecha_pct_prov?: number;
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
  presupuestoProv?: {
    diffAbs: string;
    diffAbsClass: string;
    diffPct: string;
    diffPctClass: string;
    recaudado: string;
    esperada: string;
  };
};

export function buildAnnualVm(kpi: AnnualKpiBundle, iterYear: number): AnnualVm {
  const prevYear = iterYear - 1;
  const rawPeriod = kpi.meta?.periodo ?? "";
  const periodLabel = rawPeriod.replace(" (YTD)", " (incompleto)");

  const ipcPct = recaudacionIpcPct(kpi);

  const currentNet =
    kpi.recaudacion.disponible_current ?? kpi.recaudacion.current ?? 0;
  const prevNet = kpi.recaudacion.disponible_prev ?? kpi.recaudacion.prev ?? 0;
  const diffNomNet = kpi.recaudacion.diff_nom ?? 0;
  const diffSign = diffNomNet >= 0 ? "+" : "-";
  const coberturaBaseCurr = (kpi.rop?.bruta_current ?? 0) + (kpi.recaudacion.bruta_current ?? 0);
  const coberturaBasePrev = (kpi.rop?.bruta_prev ?? 0) + (kpi.recaudacion.bruta_prev ?? 0);
  const coberturaCurr = coberturaBaseCurr > 0 ? ((kpi.masa_salarial.current ?? 0) / coberturaBaseCurr) * 100 : 0;
  const coberturaPrev = coberturaBasePrev > 0 ? ((kpi.masa_salarial.prev ?? 0) / coberturaBasePrev) * 100 : 0;

  const isIpcNacionMissing = !!kpi.recaudacion.ipc_missing;

  let recRealAbs = "--";
  let recRealAbsClass = "";
  if (!isIpcNacionMissing) {
    const inflacionPct = ipcPct / 100;
    const prevAjustado = prevNet * (1 + inflacionPct);
    const diffReal = currentNet - prevAjustado;
    const diffRealSign = diffReal >= 0 ? "+" : "-";
    recRealAbs = diffRealSign + formatBillions(Math.abs(diffReal));
    recRealAbsClass = diffReal >= 0 ? "text-success" : "text-danger";
  }

  let muniVm: AnnualVm["muni"];
  if (kpi.distribucion_municipal) {
    const dm = kpi.distribucion_municipal;
    const isIpcNeaMissingMuni = !!dm.ipc_missing;

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
      const muniCurrent = dm.current ?? 0;
      const muniPrev = dm.prev ?? 0;
      const inflacionPct = ipcPct / 100;
      const muniPrevAjustado = muniPrev * (1 + inflacionPct);
      const muniDiffReal = muniCurrent - muniPrevAjustado;
      const muniDiffRealSign = muniDiffReal >= 0 ? "+" : "-";
      realAbs = muniDiffRealSign + formatMillions(Math.abs(muniDiffReal));
      realAbsClass = muniDiffReal >= 0 ? "text-success" : "text-danger";
    }

    const muniDiffNom = dm.diff_nom ?? 0;
    const muniDiffSign = muniDiffNom >= 0 ? "+" : "-";

    muniVm = {
      current: formatMillions(dm.current),
      prev: formatMillions(dm.prev),
      natCurr: formatMillions(dm.nacion_current),
      provCurr: formatMillions(dm.provincia_current),
      natPrev: formatMillions(dm.nacion_prev),
      provPrev: formatMillions(dm.provincia_prev),
      varNomAbs: muniDiffSign + formatBillions(Math.abs(muniDiffNom)),
      varNomPct:
        ((dm.var_nom ?? 0) >= 0 ? "+" : "-") + formatPctUnsigned(Math.abs(dm.var_nom ?? 0)),
      varNomClass: `kpi-value ${(dm.var_nom ?? 0) >= 0 ? "text-success" : "text-danger"}`,
      realPct,
      realPctClass,
      realAbs,
      realAbsClass,
      showNomAbs: true,
      showRealAbs: true,
    };
  }

  let ropVm: AnnualVm["rop"];
  if (kpi.rop) {
    const rp = kpi.rop;
    const isIpcProv = !!rp.ipc_missing;
    let realPct = "";
    let realPctClass = "";
    let realAbs = "";
    let realAbsClass = "";
    if (isIpcProv) {
      realPct = "Sin IPC completo";
      realPctClass = "kpi-value text-secondary text-missing";
      realAbs = "--";
    } else {
      realPct = formatPercentage(rp.var_real ?? 0);
      realPctClass = `kpi-value ${(rp.var_real ?? 0) >= 0 ? "text-success" : "text-danger"}`;
      const dr = rp.diff_real ?? 0;
      const drs = dr >= 0 ? "+" : "-";
      realAbs = drs + formatMillions(Math.abs(dr));
      realAbsClass = dr >= 0 ? "text-success" : "text-danger";
    }
    const dn = rp.diff_nom ?? 0;
    const dns = dn >= 0 ? "+" : "-";

    ropVm = {
      dispCurr: formatMillions(rp.disponible_current),
      brutaCurr: formatMillions(rp.bruta_current),
      dispPrev: formatMillions(rp.disponible_prev),
      brutaPrev: formatMillions(rp.bruta_prev),
      varNomAbs: dns + formatMillions(Math.abs(dn)),
      varNomPct:
        ((rp.var_nom ?? 0) >= 0 ? "+" : "-") + formatPctUnsigned(Math.abs(rp.var_nom ?? 0)),
      varNomClass: `kpi-value ${(rp.var_nom ?? 0) >= 0 ? "text-success" : "text-danger"}`,
      realPct,
      realPctClass,
      realAbs,
      realAbsClass,
      showNomAbs: true,
      showRealAbs: true,
    };
  }

  const isIncomplete = !!kpi.masa_salarial.is_incomplete;
  const isIpcNeaMissingMasa = !!kpi.masa_salarial.ipc_missing;

  let masaVarNomPct = "";
  let masaVarNomPctClass = "";
  let masaVarNomAbs = "";
  if (isIncomplete) {
    masaVarNomPct = "Sin datos";
    masaVarNomPctClass = "kpi-value text-secondary";
    masaVarNomAbs = " - ";
  } else {
    const masaDiffSign = (kpi.masa_salarial.diff_nom ?? 0) >= 0 ? "+" : "-";
    masaVarNomAbs = masaDiffSign + formatBillions(Math.abs(kpi.masa_salarial.diff_nom ?? 0));
    masaVarNomPct =
      ((kpi.masa_salarial.var_nom ?? 0) >= 0 ? "+" : "-") +
      formatPctUnsigned(Math.abs(kpi.masa_salarial.var_nom ?? 0));
    masaVarNomPctClass = `kpi-value ${(kpi.masa_salarial.var_nom ?? 0) >= 0 ? "text-success" : "text-danger"}`;
  }

  let masaRealPct = "";
  let masaRealPctClass = "";
  let masaRealAbs = "--";
  let masaRealAbsClass = "";
  if (isIncomplete || isIpcNeaMissingMasa) {
    masaRealPct = isIpcNeaMissingMasa ? "Sin IPC completo" : "Sin datos completos";
    masaRealPctClass = "kpi-value text-secondary text-missing";
  } else {
    masaRealPct = formatPercentage(kpi.masa_salarial.var_real ?? 0);
    masaRealPctClass = `kpi-value ${(kpi.masa_salarial.var_real ?? 0) >= 0 ? "text-success" : "text-danger"}`;
    const inflacionPct = ipcPct / 100;
    const prevAjustado = (kpi.masa_salarial.prev ?? 0) * (1 + inflacionPct);
    const diffReal = (kpi.masa_salarial.current ?? 0) - prevAjustado;
    const diffRealSign = diffReal >= 0 ? "+" : "-";
    masaRealAbs = diffRealSign + formatBillions(Math.abs(diffReal));
    masaRealAbsClass = diffReal >= 0 ? "text-success" : "text-danger";
  }

  let presupuestoProv: AnnualVm["presupuestoProv"];
  const pProv = kpi.recaudacion_provincial ?? (kpi.rop
    ? {
        current: kpi.rop.bruta_current,
        esperada_prov: kpi.rop.esperada_prov,
        brecha_abs_prov: kpi.rop.brecha_abs_prov,
        brecha_pct_prov: kpi.rop.brecha_pct_prov,
      }
    : undefined);

  if (pProv && pProv.esperada_prov != null) {
    const recaProvCurr = pProv.current ?? 0;
    const esperadaProv = pProv.esperada_prov ?? 0;
    const diffAbsProv = pProv.brecha_abs_prov ?? 0;
    const diffPctProv = pProv.brecha_pct_prov ?? 0;
    const pctSignProv = diffPctProv > 0 ? "+" : "";
    const absSignProv = diffAbsProv > 0 ? "+" : "";

    presupuestoProv = {
      diffAbs: absSignProv + formatMillions(Math.abs(diffAbsProv)),
      diffAbsClass: `kpi-value ${diffAbsProv >= 0 ? "text-success" : "text-danger"}`,
      diffPct: pctSignProv + formatPercentage(diffPctProv).replace("+", ""),
      diffPctClass: `kpi-value ${diffPctProv >= 0 ? "text-success" : "text-danger"}`,
      recaudado: formatMillions(recaProvCurr),
      esperada: formatMillions(esperadaProv),
    };
  }

  return {
    periodLabel,
    prevYear,
    ipcPct,
    recaudacion: {
      current: formatBillions(currentNet),
      prev: formatBillions(prevNet),
      netaCurr: formatMillions(kpi.recaudacion.neta_current),
      netaPrev: formatMillions(kpi.recaudacion.neta_prev),
      brutaCurr: formatMillions(kpi.recaudacion.bruta_current),
      brutaPrev: formatMillions(kpi.recaudacion.bruta_prev),
      varNomAbs: diffSign + formatBillions(Math.abs(diffNomNet)),
      varNomPct:
        ((kpi.recaudacion.var_nom ?? 0) >= 0 ? "+" : "-") +
        formatPctUnsigned(Math.abs(kpi.recaudacion.var_nom ?? 0)),
      varNomClass: `kpi-value ${(kpi.recaudacion.var_nom ?? 0) >= 0 ? "text-success" : "text-danger"}`,
      realPct: isIpcNacionMissing
        ? "Sin IPC completo"
        : formatPercentage(kpi.recaudacion.var_real ?? 0),
      realPctClass: isIpcNacionMissing
        ? "kpi-value text-secondary text-missing"
        : `kpi-value ${(kpi.recaudacion.var_real ?? 0) >= 0 ? "text-success" : "text-danger"}`,
      realAbs: isIpcNacionMissing ? "--" : recRealAbs,
      realAbsClass: isIpcNacionMissing ? "" : recRealAbsClass,
      showNomAbs: true,
      showRealAbs: true,
    },
    muni: muniVm,
    rop: ropVm,
    masa: {
      current: isIncomplete ? "Sin datos" : formatBillions(kpi.masa_salarial.current),
      prev: formatBillions(kpi.masa_salarial.prev),
      cobCurr: `Cobertura: ${coberturaCurr.toFixed(1)}%`,
      cobPrev: `Cobertura: ${coberturaPrev.toFixed(1)}%`,
      varNomPct: masaVarNomPct,
      varNomPctClass: masaVarNomPctClass,
      varNomAbs: masaVarNomAbs,
      showNomAbs: true,
      realPct: masaRealPct,
      realPctClass: masaRealPctClass,
      realAbs: masaRealAbs,
      realAbsClass: masaRealAbsClass,
      showRealAbs: true,
    },
    presupuestoProv,
  };
}
