# Tablero de Control - Recursos de Origen Nacional (RON) y Empleo (IPECD)

Este proyecto es un tablero de control ejecutivo, dinámico e interactivo diseñado para el Instituto de Estadística y Ciencia de Datos (IPECD) de la Provincia de Corrientes. 

Permite visualizar la evolución de ingresos por Recursos de Origen Nacional (RON) y Recursos de Origen Provincial (ROP), el impacto de la masa salarial del gobierno y su cobertura frente a los ingresos, tanto a nivel mensual como histórico (anual), además de la ejecución presupuestaria de gastos y auditoría de accesos.

---

## 📊 Arquitectura del Proyecto

El tablero está estructurado bajo un esquema de **Monorepo** con dos aplicaciones principales:

1. **Frontend (`apps/web`)**: Una aplicación moderna construida con **Next.js (v16)**, **React (v19)**, **TypeScript** y **Tailwind CSS**. Utiliza **Chart.js** (mediante `react-chartjs-2`) para la renderización de gráficos interactivos de coparticipación diaria, acumulados e históricos.
2. **Backend / API (`apps/api`)**: Un servidor API RESTful construido en **Node.js** con **Express**. Se conecta directamente a bases de datos PostgreSQL para servir consultas dinámicas en tiempo real con soporte de autenticación basada en **JWT** y registro automático de telemetría/auditoría.

Para un nivel más asiduo de detalles arquitectónicos, consulte la [Documentación de Arquitectura Interna](docs/ARCHITECTURE.md).

---

## 📂 Organización del Repositorio

- **`apps/`** - Aplicaciones del monorepo:
  - **[`apps/web`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/web)**: Frontend en Next.js.
  - **[`apps/api`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/api)**: Backend API en Express.
- **`backend/`** - Recursos heredados y entradas manuales de datos en bruto:
  - **[`backend/inputs`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/backend/inputs)**: Contiene archivos consolidados Excel/CSV (`presupuesto.xlsx`, `masa_salarial.xlsx`, `reca.xlsx`, `consolidado_copa_esperada.csv`).
- **`docs/`** - Nueva documentación del sistema:
  - **[`docs/ARCHITECTURE.md`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/docs/ARCHITECTURE.md)**: Arquitectura detallada y flujo de comunicación.
  - **[`docs/DATABASE_SCHEMA.md`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/docs/DATABASE_SCHEMA.md)**: Estructura de tablas, vistas y bases de datos.
  - **[`docs/MODULES.md`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/docs/MODULES.md)**: Detalle de las pantallas y lógica de negocio visual.
  - **[`docs/API_REFERENCE.md`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/docs/API_REFERENCE.md)**: Referencia de rutas, payloads y telemetría de la API.
  - **[`docs/GLOSSARY.md`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/docs/GLOSSARY.md)**: Glosario de términos financieros, ratios legales y fórmulas.
- **`dev.ps1`** - Script de PowerShell para automatización del entorno local.
- **`ecosystem.config.js`** - Archivo de configuración de PM2 para el despliegue en producción.

---

## 🛠 Instalación y Desarrollo Local

### 1. Variables de Entorno
Cree un archivo `.env` en la raíz del proyecto basándose en `.env.example` (o modifique el `.env` existente) completando las credenciales de PostgreSQL y la clave para JWT:

```ini
PG_HOST=149.50.145.182
PG_PORT=5432
PG_USER=mi_usuario
PG_PASSWORD=mi_password
PG_DATABASE=datos_tablero
JWT_SECRET=clave_secreta_jwt
PORT=4000
```

### 2. Levantar el Entorno Local
Para iniciar tanto la API como el frontend Next.js simultáneamente en terminales independientes, ejecute el script de PowerShell provisto:

```powershell
./dev.ps1
```

Esto levantará de forma automática:
- **API**: [http://localhost:4000](http://localhost:4000)
- **Web (Next.js)**: [http://localhost:3000](http://localhost:3000) (con redirección al Login si no hay sesión iniciada).

*Nota: Si se encuentra en un entorno de desarrollo no Windows, deberá ingresar en `apps/api` y ejecutar `node index.js`, y en `apps/web` ejecutar `npm run dev`.*

---

## 🚀 Despliegue en Producción (PM2)

El proyecto está preparado para desplegarse mediante el administrador de procesos **PM2** utilizando el archivo `ecosystem.config.js`:

```bash
# Iniciar servicios en producción
pm2 start ecosystem.config.js
```

En producción, el frontend estático compilado de Next.js escucha en el puerto **3006** y la API de Node.js en el puerto **4000**. Los rewrites de Next.js se encargan de enrutar las peticiones dinámicas de `/copa/copa-api/*` hacia el puerto **4000** del backend en forma transparente.

---
Elaborado por el Instituto de Estadística y Ciencia de Datos (IPECD) de la Provincia de Corrientes.
