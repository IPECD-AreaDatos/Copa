# Glosario Económico y Lógica de Negocio - Tablero COPA

Este documento proporciona una guía de referencia rápida para comprender los términos económicos, fórmulas y criterios de lógica de negocio aplicados en las agregaciones analíticas del Tablero COPA.

---

## 1. Conceptos de Ingresos (Recursos)

### A. RON (Recursos de Origen Nacional)
Son los ingresos que recibe la provincia de forma diaria provenientes del régimen de coparticipación federal de impuestos y leyes especiales de reparto nacional.
*   **RON Bruto**: Monto total en pesos girado por el Gobierno Nacional a la provincia, antes de retenciones y descuentos.
*   **Descuentos Legales**: Nación retiene automáticamente aportes pre-acordados por leyes específicas (como financiamiento del FONAVI, obras viales nacionales y residuales de IVA). Los descuentos promedio rondan el ~19% del bruto.
*   **RON Neto (o Recaudación Neta)**: Es el remanente líquido para la provincia tras sustraer los descuentos del total general:
    $$\text{RON Neto} = \text{RON Bruto} - \text{Descuentos}$$
*   **RON Disponible (Tesoro Provincial)**: Es la porción neta que queda en el Tesoro de la provincia tras deducir el porcentaje coparticipable a los municipios:
    $$\text{RON Disponible} = \text{RON Neto} \times 0.877487$$
*   **Coparticipación Municipal Nacional**: Recursos nacionales que se giran de forma secundaria a las municipalidades de la provincia (coeficiente del 12.25% del RON Neto):
    $$\text{Coparticipación Muni (Nación)} = \text{RON Neto} \times 0.122513$$

---

### B. ROP (Recursos de Origen Provincial)
Son los ingresos generados por la recaudación tributaria propia de la provincia de Corrientes (Ingresos Brutos, Sellos, Inmobiliario Rural, Tasas, Premios de Lotería y judicializaciones).
*   **ROP Disponible (Provincia)**: Porción líquida que se destina al Tesoro de la provincia (81.29% de la recaudación provincial):
    $$\text{ROP Disponible} = \text{ROP Bruto} \times 0.812932$$
*   **Coparticipación Municipal Provincial**: Recursos propios provinciales transferidos a las municipalidades de la provincia (coeficiente del 18.71% del ROP):
    $$\text{Coparticipación Muni (Provincia)} = \text{ROP Bruto} \times 0.187068$$

---

## 2. Conceptos de Empleo y Gasto

### A. Masa Salarial (SISPER)
Representa el costo total mensual en pesos de la nómina salarial (sueldos netos) pagada a los empleados de la administración pública provincial. Proviene del Sistema de Personal (SISPER).
*   **Filtro de Consulta**: Se consolida filtrando los registros de ejecución presupuestaria de gastos (`copa_gastos`) que posean estado `'ORDENADO'`, se financien con rentas generales y coparticipación (`tipo_financ` 10 y 14) y correspondan al clasificador de objeto del gasto `'GASTOS EN PERSONAL'`.

### B. Cobertura Salarial
Relación porcentual que indica qué proporción de los ingresos totales brutos (RON Bruto + ROP Bruto) se consume mensualmente o anualmente para abonar los salarios de la administración pública:
$$\text{Cobertura Salarial} = \frac{\text{Masa Salarial}}{\text{RON Bruto} + \text{ROP Bruto}} \times 100$$
Un porcentaje menor indica mayor margen de maniobra fiscal para obras e inversiones.

### C. Cobertura Diaria (Día de Cobertura)
Criterio dinámico empleado en el módulo **Monitor Mensual** para determinar el día exacto del mes calendario en el cual la acumulación de ingresos diarios alcanza a cubrir el monto total de la nómina salarial mensual pública. Representa un indicador crítico de flujo de caja provincial.

---

## 3. Indicadores de Ajuste e Inflación

### A. IPC (Índice de Precios al Consumidor)
Indicador oficial publicado mensualmente por el INDEC que mide la evolución de la inflación. En el tablero se utiliza el IPC Nivel General para deflactar los ingresos nacionales, y la variación del IPC Región NEA (Noreste Argentino) para evaluar el comportamiento salarial en el territorio.

### B. Deflactación (Cálculo Real / Variación Real)
Es el procedimiento matemático para remover el efecto distorsivo de la inflación sobre los montos en pesos, permitiendo comparar el poder adquisitivo real entre periodos:
1.  **Cálculo de Inflación Interanual ($v_{Ipc}$)**:
    $$v_{Ipc} = \frac{\text{IPC}_{t}}{\text{IPC}_{t-12}} - 1$$
2.  **Cálculo de Variación Real ($v_{Real}$)**:
    $$v_{Real} = \frac{1 + v_{Nominal}}{1 + v_{Ipc}} - 1$$
    *   Una **variación nominal** del 120% frente a una **inflación** de 100% da como resultado una **variación real** positiva de $+10\%$ ($2.2 / 2.0 - 1$).
    *   Si la inflación interanual supera a la variación nominal, la variación real dará un saldo negativo (pérdida de poder de compra/recaudación real).

### C. CBT (Canasta Básica Total - Región NEA)
Monto mensual oficial en pesos medido por INDEC requerido para satisfacer las necesidades alimentarias y no alimentarias de una familia tipo de cuatro integrantes.
*   **Ratio CBT (Poder de Compra)**: Indica la cantidad de canastas básicas familiares que puede adquirir un Salario Promedio público neto en un mes dado:
    $$\text{Ratio CBT} = \frac{\text{Salario Promedio}}{\text{CBT NEA}}$$
    Un ratio de `2.4` significa que el salario promedio de un agente del Estado equivale a 2.4 canastas de pobreza de la región NEA. Permite monitorear el bienestar social de los empleados estatales.

### D. REM (Relevamiento de Expectativas de Mercado)
Informe mensual de proyecciones inflacionarias de consultoras privadas publicado por el Banco Central (BCRA). Se utiliza para proyectar la inflación de los periodos más recientes cuando el INDEC aún no ha publicado el IPC oficial.

---

## 4. Lógica de Agregación Temporal

### A. YTD (Year-to-Date / Año Fiscal Parcial)
Técnica de recorte temporal para comparar periodos acumulados incompletos de forma homogénea.
- **Problema**: Si el año actual (ej. 2026) está en curso y solo tiene datos cargados de Enero a Mayo, comparar la recaudación contra todo el año previo (12 meses de 2025) arrojaría un desplome del $-60\%$ irreal.
- **Solución**: El algoritmo de la API calcula el mes máximo disponible del año en curso ($M_{max}$). Para los años históricos de comparación, recorta la suma acumulada estrictamente desde el mes 1 hasta el mes $M_{max}$. Así, se compara Enero-Mayo 2026 contra Enero-Mayo 2025, 2024, etc., garantizando variaciones interanuales estadísticamente válidas.
