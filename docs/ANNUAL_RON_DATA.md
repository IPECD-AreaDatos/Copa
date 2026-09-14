# Actualización del análisis anual RON

Desde 2025, `/api/ron/annual-monitor` acumula los resultados de `loadMonthlyDashboard`, el mismo servicio que usan `/api/dashboard/monthly` y el reporte mensual. No utiliza los importes estáticos de esos años. Los años nuevos se detectan en los períodos del mensual.

Las fuentes y filtros están fijados en `apps/api/services/monthly-dashboard.js`:

- RON: `copa_recursos_origen_nacional`, con los mismos componentes, coeficientes y ajustes por año del mensual.
- ROP: `copa_reca_rop`, con los mismos conceptos y distribución del mensual.
- Salarios: `copa_gastos`, estado `ORDENADO`, partida `GAST% EN PERSONAL%`, fuentes de financiamiento 10 y 14.
- IPC: el resolver mensual, con IPC oficial y alternativa REM cuando corresponda.
- Presupuesto: `apps/api/data/presupuesto.json`, la fuente presupuestaria vigente del mensual. Se acumula hasta el mismo corte de recaudación; un año sin presupuesto no recibe una expectativa ficticia.

El corte es el último mes que el mensual considera completo para RON. Se acumula desde enero hasta ese mes y se compara con exactamente los mismos meses del año anterior. Si falta una variable dentro de ese intervalo, su total y comparaciones son `null` y la pantalla muestra `Sin datos`. Los gráficos tampoco completan faltantes con cero. Un año completo requiere doce meses completos para todas las variables.

La inflación anual conserva la metodología anterior: promedio de las variaciones interanuales mensuales del IPC en el intervalo. Es una variación del acumulado ajustada por ese promedio, no un promedio de las variaciones reales de recaudación. La procedencia oficial/REM y los faltantes se propagan desde el mensual.

Los años anteriores a 2025 conservan sus filas históricas en `_data_ipce_v1.json`. Si falta el salario previo en la base (caso 2024), sólo se usa el total histórico cuando coincide exactamente el corte anual. No se prorratea un total anual para completar un intervalo parcial ni se recuperan valores estáticos de 2025 en adelante.

La API vuelve a consultar las fuentes en cada solicitud y responde sin caché HTTP. La pestaña anual usa el mismo ciclo de carga del mensual: consulta una vez al abrirse o recargarse, sin temporizadores ni consultas al cambiar el foco. Cambiar el año usa los datos de esa consulta, igual que cambiar el período en el mensual. Si la carga falla, muestra el error. La hora mostrada es la de consulta, no una afirmación sobre la última carga de la base.

Esto usa la misma carga de base que el mensual; no crea un proceso ETL adicional. Los cambios quedan disponibles cuando las fuentes del mensual se actualicen.

Validación local:

```sh
cd apps/api && npm test
cd ../web && npm run test:annual && npm run build
```

También se verificó en lectura contra la base que el JSON mensual serializado no cambia con la extracción al servicio compartido y que RON, ROP, distribución municipal y salarios anuales concilian con la suma mensual para 2025 y enero–agosto de 2026.
