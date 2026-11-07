import { format1M, formatPctOneDecimal } from "@/lib/gasto/logic";
import type { DesagregadoResponse } from "./GastosDesagregadosDashboard";

export default function GastoLecturaRubro({ data }: { data: DesagregadoResponse }) {
  const maximum = Math.max(1, ...data.rubros.map((row) => Math.abs(row.total)));
  return (
    <section className="chart-container">
      <h2 className="section-title">Lectura por rubro</h2>
      <p className="section-subtitle">Distribución del gasto del corte seleccionado</p>
      <div className="desagregado-bars">
        {data.rubros.map((row) => (
          <div className="desagregado-bar-row" key={row.codigo}>
            <div className="desagregado-bar-label">
              <span>{row.nombre}</span>
              <strong>{format1M(row.total)}</strong>
            </div>
            <div className="desagregado-bar-track" aria-hidden="true">
              <span style={{ width: `${Math.abs(row.total) / maximum * 100}%` }} />
            </div>
            <div className="desagregado-bar-meta">
              <span>{formatPctOneDecimal(row.participacion)}</span>
              <span>{row.subpartidas} cuentas · {row.filas} filas</span>
            </div>
          </div>
        ))}
      </div>
      {!data.rubros.length && <p>Sin registros para este corte.</p>}
      <p className="source-text">
        Bienes y servicios agrupa las partidas 200 y 300. Transferencias excluye
        seguridad social y coparticipación, que se muestran por separado.
        La evolución mensual siguiente reúne seguridad social, deuda y
        figurativos en Otros.
      </p>
    </section>
  );
}
