import type { CopaUser } from "@/hooks/useDashboardSession";

const GASTOS_DESAGREGADOS_USERS = new Set([
  "gcorrales",
  "hgrachot",
  "dinsaurralde",
  "fgonzalez",
  "admin",
]);

export function isInstitutionUser(user?: Pick<CopaUser, "access"> | null): boolean {
  return user?.access?.scope === "institution";
}

export function canAccessGastosDesagregados(user?: CopaUser | null): boolean {
  return isInstitutionUser(user) || GASTOS_DESAGREGADOS_USERS.has(user?.username?.trim().toLowerCase() || "");
}
