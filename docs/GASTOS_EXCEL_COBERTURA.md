# Gastos desagregados: cobertura de los cuatro Excel

Revisión: 4 de septiembre de 2026. Rama: `codex/desglose-gasto-por-fuente`.

## Resultado y fuente

Se inventariaron las **29 hojas, 9.899 celdas con contenido, 2.524 fórmulas y 6 gráficos**. El archivo `apps/api/data/gasto_excel_sheets.json` conserva valores guardados, fórmulas, comentarios, rangos, columnas/filas ocultas y referencias de series. Cada archivo tiene hash SHA-256. Los cuatro XLSX originales no se modifican ni se ejecutan macros o instrucciones contenidas en ellos.

El tablero usa `copa_gastos_fte` como fuente viva: año, mes, jurisdicción, fuente, programa, subprograma (`sub_prof`), proyecto, obra, capítulo, subpartida y estado. Las respuestas se agregan a cuenta × jurisdicción; no se presentan como transacciones individuales. Los Excel son referencias analíticas estáticas, no la alimentación operacional.

La hoja «29 hojas Excel» incluye cada celda con contenido, incluidos los auxiliares no normalizables. Sus seis gráficos se reconstruyen con las mismas series/categorías del archivo, sin atribuirles valores vivos. «Análisis del ministro» recalcula rankings, matrices, exclusiones y subtotales. «Explorador general» conserva la apertura extendida y evolución mensual.

## Mapa completo

### desagregado ministerios ene-jun.xlsx (8 hojas)

| Hoja | Análisis incorporado |
|---|---|
| seguridad | Cuentas de Seguridad por capítulo; monto, participación y acumulado por bloque. |
| Hacienda | Cuentas de Hacienda por capítulo, incluida la apertura de transferencias. |
| educacion | Cuentas de Educación por capítulo y concentración. |
| salud | Cuentas de Salud por capítulo, incluidos préstamos / capítulo 800. |
| obras | Cuentas de Obras por capítulo. |
| sec gral | Cuentas de Secretaría General por capítulo. |
| planificacion | Cuentas de Planificación por capítulo. |
| desarrollo social | Cuentas de Desarrollo Social por capítulo. |

Las ocho selecciones originales están en el explorador de hojas; el ranking vivo admite las mismas jurisdicciones y además todos los organismos disponibles.

### desagregado ministerios ene-jun consolida bs y serv.xlsx (11 hojas)

| Hoja | Análisis incorporado |
|---|---|
| seguridad | Bienes y servicios 200+300 consolidados; otros capítulos separados. |
| Hacienda | Igual criterio para Hacienda. |
| educacion | Igual criterio para Educación. |
| salud | Igual criterio para Salud, incluido 800. |
| obras | Igual criterio para Obras. |
| sec gral | Igual criterio para Secretaría General. |
| planificacion | Igual criterio para Planificación. |
| desarrollo social | Igual criterio para Desarrollo Social. |
| BNS Y sERV | Dos presentaciones de la selección cuenta–jurisdicción; subtotales únicos por cuenta. |
| TRANSF | Tres cuentas de Seguridad: 513, 514 y 517. No equivale al total de transferencias provinciales. |
| Resumen de Bienes y Servicios | Selección ordenada por cuenta y apertura de jurisdicciones; duplicados conservados pero excluidos del subtotal. |

### Ejecucion Comp - fte 10 ene a jun.xlsx (5 hojas)

| Hoja | Análisis incorporado |
|---|---|
| resumen global | Matriz, columnas ocultas de modificaciones y personal, subtotales sin personal, porcentajes, acumulados y seis gráficos. Coparticipación y deuda separadas de Hacienda. |
| por jurisccion y grupo con cop | Tres universos con/sin personal y coparticipación; Top 8; ranking jurisdicción × rubro; rankings completos de B&S, transferencias y bienes de uso; presentación repetida y controles auxiliares originales. |
| con proyeccion | Ejecución, promedios mensuales, seis necesidades/metas manuales, diferencias, subtotal válido de ejecución y seis celdas auxiliares originales. |
| por rubro | Top 5 B&S, Top 6 transferencias, Top 7 bienes de uso; concentración respecto del rubro completo; promedios y totales de coparticipación, deuda y otros. |
| base | Matriz por jurisdicción, modificaciones presupuestarias, siete rubros y subtotales; fila de Oncología sin subtotal original. |

### desagregado partidas global ene-jun.xlsx (5 hojas)

| Hoja | Análisis incorporado |
|---|---|
| 200 | Ranking conjunto 200+300. Se conserva el porcentaje parcial original y se recalcula el total de todas las cuentas de la selección. |
| 300 | Ranking de servicios no personales; monto, porcentaje y acumulado. |
| 400 | Ranking de bienes de uso. |
| 500 | Ranking de transferencias, incluye 533 y excluye 571/587. |
| cop | Cuentas 571/587 y su apertura. |

## Reglas de cálculo

- Los filtros superiores aplican al dato vivo. Los valores Excel permanecen fijos y se identifican como referencia.
- La comparación orientativa está habilitada sólo para enero–junio 2026, fuente 10, Comprometido y sin filtros de jurisdicción/capítulo/subpartida. **El año de los Excel sigue sin confirmarse**: no constituye una conciliación contable estricta.
- El explorador conserva cada selección de cuentas y jurisdicciones. Los análisis ampliados permiten las 25 jurisdicciones de `base` o todos los organismos de la base viva.
- Transferencias en los análisis ministeriales incluye 533 y excluye 571/587. El explorador general separa 533 como Seguridad Social y lo explica.
- Top 5/6/7 se calcula respecto del rubro completo del universo elegido. Top 8 muestra tanto porcentaje del Top 8 como del universo sin personal, coparticipación ni deuda.
- Los rankings ordenan por monto con signo, no por valor absoluto. Acumulados y participaciones mantienen los ajustes negativos. Si el denominador es cero se muestra «—».
- Los promedios dividen por todos los meses solicitados, no sólo los que tienen registros. Los meses ausentes se advierten. El ritmo ×12 es una extrapolación simple, no un pronóstico ni una autorización presupuestaria.
- Créditos original/vigente son snapshots: se consulta el último mes disponible del rango, no se suman meses ni se anualizan.
- Modificación presupuestaria viva = vigente − original del mismo mes y universo. No se agrega al gasto ejecutado. La columna manual B de los Excel se conserva sin asumir que su metodología sea idéntica.
- Ausencia de registros se distingue de monto cero. Las claves repetidas se muestran y se excluyen de los subtotales de claves únicas.
- Los porcentajes originales se conservan sin corregir silenciosamente sus fórmulas. El porcentaje vivo de selección y el acumulado en orden Excel se rotulan por separado.

## Hallazgos que no deben replicarse como errores de cálculo

1. `base!J26` está vacío. El subtotal J27 omite $831.183.366,06. El total reportado es $1.547.024.452.813,25; el recalculado es $1.547.855.636.179,31. `C26` corresponde a Personal ($291.841.782,06), no a B&S; el resto son Transferencias.
2. `con proyeccion!P4:P27` suma B:N, mezclando ejecución semestral, promedios, necesidades y diferencias. El subtotal vivo suma sólo ejecución. C32:C33 no identifica concepto ni unidad; queda como auxiliar no interpretado.
3. `resumen global!J` reinicia varias veces el acumulado. El acumulado vivo recorre el orden completo sin esos reinicios.
4. La hoja global `200` incluye cuentas 300; D5:D53 sólo usa como denominador C5:C53 aunque hay montos hasta la fila 117. No sumar las hojas 200 y 300 entre sí.
5. La cuenta 363 reaparece en BNS Y sERV y Resumen de Bienes y Servicios. Se conservan las filas originales, sin duplicarlas en el subtotal vivo.
6. `por jurisccion y grupo con cop!C213`, rotulado como deuda, referencia C63 (B&S de Secretaría General). El bloque repetido de filas 221–297 conserva porcentajes que apuntan al primer bloque.

## Verificación reproducible

Extracción de originales (Python con openpyxl):

```sh
python3 scripts/audit-gasto-excel.py --directory /Volumes/SD/Descargas --output apps/api/data/gasto_excel_sheets.json
```

Pruebas de cálculo, inventario, fórmulas conservadas, ninguna cuenta omitida, ámbitos, duplicados, metas, snapshots, denominadores y ajustes negativos:

```sh
cd apps/api
node --test tests/gasto-desagregado.test.js tests/gasto-excel-analysis.test.js
RUN_GASTO_DB_TESTS=1 node --test tests/gasto-dashboard.integration.test.js
```

La integración es opt-in y de sólo lectura: invoca los manejadores con respuestas de prueba, sin crear usuarios ni tokens, y contrasta con SQL en seis cortes. La autenticación real de los endpoints permanece activa: solicitudes sin token reciben 403.

Resultado observado: 14 pruebas unitarias y 8 resultados de integración aprobados. Corte 2026 enero–junio / fuente 10 / Comprometido: $1.624.664.128.259,90; diferencias de control contra capítulos, rubros y matriz: $0. La selección de las 25 jurisdicciones suma $1.583.878.394.470,34; **no coincide automáticamente con la referencia** por igualar nombres de hojas o año operativo. Las diferencias por celda permiten investigarlo sin ocultar discrepancias.

TypeScript, ESLint de los tres componentes y compilación de producción se verifican con las herramientas del proyecto. La verificación visual autenticada requiere una sesión del usuario; no se elude el inicio de sesión.

## Selección múltiple de capítulos · 7 de septiembre de 2026

El filtro global «Capítulos» admite uno o varios códigos mediante casillas. Incluye un atajo «200 + 300 · Bienes y servicios» y un botón para volver a todos. Sin marcas no hay restricción de capítulo. Las opciones provienen del catálogo completo, no de los capítulos que sobrevivieron al filtro anterior, por lo que siempre se puede agregar o quitar otro capítulo.

La consulta envía `partid=200,300` (o la combinación elegida) al filtro SQL existente `partid = ANY(...)`, conservando fuente, jurisdicción, año, meses y estado. Totales, matrices, rankings, meses y modificaciones presupuestarias usan esa selección. Las referencias estáticas Excel no se modifican.

Verificación del 7 de septiembre: 24 resultados de prueba aprobados; se comprobó con datos vivos de Salud que 200+300 equivale a la suma de ambos capítulos y que agregar 400 incorpora exactamente ese capítulo. La compilación de producción y ESLint también pasaron. La prueba interactiva autenticada sigue pendiente de inicio de sesión.
