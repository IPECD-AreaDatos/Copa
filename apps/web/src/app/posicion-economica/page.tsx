"use client";

import Link from "next/link";
import GastoPosicionEconomica from "@/components/gasto/GastoPosicionEconomica";
import DashboardShell from "@/components/layout/DashboardShell";
import SessionPending from "@/components/layout/SessionPending";
import { useDashboardSession } from "@/hooks/useDashboardSession";
import { canAccessEconomicPosition } from "@/lib/access";

export default function PosicionEconomicaPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready || !user) return <SessionPending />;

  if (!canAccessEconomicPosition(user)) {
    return (
      <main className="route-status-page">
        <section className="route-status-card">
          <h1>Acceso restringido</h1>
          <p>Posición económica está disponible únicamente para la cuenta admin.</p>
          <Link href={user.access?.scope === "institution" ? "/gasto" : "/"} className="route-status-link">
            Volver al tablero
          </Link>
        </section>
      </main>
    );
  }

  return (
    <DashboardShell
      user={user}
      activePath="/posicion-economica"
      displayName={displayName}
      onLogout={logout}
    >
      <GastoPosicionEconomica />
    </DashboardShell>
  );
}
