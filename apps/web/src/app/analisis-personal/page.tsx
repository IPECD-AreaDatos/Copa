"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import SessionPending from "@/components/layout/SessionPending";
import AnalisisPersonalDashboard from "@/components/analisis-personal/AnalisisPersonalDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function AnalisisPersonalPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready || !user) {
    return <SessionPending />;
  }

  return (
    <DashboardShell
      user={user}
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
