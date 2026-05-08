"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import AnalisisPersonalDashboard from "@/components/analisis-personal/AnalisisPersonalDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function AnalisisPersonalPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready || !user) {
    return null;
  }

  return (
    <DashboardShell
      activePath="/analisis-personal"
      displayName={displayName}
      username={user.username}
      name={user.name}
      onLogout={logout}
    >
      <AnalisisPersonalDashboard />
    </DashboardShell>
  );
}
