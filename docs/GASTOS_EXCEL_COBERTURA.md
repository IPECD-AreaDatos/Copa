# Gastos desagregados: cobertura de los cuatro Excel

Revisión: 23 de septiembre de 2026. Estado: cambios locales para revisión.

## Resultado y fuente

Se inventariaron las **29 hojas, 9.899 celdas con contenido, 2.524 fórmulas y 6 gráficos**. El archivo `apps/api/data/gasto_excel_sheets.json` conserva valores guardados, fórmulas, comentarios, rangos, columnas/filas ocultas y referencias de series. El 23 de septiembre se verificó que los SHA-256 de los cuatro XLSX originales coinciden con ese inventario. Los originales no se modifican ni se ejecutan macros o instrucciones contenidas en ellos.

El tablero usa `copa_gastos_fte` como fuente viva: año, mes, jurisdicción, fuente, programa, subprograma (`sub_prof`), proyecto, obra, partida (`partid`, códigos 100, 200, 300, etc.), subpartida y estado. Las respuestas se agregan a cuenta × jurisdicción; no se presentan como transacciones individuales. Los Excel son referencias analíticas estáticas, no la alimentación operacional.

La interfaz muestra **«Análisis consolidado»** y **«Explorador general»**, sin nombres de archivos, hojas, fórmulas ni comparaciones con valores estáticos. El primero recalcula los universos, rankings, matrices, exclusiones y subtotales. El segundo muestra todas las jurisdicciones y cuentas del corte, la evolución mensual, la proyección simple, el ranking global de cuentas por grupo y los controles de consistencia. El inventario y la ruta autenticada `/desagregados/excel/:id` quedan para auditoría interna; el endpoint del tablero no entrega el inventario ni los valores estáticos.

Las seis gráficas originales representan totales por jurisdicción y distribución por rubro. Sus medidas están en la matriz, los rankings y las barras del tablero; no se replican como seis visualizaciones separadas. Las seis metas escritas manualmente no se precargan porque no están confirmadas como metas oficiales ni tienen fecha de vigencia verificada. La comparación analítica se conserva mediante una meta mensual que el usuario puede ingresar para una jurisdicción y rubro del corte actual.

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

Los ocho organismos se pueden elegir en «Rankings por ministerio y partida»; el selector también admite los demás organismos con datos.

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
| con proyeccion | Ejecución, promedio mensual y ritmo anual por jurisdicción y rubro en «Explorador general». La comparación con una meta ingresada conserva la operación analítica. Los seis valores manuales y los auxiliares sin concepto o unidad no se publican. |
| por rubro | Top 5 B&S, Top 6 transferencias, Top 7 bienes de uso; concentración respecto del rubro completo; promedios y totales de coparticipación, deuda y otros. |
| base | Matriz por jurisdicción, modificaciones presupuestarias, siete rubros y subtotales; fila de Oncología sin subtotal original. |

### desagregado partidas global ene-jun.xlsx (5 hojas)

| Hoja | Análisis incorporado |
|---|---|
| 200 | Ranking conjunto 200+300 en «Ranking global de cuentas», con denominador sobre todas las cuentas del grupo. El porcentaje parcial original no se reproduce. |
| 300 | Ranking de servicios no personales por partida, con monto, porcentaje y acumulado. |
| 400 | Ranking de bienes de uso por partida, con monto, porcentaje y acumulado. |
| 500 | Ranking de transferencias con 533 y sin 571/587. |
| cop | Ranking de las cuentas 571/587; apertura por jurisdicción en «Cuenta → jurisdicciones y subtotales». |

## Reglas de cálculo

- Los filtros superiores aplican a las dos vistas y todos sus resultados se calculan sobre el dato vivo. El año de los archivos sigue sin confirmarse; el tablero no presenta diferencias numéricas contra ellos.
- «Análisis consolidado» permite las 25 jurisdicciones de `base` o todos los organismos con datos. La selección de 25 queda rotulada como tal y nunca se presenta como cobertura provincial completa.
- «Explorador general» usa todas las jurisdicciones del corte elegido. El ranking global de cuentas admite 200+300, cada partida, transferencias 500 sin coparticipación y coparticipación 571/587, siempre con denominador del grupo completo.
- Transferencias en los análisis ministeriales incluye 533 y excluye 571/587. El explorador general separa 533 como Seguridad Social y lo explica.
- Top 5/6/7 se calcula respecto del rubro completo del universo elegido. Top 8 muestra la participación individual en el universo sin personal, coparticipación ni deuda y el porcentaje acumulado respecto del total del Top 8, que llega a 100 % en la última fila.
- En «Cuenta → jurisdicciones y subtotales», la partida 100 se agrupa una sola vez por ministerio o jurisdicción, sin abrir subpartidas. Las demás cuentas excluyen la partida 100 y calculan su participación sobre ese universo reducido. «Explorador general» conserva el detalle de la partida 100.
- Los rankings ordenan por monto con signo, no por valor absoluto. Acumulados y participaciones mantienen los ajustes negativos. Si el denominador es cero se muestra «—».
- Los promedios dividen por todos los meses solicitados, no sólo los que tienen registros. Los meses ausentes se advierten. El ritmo ×12 es una extrapolación simple, no un pronóstico ni una autorización presupuestaria.
- Créditos original/vigente son snapshots: se consulta el último mes disponible del rango, no se suman meses ni se anualizan.
- Modificación presupuestaria viva = vigente − original del mismo mes y universo. No se agrega al gasto ejecutado. La columna manual B original no se usa porque su metodología no está documentada.
- Ausencia de registros se distingue de monto cero. Las claves repetidas de las planillas no se suman dos veces: los rankings se recalculan desde las cuentas únicas de la base viva.
- Los porcentajes y acumulados del tablero se recalculan desde los montos del corte, sin copiar fórmulas o denominadores parciales de las planillas.

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

Validación local del 23 de septiembre: 16 pruebas unitarias y 9 resultados de integración aprobados. En los seis cortes consultados, el total del tablero concilió con SQL y los tres controles de partida, rubro y matriz cerraron dentro de la tolerancia de centavos. El endpoint principal ya no envía valores, inventario ni análisis de hojas; la ruta autenticada de auditoría sigue disponible para cotejos internos.

TypeScript, ESLint de los componentes activos y compilación de producción se verificaron con las herramientas del proyecto. En la interfaz autenticada local se comprobaron las dos vistas, la ausencia de menciones visibles a los archivos, los rankings globales 200+300, transferencias con 533 y coparticipación 571/587, la comparación con una meta ingresada y los tres controles de consistencia en «OK» para el corte predeterminado.

## Selección múltiple de partidas · 7 de septiembre de 2026

El filtro global «Partidas» admite uno o varios códigos mediante casillas. Incluye un atajo «200 + 300 · Bienes y servicios» y un botón para volver a todas. Sin marcas no hay restricción de partida. Las opciones provienen del catálogo completo, no de las partidas que sobrevivieron al filtro anterior, por lo que siempre se puede agregar o quitar otra partida.

La consulta envía `partid=200,300` (o la combinación elegida) al filtro SQL existente `partid = ANY(...)`, conservando fuente, jurisdicción, año, meses y estado. Totales, matrices, rankings, meses y modificaciones presupuestarias usan esa selección. El inventario documental interno permanece sin cambios.

Verificación histórica del 7 de septiembre: 24 resultados de prueba aprobados; se comprobó con datos vivos de Salud que 200+300 equivale a la suma de ambos capítulos y que agregar 400 incorpora exactamente ese capítulo. La compilación de producción y ESLint también pasaron. La prueba interactiva de esa fecha estaba pendiente de inicio de sesión; la revisión autenticada del 23 de septiembre figura arriba.
