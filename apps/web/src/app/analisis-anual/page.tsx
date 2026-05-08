"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import AnalisisAnualDashboard from "@/components/analisis-anual/AnalisisAnualDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function AnalisisAnualPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready || !user) {
    return null;
  }

  return (
    <DashboardShell
      activePath="/analisis-anual"
      displayName={displayName}
      username={user.username}
      name={user.name}
      onLogout={logout}
    >
      <AnalisisAnualDashboard />
    </DashboardShell>
  );
}
