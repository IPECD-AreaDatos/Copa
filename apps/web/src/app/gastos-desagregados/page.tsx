"use client";

import Link from "next/link";
import DashboardShell from "@/components/layout/DashboardShell";
import GastosDesagregadosDashboard from "@/components/gasto/GastosDesagregadosDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";

export default function GastosDesagregadosPage() {
  const { user, displayName, logout, ready } = useDashboardSession();

  if (!ready) {
    return (
      <main className="route-status-page">
        <section className="route-status-card" aria-live="polite">
          <h1>Verificando el acceso</h1>
          <p>Estamos comprobando la sesión del tablero.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="route-status-page">
        <section className="route-status-card">
          <h1>Sesión requerida</h1>
          <p>Iniciá sesión para consultar los gastos desagregados.</p>
          <Link href="/login" className="route-status-link">
            Ir al inicio de sesión
          </Link>
        </section>
      </main>
    );
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
