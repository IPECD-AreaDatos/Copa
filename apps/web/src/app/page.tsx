"use client";

import HomeDashboard from "@/components/home/HomeDashboard";
import DashboardShell from "@/components/layout/DashboardShell";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function HomePage() {
  const { user, displayName, logout, ready } = useDashboardSession({ required: false });

  if (!ready) {
    return null;
  }

  return (
    <DashboardShell
      activePath="/"
      displayName={displayName}
      username={user?.username}
      name={user?.name}
      onLogout={logout}
    >
      <HomeDashboard />
    </DashboardShell>
  );
}

