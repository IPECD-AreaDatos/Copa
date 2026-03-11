# Arquitectura del Tablero de Recursos de Origen Nacional (RON) y Empleo (IPECD)

Este documento detalla la arquitectura técnica, el flujo de datos y las decisiones de diseño del proyecto para facilitar el traspaso de la propiedad, el mantenimiento futuro y la escalabilidad.

## 1. Visión General (High-Level Architecture)

El proyecto funciona bajo un modelo **SSG-like (Static Site Generation)** híbrido, compuesto por dos grandes piezas:
1. **Frontend**: Una Single Page Application (SPA) compuesta de archivos estáticos HTML, CSS y Vanilla JavaScript. No requiere un servidor backend dinámico (como Node.js o Django) para servir peticiones de clientes.
2. **Backend / Data Pipeline (ETL)**: Scripts escritos en Python (`etl_main.py` y `etl_personal.py`) que se conectan a una base de datos MySQL, procesan información y generan archivos estáticos JSON (`dashboard_data.json`).

El frontend "cobra vida" al leer asíncronamente (vía `fetch()`) esos archivos JSON estáticos generados por el backend.

---

## 2. Flujo de Datos (Data Pipeline & ETL)

### El proceso ETL (Extract, Transform, Load)

Los datos originales residen en una base de datos MySQL, que aglomera la recaudación diaria, los presupuestos, el índice inflacionario (IPC) y la información de la masa salarial (SISPER).

1. **Extract**: El script `etl_main.py` usa `mysql-connector-python` o `pandas.read_sql` para extraer los montos brutos, descuentos, masa salarial mensual, e IPC desde la base de datos.
2. **Transform**: `pandas` es el motor principal aquí.
   - **Agrupamientos**: Agrupa recaudación diaria por mes y por año.
   - **Cálculos Reales (Deflactación)**: Ajusta los "Recursos de Origen Nacional (RON)" y la "Masa Salarial" usando las tasas del Índice de Precios al Consumidor (IPC) correspondientes a la región NEA para mostrar la *Variación Real*.
   - **Lógica YTD (Year-to-Date)**: Entiende si un año en curso (ej. 2026) está incompleto y compara la recaudación únicamente contra los *mismos meses* del año anterior.
   - **Cálculo de Brechas**: Compara los montos de ingresos "Esperados" contra los "Efectivos".
3. **Load**: Los DataFrames de pandas se serializan en un gran y estructurado diccionario de Python, el cual finalmente se vuelca en `/main/dashboard_data.json`. Este JSON es el único punto de contacto con el frontend.

**Ejecución:**
Para actualizar el tablero con los últimos datos, un administrador o un proceso automatizado (ej. un cronjob o GitHub Actions) debe correr los scripts:
```bash
python main/etl_main.py
```

---

## 3. Frontend Estructura y UI

Todo el frontend está diseñado sin frameworks reactivos complejos (como React o Angular) para mantener la dependencia de build lo más baja posible (Vanilla JS).

### Carpetas Principales
- `/main`: Contiene el **Monitor Mensual** (Landing Page post-login). Muestra los ingresos por mes, coparticipación diaria y mensual.
- `/analisis-anual`: Contiene el **Monitor Anual**, una réplica funcional del Monitor Mensual pero agrupando la data por períodos de 12 meses, útil para entender la macroeconomía provincial anualizada.
- `/analisis-personal`: Detalla la información referente a la **Masa Salarial**, el impacto del empleo gubernamental, salarios promedio, escalafones, la cobertura salarial frente a la recuadación, y la relación del salario contra la Canasta Básica Total (CBT).
- `/auth`: Lógica y UI de autenticación visual.

### Componentes Clave
1. **Estructura HTML (Layout)**: Todas las vistas comparten un layout de un Sidebar izquierdo de navegación (`<aside class="sidebar">`) y un Canvas principal (`<main class="main-content">`).
2. **Estilos (CSS)**: Se usa CSS plano con **CSS Variables (Custom Properties)** en la raíz (`:root`) para manejar los temas (modos claros/oscuros, paleta de colores verdes de la institución). Se rige por sistemas de Grid y Flexbox responsivos (`styles.css`).
3. **Controladores JS**: Cada página tiene un analizador `script.js` (ej. `analisis-anual/script.js`). Este archivo es responsable de:
   - Configurar los event listeners (selector de períodos).
   - Hacer el `fetch("path/al/json")`.
   - Repopular el DOM (`document.getElementById()`).

### Motor de Gráficos (Chart.js)
Se utiliza la librería de código abierto **Chart.js** por su ligereza y facilidad.
- Todos los gráficos están instanciados de manera que si se cambia de período, la instancia se destruye (`chartInstance.destroy()`) y se vuelve a crear con la nueva *data*.
- **Plugins/Tooltips**: Se modificó intensamente el objeto `options.plugins.tooltip.callbacks` a través del código JS para inyectarle lógica de negocio (ej. Mostrar "Variación Nominal" calculando en tiempo real la diferencia entre las dos barras sobre las que se hace hover).

---

## 4. Autenticación Actual

El proyecto posee una carpeta `/auth` que imita o posee un flujo básico e inicial de Login (mock login) antes de entrar al *Tablero Ejecutivo Provincial*. 

- La página de inicio es `login.html`.
- **Importante para el próximo propietario**: Actualmente es un sistema "Client-Side" para restringir el acceso básico a la lectura del dashboard. Como es una SPA de archivos estáticos, la seguridad real para proteger el `dashboard_data.json` dependerá de dónde se despliegue. (Ej. colocar la página tras un Single Sign-On, un Proxy reverso con Basic Auth de Nginx, o reglas de bucket S3 privativas, o reescribir el login frente a un endpoint de autenticación JWT real manejado e.g. mediante AWS Cognito, Firebase o similar).

---

## 5. Glosario de Términos Económicos y de Lógica de Negocio

Para los ingenieros de software ajenos al organismo gubernamental, estas son las reglas de negocio mapeadas en los scripts:

*   **RON Bruta**: Total girado por Nación a la provincia.
*   **RON Neta (o Disponible)**: Es la RON Bruta menos los *descuentos* pre-acordados por leyes u obligaciones impositivas que Nación le retiene a la provincia antes de darle el líquido. **Este es el KPI principal del tablero.** El factor reductor usado suele ser ~19% por ley.
*   **Masa Salarial (SISPER)**: El costo total de sueldos de la nómina de empleados públicos del mes (proviene del Sistema de Personal, SISPER).
*   **Cobertura Salarial**: Porcentaje que indica cuánto de los RON disponibles se utiliza mensualmente/anualmente para pagar los sueldos ($ Masa Salarial / $ RON Neta).
*   **Variación Nominal**: El delta en pesos sin ajustar. (ej. Año X respecto al X-1).
*   **Variación Real**: El delta deflactado ajustado por el nivel inflacionario emitido por el Instituto Nacional de Estadística y Censos (INDEC). IPC (Índice de Precios al Consumidor) de la región NEA (Noreste Argentino).
*   **YTD (Year-to-Date)**: Al consultar un año no cerrado (ej. Agosto 2026), el backend recorta los datos del año previo para compararlos únicamente desde Enero a Agosto de 2025. Esto es crucial para que las variaciones nominales y reales no den negativas irreales ("cayó -30% vs todo el año pasado").
*   **RON Esperada vs Efectiva (Brecha)**: Se presupone por la "Ley de Presupuesto" que la provincia recibirá X por mes. La brecha es cuánto más, o menos, recibió de la nación en la realidad versus lo que se le dijo por ley que recibiría.
*   **CBT (Canasta Básica Total)**: Monto medido por INDEC. El tablero `analisis-personal` lo usa para medir un índice de "Poder de Compra", es decir, cuántas CBT puede comprar un "Salario Promedio" público en un mes dado. Mide una mejora o empeoramiento real en el bolsillo del empleado público de la provincia a través del tiempo.

---

*FIN DEL DOCUMENTO*
