"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type CopaUser = {
  id?: number;
  username?: string;
  name?: string;
  role?: string;
};

export function useDashboardSession(options: { required?: boolean } = { required: true }) {
  const router = useRouter();
  const [user, setUser] = useState<CopaUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const markReady = () => {
      queueMicrotask(() => {
        if (!cancelled) setReady(true);
      });
    };

    let storedUser: string | null = null;
    let token: string | null = null;

    try {
      storedUser = localStorage.getItem("copa_user");
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

    if (!storedUser || !token) {
      markReady();
      if (options.required) {
        router.replace("/login");
      }
      return () => {
        cancelled = true;
      };
    }
    
    try {
      const parsedUser = JSON.parse(storedUser) as CopaUser;
      queueMicrotask(() => {
        if (cancelled) return;
        setUser(parsedUser);
        setReady(true);
      });
    } catch {
      markReady();
      if (options.required) {
        router.replace("/login");
      }
    }

    return () => {
      cancelled = true;
    };
  }, [router, options.required]);

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
