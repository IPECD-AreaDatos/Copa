import type { DesagregadoResponse } from "@/components/gasto/GastosDesagregadosDashboard";

export const GROUPED_RUBRO_LABELS: Record<string, string> = {
  personal: "Personal",
  bienes_servicios: "Bienes y servicios",
  transferencias: "Transferencias",
  coparticipacion: "Coparticipación",
  bienes_uso: "Bienes de uso",
  otros: "Otros",
};
export const groupedRubro = (code: string) =>
  ["seguridad_social", "deuda", "figurativos"].includes(code) ? "otros" : code;
export const normalizeSearch = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
type AccountRow = DesagregadoResponse["jurisdiccion_subpartidas"][number];
export type MatrixRow = {
  id: string;
  label: string;
  total: number;
  rubros: Record<string, number>;
};

export function scopeDashboardJurisdictions(
  data: DesagregadoResponse,
  codes: number[],
) {
  const jurisdictionRows = data.jurisdicciones_rubros.filter((r) =>
    codes.includes(r.codigo),
  );
  const monthlyJurisdictions = data.monthly_jurisdicciones_rubros.filter((r) =>
    codes.includes(r.codigo),
  );
  const total = jurisdictionRows.reduce((sum, r) => sum + r.total, 0);
  const rubros = data.rubros.map((r) => {
    const amount = jurisdictionRows
      .filter((j) => j.rubro.codigo === r.codigo)
      .reduce((sum, j) => sum + j.total, 0);
    return {
      ...r,
      total: amount,
      participacion: total === 0 ? 0 : (amount / total) * 100,
    };
  });
  const monthly = data.monthly.map((m) => ({
    ...m,
    total: monthlyJurisdictions
      .filter((r) => r.mes === m.mes)
      .reduce((sum, r) => sum + r.total, 0),
  }));
  const monthlyRubros = new Map<
    string,
    DesagregadoResponse["monthly_rubros"][number]
  >();
  for (const r of monthlyJurisdictions) {
    const key = `${r.mes}|${r.rubro.codigo}`;
    const value = monthlyRubros.get(key) ?? {
      mes: r.mes,
      rubro: {
        codigo: r.rubro.codigo,
        nombre:
          data.rubros.find((x) => x.codigo === r.rubro.codigo)?.nombre ??
          r.rubro.codigo,
      },
      total: 0,
      filas: 0,
    };
    value.total += r.total;
    monthlyRubros.set(key, value);
  }
  return {
    ...data,
    total,
    rubros,
    monthly,
    jurisdicciones: data.jurisdicciones.filter((r) => codes.includes(r.codigo)),
    jurisdicciones_rubros: jurisdictionRows,
    monthly_jurisdicciones_rubros: monthlyJurisdictions,
    monthly_rubros: [...monthlyRubros.values()],
    jurisdiccion_subpartidas: data.jurisdiccion_subpartidas.filter((r) =>
      codes.includes(r.jurisdiccion.codigo),
    ),
  };
}

export function buildGroupedRubros(data: DesagregadoResponse) {
  const totals = new Map<string, number>();
  data.rubros.forEach((r) =>
    totals.set(
      groupedRubro(r.codigo),
      (totals.get(groupedRubro(r.codigo)) ?? 0) + r.total,
    ),
  );
  return Object.entries(GROUPED_RUBRO_LABELS)
    .filter(([code]) => totals.has(code))
    .map(([codigo, nombre]) => ({
      codigo,
      nombre,
      total: totals.get(codigo)!,
    }));
}

export function monthlyRubroValues(data: DesagregadoResponse) {
  const values = new Map<string, number>();
  for (const row of data.monthly_rubros) {
    const key = `${row.mes}|${groupedRubro(row.rubro.codigo)}`;
    values.set(key, (values.get(key) ?? 0) + row.total);
  }
  return values;
}

export function buildMatrixRows(data: DesagregadoResponse): MatrixRow[] {
  const rows = new Map(
    data.jurisdicciones.map((r) => [
      r.codigo,
      {
        id: String(r.codigo),
        label: r.nombre,
        total: r.total,
        rubros: {} as Record<string, number>,
      },
    ]),
  );
  for (const row of data.jurisdicciones_rubros) {
    const target = rows.get(row.codigo);
    if (!target) continue;
    const code = groupedRubro(row.rubro.codigo);
    target.rubros[code] = (target.rubros[code] ?? 0) + row.total;
  }
  return [...rows.values()];
}

export function sortMatrixRows<T extends MatrixRow>(
  rows: T[],
  key: string,
  descending: boolean,
) {
  return [...rows].sort((a, b) => {
    const comparison =
      key === "label"
        ? a.label.localeCompare(b.label, "es")
        : (key === "total" ? a.total : (a.rubros[key] ?? 0)) -
          (key === "total" ? b.total : (b.rubros[key] ?? 0));
    return (descending ? -comparison : comparison) || a.id.localeCompare(b.id);
  });
}

export function buildProjectionRows(data: DesagregadoResponse) {
  if (data.meta.is_snapshot) return [];
  const monthly = new Map<string, Map<number, number>>();
  const jurisdictionMonths = new Map<number, Set<number>>();
  for (const row of data.monthly_jurisdicciones_rubros) {
    if (!jurisdictionMonths.has(row.codigo)) jurisdictionMonths.set(row.codigo, new Set());
    jurisdictionMonths.get(row.codigo)!.add(row.mes);
    const key = `${row.codigo}|${groupedRubro(row.rubro.codigo)}`;
    if (!monthly.has(key)) monthly.set(key, new Map());
    const values = monthly.get(key)!;
    values.set(row.mes, (values.get(row.mes) ?? 0) + row.total);
  }
  const loadedMonths = new Set(data.monthly.map((r) => r.mes));
  const referenceMonth = data.meta.selected?.mesHasta
    ?? data.meta.requested?.mesHasta
    ?? Math.max(0, ...loadedMonths);
  return buildMatrixRows(data)
    .flatMap((jurisdiction) =>
      Object.entries(jurisdiction.rubros).map(([code, total]) => {
        const values =
          monthly.get(`${jurisdiction.id}|${code}`) ??
          new Map<number, number>();
        // Sin movimientos de un rubro en un mes cargado = 0; un mes sin carga
        // queda fuera del máximo y del Top 3, nunca se inventa como observación.
        const observed = [...loadedMonths]
          .map((mes) => ({ mes, total: values.get(mes) ?? 0 }))
          .sort((a, b) => b.total - a.total || a.mes - b.mes);
        const top = observed.slice(0, 3);
        const personal = code === "personal";
        const referenceAmount = jurisdictionMonths.get(Number(jurisdiction.id))?.has(referenceMonth)
          ? values.get(referenceMonth) ?? 0
          : null;
        return {
          id: `${jurisdiction.id}|${code}`,
          jurisdiction: jurisdiction.label,
          rubro: GROUPED_RUBRO_LABELS[code] ?? code,
          personal,
          referenceMonth,
          referenceAmount,
          total,
          average: total / data.meta.requested_months,
          topAverage: top.length
            ? top.reduce((sum, r) => sum + r.total, 0) / top.length
            : null,
          topCount: top.length,
          maximum: observed[0]?.total ?? null,
          maximumMonth: observed[0]?.mes ?? null,
          annual: personal
            ? referenceAmount === null ? null : referenceAmount * 12
            : (total / data.meta.requested_months) * 12,
        };
      }),
    )
    .sort((a, b) => b.total - a.total);
}

const accountId = (row: AccountRow) =>
  [421, 423].includes(row.subpartida.codigo)
    ? "421+423"
    : String(row.subpartida.codigo);
export function buildAccountGroups(
  rows: AccountRow[],
  chapters: number[] = [],
  includeCop = true,
) {
  const selected = rows.filter(
    (r) =>
      (!chapters.length || chapters.includes(r.partida.codigo)) &&
      (includeCop || ![571, 587].includes(r.subpartida.codigo)),
  );
  const personalMap = new Map<
    number,
    { id: string; label: string; total: number }
  >();
  const accounts = new Map<
    string,
    {
      id: string;
      label: string;
      chapter: number;
      total: number;
      codes: number[];
      jurisdictions: Map<number, { id: string; label: string; total: number }>;
    }
  >();
  for (const row of selected) {
    const jurisdiction = row.jurisdiccion;
    if (row.partida.codigo === 100) {
      const target = personalMap.get(jurisdiction.codigo) ?? {
        id: String(jurisdiction.codigo),
        label: jurisdiction.nombre,
        total: 0,
      };
      target.total += row.total;
      personalMap.set(jurisdiction.codigo, target);
      continue;
    }
    const id = accountId(row);
    const account = accounts.get(id) ?? {
      id,
      label:
        id === "421+423"
          ? "Construcciones y redeterminaciones en bienes de dominio privado"
          : row.subpartida.nombre,
      chapter: row.partida.codigo,
      total: 0,
      codes: [] as number[],
      jurisdictions: new Map<
        number,
        { id: string; label: string; total: number }
      >(),
    };
    account.total += row.total;
    if (!account.codes.includes(row.subpartida.codigo))
      account.codes.push(row.subpartida.codigo);
    const target = account.jurisdictions.get(jurisdiction.codigo) ?? {
      id: String(jurisdiction.codigo),
      label: jurisdiction.nombre,
      total: 0,
    };
    target.total += row.total;
    account.jurisdictions.set(jurisdiction.codigo, target);
    accounts.set(id, account);
  }
  const restTotal = [...accounts.values()].reduce((sum, r) => sum + r.total, 0);
  let accumulated = 0;
  const rankedAccounts = [...accounts.values()]
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
    .map((a, index) => {
      accumulated += a.total;
      return {
        ...a,
        rank: index + 1,
        share: restTotal === 0 ? null : (a.total / restTotal) * 100,
        cumulative: restTotal === 0 ? null : (accumulated / restTotal) * 100,
        jurisdictions: [...a.jurisdictions.values()].sort(
          (a, b) => b.total - a.total,
        ),
      };
    });
  const personal = [...personalMap.values()].sort((a, b) => b.total - a.total);
  return {
    accounts: rankedAccounts,
    restTotal,
    personal,
    personalTotal: personal.reduce((sum, r) => sum + r.total, 0),
  };
}

export function buildConcentration(
  data: DesagregadoResponse,
  includePersonal: boolean,
  showAll: boolean,
) {
  const totals = new Map<
    number,
    { id: number; label: string; total: number }
  >();
  for (const row of data.jurisdiccion_subpartidas) {
    if (
      ![
        200,
        300,
        400,
        500,
        600,
        800,
        ...(includePersonal ? [100] : []),
      ].includes(row.partida.codigo) ||
      [571, 587].includes(row.subpartida.codigo)
    )
      continue;
    const j = row.jurisdiccion;
    const target = totals.get(j.codigo) ?? {
      id: j.codigo,
      label: j.nombre,
      total: 0,
    };
    target.total += row.total;
    totals.set(j.codigo, target);
  }
  const ranked = [...totals.values()].sort(
    (a, b) => b.total - a.total || a.id - b.id,
  );
  const total = ranked.reduce((sum, r) => sum + r.total, 0);
  const rows = showAll ? ranked : ranked.slice(0, 8);
  const shownTotal = rows.reduce((sum, r) => sum + r.total, 0);
  let accumulated = 0;
  return {
    total,
    shownTotal,
    count: ranked.length,
    rows: rows.map((r) => {
      accumulated += r.total;
      return {
        ...r,
        share: total === 0 ? null : (r.total / total) * 100,
        cumulative: shownTotal === 0 ? null : (accumulated / shownTotal) * 100,
      };
    }),
  };
}
