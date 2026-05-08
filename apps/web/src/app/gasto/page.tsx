"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import GastoDashboard from "@/components/gasto/GastoDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function GastoPage() {
  const router = useRouter();
  const { user, displayName, logout, ready } = useDashboardSession();

  useEffect(() => {
    if (
      user &&
      (user.username === "jpvaldes" ||
        user.username === "gobernador" ||
        user.name === "Gob. JP. Valdes" ||
        user.name === "Gob. JP. Valdés")
    ) {
      router.replace("/");
    }
  }, [user, router]);

  if (!ready || !user) {
    return null;
  }

  if (
    user.username === "jpvaldes" ||
    user.username === "gobernador" ||
    user.name === "Gob. JP. Valdes" ||
    user.name === "Gob. JP. Valdés"
  ) {
    return null;
  }

  return (
    <DashboardShell
      activePath="/gasto"
      displayName={displayName}
      username={user.username}
      name={user.name}
      onLogout={logout}
    >
      <GastoDashboard />
    </DashboardShell>
  );
}
