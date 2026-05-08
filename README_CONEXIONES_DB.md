# Documentación de Conexiones de Datos - IPECD Dashboard

Este documento detalla la relación entre los endpoints de la API y las tablas/vistas en los servidores de PostgreSQL.

## 1. Bases de Datos Utilizadas

| Base de Datos | Servidor | Propósito |
| :--- | :--- | :--- |
| `datalake_economico` | 149.50.145.182 | Datos históricos, RON, Personal e IPC. |
| `datos_tablero` | 149.50.145.182 | Datos específicos del Tablero Copa y registros de auditoría. |

---

## 2. Mapeo de Endpoints y Tablas

### A. Recursos de Origen Nacional (RON)
*   **Endpoint**: `/api/ron/annual-monitor`
*   **Base de Datos**: `datalake_economico`
*   **Vista Principal**: `v_ron_mensual_completo`
*   **Lógica**: 
    *   Extrae `ron_bruto` y `ron_neto` agregados por año y mes.
    *   Cruza con la tabla `ipc` para obtener variaciones reales.
    *   **Ajuste de Escala**: La base de datos almacena valores en **pesos brutos**. Para mantener la paridad con la versión anterior del dashboard, la API divide estos valores por `1,000,000` (conversión a Millones). El frontend recibe estos valores y les aplica el formato de "Billones" (donde 1.0 Billón = 1,000,000 Millones).

### B. Masa Salarial (Personal)
*   **Endpoint**: `/api/ron/annual-monitor` (Cruza datos RON con Personal)
*   **Base de Datos**: `datalake_economico`
*   **Vista Principal**: `v_analisis_personal_completo`
*   **Columna Clave**: `masa_salarial`.
*   **Lógica**: Se utiliza para calcular la cobertura de la masa salarial respecto a los ingresos de coparticipación.

### C. Gastos de la Administración Pública
*   **Endpoints**: 
    *   `/api/gastos/all-data`: Consulta la tabla base `copa_gastos`.
    *   `/api/gastos/resumen`: Utiliza la vista `v_gastos_agrupados`.
*   **Base de Datos**: `datos_tablero`
*   **Tabla Principal**: `copa_gastos`
*   **Vista Principal**: `v_gastos_agrupados` (Agregación mensual por jurisdicción, partida y fuente).
*   **Columnas**: `monto`, `jurisdiccion`, `finalidad`, `subfinalidad`.
*   **Ajuste de Tipos**: Se agregó un `parseFloat` en el backend para manejar el tipo `NUMERIC` de PostgreSQL que llegaba como string, corrigiendo errores de cálculos (`NaN%`) en el frontend.
*   **Lógica de Acumulación (Heatmap)**: Se corrigió la función `computeHeatmap` en el frontend para que solo acumule montos correspondientes al **año fiscal actual** (detectado automáticamente por el último período disponible). Esto evita que los datos de años anteriores inflen los porcentajes de ejecución del año en curso.

---

## 3. Pendientes (Datos Faltantes)

Actualmente, las siguientes tarjetas en la sección de **Análisis Anual** no tienen una fuente de datos identificada en las bases de datos consultadas:

1.  **Recursos de Origen Provincial (ROP)**: No se localizó una tabla o vista equivalente a `v_ron_mensual_completo` para ingresos provinciales en `datalake_economico`.
2.  **Distribución Municipal**: No se encontró la tabla de distribución a municipios por origen (Nacional/Provincial).

> [!TIP]
> Si estos datos se encuentran en una base de datos distinta a las mencionadas (ej. `dwh_economico` o un esquema distinto), favor de notificar para actualizar los mapeos.

---

## 4. Estructura de Conexión en el Código
*   `apps/api/db_datalake.js`: Conexión a `datalake_economico`.
*   `apps/api/db.js`: Conexión a `datos_tablero`.
*   `apps/api/routes/ron.js`: Lógica de agregación anual y cálculo de variaciones.
*   `apps/api/routes/gastos.js`: Consulta directa de ejecución presupuestaria.
