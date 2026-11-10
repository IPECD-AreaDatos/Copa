"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";
import { isInstitutionUser } from "@/lib/access";

export type CopaUser = {
  id?: number;
  username?: string;
  name?: string;
  role?: string;
  origen?: "central" | "central-ensayo";
  rango?: string;
  capabilities?: string[];
  access?: {
    scope: "global" | "institution";
    jurisdictions: { code: number; name: string }[];
  };
};

export function useDashboardSession(options: { required?: boolean } = { required: true }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CopaUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const markReady = () => {
      queueMicrotask(() => {
        if (!cancelled) setReady(true);
      });
    };

    let token: string | null = null;

    try {
      token = localStorage.getItem("copa_token");
    } catch {
      // Safari puede bloquear el acceso al almacenamiento en ciertos modos.
      markReady();
      if (options.required) {
        router.replace("/login");
      }
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    const centralEnabled = process.env.NEXT_PUBLIC_COPA_SSO_LOCAL === "si" || process.env.NEXT_PUBLIC_COPA_SSO_STAGING === "si" || process.env.NEXT_PUBLIC_COPA_SSO_ENABLED === "si";

    async function verifySession() {
      // A portal session represents the identity the user just chose, even if
      // a different, older Copa token remains in this browser.
      if (centralEnabled) {
        try {
          const response = await fetch("/copa/copa-api/api/auth/session", { cache: "no-store", signal: controller.signal });
          const data = response.ok ? await response.json() as { user?: CopaUser } : null;
          if (cancelled) return;
          if (data?.user?.origen === "central" || data?.user?.origen === "central-ensayo") {
            localStorage.removeItem("copa_token");
            localStorage.removeItem("copa_user");
            setUser(data.user);
            setReady(true);
            return;
          }
          if (response.status !== 404) {
            localStorage.removeItem("copa_token");
            localStorage.removeItem("copa_user");
            markReady();
            if (options.required) router.replace("/login");
            return;
          }
        } catch {
          if (cancelled) return;
          localStorage.removeItem("copa_token");
          localStorage.removeItem("copa_user");
          markReady();
          if (options.required) router.replace("/login");
          return;
        }
      }
      if (!token) {
        markReady();
        if (options.required) router.replace("/login");
        return;
      }
      try {
        const response = await fetchWithAuth("/copa/copa-api/api/auth/me", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo verificar la sesión");
        const { user: sessionUser } = await response.json() as { user: CopaUser };
        if (cancelled) return;
        localStorage.setItem("copa_user", JSON.stringify(sessionUser));
        const route = pathname.replace(/^\/copa(?=\/|$)/, "") || "/";
        const institutionRoutes = ["/gasto", "/gastos-desagregados"];
        const hasMinistryHome = sessionUser.rango === "ministerio" && route === "/";
        if (isInstitutionUser(sessionUser) && !institutionRoutes.includes(route) && !hasMinistryHome) {
          router.replace("/gasto");
          return;
        }
        setUser(sessionUser);
        setReady(true);
      } catch {
        if (cancelled) return;
        markReady();
        if (options.required) router.replace("/login");
      }
    }
    void verifySession();
    return () => { cancelled = true; controller.abort(); };
  }, [router, pathname, options.required]);

  const logout = useCallback(() => {
    if (confirm("¿Está seguro que desea cerrar sesión?")) {
      if (user?.origen === "central" || user?.origen === "central-ensayo") {
        void fetch("/copa/copa-api/api/auth/logout-central", { method: "POST" })
          .then(response => { if (response.ok) window.location.href = "/copa/login"; else alert("No se pudo cerrar la sesión. Intentá nuevamente."); })
          .catch(() => alert("No se pudo cerrar la sesión. Intentá nuevamente."));
        return;
      }
      localStorage.removeItem("copa_token");
      localStorage.removeItem("copa_user");
      router.push("/login");
    }
  }, [router, user]);

  const displayName = user?.username === "jpvaldes" 
    ? "Gob. JP. Valdés" 
    : (user?.name || user?.username || "Invitado");

  return { user, displayName, logout, ready };
}
