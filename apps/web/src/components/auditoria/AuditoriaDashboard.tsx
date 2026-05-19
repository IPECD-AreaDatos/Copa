"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardShell from "../layout/DashboardShell";
import { fetchWithAuth } from "@/lib/api";
import { useDashboardSession } from "@/hooks/useDashboardSession";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

type TelemetriaRow = {
  id_registro: string;
  fecha_hora: string;
  seccion_tablero: string;
  accion: string;
  detalle_interaccion: any;
  ip_cliente: string;
  username: string;
};

export default function AuditoriaDashboard() {
  const { user, logout } = useDashboardSession();
  const [data, setData] = useState<TelemetriaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>("Todos");

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetchWithAuth("/copa/copa-api/api/admin/usage");
        if (!res.ok) {
          throw new Error("No tenés permisos o hubo un error en el servidor");
        }
        const json = await res.json();
        if (json.status === "success") {
          setData(json.data || []);
        } else {
          throw new Error(json.message || "Error al cargar auditoría");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (user?.username === "admin") {
      loadData();
    } else if (user) {
      setError("Acceso denegado: solo para administradores.");
      setLoading(false);
    }
  }, [user]);

  // --- Filtrado de Usuarios ---
  const dataSinAdmin = useMemo(() => {
    // Filtramos contundentemente al usuario admin para no ensuciar las estadísticas
    return data.filter((r) => r.username !== "admin");
  }, [data]);

  const uniqueUsers = useMemo(() => {
    return Array.from(new Set(dataSinAdmin.map((r) => r.username || "Anónimo"))).sort();
  }, [dataSinAdmin]);

  const filteredData = useMemo(() => {
    if (selectedUser === "Todos") return dataSinAdmin;
    return dataSinAdmin.filter((r) => (r.username || "Anónimo") === selectedUser);
  }, [dataSinAdmin, selectedUser]);

  // --- Lógica de KPIs y Agrupaciones ---
  const kpis = useMemo(() => {
    if (!filteredData.length) return { total: 0, users: 0, topSection: "-", sectionCounts: {} as Record<string, number> };

    const total = filteredData.length;
    const usersSet = new Set<string>();
    const sectionCounts: Record<string, number> = {};

    filteredData.forEach((row) => {
      if (row.username) usersSet.add(row.username);
      const sec = row.seccion_tablero || "Desconocida";
      sectionCounts[sec] = (sectionCounts[sec] || 0) + 1;
    });

    let topSection = "-";
    let maxSectionCount = 0;
    for (const [sec, count] of Object.entries(sectionCounts)) {
      if (count > maxSectionCount) {
        maxSectionCount = count;
        topSection = sec;
      }
    }

    return {
      total,
      users: usersSet.size,
      topSection,
      sectionCounts,
    };
  }, [data]);

  // --- Datos para Gráficos ---
  const chartDataSecciones = useMemo(() => {
    const labels = Object.keys(kpis.sectionCounts);
    const values = Object.values(kpis.sectionCounts);

    return {
      labels,
      datasets: [
        {
          label: "Interacciones",
          data: values,
          backgroundColor: "rgba(16, 185, 129, 0.7)",
          borderColor: "rgba(16, 185, 129, 1)",
          borderWidth: 1,
          borderRadius: 8,
        },
      ],
    };
  }, [kpis.sectionCounts]);

  const chartDataUsuarios = useMemo(() => {
    const userCounts: Record<string, number> = {};
    filteredData.forEach((row) => {
      const u = row.username || "Anónimo";
      userCounts[u] = (userCounts[u] || 0) + 1;
    });

    const labels = Object.keys(userCounts);
    const values = Object.values(userCounts);

    return {
      labels,
      datasets: [
        {
          label: "Actividad por Usuario",
          data: values,
          backgroundColor: [
            "rgba(59, 130, 246, 0.7)",
            "rgba(16, 185, 129, 0.7)",
            "rgba(245, 158, 11, 0.7)",
            "rgba(239, 68, 68, 0.7)",
            "rgba(139, 92, 246, 0.7)",
          ],
          borderColor: [
            "rgba(59, 130, 246, 1)",
            "rgba(16, 185, 129, 1)",
            "rgba(245, 158, 11, 1)",
            "rgba(239, 68, 68, 1)",
            "rgba(139, 92, 246, 1)",
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [data]);

  if (!user) return null;

  return (
    <DashboardShell
      activePath="/auditoria"
      displayName={user.name || user.username || ""}
      username={user.username || ""}
      onLogout={logout}
    >
      <div className="dashboard-header" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
        <div className="title-block" style={{ flexDirection: "column", alignItems: "flex-start", flex: 1 }}>
          <h1 className="dashboard-title" style={{ textAlign: "left" }}>Telemetría de Uso</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            Monitoreo del uso real del tablero por parte de las autoridades y analistas.
          </p>
        </div>
        {!loading && !error && (
          <div className="period-select-wrapper" style={{ position: "static" }}>
            <label htmlFor="userFilter" className="period-label">Filtrar por Usuario:</label>
            <select
              id="userFilter"
              className="period-select"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="Todos">Todos los Usuarios</option>
              {uniqueUsers.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", marginTop: "3rem" }}>Cargando datos de telemetría...</div>
      ) : error ? (
        <div className="kpi-card" style={{ marginTop: "3rem", borderColor: "var(--accent-danger)" }}>
          <h2 className="text-danger" style={{ marginBottom: "1rem" }}>Acceso Restringido</h2>
          <p>{error}</p>
        </div>
      ) : (
        <>
          {/* --- KPIs Superiores --- */}
          <div className="hero-grid" style={{ marginTop: "2rem", marginBottom: "2rem" }}>
            <div className="kpi-card">
              <h3 className="kpi-label">Total de Interacciones</h3>
              <div className="kpi-value text-accent">{kpis.total}</div>
              <div className="kpi-sub">Movimientos registrados en sistema</div>
            </div>
            <div className="kpi-card">
              <h3 className="kpi-label">Usuarios Activos</h3>
              <div className="kpi-value text-accent">{kpis.users}</div>
              <div className="kpi-sub">Cuentas únicas que ingresaron</div>
            </div>
            <div className="kpi-card" style={{ gridColumn: "span 2" }}>
              <h3 className="kpi-label">Sección Más Popular</h3>
              <div className="kpi-value" style={{ fontSize: "2.1rem" }}>{kpis.topSection}</div>
              <div className="kpi-sub">Módulo con mayor nivel de visitas</div>
            </div>
          </div>

          {/* --- Gráficos Centrales --- */}
          <div className="charts-grid-half" style={{ marginBottom: "2rem" }}>
            <div className="chart-container">
              <h2 className="section-title" style={{ fontSize: "1.2rem" }}>Actividad por Sección</h2>
              <div style={{ height: "300px", marginTop: "1rem" }}>
                <Bar 
                  data={chartDataSecciones} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                  }} 
                />
              </div>
            </div>
            <div className="chart-container">
              <h2 className="section-title" style={{ fontSize: "1.2rem" }}>Participación por Usuario</h2>
              <div style={{ height: "300px", marginTop: "1rem", display: "flex", justifyContent: "center" }}>
                <Doughnut 
                  data={chartDataUsuarios} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: "right" } }
                  }} 
                />
              </div>
            </div>
          </div>

          {/* --- Tabla Inferior --- */}
          <section className="chart-container" style={{ overflowX: "auto" }}>
            <h2 className="section-title" style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Últimos Movimientos</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", color: "var(--text-secondary)" }}>
                  <th style={{ padding: "1rem" }}>Fecha y Hora</th>
                  <th style={{ padding: "1rem" }}>Usuario</th>
                  <th style={{ padding: "1rem" }}>Sección</th>
                  <th style={{ padding: "1rem" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(0, 10).map((row) => (
                  <tr key={row.id_registro} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <td style={{ padding: "1rem" }}>
                      {new Date(row.fecha_hora).toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "medium"
                      })}
                    </td>
                    <td style={{ padding: "1rem", fontWeight: "bold", color: "var(--accent-primary)" }}>{row.username || "Anónimo"}</td>
                    <td style={{ padding: "1rem" }}>{row.seccion_tablero}</td>
                    <td style={{ padding: "1rem" }}>{row.accion}</td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                      No hay registros de uso con el filtro actual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {filteredData.length > 10 && (
              <div style={{ textAlign: "center", padding: "1rem", color: "var(--text-secondary)" }}>
                Mostrando los últimos 10 registros de un total de {filteredData.length}.
              </div>
            )}
          </section>
        </>
      )}
    </DashboardShell>
  );
}
