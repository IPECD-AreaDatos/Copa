"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import MonitorMensualDashboard from "@/components/monitor-mensual/MonitorMensualDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function MonitorMensualPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready || !user) {
    return null;
  }

  return (
    <DashboardShell
      activePath="/monitor-mensual"
      displayName={displayName}
      username={user.username}
      name={user.name}
      onLogout={logout}
    >
      <MonitorMensualDashboard />
    </DashboardShell>
  );
}
