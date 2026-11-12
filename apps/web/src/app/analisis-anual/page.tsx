"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import SessionPending from "@/components/layout/SessionPending";
import AnalisisAnualDashboard from "@/components/analisis-anual/AnalisisAnualDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function AnalisisAnualPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready || !user) {
    return <SessionPending />;
  }

  return (
    <DashboardShell
      user={user}
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
