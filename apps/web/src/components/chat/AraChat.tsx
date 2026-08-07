import AraChatLoader from "./AraChatLoader";

type TenantRoute = {
  ara_id?: unknown;
  tenant_id?: unknown;
};

function publicBaseUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function araIdFromRoutes(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const routes = JSON.parse(value) as unknown;
    if (!Array.isArray(routes)) return undefined;

    for (const route of routes as TenantRoute[]) {
      const candidate = route.ara_id ?? route.tenant_id;
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export default function AraChat() {
  const apiBaseUrl = publicBaseUrl(process.env.ARA_WEB_API_PUBLIC_BASE_URL);
  if (!apiBaseUrl) return null;

  return (
    <AraChatLoader
      apiBaseUrl={apiBaseUrl}
      araId={araIdFromRoutes(process.env.ARA_WIDGET_TENANT_ROUTES_JSON)}
      jwtEnabled={process.env.ARA_WIDGET_JWT_ENABLED?.toLowerCase() === "true"}
    />
  );
}
