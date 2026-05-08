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
    const storedUser = localStorage.getItem("copa_user");
    const token = localStorage.getItem("copa_token");
    
    if (!storedUser || !token) {
      if (options.required) {
        router.replace("/login");
      } else {
        setReady(true);
      }
      return;
    }
    
    try {
      setUser(JSON.parse(storedUser) as CopaUser);
      setReady(true);
    } catch {
      if (options.required) {
        router.replace("/login");
      } else {
        setReady(true);
      }
    }
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

