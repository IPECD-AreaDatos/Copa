"use client";

import Link from "next/link";
import DashboardShell from "@/components/layout/DashboardShell";
import GastosDesagregadosDashboard from "@/components/gasto/GastosDesagregadosDashboard";
import { useDashboardSession } from "@/hooks/useDashboardSession";
import { canAccessGastosDesagregados } from "@/lib/access";

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

  if (!canAccessGastosDesagregados(user.username)) {
    return (
      <main className="route-status-page">
        <section className="route-status-card">
          <h1>Acceso restringido</h1>
          <p>Tu usuario no tiene permiso para consultar los gastos desagregados.</p>
          <Link href="/" className="route-status-link">
            Volver al tablero
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
