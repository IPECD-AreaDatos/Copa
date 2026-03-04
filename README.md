# Tablero de Control - Coparticipación y Empleo (IPECD)

Este proyecto es un tablero de control ejecutivo, dinámico e interactivo diseñado para el Instituto de Estadística y Ciencia de Datos (IPECD) de la Provincia de Corrientes. 

Permite visualizar la evolución de ingresos por coparticipación federal, el peso de la masa salarial del gobierno y la cobertura frente a los ingresos, tanto a nivel mensual como histórico (anual).

## 📊 Arquitectura del Proyecto

El tablero funciona como una **Single Page Application (SPA)** muy ligera construida puramente con HTML, CSS, y Vanilla JavaScript. No requiere Node.js ni un servidor backend en el entorno de despliegue frontend.

Los datos con los que se alimenta la interfaz provienen de un archivo estático llamado `dashboard_data.json` que reside en `/main`, el cual es generado por **scripts de Python (ETL)** conectándose periódicamente a una base de datos MySQL gubernamental y procesándolos con `pandas`.

Para un nivel más asiduo de detalles arquitectónicos sobre el pipeline de datos, lea la [Documentación de Arquitectura Interna](docs/ARCHITECTURE.md).

---

## 📂 Organización del Repositorio

- `/auth` - Sistema de login mock/básico y su interfaz gráfica. Modificable para atarse a un backend JWT o SSO.
- `/main` - **Monitor Mensual** e index principal del tablero tras loguearse.
- `/monitor-mensual` - Páginas específicas del histórico de un año mes a mes.
- `/analisis-anual` - **Monitor Anual**, vista macroeconómica comparativa año-a-año y Year-to-Date (YTD).
- `/analisis-personal` - **Tablero Salarial**, enfoque en sueldos promedios, cobertura salarial, y pérdida/ganancia del poder adquisitivo frente a la inflación (IPC/CBT).
- `/docs` - Documentación técnica y glosario financiero.

---

## 🛠 Instalación y Desarrollo Local

### 1. Variables de Entorno (Credenciales Seguras)
Copie el archivo `.env.example` en la raíz del proyecto y renómbrelo a `.env`. Complete los datos de conexión a la base de datos MySQL, de la cual de allí saldrá la data cruda.

```bash
cp .env.example .env
```

### 2. Dependencias del Motor de Datos (Python)
Se asume tener Python 3 instalado. Instale los paquetes necesarios para procesar los datos de las bases conectadas al Sisper y Ministerio de Hacienda:

```bash
pip install -r requirements.txt
```

### 3. Ejecución del Proceso ETL (Backend)
Previo a inicializar el tablero, o para "actualizar" la base de datos visual JSON (`dashboard_data.json`), deberá ejecutar el script principal de ETL:

```bash
python main/etl_main.py
```
*Si usted modifica los reportes inflacionarios u otras tablas relacionadas a RRHH en MySQL, deberá obligatoriamente ejecutar este archivo para que el frontend lo refleje.*

### 4. Inicialización del Tablero (Frontend)
Debido a políticas de acceso CORS origin, muchos navegadores hoy día (como Chrome/Safari) impiden a JavaScript hacer `fetch()` de archivos JSON en archivos locales de disco (i.e abrir el `index.html` con doble clic). Se debe inicializar en un servidor HTTP local básico. 

Vía Python versión rápida:
```bash
python3 -m http.server 8000
```
Y luego visitar: `http://localhost:8000/auth/login.html`

*(Las credenciales dummy locales para saltarse el mock login son `admin` usualmente)*.

---

## 🚀 Despliegue en Producción (Deployment)

1. **Hostear el Frontend HTML/CSS/JS**: Como todo es HTML estático, puede alojarse gratuitamente y rapidísimo en **GitHub Pages**, **Vercel**, **Netlify**, o un bucket S3 de AWS.
2. **Restricción de Acceso Público**: El Tablero Ejecutivo maneja montos provinciales, por lo cual la URL u Origen no deben estar públicos si no se cuenta con una capa de seguridad sólida (`/auth`) amarrada a un servidor real (`auth0`, Cognito, etc.) en vez del mock system actual provisto.
3. **Automatización ETL (CI/CD)**: Para no tener que teclear diariamente el comando manual de Python, lo estándar es configurar un WorkFlow programado (Cronjob) en **GitHub Actions** o AWS Lambda. El Action se conectará a la BDD, correrá el script (guardando temporalmente las variables de MySQL .env seguras allí llamadas Secrets), commiteará internamente el nuevo `dashboard_data.json` pisando al viejo, y re-desplegará automáticamente la página.

---
Elaborado inicialmente por IPECD.
