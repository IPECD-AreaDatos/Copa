"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import { useDashboardSession } from "@/hooks/useDashboardSession";
import { fetchWithAuth } from "@/lib/api";
import styles from "./DataStatusDashboard.module.css";

type Source = {
  id: string;
  label: string;
  database: string;
  table: string;
  usage: string;
  frequency: "daily" | "monthly";
  status: "ok" | "missing" | "error";
  last_recorded_date: string | null;
  last_positive_date: string | null;
  last_updated_at: string | null;
  updated_at_has_timezone: boolean | null;
  reference_date?: string | null;
  latest_value: number | null;
  row_count: number | null;
};

type InflationPeriod = {
  period_id: string;
  ipc_source: "official" | "rem_bcra" | "unavailable";
  ipc_rem_published_at: string | null;
  yoy_percent: number | null;
};

type DataStatus = {
  checked_at: string;
  sources: Source[];
  inflation: { default_period_id: string; periods: InflationPeriod[] };
};

const TIME_ZONE = "America/Argentina/Cordoba";
const numberFormat = new Intl.NumberFormat("es-AR");
const currencyFormat = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", maximumFractionDigits: 2,
});

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sin datos";
  const monthly = value.length === 7;
  const date = new Date(`${value}${monthly ? "-01" : ""}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Sin datos";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC", ...(monthly ? {} : { day: "2-digit" }),
    month: monthly ? "long" : "2-digit", year: "numeric",
  }).format(date);
}

function formatTimestamp(value: string, hasTimezone = true): string {
  // Los timestamps sin zona se muestran literalmente, sin inventar una conversión.
  const date = new Date(hasTimezone ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "Sin datos";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: hasTimezone ? TIME_ZONE : "UTC", dateStyle: "short", timeStyle: "medium",
  }).format(date);
}

async function requestDataStatus(signal?: AbortSignal): Promise<DataStatus> {
  const response = await fetchWithAuth("/copa/copa-api/api/admin/data-status", {
    cache: "no-store", signal,
  });
  if (!response.ok) {
    throw new Error(response.status === 403 ? "Acceso exclusivo para administradores." : "No se pudo consultar el estado de los datos. Volvé a intentar.");
  }
  return response.json();
}

function SourceRow({ source }: { source: Source }) {
  const resource = source.id === "ron" || source.id === "rop";
  const latestDate = resource ? source.last_positive_date : source.last_recorded_date;
  const hasLaterRows = resource && source.last_recorded_date
    && (!source.last_positive_date || source.last_recorded_date > source.last_positive_date);

  return (
    <tr>
      <th scope="row">
        <span className={styles.sourceName}>{source.label}</span>
        <span className={styles.detail}>{source.usage}</span>
        <code className={styles.origin}>{source.database} · {source.table}</code>
      </th>
      <td>
        <span className={styles.dateValue}>{formatDate(latestDate)}</span>
        <span className={styles.detail}>
          {resource ? "Último importe positivo" : source.id === "rem" ? "Horizonte de la última consulta" : "Último período disponible"}
        </span>
        {resource && source.latest_value !== null && (
          <span className={styles.amount}>{currencyFormat.format(source.latest_value)}</span>
        )}
        {hasLaterRows && (
          <span className={styles.notice}>Hay filas hasta {formatDate(source.last_recorded_date)}, sin importe positivo posterior.</span>
        )}
        {source.reference_date && (
          <span className={styles.detail}>REM consultado el {formatDate(source.reference_date)}</span>
        )}
      </td>
      <td>
        {source.last_updated_at ? (
          <>
            <span className={styles.dateValue}>{formatTimestamp(source.last_updated_at, source.updated_at_has_timezone === true)}</span>
            <span className={styles.detail}>updated_at · {source.updated_at_has_timezone ? "hora argentina" : "hora registrada en la base, sin zona horaria"}</span>
          </>
        ) : (
          <span className={styles.detail}>{source.status === "error" ? "No se pudo consultar" : resource ? "La fuente no registra fecha de carga" : "Sin fecha de actualización"}</span>
        )}
      </td>
      <td>
        <span className={`${styles.badge} ${styles[source.status]}`}>
          {source.status === "ok" ? "Consulta correcta" : source.status === "missing" ? "Sin dato utilizable" : "Error de consulta"}
        </span>
        {source.row_count !== null && (
          <span className={styles.detail}>{numberFormat.format(source.row_count)} registros{source.id === "rem" ? " en la última consulta" : ""}</span>
        )}
      </td>
    </tr>
  );
}

export default function DataStatusDashboard() {
  const { user, displayName, logout, ready } = useDashboardSession();
  const [data, setData] = useState<DataStatus | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user?.username === "admin";

  async function refreshData() {
    setLoading(true);
    setError(null);
    try {
      setData(await requestDataStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar el estado de los datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !isAdmin) return;
    const controller = new AbortController();
    void requestDataStatus(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setData(result);
      setError(null);
      setLoading(false);
    }, (err: unknown) => {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "No se pudo consultar el estado de los datos.");
      setLoading(false);
    });
    return () => controller.abort();
  }, [ready, isAdmin]);

  if (!ready || !user || !isAdmin) {
    return (
      <main className="route-status-page">
        <section className="route-status-card" aria-live="polite">
          <h1>{!ready ? "Verificando el acceso" : !user ? "Sesión requerida" : "Acceso restringido"}</h1>
          <p>{!ready ? "Comprobando la sesión del tablero." : "Esta hoja está disponible únicamente para el administrador."}</p>
          {ready && <Link href={user ? "/" : "/login"} className="route-status-link">{user ? "Volver al tablero" : "Iniciar sesión"}</Link>}
        </section>
      </main>
    );
  }

  const inflation = data?.inflation.periods.find(
    (period) => period.period_id === (selectedPeriod || data.inflation.default_period_id),
  );
  const official = data?.sources.find((source) => source.id === "ipc");
  const rem = data?.sources.find((source) => source.id === "rem");
  const failed = data?.sources.filter((source) => source.status === "error").length || 0;
  const sourceLabel = inflation?.ipc_source === "official" ? "INDEC · dato oficial"
    : inflation?.ipc_source === "rem_bcra" ? "REM · publicado por BCRA" : "Sin datos para el cálculo";

  return (
    <DashboardShell activePath="/actualizacion-datos" displayName={displayName} username={user.username} onLogout={logout}>
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div>
            <h1>Actualización de datos</h1>
            <p className={styles.subtitle}>Fechas y fuentes que está consumiendo el tablero.</p>
          </div>
          <button type="button" className={styles.refresh} disabled={loading} onClick={() => void refreshData()}>
            {loading ? "Consultando…" : "Actualizar ahora"}
          </button>
        </header>

        <div aria-live="polite" className={styles.queryStatus}>
          {data ? <span>Última consulta: {formatTimestamp(data.checked_at)} · {data.sources.length - failed}/{data.sources.length} fuentes respondieron.</span>
            : loading ? <span>Consultando las bases de datos…</span> : null}
        </div>
        {error && <p role="alert" className={styles.errorBox}>{error}{data && " Se conservan los resultados de la última consulta indicada arriba."}</p>}
        {failed > 0 && <p role="alert" className={styles.errorBox}>No respondieron {failed} fuente(s). Revisá los errores de consulta en la tabla.</p>}

        {data && (
          <>
            <section className={styles.card} aria-labelledby="inflation-status-title">
              <div className={styles.sectionHeader}>
                <h2 id="inflation-status-title">Inflación utilizada en el cálculo</h2>
                <label className={styles.periodControl}>
                  Mes de cálculo
                  <select value={selectedPeriod || data.inflation.default_period_id} onChange={(event) => setSelectedPeriod(event.target.value)}>
                    {data.inflation.periods.map((period) => <option key={period.period_id} value={period.period_id}>{formatDate(period.period_id)}</option>)}
                  </select>
                </label>
              </div>
              <div className={styles.inflationGrid}>
                <div>
                  <span className={`${styles.badge} ${inflation?.ipc_source === "official" ? styles.ok : styles.missing}`}>{sourceLabel}</span>
                  <p className={styles.rate}>{inflation?.yoy_percent != null ? `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(inflation.yoy_percent)} %` : "Sin datos"}</p>
                  <span className={styles.detail}>Variación interanual usada para ajustar los importes</span>
                </div>
                <dl className={styles.facts}>
                  <div><dt>Último IPC oficial disponible</dt><dd>{formatDate(official?.last_recorded_date)}</dd></div>
                  <div><dt>Fecha de consulta del REM disponible</dt><dd>{formatDate(rem?.reference_date)}</dd></div>
                  {inflation?.ipc_source === "rem_bcra" && <div><dt>REM utilizado para este mes</dt><dd>{formatDate(inflation.ipc_rem_published_at)}</dd></div>}
                </dl>
              </div>
              <p className={styles.explanation}>Se usa el resolver de inflación de Inicio y Análisis Mensual RON, compartido con el Análisis Anual RON desde 2025: primero el IPC oficial; cuando falta, las medianas mensuales del REM encadenadas desde el último índice oficial. El REM recoge expectativas de mercado.</p>
            </section>

            <section className={styles.card} aria-labelledby="sources-status-title">
              <div className={styles.sectionHeader}><h2 id="sources-status-title">Estado de las fuentes</h2></div>
              <div className={styles.tableScroll} role="region" aria-label="Fechas y actualización de cada fuente" tabIndex={0}>
                <table className={styles.table}>
                  <thead><tr><th scope="col">Fuente y uso</th><th scope="col">Último dato</th><th scope="col">Último cambio en la base</th><th scope="col">Lectura de la fuente</th></tr></thead>
                  <tbody>{data.sources.map((source) => <SourceRow key={source.id} source={source} />)}</tbody>
                </table>
              </div>
              <p className={styles.explanation}>El último cambio es el máximo updated_at de cada fuente; en REM corresponde a la última consulta disponible. RON y ROP no registran fecha de carga: se muestra el último importe estrictamente positivo. Un dato positivo o una consulta correcta no garantizan que el mes esté completo. La hora de consulta indica cuándo se verificó la base.</p>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
