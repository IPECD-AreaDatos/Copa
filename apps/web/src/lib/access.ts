import type { CopaUser } from "@/hooks/useDashboardSession";
const isCentralUser = (user?: CopaUser | null) => user?.origen === "central" || user?.origen === "central-ensayo";

const GASTOS_DESAGREGADOS_USERS = new Set([
  "gcorrales",
  "hgrachot",
  "dinsaurralde",
  "fgonzalez",
  "jgazzo",
  "admin",
]);

export function isInstitutionUser(user?: Pick<CopaUser, "access"> | null): boolean {
  return user?.access?.scope === "institution";
}

export function isCopaAdmin(user?: CopaUser | null): boolean {
  return isCentralUser(user) ? user?.role === "admin" : user?.username === "admin" && !isInstitutionUser(user);
}

export function canAccessGastosDesagregados(user?: CopaUser | null): boolean {
  if (isCentralUser(user)) return user?.role === "admin" || user?.role === "editor" || user?.capabilities?.includes("gastos-desagregados") === true || isInstitutionUser(user);
  return isInstitutionUser(user) || GASTOS_DESAGREGADOS_USERS.has(user?.username?.trim().toLowerCase() || "");
}

export function canAccessEconomicPosition(user?: CopaUser | null): boolean {
  return user?.role === "admin"
    && user.access?.scope === "global"
    && user.username?.trim().toLowerCase() === "admin";
}
