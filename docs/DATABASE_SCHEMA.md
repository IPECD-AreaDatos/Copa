# Esquema y Conexiones de Base de Datos - Tablero COPA

Este documento detalla la infraestructura de conexión, los parámetros de configuración en el entorno, y la estructura de tablas, vistas, relaciones y la lógica de integración de datos del Tablero COPA.

---

## 1. Conexión a las Bases de Datos

El sistema utiliza un único servidor PostgreSQL (`149.50.145.182`) que aloja dos bases de datos diferenciadas por su propósito:

| Base de Datos | Archivo de Conexión | Propósito / Datos Contenidos |
| :--- | :--- | :--- |
| **`datalake_economico`** | [`apps/api/db_datalake.js`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/api/db_datalake.js) | Contiene datos económicos generales: Índice de Precios al Consumidor (IPC), Expectativas del REM (Banco Central) para proyecciones, e información consolidada de empleo y salarios (`v_analisis_personal_completo`). |
| **`datos_tablero`** | [`apps/api/db.js`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/api/db.js) | Contiene los datos frescos específicos del Tablero Copa: Recursos de Origen Nacional (RON), Recursos de Origen Provincial (ROP), ejecución presupuestaria de gastos gubernamentales, tablas de usuarios y auditoría de accesos. |

### Configuración del Entorno (`.env`)
Las conexiones se parametrizan a través de variables de entorno definidas en el archivo `.env` en la raíz del monorepo:

```ini
PG_HOST=149.50.145.182
PG_PORT=5432
PG_USER=usuario_de_db
PG_PASSWORD=password_de_db
PG_DATABASE=datos_tablero
```

*Nota: La conexión a `datalake_economico` reutiliza los parámetros del host, puerto y credenciales, pero sobrescribe el nombre de la base de datos a `datalake_economico` de forma dura en el módulo `db_datalake.js`.*

---

## 2. Base de Datos: `datos_tablero`

Esta base de datos contiene los datos frescos de coparticipación nacional, recaudación provincial, presupuestos de gastos del gobierno de Corrientes, credenciales de usuarios y registros de auditoría de uso.

### A. Tabla: `copa_recursos_origen_nacional` (Recursos Nacionales - RON)
Almacena el detalle diario de las transferencias de Recursos de Origen Nacional (recaudación por coparticipación federal y leyes especiales).

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `fecha` | `DATE` / `TIMESTAMP` | Fecha de la transferencia diaria. |
| `total_general` | `NUMERIC` | Recaudación bruta total diaria girada por Nación a la Provincia. |
| `iva_ley_23966` | `NUMERIC` | Retenciones de IVA bajo Ley 23966. |
| `imp_combustibles_vialidad` | `NUMERIC` | Retenciones del Impuesto a los Combustibles destinadas a Vialidad. |
| `imp_combustibles_fonavi` | `NUMERIC` | Retenciones del Impuesto a los Combustibles destinadas a FONAVI. |
| `imp_bienes_personales_ley_23966` | `NUMERIC` | Impuesto sobre Bienes Personales de la Ley 23966. |

*   **Lógica de Negocio (RON Neta)**:
    La API calcula el RON neto descontando del total general los fondos de afectación específica y el IVA residual (según reglas históricas para años anteriores a 2026):
    $$\text{RON Neto} = \text{total\_general} - (\text{imp\_combustibles\_vialidad} + \text{imp\_combustibles\_fonavi} + \text{iva\_ley\_23966} + \text{imp\_bienes\_personales\_ley\_23966})$$

---

### B. Tabla: `copa_reca_rop` (Recursos Provinciales - ROP)
Almacena la recaudación mensual agregada de los tributos de origen provincial.

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `anio` | `INTEGER` | Año fiscal (ej. 2025). |
| `mes` | `INTEGER` | Mes del año (1 a 12). |
| `inmobiliario_rural` | `NUMERIC` | Recaudación del Impuesto Inmobiliario Rural. |
| `tasas` | `NUMERIC` | Ingresos por tasas administrativas. |
| `marcas_y_senales` | `NUMERIC` | Ingresos por marcas y señales de ganado. |
| `sellos` | `NUMERIC` | Recaudación por Impuesto de Sellos. |
| `premios` | `NUMERIC` | Ingresos de loterías y premios. |
| `ingresos_brutos` | `NUMERIC` | Recaudación del Impuesto sobre los Ingresos Brutos (principal tributo). |
| `apremios_concursos_quiebras_reg_judiciales` | `NUMERIC` | Ingresos judiciales asociados a recaudación fiscal. |

*   **Cálculo de ROP Bruta**:
    La API agrupa y suma todos estos tributos mensuales para determinar los recursos provinciales corrientes:
    $$\text{ROP Bruta} = \text{inmobiliario\_rural} + \text{tasas} + \text{marcas\_y\_senales} + \text{sellos} + \text{premios} + \text{ingresos\_brutos} + \text{apremios\_concursos...}$$

---

### C. Tabla: `copa_gastos` (Ejecución Presupuestaria de Gastos)
Registra las transacciones del presupuesto provincial, incluyendo los sueldos gubernamentales.

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `periodo` | `DATE` / `TIMESTAMP` | Periodo mensual del gasto. |
| `jurisdiccion` | `VARCHAR` | Ministerio u organismo que ejecuta el gasto (ej. MINISTERIO DE SALUD PÚBLICA). |
| `tipo_financ` | `INTEGER` | Código de fuente de financiamiento (ej. 10 = Tesoro Provincial, 14 = Coparticipación). |
| `partida` | `VARCHAR` | Clasificador por objeto del gasto (ej. GASTOS EN PERSONAL). |
| `estado` | `VARCHAR` | Estado de la ejecución presupuestaria (ej. ORDENADO, COMPROMETIDO, DEVENGADO). |
| `monto` | `NUMERIC` | Importe en pesos del gasto. |

*   **Lógica de Masa Salarial**:
    Para obtener el costo de la nómina pública (Masa Salarial), se filtra la tabla bajo los siguientes criterios:
    - Estado de ejecución: `'ORDENADO'` (mayúsculas)
    - Partida: que contenga `'GAST% EN PERSONAL%'` (ej. Gastos en Personal Permanente, Transitorio)
    - Fuentes de financiamiento: `10` y `14` (recursos del tesoro y coparticipación)

#### Fuente detallada: `copa_gastos_fte`
La vista **Gastos desagregados** utiliza esta tabla como fuente de mayor granularidad. Cada registro conserva las dimensiones operativas del presupuesto antes de agregarse para el navegador.

| Campo | Tipo | Uso en el desglose |
| :--- | :--- | :--- |
| `mes`, `anio` | `INTEGER` | Corte temporal del registro. |
| `jurisdiccion` | `INTEGER` | Código del organismo ejecutor. |
| `codigo_fuente` | `INTEGER` | Fuente de financiamiento. |
| `programa`, `sub_prof`, `py`, `a_obra` | `INTEGER` | Dimensiones operativas del programa, subprograma, proyecto y obra. |
| `partid` | `INTEGER` | Capítulo presupuestario: 100, 200, 300, etc. |
| `sub_partid` | `INTEGER` | Cuenta presupuestaria mostrada en el detalle. |
| `tipo_de_g` | `VARCHAR` | Estado del registro, por ejemplo `Comprometido`, `Cred Ori` o `Cred Vig`. |
| `val` | `NUMERIC` | Monto del gasto. |

La API agrupa por capítulo, cuenta, jurisdicción y mes, conservando la cobertura de filas de origen. Las etiquetas de jurisdicción y las descripciones de cuentas se mantienen como catálogos de referencia mientras no exista una tabla de dimensiones oficial asociada.

---

### D. Vista: `v_gastos_agrupados`
Vista precalculada en la base de datos para facilitar el análisis del módulo **Gasto**. Agrupa la ejecución presupuestaria mensual por campos clave.

*   **Estructura**: `periodo`, `jurisdiccion`, `partida`, `fuente`, `estado`, `monto` (agrupado).
*   **Uso**: Es consumida directamente por `/api/gastos/resumen` y `/api/gastos/filtros` para los paneles interactivos y heatmaps.

---

### E. Tabla: `public.usuarios_tableros` (Usuarios)
Contiene las credenciales y permisos de los usuarios del tablero.

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id_usuario` | `SERIAL` (PK) | Identificador único del usuario. |
| `username` | `VARCHAR` | Nombre de usuario único (ej. `admin`, `jpvaldes`, `invitado`). |
| `password_hash` | `VARCHAR` | Contraseña cifrada con Bcrypt o texto plano (migrado automáticamente al hacer login). |
| `tablero_acceso` | `VARCHAR` | Tipo de acceso permitido (ej. `coparticipacion` para acceder a la aplicación). |
| `activo` | `BOOLEAN` | Estado de habilitación de la cuenta. |

---

### F. Tabla: `public.coparticipacion_registros` (Auditoría / Telemetría)
Registra la telemetría automática de peticiones a la API y el log manual de clics enviado desde la interfaz Next.js.

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id_registro` | `SERIAL` (PK) | Identificador único del registro. |
| `fecha_hora` | `TIMESTAMP` | Fecha y hora del evento (por defecto `CURRENT_TIMESTAMP`). |
| `id_usuario` | `INTEGER` (FK) | Relación al usuario que realizó la acción (`public.usuarios_tableros.id_usuario`). |
| `seccion_tablero` | `VARCHAR` | Módulo o sección visitada (ej. `Inicio`, `Monitor Mensual`, `Gasto`). |
| `accion` | `VARCHAR` | Acción ejecutada (ej. `GET /api/ron/annual-monitor`, `Export Excel`). |
| `detalle_interaccion` | `JSON` / `TEXT` | Metadatos de la petición (parámetros de consulta, consultas sql, IP, user-agent). |
| `ip_cliente` | `VARCHAR` | Dirección IP del cliente de donde proviene la petición. |

---

## 2. Base de Datos: `datalake_economico`

Contiene variables macroeconómicas globales e información consolidada de empleo y salarios de la provincia que no corresponden a la operación cotidiana de la copa.

### A. Tabla: `ipc` (Índice de Precios al Consumidor)
Almacena el índice de inflación del INDEC.

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `fecha` | `DATE` / `TIMESTAMP` | Periodo mensual del índice. |
| `id_region` | `INTEGER` | Identificador de región (1 = Total País, 4 = Región NEA, etc.). |
| `id_categoria` | `INTEGER` | Categoría de bienes y servicios. |
| `id_division` | `INTEGER` | División del clasificador IPC. |
| `id_subdivision` | `INTEGER` | Subdivisión del clasificador. |
| `valor` | `NUMERIC` | Índice base del IPC para el mes. |

*   **Filtro NEA**: Para ajustar valores por la inflación correspondiente a Corrientes, las consultas de la API filtran por `id_region = 1` (Nivel General), `id_categoria = 1`, `id_division = 1`, `id_subdivision = 1`.

---

### B. Vista: `v_analisis_personal_completo` (Estadísticas Salariales Consolidadas)
Vista analítica que reúne datos de la masa salarial del SISPER, empleados públicos y la canasta básica.

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `anio` | `VARCHAR` / `INTEGER` | Año fiscal. |
| `mes` | `INTEGER` | Mes calendario. |
| `salario_promedio` | `NUMERIC` | Salario neto promedio ponderado del sector público. |
| `salario_promedio_anterior` | `NUMERIC` | Salario promedio del mismo mes del año anterior. |
| `cantidad_empleados` | `INTEGER` | Cantidad total de agentes activos cargados en el sistema. |
| `var_nominal_ia` | `NUMERIC` | Variación nominal interanual del salario promedio (ej. 1.25 = +125%). |
| `var_real_ia` | `NUMERIC` | Variación real interanual ajustada por inflación. |
| `cbt_nea` | `NUMERIC` | Valor monetario de la Canasta Básica Total (CBT) regional NEA medida por INDEC. |
| `cbt_ratio` | `NUMERIC` | Relación de poder de compra (cuántas canastas básicas cubre un salario promedio). |
| `ipc_valor` | `NUMERIC` | Valor del IPC del mes. |
| `ipc_valor_anterior` | `NUMERIC` | Valor del IPC del mismo mes del año anterior. |

---

### C. Tabla: `rem_precios_minoristas` (Expectativas del REM)
Contiene las proyecciones inflacionarias informadas por el Relevamiento de Expectativas de Mercado (REM) del Banco Central de la República Argentina (BCRA).

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `fecha` | `DATE` / `TIMESTAMP` | Periodo mensual que se proyecta. |
| `mediana` | `NUMERIC` | Tasa mensual de inflación esperada (ej. 3.5 = +3.5%). |
| `fecha_consulta` | `DATE` / `TIMESTAMP` | Fecha de publicación del informe del REM (se filtra por la última disponible). |

*   **Lógica de Proyección de IPC**:
    Cuando un mes no posee datos oficiales de `ipc` cargados, la API utiliza el servicio [`projections.js`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/api/services/projections.js) para encadenar las variaciones esperadas del REM a partir del último valor real disponible de IPC:
    $$\text{IPC Proyectado} = \text{IPC Último Oficial} \times \prod_{m} (1 + \text{mediana}_{m}/100)$$

---

## 3. Diagrama de Relaciones Lógicas

Las bases de datos se comunican lógicamente del siguiente modo:

```
[datos_tablero]
+---------------------------+       +-------------------------------+
|     usuarios_tableros     |       |    coparticipacion_registros  |
|---------------------------|       |-------------------------------|
| PK  id_usuario            |<------+ FK  id_usuario                |
|     username              |       |     fecha_hora                |
|     password_hash         |       |     seccion_tablero           |
|     activo                |       |     accion                    |
+---------------------------+       +-------------------------------+

+---------------------------+       +-------------------------------+
|        copa_gastos        |       |      v_gastos_agrupados       |
|---------------------------|       |-------------------------------|
|     periodo               |       |     (Vista basada en          |
|     jurisdiccion          |       |      copa_gastos)             |
|     monto                 |       +-------------------------------+
+---------------------------+

[datalake_economico]
+---------------------------+       +-------------------------------+
|            ipc            |       |  v_analisis_personal_completo |
|---------------------------|       |-------------------------------|
|     fecha                 |       |     anio, mes                 |
|     id_region             |       |     salario_promedio          |
|     valor                 |       |     cantidad_empleados        |
+---------------------------+       |     ipc_valor                 |
                                    +-------------------------------+
                                                    ^
                                                    | (Proyecciones)
                                    +-------------------------------+
                                    |     rem_precios_minoristas    |
                                    +-------------------------------+
```
