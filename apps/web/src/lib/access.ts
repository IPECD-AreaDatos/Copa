const GASTOS_DESAGREGADOS_USERS = new Set(["gcorrales", "admin"]);

export function canAccessGastosDesagregados(username?: string): boolean {
  return GASTOS_DESAGREGADOS_USERS.has(username?.trim().toLowerCase() || "");
}
