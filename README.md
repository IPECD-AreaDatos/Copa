# Tablero de Control - Recursos de Origen Nacional (RON) y Empleo (IPECD)

Este proyecto es un tablero de control ejecutivo, dinámico e interactivo diseñado para el Instituto de Estadística y Ciencia de Datos (IPECD) de la Provincia de Corrientes. 

Permite visualizar la evolución de ingresos por Recursos de Origen Nacional (RON), el peso de la masa salarial del gobierno y la cobertura frente a los ingresos, tanto a nivel mensual como histórico (anual).

## 📊 Arquitectura del Proyecto

El tablero funciona como una **Single Page Application (SPA)** muy ligera construida puramente con HTML, CSS, y Vanilla JavaScript. No requiere Node.js ni un servidor backend en el entorno de despliegue frontend.

Los datos con los que se alimenta la interfaz provienen de un archivo estático llamado `dashboard_data.json` que reside en `/main`, el cual es generado por **scripts de Python (ETL)** conectándose periódicamente a una base de datos MySQL gubernamental y procesándolos con `pandas`.

Para un nivel más asiduo de detalles arquitectónicos sobre el pipeline de datos, lea la [Documentación de Arquitectura Interna](docs/ARCHITECTURE.md).

---

## 📂 Organización del Repositorio

- `/assets` - Recursos estáticos centralizados (logos, imágenes).
- `/backend` - Scripts de procesamiento de datos (ETL) y archivos de entrada (`inputs/`).
- `/data` - Archivos JSON generados por los ETL que alimentan el dashboard.
- `/frontend` - Interfaz de usuario organizada por módulos:
    - `main/`: Dashboard principal.
    - `monitor-mensual/`: Análisis histórico detallado mes a mes.
    - `analisis-anual/`: Macroeconómico interanual y YTD.
    - `analisis-personal/`: Estadísticas de empleo y masa salarial.
    - `gasto/`: Análisis de ejecución presupuestaria.
- `/docs` - Documentación técnica y glosario financiero.

---

## 🛠 Instalación y Desarrollo Local

### 1. Variables de Entorno (Credenciales Seguras)
Copie el archivo `.env.example` en la raíz del proyecto y renómbrelo a `.env`. Complete los datos de conexión a la base de datos MySQL y PostgreSQL.

```bash
cp .env.example .env
```

### 2. Dependencias del Motor de Datos (Python)
Se recomienda usar un entorno virtual. Instale los paquetes necesarios:

```bash
python -m venv .venv
source .venv/bin/activate  # En Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Ejecución del Proceso ETL (Backend)
Para actualizar los datos del tablero, ejecute los scripts desde la raíz:

```bash
# Procesamiento de recursos (RON)
python backend/etl_main.py

# Procesamiento de personal
python backend/etl_personal.py
```
Los archivos JSON resultantes se guardarán automáticamente en la carpeta `data/`.

### 4. Inicialización del Tablero (Frontend)
Debido a políticas de seguridad CORS, se debe ejecutar un servidor HTTP local.

Vía Python:
```bash
python -m http.server 8000
```
Luego visite: `http://localhost:8000` (el cual redirigirá automáticamente al sistema de login).

---

## 🚀 Despliegue en Producción (Deployment)

1. **Hostear el Frontend HTML/CSS/JS**: Como todo es HTML estático, puede alojarse gratuitamente y rapidísimo en **GitHub Pages**, **Vercel**, **Netlify**, o un bucket S3 de AWS.
2. **Restricción de Acceso Público**: El Tablero Ejecutivo maneja montos provinciales, por lo cual la URL u Origen no deben estar públicos si no se cuenta con una capa de seguridad sólida (`/auth`) amarrada a un servidor real (`auth0`, Cognito, etc.) en vez del mock system actual provisto.
3. **Automatización ETL (CI/CD)**: Para no tener que teclear diariamente el comando manual de Python, lo estándar es configurar un WorkFlow programado (Cronjob) en **GitHub Actions** o AWS Lambda. El Action se conectará a la BDD, correrá el script (guardando temporalmente las variables de MySQL .env seguras allí llamadas Secrets), commiteará internamente el nuevo `dashboard_data.json` pisando al viejo, y re-desplegará automáticamente la página.

---
Elaborado inicialmente por IPECD.
