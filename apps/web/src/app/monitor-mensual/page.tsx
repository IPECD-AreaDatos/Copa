"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import SessionPending from "@/components/layout/SessionPending";
import MonitorMensualDashboard from "@/components/monitor-mensual/MonitorMensualDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function MonitorMensualPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready || !user) {
    return <SessionPending />;
  }

  return (
    <DashboardShell
      user={user}
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
