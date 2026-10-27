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

    if (!token) {
      markReady();
      if (options.required) {
        router.replace("/login");
      }
      return () => {
        cancelled = true;
      };
    }
    
    const controller = new AbortController();
    // Refresh permissions from the server; localStorage is only a display cache.
    fetchWithAuth("/copa/copa-api/api/auth/me", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo verificar la sesión");
        return response.json() as Promise<{ user: CopaUser }>;
      })
      .then(({ user: sessionUser }) => {
        if (cancelled) return;
        localStorage.setItem("copa_user", JSON.stringify(sessionUser));
        const route = pathname.replace(/^\/copa(?=\/|$)/, "") || "/";
        if (isInstitutionUser(sessionUser) && !["/gasto", "/gastos-desagregados"].includes(route)) {
          router.replace("/gasto");
          return;
        }
        setUser(sessionUser);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        markReady();
        if (options.required) router.replace("/login");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [router, pathname, options.required]);

  const logout = useCallback(() => {
    if (confirm("¿Está seguro que desea cerrar sesión?")) {
      localStorage.removeItem("copa_token");
      localStorage.removeItem("copa_user");
      router.push("/login");
    }
  }, [router]);

  const displayName = user?.username === "jpvaldes" 
    ? "Gob. JP. Valdés" 
    : (user?.name || user?.username || "Invitado");

  return { user, displayName, logout, ready };
}
