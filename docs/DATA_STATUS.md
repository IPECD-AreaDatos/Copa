# Actualización de datos

La hoja `/copa/actualizacion-datos` está disponible sólo para el usuario `admin`.
El endpoint `GET /api/admin/data-status` exige JWT y el mismo permiso de administrador
que la auditoría. Las respuestas no se almacenan en caché. Se consulta al entrar y
al pulsar **Actualizar ahora**, sin sondeo automático.

## Fuentes y significado de las fechas

| Fuente | Último dato | Último cambio |
| --- | --- | --- |
| `datalake_economico.ipc` | Último mes con índice positivo, con los cuatro filtros de nivel general del resolver | Máximo `updated_at` de esa población |
| `datalake_economico.rem_precios_minoristas` | Último mes proyectado del lote con máximo `fecha_consulta` | Máximo `updated_at` del mismo lote |
| `copa_gastos` | Máximo período disponible | Máximo `updated_at` de la tabla |
| `copa_gastos_fte` | Máximo año/mes disponible | Máximo `updated_at` de la tabla |
| `copa_recursos_origen_nacional` | Último día cuya suma de `total_general` es estrictamente positiva | No existe campo de fecha de carga |
| `copa_reca_rop` | Último mes cuya suma de los siete tributos es estrictamente positiva, con la misma expresión del Análisis Mensual RON | No existe campo de fecha de carga |

Para RON y ROP se informa también la última fecha registrada aunque sólo tenga
ceros o nulos. El importe mostrado corresponde al último dato positivo. No se
sustituyen fechas ausentes por la fecha de consulta ni se infiere completitud.
Una lectura correcta de la fuente no acredita que cada mes esté completo.

En ROP, los campos individuales `NULL` cuentan como cero según el criterio
confirmado el 19/10/2026. El tablero y el monitor comparten la expresión de
`apps/api/services/rop-source.js`; una fila mensual ausente permanece ausente.
Por ejemplo, septiembre de 2026 contiene valores en cinco tributos y `NULL` en
`premios` y `apremios_concursos_quiebras_reg_judiciales`: el total es
$42.793.605.727,27. La prueba de SQL de sólo lectura se ejecuta con
`COPA_DB_TESTS=1 npm run test:rop-source` desde `apps/api`.

Los `updated_at` con zona horaria de gastos se muestran en hora argentina. Los de
IPC y REM no tienen zona horaria: se muestran como están almacenados y se indica
esa limitación. `checked_at` representa cuándo terminó la consulta del monitor.

El selector de inflación cubre los últimos 24 meses hasta el mes actual argentino.
Utiliza `buildInflationResolver`, `IPC_QUERY` y `REM_QUERY`, compartidos con el
tablero: prioridad oficial, encadenamiento REM cuando falta IPC, variación
interanual nula cuando falta el índice actual o el comparable. `fecha_consulta`
se presenta con su nombre operativo; no se deduce una fecha de publicación externa.
El Análisis Anual RON comparte este cálculo para los datos desde 2025; los años
anteriores conservan su fuente histórica.

Las fuentes se consultan de manera independiente; el fallo de una queda visible
sin ocultar las que respondieron. Este monitor revisa las fuentes SQL en vivo de
los módulos indicados. No certifica la regeneración de archivos históricos JSON,
otros módulos ni la salud de todos los endpoints del tablero.
