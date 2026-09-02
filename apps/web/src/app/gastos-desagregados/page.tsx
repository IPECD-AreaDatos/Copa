"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import GastosDesagregadosDashboard from "@/components/gasto/GastosDesagregadosDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function GastosDesagregadosPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready || !user) {
    return null;
  }

  return (
    <DashboardShell
      activePath="/gastos-desagregados"
      displayName={displayName}
      username={user.username}
      name={user.name}
      onLogout={logout}
    >
      <GastosDesagregadosDashboard />
    </DashboardShell>
  );
}
