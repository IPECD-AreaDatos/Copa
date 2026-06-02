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

const doughnutLabelsPlugin = {
  id: "doughnutLabelsPlugin",
  afterDraw(chart: any) {
    const { ctx } = chart;
    const datasetMeta = chart.getDatasetMeta(0);
    if (!datasetMeta || datasetMeta.hidden) return;

    const dataset = chart.data.datasets[0];
    const total = dataset.data.reduce((sum: number, val: number) => sum + val, 0);
    if (total === 0) return;

    datasetMeta.data.forEach((element: any, index: number) => {
      const value = dataset.data[index];
      if (value === undefined || value === null) return;

      const percentageValue = (value / total) * 100;
      if (percentageValue < 3) return; // No pintar si la porción es menor al 3% para evitar solapamiento

      const pct = percentageValue.toFixed(1) + "%";

      // Obtener el centro del segmento (arco)
      const { x, y, startAngle, endAngle, innerRadius, outerRadius } = element;
      const avgAngle = startAngle + (endAngle - startAngle) / 2;
      const r = innerRadius + (outerRadius - innerRadius) / 2;

      // Convertir coordenadas polares a cartesianas en el canvas
      const labelX = x + Math.cos(avgAngle) * r;
      const labelY = y + Math.sin(avgAngle) * r;

      ctx.save();
      ctx.fillStyle = "#ffffff"; // Texto en blanco
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Sombra/borde negro para contrastar en fondos claros
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 3;
      ctx.strokeText(pct, labelX, labelY);

      // Dibujar texto del porcentaje
      ctx.fillText(pct, labelX, labelY);
      ctx.restore();
    });
  }
};

const barLabelsPlugin = {
  id: "barLabelsPlugin",
  afterDraw(chart: any) {
    const { ctx } = chart;
    const datasetMeta = chart.getDatasetMeta(0);
    if (!datasetMeta || datasetMeta.hidden) return;

    const dataset = chart.data.datasets[0];
    const total = dataset.data.reduce((sum: number, val: number) => sum + val, 0);
    if (total === 0) return;

    datasetMeta.data.forEach((element: any, index: number) => {
      const value = dataset.data[index];
      if (value === undefined || value === null) return;

      const percentageValue = (value / total) * 100;
      const pct = percentageValue.toFixed(1) + "%";

      const { x, y, base } = element;
      const barHeight = base - y;

      let labelY;
      let textColor;
      let useStroke = false;
      let textBaseline: CanvasTextBaseline = "bottom";

      if (barHeight > 24) {
        // Dentro de la barra (centrado un poco abajo del borde superior)
        labelY = y + 12;
        textColor = "#ffffff";
        useStroke = true;
        textBaseline = "middle";
      } else {
        // Fuera de la barra (arriba)
        labelY = y - 6;
        textColor = "#64748b";
        textBaseline = "bottom";
      }

      ctx.save();
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = textBaseline;

      if (useStroke) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
        ctx.lineWidth = 3;
        ctx.strokeText(pct, x, labelY);
      }

      ctx.fillStyle = textColor;
      ctx.fillText(pct, x, labelY);
      ctx.restore();
    });
  }
};


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
  const [datePreset, setDatePreset] = useState<string>("Todos");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

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

  // Auxiliar para formatear fecha local a string YYYY-MM-DD
  function getLocalDateString(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "Todos") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "Hoy") {
      const todayStr = getLocalDateString(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "7dias") {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setStartDate(getLocalDateString(past));
      setEndDate(getLocalDateString(now));
    } else if (preset === "30dias") {
      const past = new Date();
      past.setDate(now.getDate() - 30);
      setStartDate(getLocalDateString(past));
      setEndDate(getLocalDateString(now));
    } else if (preset === "esteMes") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(getLocalDateString(startOfMonth));
      setEndDate(getLocalDateString(now));
    }
  };

  // --- Filtrado de Usuarios ---
  const dataSinAdmin = useMemo(() => {
    // Filtramos contundentemente al usuario admin para no ensuciar las estadísticas
    return data.filter((r) => r.username !== "admin");
  }, [data]);

  const uniqueUsers = useMemo(() => {
    return Array.from(new Set(dataSinAdmin.map((r) => r.username || "Anónimo"))).sort();
  }, [dataSinAdmin]);

  const filteredData = useMemo(() => {
    let temp = dataSinAdmin;

    // 1. Filtrar por Usuario
    if (selectedUser !== "Todos") {
      temp = temp.filter((r) => (r.username || "Anónimo") === selectedUser);
    }

    // 2. Filtrar por Fecha Inicio
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      temp = temp.filter((r) => {
        const d = new Date(r.fecha_hora);
        return d >= start;
      });
    }

    // 3. Filtrar por Fecha Fin
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      temp = temp.filter((r) => {
        const d = new Date(r.fecha_hora);
        return d <= end;
      });
    }

    return temp;
  }, [dataSinAdmin, selectedUser, startDate, endDate]);

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
  }, [filteredData]);

  // --- Datos para Gráficos ---
  const chartDataSecciones = useMemo(() => {
    const sortedEntries = Object.entries(kpis.sectionCounts).sort((a, b) => b[1] - a[1]);
    const labels = sortedEntries.map(([k]) => k);
    const values = sortedEntries.map(([, v]) => v);

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
    const counts: Record<string, number> = {};
    
    if (selectedUser === "Todos") {
      filteredData.forEach((row) => {
        const u = row.username || "Anónimo";
        counts[u] = (counts[u] || 0) + 1;
      });
    } else {
      // Si es un usuario específico, mostramos la distribución de sus acciones
      filteredData.forEach((row) => {
        const a = row.accion || "Otra Acción";
        counts[a] = (counts[a] || 0) + 1;
      });
    }

    const labels = Object.keys(counts);
    const values = Object.values(counts);

    return {
      labels,
      datasets: [
        {
          label: selectedUser === "Todos" ? "Actividad por Usuario" : "Acciones",
          data: values,
          backgroundColor: [
            "rgba(59, 130, 246, 0.7)",
            "rgba(16, 185, 129, 0.7)",
            "rgba(245, 158, 11, 0.7)",
            "rgba(239, 68, 68, 0.7)",
            "rgba(139, 92, 246, 0.7)",
            "rgba(236, 72, 153, 0.7)",
            "rgba(20, 184, 166, 0.7)",
          ],
          borderColor: [
            "rgba(59, 130, 246, 1)",
            "rgba(16, 185, 129, 1)",
            "rgba(245, 158, 11, 1)",
            "rgba(239, 68, 68, 1)",
            "rgba(139, 92, 246, 1)",
            "rgba(236, 72, 153, 1)",
            "rgba(20, 184, 166, 1)",
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [filteredData, selectedUser]);

  if (!user) return null;

  return (
    <DashboardShell
      activePath="/auditoria"
      displayName={user.name || user.username || ""}
      username={user.username || ""}
      name={user.name || ""}
      onLogout={logout}
    >
      <div className="dashboard-header" style={{ flexDirection: "column", alignItems: "stretch", marginBottom: "2rem" }}>
        <div className="title-block" style={{ flexDirection: "column", alignItems: "flex-start", width: "100%", marginBottom: "1.5rem" }}>
          <h1 className="dashboard-title" style={{ textAlign: "left" }}>Telemetría de Uso</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            Monitoreo del uso real del tablero por parte de las autoridades y analistas.
          </p>
        </div>
        {!loading && !error && (
          <div className="section-filters" style={{ width: "100%", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            {/* Filtro por Usuario */}
            <div className="sf-group" style={{ flex: "1 1 200px" }}>
              <label htmlFor="userFilter" style={{ fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem", display: "block" }}>Usuario</label>
              <select
                id="userFilter"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={{ width: "100%", height: "42px", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "0.6rem 1rem", fontSize: "0.875rem" }}
              >
                <option value="Todos">Todos los Usuarios</option>
                {uniqueUsers.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {/* Presets de Fecha */}
            <div className="sf-group" style={{ flex: "1 1 150px" }}>
              <label htmlFor="datePreset" style={{ fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem", display: "block" }}>Período</label>
              <select
                id="datePreset"
                value={datePreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                style={{ width: "100%", height: "42px", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "0.6rem 1rem", fontSize: "0.875rem" }}
              >
                <option value="Todos">Todo el Historial</option>
                <option value="Hoy">Hoy</option>
                <option value="7dias">Últimos 7 días</option>
                <option value="30dias">Últimos 30 días</option>
                <option value="esteMes">Este mes</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </div>

            {/* Fecha Inicio */}
            <div className="sf-group" style={{ flex: "1 1 150px" }}>
              <label htmlFor="startDate" style={{ fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem", display: "block" }}>Desde</label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset("personalizado");
                }}
                style={{ width: "100%", height: "42px", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "0.6rem 1rem", fontSize: "0.875rem", boxSizing: "border-box" }}
              />
            </div>

            {/* Fecha Fin */}
            <div className="sf-group" style={{ flex: "1 1 150px" }}>
              <label htmlFor="endDate" style={{ fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem", display: "block" }}>Hasta</label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset("personalizado");
                }}
                style={{ width: "100%", height: "42px", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "0.6rem 1rem", fontSize: "0.875rem", boxSizing: "border-box" }}
              />
            </div>
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
                    plugins: { 
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label(ctx) {
                            const val = ctx.parsed?.y ?? 0;
                            const total = ctx.dataset.data.reduce((s: any, v: any) => s + v, 0);
                            const pct = ((val / total) * 100).toFixed(1) + "%";
                            return ` ${ctx.dataset.label || "Interacciones"}: ${val} (${pct})`;
                          }
                        }
                      }
                    },
                    scales: { 
                      y: { 
                        beginAtZero: true, 
                        ticks: { precision: 0 },
                        grace: "8%"
                      } 
                    }
                  }} 
                  plugins={[barLabelsPlugin]}
                />
              </div>
            </div>
            <div className="chart-container">
              <h2 className="section-title" style={{ fontSize: "1.2rem" }}>
                {selectedUser === "Todos" ? "Participación por Usuario" : `Acciones de ${selectedUser}`}
              </h2>
              <div style={{ height: "300px", marginTop: "1rem", display: "flex", justifyContent: "center" }}>
                <Doughnut 
                  data={chartDataUsuarios} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                      legend: { position: "right" },
                      tooltip: {
                        callbacks: {
                          label(ctx) {
                            const val = ctx.parsed;
                            const total = ctx.dataset.data.reduce((s: any, v: any) => s + v, 0);
                            const pct = ((val / total) * 100).toFixed(1) + "%";
                            return ` ${ctx.label}: ${val} (${pct})`;
                          }
                        }
                      }
                    }
                  }} 
                  plugins={[doughnutLabelsPlugin]}
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
