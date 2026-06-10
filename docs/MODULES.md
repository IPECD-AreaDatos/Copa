# Guía de Módulos del Tablero COPA

El frontend del Tablero COPA está desarrollado en **Next.js** y organizado en seis módulos principales de análisis ejecutivo. Este documento detalla la funcionalidad de cada módulo, sus componentes asociados, la experiencia de usuario y la lógica de negocio visual implementada.

---

## 1. Módulo: Inicio (Home)
*   **Ruta**: `/`
*   **Componente**: [`HomeDashboard.tsx`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/web/src/components/home/HomeDashboard.tsx)
*   **Acceso**: Libre (Lectura básica). Si el usuario es un "Invitado", no se le permite navegar al resto de las pestañas ejecutivas, sirviendo esta pantalla como portada pública con datos agregados clave.

### Características Principales:
*   **Resumen del Último Período Disponible**: Muestra tarjetas consolidadas con los datos del último mes completo:
    - **Recaudación Bruta**: Recursos de Origen Nacional (RON) deflactados a millones.
    - **Recursos Provinciales**: Recursos de Origen Provincial (ROP) en millones.
    - **Variación Real Total**: Cambio interanual real de recursos brutos conjuntos (RON + ROP) deflactados por el IPC.
    - **Masa Salarial**: Cobertura salarial expresada como porcentaje de los recursos brutos invertidos en salarios.
    - **Distribución Municipal**: Monto total transferido a municipios de acuerdo a los coeficientes de coparticipación secundaria.
*   **Gráfico Global de Evolución (Histórico 12 Meses)**: 
    - Un gráfico de líneas que compara de forma interanual la **Variación Nominal de Recursos** contra la **Inflación (IPC)** del periodo.
    - Permite evaluar a simple vista si la recaudación provincial le está ganando o perdiendo a la inflación (Variación Real positiva/negativa).

---

## 2. Módulo: Análisis Mensual (Monitor Mensual)
*   **Ruta**: `/monitor-mensual`
*   **Componente**: [`MonitorMensualDashboard.tsx`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/web/src/components/monitor-mensual/MonitorMensualDashboard.tsx)
*   **Acceso**: Privado (Requiere Sesión activa).

### Características Principales:
*   **Selector de Períodos**: Permite filtrar y analizar cualquier mes/año histórico disponible en la base de datos.
*   **Panel de Brecha (Esperado vs. Efectivo)**:
    - Compara los ingresos **Efectivos** recibidos contra la estimación del **Presupuesto (Esperado)**.
    - Muestra la brecha tanto en pesos nominales como en porcentaje de desvío (positivo o negativo).
*   **Gráfico de Coparticipación Diaria (RON)**:
    - Gráfico de barras que muestra la transferencia diaria de coparticipación de la Nación durante el mes seleccionado.
    - Superpone una línea con la recaudación diaria del **mismo mes del año anterior** para permitir comparaciones estacionales de picos de recaudación.
*   **Gráfico de Coparticipación vs. Masa Salarial (Acumulado Diario)**:
    - **Curva Acumulada**: Suma acumulada diaria del RON disponible a medida que transcurren los días del mes.
    - **Línea de Masa Salarial**: Una línea horizontal fija que representa el costo total de los sueldos públicos del mes.
    - **Regla del Día de Cobertura**: Identifica de forma dinámica el día del mes exacto en que la curva acumulada cruza la línea horizontal. Ese es el día en que la provincia recaudó lo suficiente para cubrir la nómina de sueldos (cruzando el "umbral salarial").
    - Si la masa salarial del mes actual no está cargada aún (mes en curso), el sistema aplica un fallback automático utilizando el valor del mes anterior o, en su defecto, el del año anterior, marcando la métrica como "Estimada".

---

## 3. Módulo: Análisis Anual
*   **Ruta**: `/analisis-anual`
*   **Componente**: [`AnalisisAnualDashboard.tsx`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/web/src/components/analisis-anual/AnalisisAnualDashboard.tsx)
*   **Acceso**: Privado (Requiere Sesión activa).

### Características Principales:
*   **Selector de Años**: Muestra la evolución en bloques históricos anuales (desde 2022 en adelante).
*   **Lógica YTD (Year-to-Date / Año Acumulado)**:
    - **Crucial para Periodos Incompletos**: Si se selecciona un año en curso que está a mitad de camino (ej. Mayo de 2026), el sistema calcula el mes máximo disponible (mes 5).
    - Para calcular variaciones interanuales justas, recorta automáticamente los datos de los años previos para que consideren **únicamente el periodo Enero-Mayo** de dichos años. Esto evita distorsiones de variaciones reales negativas irreales.
*   **Tarjetas de KPIs Anuales**:
    - RON Bruto y RON Neto acumulados.
    - ROP Bruto acumulado.
    - Masa Salarial acumulada y Cobertura real.
    - Distribución Municipal acumulada.
*   **Gráfico Acumulado Anual**:
    - Gráfico de barras apiladas que visualiza la recaudación acumulada anual contra los sueldos devengados históricos.

---

## 4. Módulo: Análisis Personal (Masa Salarial)
*   **Ruta**: `/analisis-personal`
*   **Componente**: [`AnalisisPersonalDashboard.tsx`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/web/src/components/analisis-personal/AnalisisPersonalDashboard.tsx)
*   **Acceso**: **Restringido** (Solo visible para usuarios administradores `admin`).

### Características Principales:
*   **Monitoreo del Gasto Salarial**: Muestra el total mensual de la masa salarial gubernamental y la cantidad de agentes públicos activos en la nómina.
*   **Salario Promedio Provincial**:
    - Muestra el salario promedio neto de los empleados y calcula su variación nominal e interanual ajustada por inflación.
*   **Relación Salario vs. Canasta Básica (CBT - NEA)**:
    - Utiliza el valor oficial de la Canasta Básica Total (CBT) provisto por el INDEC para la Región NEA (Noreste Argentino).
    - **Ratio CBT (Poder de Compra)**: Muestra cuántas canastas básicas puede adquirir un salario público promedio. Un ratio mayor a 1.0 indica que el sueldo promedio cubre la canasta familiar básica de pobreza. Permite monitorear el poder adquisitivo real de los agentes del Estado.
*   **Proyecciones de Inflación por Retardo del INDEC**:
    - Dado que el INDEC publica el IPC oficial con un retraso de aproximadamente 15 días, el sistema utiliza el Relevamiento de Expectativas de Mercado (REM) del Banco Central para proyectar la inflación de los meses más recientes y estimar las variaciones reales, marcándolas visualmente como "Proyecciones".

---

## 5. Módulo: Gasto (Presupuesto y Ejecución)
*   **Ruta**: `/gasto`
*   **Componente**: [`GastoDashboard.tsx`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/web/src/components/gasto/GastoDashboard.tsx)
*   **Acceso**: Privado (Requiere Sesión activa).

### Características Principales:
*   **Análisis Dinámico de Partidas y Jurisdicciones**:
    - Permite filtrar interactivamente el presupuesto general de la provincia.
    - Filtros disponibles: Jurisdicción (ej. MINISTERIO DE EDUCACIÓN), Objeto del Gasto / Partida (ej. Gastos en Personal, Bienes de Consumo), Fuente de Financiamiento y Estado (Comprometido, Ordenado, etc.).
*   **Heatmaps de Ejecución**:
    - Presenta un mapa de calor clasificado por montos totales y por porcentajes de ejecución presupuestaria respecto del crédito vigente de cada jurisdicción.
    - Permite identificar rápidamente cuellos de botella en la ejecución o ministerios con subejecución.
*   **Gráfico de Curva Acumulada**:
    - Muestra el ritmo mensual de consumo presupuestario a lo largo del año fiscal, comparándolo con la cuota teórica lineal de ejecución.
*   **Lógica de Acumulación Anual**:
    - La ejecución acumulada en gráficos y heatmaps se limita automáticamente al **año fiscal activo** (determinado dinámicamente por el último mes con registros en la base de datos). Esto evita mezclar montos de presupuestos de ejercicios anteriores.

---

## 6. Módulo: Uso del Tablero (Auditoría)
*   **Ruta**: `/auditoria`
*   **Componente**: [`AuditoriaDashboard.tsx`](file:///c:/Users/USER/Desktop/Codigos/Trabajo_IPECD/Copa/apps/web/src/components/auditoria/AuditoriaDashboard.tsx)
*   **Acceso**: **Restringido** (Solo visible para usuarios administradores `admin`).

### Características Principales:
*   **Monitoreo en Tiempo Real**:
    - Tabla cronológica detallada que recupera los registros de la tabla `public.coparticipacion_registros`.
    - Muestra quién, cuándo, desde qué IP y qué sección visitó o qué botón pulsó (descargas de Excel, filtros avanzados).
*   **Filtros de Auditoría**:
    - Permite buscar interacciones de un usuario específico (`jpvaldes`, etc.) o filtrar acciones administrativas específicas para evaluar la adopción y el uso del tablero ejecutivo.
