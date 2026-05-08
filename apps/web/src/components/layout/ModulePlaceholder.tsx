import type { ReactNode } from "react";

type Props = {
  title: string;
  description: ReactNode;
};

// Contenido provisional mientras se porta la lógica desde frontend (cada script.js del módulo).
export default function ModulePlaceholder({ title, description }: Props) {
  return (
    <main>
      <div
        className="header-content"
        style={{
          marginBottom: "2rem",
          textAlign: "left",
        }}
      >
        <h1 className="text-gradient dashboard-title" style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>
          {title}
        </h1>
        <p style={{ color: "var(--text-secondary)", maxWidth: "42rem", lineHeight: 1.6 }}>{description}</p>
      </div>

      <div
        className="chart-container"
        style={{
          marginBottom: 0,
          minHeight: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem" }}>
          Los KPI y gráficos de este módulo se integrarán en esta vista (misma fuente de datos que el tablero
          estático).
        </p>
      </div>
    </main>
  );
}
