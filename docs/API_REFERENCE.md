# Referencia de la API - Tablero COPA

El servidor backend del proyecto es una API REST construida con **Node.js** y **Express** que por defecto escucha en el puerto `4000` (`http://localhost:4000/api`).

---

## 1. Seguridad y Autenticación

### Middleware: `authMiddleware`
La mayoría de los endpoints analíticos de la API requieren un token JWT válido enviado en la cabecera HTTP de la petición:

```http
Authorization: Bearer <token_jwt_aqui>
```

- Si el token falta, retorna un estado `403 Forbidden` (`{"message": "Token requerido para autenticación"}`).
- Si el token ha expirado o tiene firma inválida, retorna un estado `401 Unauthorized` (`{"message": "Token inválido o expirado"}`).

---

## 2. Endpoints Públicos

### Health Check
*   **Ruta**: `GET /api/health`
*   **Descripción**: Verifica el estado de salud del servicio y de la conexión a la base de datos.
*   **Respuesta**:
    ```json
    {
      "status": "ok",
      "service": "IPECD Copa API",
      "db": "connected",
      "timestamp": "2026-06-09T23:20:00.000Z"
    }
    ```

### Datos de Inicio (Home Dashboard)
*   **Ruta**: `GET /api/dashboard/home`
*   **Descripción**: Devuelve la información agregada para el panel principal y gráficos consolidados históricos. Este endpoint es público para permitir la renderización inicial del portal.
*   **Respuesta**:
    ```json
    {
      "meta": {
        "default_period_id": "2026-04",
        "available_periods": [
          { "id": "2026-05", "label": "Mayo", "month": 5, "year": 2026 }
        ]
      },
      "data": {
        "2026-04": {
          "kpi": {
            "recaudacion": { "bruta_current": 45120.5, "ipc_missing": false },
            "rop": { "bruta_current": 12500.1 },
            "resumen": { "total_recursos_brutos_var_real": 2.45 },
            "masa_salarial": {
              "current": 18200.3,
              "cobertura_current": 31.58,
              "var_real": -1.2,
              "is_incomplete": false,
              "ipc_missing": false
            },
            "distribucion_municipal": { "current": 5420.2 }
          }
        }
      },
      "global_charts": {
        "labels": ["Ene 26", "Feb 26", "Mar 26", "Abr 26"],
        "total_var_interanual": [120.5, 118.2, 122.1, 115.4],
        "ipc_var_interanual": [115.2, 116.4, 118.0, 112.5]
      }
    }
    ```

---

## 3. Endpoints Privados (Requieren JWT)

### A. Autenticación de Usuarios
*   **Ruta**: `POST /api/auth/login`
*   **Descripción**: Recibe las credenciales y, en caso de ser válidas, emite un token JWT.
*   **Cuerpo (JSON)**:
    ```json
    {
      "username": "admin",
      "password": "mi_password_segura"
    }
    ```
*   **Lógica Destacada**:
    - Si la contraseña se encuentra almacenada en texto plano, la API valida el login y automáticamente la encripta en un hash Bcrypt actualizando la tabla `public.usuarios_tableros` de forma transparente.
    - Inserta de forma manual un registro de auditoría de ingreso exitoso en la tabla `public.coparticipacion_registros`.
*   **Respuesta**:
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": 1,
        "username": "admin",
        "name": "Administrador",
        "role": "user"
      }
    }
    ```

---

### B. Análisis de Recursos (RON y ROP)

#### Datos Detallados Mensuales
*   **Ruta**: `GET /api/dashboard/monthly`
*   **Descripción**: Devuelve la información de coparticipación diaria, brechas vs presupuesto y acumulados.
*   **Respuesta**:
    - Contiene los KPIs del periodo seleccionado (bruto, neto, disponible, variaciones, ratios municipales).
    - Contiene el nodo `charts.daily` con las series diarias del mes actual y del mismo mes del año anterior.
    - Contiene el nodo `charts.copa_vs_salario` con las series acumuladas acumulativas para calcular el día en que se cubre la nómina salarial.

#### Adaptador para el Monitor Anual
*   **Ruta**: `GET /api/ron/annual-monitor`
*   **Descripción**: Actúa como un adaptador dinámico de compatibilidad.
*   **Lógica**: 
    - Carga los datos base desde el archivo estático [`_data_ipce_v1.json`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/web/public/data/_data_ipce_v1.json) para mantener inalterados los años cerrados e históricos del tablero (2022 a 2024).
    - Para los años de transición y curso (2025 y 2026), calcula dinámicamente desde SQL la masa salarial real (`copa_gastos`), RON y ROP bruto, recalculando las coberturas, deltas nominales y variaciones antes de retornar el JSON unificado.

---

### C. Análisis Salarial (Masa Salarial e IPC)

#### Histórico de Masa Salarial
*   **Ruta**: `GET /api/personal/masa-salarial`
*   **Descripción**: Retorna la serie de salarios promedio de agentes, cantidad de empleados, valores de la canasta básica regional (CBT NEA) e IPC.
*   **Lógica de Proyección de IPC**:
    - Si la base de datos no cuenta con IPC oficial para los meses más recientes, el endpoint invoca al servicio [`projections.js`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/api/services/projections.js).
    - El servicio consulta los pronósticos del REM (Relevamiento de Expectativas de Mercado) cargados en `rem_precios_minoristas`, encadena mensualmente la inflación esperada sobre el último IPC real y actualiza dinámicamente las variaciones reales de salario estimadas, marcando el registro con `is_projection: true`.

---

### D. Gastos y Presupuesto

#### Resumen Agrupado
*   **Ruta**: `GET /api/gastos/resumen`
*   **Descripción**: Consulta la vista agregada `v_gastos_agrupados`. Admite filtros mediante query parameters.
*   **Parámetros de Consulta (Opcionales)**:
    - `jurisdiccion` (ej: `MINISTERIO DE EDUCACIÓN`)
    - `partida` (ej: `GASTOS EN PERSONAL`)
    - `fuente` (ej: `10`)
    - `estado` (ej: `ORDENADO`)
*   **Respuesta**: Un array JSON de objetos con montos acumulados filtrados.

#### Todos los Gastos (All-Data)
*   **Ruta**: `GET /api/gastos/all-data`
*   **Descripción**: Retorna el listado completo de gastos mensuales estructurado para el renderizado del buscador interactivo del frontend. Aplica un `parseFloat` en el backend al tipo `NUMERIC` de base de datos para evitar que los valores lleguen al cliente como string.

#### Opciones de Filtros
*   **Ruta**: `GET /api/gastos/filtros`
*   **Descripción**: Devuelve las listas ordenadas de valores únicos de `jurisdicciones`, `partidas`, `fuentes` y `estados` presentes en la base de datos para rellenar los filtros dropdown.

---

### E. Telemetría y Logs

#### Telemetría Manual de UI
*   **Ruta**: `POST /api/analytics/log`
*   **Descripción**: Permite al cliente Next.js enviar registros de telemetría de eventos de interfaz de usuario.
*   **Cuerpo (JSON)**:
    ```json
    {
      "seccion": "Gasto",
      "accion": "Export Excel",
      "detalle": { "jurisdiccion": "SALUD", "formato": "xlsx" }
    }
    ```
*   **Respuesta**: `{"status": "success"}`

#### Historial de Uso (Auditoría)
*   **Ruta**: `GET /api/admin/usage`
*   **Restricción**: Solo accesible por el usuario administrador (`admin`).
*   **Descripción**: Recupera los últimos 500 registros de auditoría de la tabla `public.coparticipacion_registros` ordenados de forma descendente por fecha y hora, excluyendo las actividades del propio administrador `admin` para centrarse en los usuarios analizados.
