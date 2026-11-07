# Cambios del tablero de gastos · 6 de noviembre de 2026

Implementación local en `codex/mejoras-tablero-gastos`, a partir de `origin/main` (`584fa85`). Se hizo `git pull --ff-only` antes de modificar el código y se conservaron los archivos locales preexistentes sin seguimiento. La implementación no modifica los registros originales de gasto o ingresos. El despliegue fue solicitado tras la revisión visual.

## Criterios acordados

- Alcance funcional: los cambios anotados bajo «Salud» se aplican tanto al nivel general como a cualquier ministerio u organismo. Salud fue el ejemplo utilizado en la reunión y en la primera revisión. Total, etiquetas, evolución y nuevos indicadores comparten la misma implementación; los tops entre organismos sólo aparecen al comparar varias jurisdicciones.
- Al seleccionar un organismo desde el acceso general se utiliza todo su gasto dentro de los filtros superiores, incluso si no pertenece a la selección histórica de 25 jurisdicciones. Los permisos de cada cuenta siguen determinando qué instituciones puede consultar.
- Corte inicial: enero hasta el último mes calendario finalizado con registros de Comprometido, Ordenado y Crédito vigente en el alcance autorizado. El año también es relativo. Al verificar, el acceso general y Salud abren enero–octubre de 2026.
- Una caída en la cantidad de movimientos no demuestra falta de carga. La fecha inicial no constituye una certificación del cierre administrativo.
- Posición económica: RON + ROP **brutos provinciales** frente al gasto seleccionado. Los filtros de fuente, partida y jurisdicción afectan al gasto; los ingresos disponibles no tienen esas aperturas.
- 421 y 423 se presentan juntas como Construcciones y redeterminaciones en bienes de dominio privado. Los registros originales conservan sus códigos.

## Cobertura de las necesidades

| Necesidad | Comportamiento implementado |
| --- | --- |
| Total consolidado general y por organismo | Tarjeta de total seleccionado y totales en los cuadros por universo, para cualquier ministerio o jurisdicción. |
| Sin tops para un único organismo | Se omiten concentración Top 8 y tops entre jurisdicciones en todo corte individual. Se muestra composición y cuentas por partida. |
| Transferencias sin paréntesis | Etiqueta «Transferencias»; la definición permanece en la nota del resumen. |
| Evolución mensual independiente | Lectura por rubro precede al cuadro mensual de ancho completo; en teléfonos, tarjetas por mes con etiquetas e importes completos. |
| Tres mayores meses y máximo | Para gastos distintos de Personal, ambos indicadores por jurisdicción y rubro, junto al mes del máximo. Personal destaca el último mes del corte como referencia. |
| Último mes completo relativo | Se reemplaza el corte fijo por el último mes calendario cerrado disponible. |
| Agrupar columnas en Otros | Evolución y matrices reúnen los Otros anteriores (600/800), deuda, figurativos y seguridad social. Los totales concilian con el detalle. |
| Subir evolución y su compañero | Composición por partida y gráfico mensual preceden a concentración por rubro en Explorador general. |
| Orden por columna | Primer clic: mayor a menor; segundo: orden inverso. En teléfonos hay selector y botón de dirección. |
| Concentración en segunda pestaña | Explorador general abre todas las jurisdicciones y permite Top 8/Todas y con/sin personal. Conserva las exclusiones de coparticipación y deuda del bloque original. |
| Unificar cuentas y seleccionar partidas | Un bloque integra cuenta, ranking, participación, acumulado y apertura por jurisdicción. Tiene partidas múltiples, búsqueda y con/sin coparticipación (571/587). Los filtros locales se intersectan con el alcance superior. |
| Matriz y subtotales | Columnas agrupadas y totales. Los subtotales por organismo sin personal y sin coparticipación quedan en un cuadro desplegable para no ensanchar la matriz. |
| Ambos rankings debajo | Ranking jurisdicción × rubro y rankings por ministerio/partida se ubican después de cuentas y subtotales. |
| Personal y resto separados | Personal por jurisdicción, sin abrir subpartidas; Resto del gasto, con cuentas y aperturas por organismo. |
| Posición económica | Comparación mensual y totales de ingresos brutos, gasto y diferencia, con alcance explicado. Disponible únicamente para la cuenta `admin` con alcance global, tanto en la pestaña como en la API. El rol central de administrador no habilita otras cuentas. |
| Fuentes múltiples | Casillas en Alcance de la consulta. Todas elimina la restricción y el catálogo sigue disponible después de filtrar. |
| 421 y 423 juntas | Se suman una sola vez en cuentas, aperturas por jurisdicción y rankings por ministerio. Buscar cualquiera de los códigos devuelve el grupo. |

## Cálculos y faltantes

- Promedio mensual = total / meses solicitados. En Personal, «mes anterior» es el último mes del corte: octubre para enero–octubre. Es la referencia destacada y la base para comparar la meta y calcular el ritmo × 12. Si falta ese mes para el organismo, se indica sin registros y no se sustituye por otro. En los demás rubros, el ritmo simple conserva promedio mensual × 12. Los ritmos son referencias, no pronósticos.
- Tres mayores y máximo: primero se suman todos los movimientos de cada mes, organismo y rubro agrupado. Un mes cargado sin movimientos del rubro aporta cero; un mes completamente ausente no se inventa. Con menos de tres meses observados se promedian los disponibles y se informa su cantidad.
- Buscar cuentas conserva el denominador del conjunto filtrado; cambiar partidas o coparticipación lo recalcula. Los ajustes negativos mantienen su signo.
- RON usa `SUM(total_general)`. ROP reutiliza `services/rop-source.js`: nulos tributarios individuales como cero y mes ausente como faltante. La completitud de ingresos reutiliza el criterio comparativo existente del tablero.
- Una ausencia de RON, ROP o gasto impide calcular la diferencia mensual y el total comparable del rango. Los créditos no se comparan como flujos: la pestaña solicita Comprometido u Ordenado.
- Verificado el 6/11/2026: ROP llega a septiembre, mientras RON y gastos tienen octubre. Enero–octubre no tiene saldo calculable y se indica «Octubre: falta ROP». El selector permite comparar enero–septiembre.

## Verificación

- Producción y TypeScript: compilación aprobada. ESLint aprobado en componentes modificados y modelo de vista.
- API: 77 pruebas aprobadas, incluidas reglas de corte, fuentes, cuentas agrupadas, faltantes y exclusividad de la cuenta admin antes de consultar ingresos.
- Interfaz: 22 pruebas de cálculos, renderizado y acceso cubren sumas mensuales, tres mayores, máximo, denominadores, orden, exclusiones y universo. El renderizado comprueba el nivel general y Seguridad, Educación, Salud, Obras Públicas e INVICO, tanto desde acceso general como institucional.
- Integración de sólo lectura: 9 resultados de la batería anterior y 5 de la nueva, aprobados contra PostgreSQL. Conciliación de cortes, fuentes múltiples, mensualidad por organismo, cuenta 421/423, ingresos brutos y acceso de Salud.
- Navegador local: acceso general y Salud; corte inicial, fuentes múltiples y retorno a Todas; Top 8/Todas y personal; orden por columna; cuentas y grupo 421/423; comparación económica y selección de crédito. Revisión en escritorio y teléfono, con capturas en `output/playwright/`.

Comandos reproducibles:

```sh
cd apps/api
npm test
RUN_GASTO_DB_TESTS=1 node --test tests/gasto-dashboard.integration.test.js tests/gasto-mejoras.integration.test.js
```

```sh
cd apps/web
npm run test:gasto
npm run build
```

## Auditoría visual contra la versión publicada

La galería de auditoría, conservada como artefacto local en `output/playwright/auditoria_local_vs_linea_20261106/index.html`, reúne capturas nuevas de la versión publicada, obtenidas después del inicio de sesión, y de la implementación local. Conserva las imágenes originales y contrasta las 17 necesidades de la reunión. La galería y sus imágenes se entregan localmente y no forman parte del paquete de producción. Cada par explica los filtros y las diferencias deliberadas de alcance. Incluye escritorio y vista angosta, Salud, Educación e INVICO, cuentas, concentración, fuentes e ingresos.

Durante esta auditoría se corrigieron tres defectos de presentación: nombres partidos en la primera columna de la matriz, menú de partidas tapado por el cuadro siguiente y unidad del total recortada al combinar fuentes. La galería conserva el antes y el después. Se recompiló y se verificaron los resultados en el navegador.

Se dejan visibles dos criterios para revisión del equipo: el consolidado general conserva la selección histórica de 25 organismos mientras el explorador usa Todos; los resúmenes incluyen seguridad social en Transferencias mientras las matrices la agrupan en Otros. La comparación de enero–octubre sigue indicando el faltante de ROP de octubre; enero–septiembre permite comparar el rango completo. La publicación de esta revisión está autorizada por el usuario.

## Correcciones posteriores a la auditoría

- Explorador: primero Lectura por rubro, luego Evolución mensual por rubro, en bloques de ancho completo.
- Orden comprobado: la galería incorpora la matriz publicada anterior al despliegue junto a la ordenada local, con el mismo período, fuente y universo.
- Personal: el último mes del corte reemplaza Top 3 y máximo como indicador principal. Los otros rubros conservan los indicadores nuevos.
- Posición económica: pestaña independiente de ingresos frente a gastos, reservada temporalmente a la cuenta `admin` con alcance global. Las demás cuentas, incluso otros administradores centrales, no ven la pestaña y reciben HTTP 403 en el endpoint.
- El flujo de producción ejecuta las pruebas de gastos de la interfaz además de las de API y sesión central antes de compilar y reiniciar los servicios.
