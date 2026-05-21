"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import GastoDashboard from "@/components/gasto/GastoDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function GastoPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready || !user) {
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

