/**
 * API fetch utility for COPA
 * Handles authentication headers and intercepts 401 (Unauthorized) errors
 * to clear session and redirect to the login page.
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("copa_token") : null;

  const headers = new Headers(options.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && typeof window !== "undefined") {
    console.warn("Session expired or invalid token. Redirecting to login...");
    localStorage.removeItem("copa_token");
    localStorage.removeItem("copa_user");
    // Hard redirect to clear page states
    window.location.href = "/copa/login";
  }

  return response;
}
