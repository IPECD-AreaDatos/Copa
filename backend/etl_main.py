import os
import json
import mysql.connector
import psycopg2
import pandas as pd
from datetime import datetime
import numpy as np
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def find_column(df, patterns):
    """
    Finds a column in a DataFrame that matches any of the given patterns (lowercase).
    """
    for col in df.columns:
        c_low = str(col).lower()
        
        # Test against patterns directly
        for pattern in patterns:
            # Special case for "año" variations
            if pattern == 'año' or pattern == 'anio':
                if c_low == 'año' or c_low == 'anio' or c_low == 'year' or (len(c_low) >= 2 and c_low.startswith('a') and c_low.endswith('o')):
                    return col
                continue
                
            if pattern in c_low:
                return col
    return None


# DB Configuration from Environment Variables (Fix 1-C: Remove hardcoded defaults)
DB_CONFIG = {
    'user': os.getenv('DB_USER'),
    'host': os.getenv('DB_HOST'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_DATABASE'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'connect_timeout': 20
}

def get_connection():
    return mysql.connector.connect(**DB_CONFIG)

def get_pg_connection():
    return psycopg2.connect(
        host=os.getenv("PG_HOST"),
        port=os.getenv("PG_PORT"),
        user=os.getenv("PG_USER"),
        password=os.getenv("PG_PASSWORD"),
        dbname=os.getenv("PG_DATABASE")
    )

def get_pg_ipc_connection():
    return psycopg2.connect(
        host=os.getenv("PG_HOST"),
        port=os.getenv("PG_PORT"),
        user=os.getenv("PG_USER"),
        password=os.getenv("PG_PASSWORD"),
        dbname="datalake_economico"
    )

def fetch_coparticipacion_daily():
    """
    Fetches daily coparticipation data for Current and Previous Year.
    
    Data Source: PostgreSQL database 'copa_recursos_origen_nacional'.
    Metric: CFI (Neta de Ley 26075) + Reg.Simplif. p/Pequenos Contribuyentes (Ley N.24.977) + Compensacion Consenso Fiscal (2).
    
    Returns:
        pd.DataFrame: A dataframe containing 'fecha', 'recaudacion' (Net), 'recaudacion_bruta' (Gross), and parsed date parts.
    """
    conn = get_pg_connection()
    try:
        # Load data from PostgreSQL
        query = "SELECT * FROM copa_recursos_origen_nacional"
        df_raw = pd.read_sql(query, conn)
        
        # Mapping by POSITION based on CSV structure
        # CSV order: Fecha, CFI (Neta), Financ. Educativo, SUBTOTAL, Transf. Serv..., 
        # Imp. B. Personales (24699), Imp. B. Personales (23966), Imp. s/ Activos...,
        # I.V.A (23966), Imp. Combustibles (Vialidad), Imp. Combustibles (FONAVI), ...
        
        # Column names from search result:
        # 0: fecha, 1: cfi_neta_ley_26075, 2: financ_educativo_ley_26075, 3: subtotal, 
        # 4: transf_servicios_educacion, 5: transf_servicios_posoco, 6: transf_servicios_prosonu, 
        # 7: transf_servicios_hospitales, 8: transf_servicios_minoridad, 9: transf_servicios_total, 
        # 10: imp_bienes_personales_ley_24699, 11: imp_bienes_personales_ley_23966, 12: imp_activos_fdo_educativo, 
        # 13: iva_ley_23966, 14: imp_combustibles_infraestructura, 15: imp_combustibles_vialidad, 
        # 16: imp_combustibles_fonavi, 17: fondo_compensador_deseq_fisc, 18: reg_simplif_monotributo, 
        # 19: total_recursos_origen_nacional, 20: compensacion_consenso_fiscal, 21: total_general, 22: punto_estadistico
        
        col_mapping = {
            df_raw.columns[0]: 'Fecha',
            df_raw.columns[1]: 'CFI (Neta de Ley 26075)',
            df_raw.columns[2]: 'Financ. Educativo (Ley 26075)',
            df_raw.columns[11]: 'Imp. Bienes Personales (Ley 23.966 Art. 30)', # Index 11 is ley 23966
            df_raw.columns[13]: 'I.V.A. (Ley 23.966 Art. 5 Pto. 2)',
            df_raw.columns[15]: 'Imp. Combustibles (Ley N.23966 Vialidad Provincial)',
            df_raw.columns[16]: 'Imp. Combustibles (FO.NA.VI.)',
            df_raw.columns[18]: 'Reg.Simplif. p/Pequenos Contribuyentes (Ley N.24.977)',
            df_raw.columns[20]: 'Compensacion Consenso Fiscal (2)',
            df_raw.columns[21]: 'Total - (1)+(2)',
            df_raw.columns[22]: 'Punto Estadistico'
        }
        
        df = df_raw.rename(columns=col_mapping).copy()
        
    finally:
        conn.close()

    # Parse dates
    df['fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    
    # Filter for last 5 years
    current_year = datetime.now().year
    mask = (df['fecha'].dt.year >= current_year - 4)
    df = df.loc[mask].copy()
    
    # Ensure numeric columns
    cols_to_parse = [
        'CFI (Neta de Ley 26075)', 
        'Reg.Simplif. p/Pequenos Contribuyentes (Ley N.24.977)', 
        'Compensacion Consenso Fiscal (2)',
        'Financ. Educativo (Ley 26075)',
        'Total - (1)+(2)',
        'Imp. Combustibles (Ley N.23966 Vialidad Provincial)',
        'Imp. Combustibles (FO.NA.VI.)',
        'I.V.A. (Ley 23.966 Art. 5 Pto. 2)',
        'Imp. Bienes Personales (Ley 23.966 Art. 30)',
        'Punto Estadistico'
    ]
    
    for col in cols_to_parse:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        
    # Coparticipacion Bruta (RON Bruto)
    df['recaudacion_bruta'] = df['Total - (1)+(2)']
    
    # Coparticipacion Neta
    df['recaudacion_neta'] = df['recaudacion_bruta'] - (
        df['Imp. Combustibles (Ley N.23966 Vialidad Provincial)'] + 
        df['Imp. Combustibles (FO.NA.VI.)'] + 
        df['I.V.A. (Ley 23.966 Art. 5 Pto. 2)'] + 
        df['Imp. Bienes Personales (Ley 23.966 Art. 30)']
    )
    
    # Distribucion Municipal
    df['distribucion_municipal'] = (
        df['CFI (Neta de Ley 26075)'] + 
        df['Reg.Simplif. p/Pequenos Contribuyentes (Ley N.24.977)'] - 
        df['Punto Estadistico']
    ) * 0.19
    
    # Coparticipacion Disponible (RON Disponible)
    df['recaudacion'] = df['recaudacion_neta'] - df['distribucion_municipal']
    
    # Sort
    df = df.sort_values('fecha')
    
    # Add auxiliary columns
    df['day'] = df['fecha'].dt.day
    df['month'] = df['fecha'].dt.month
    df['year'] = df['fecha'].dt.year
    
    return df[['fecha', 'recaudacion', 'recaudacion_bruta', 'recaudacion_neta', 'distribucion_municipal', 'day', 'month', 'year']]

def fetch_copa_esperada():
    """
    Fetches daily expected coparticipation data (Budgeted / Presupuestado).
    Used to calculate the "Brecha" (Gap) between what the province expected to receive vs what it actually received.
    
    Data Source: Local Excel 'presupuesto.xlsx'.
    Columns expected in Excel: 'mes', 'año', 'ron', 'rop'.
    """
    excel_path = os.path.join(os.path.dirname(__file__), 'inputs', 'presupuesto.xlsx')
    
    if not os.path.exists(excel_path):
        # Return empty structure if file is missing
        return pd.DataFrame(columns=['fecha', 'esperada', 'esperada_prov', 'day', 'month', 'year'])
        
    # Read Excel
    df_budget = pd.read_excel(excel_path, engine='openpyxl')
    
    # Robust column detection
    col_month = find_column(df_budget, ['mes', 'month'])
    col_year = find_column(df_budget, ['año', 'anio', 'ao', 'year'])
    col_ron = find_column(df_budget, ['ron'])
    col_rop = find_column(df_budget, ['rop'])

    if not col_month or not col_year:
        print(f"  [copa_esperada] ERROR: No se encontró columna de mes/año en {excel_path}")
        return pd.DataFrame(columns=['fecha', 'esperada', 'esperada_prov', 'day', 'month', 'year'])

    import calendar
    new_rows = []
    
    for _, row in df_budget.iterrows():
        y = int(row[col_year])
        m = int(row[col_month])
        
        val_ron_millions = float(row.get(col_ron, 0)) if col_ron else 0
        val_rop_millions = float(row.get(col_rop, 0)) if col_rop else 0
        
        # Convert to pesos
        val_ron_pesos = val_ron_millions * 1_000_000
        val_rop_pesos = val_rop_millions * 1_000_000
        
        days_in_month = calendar.monthrange(y, m)[1]
        
        daily_ron = val_ron_pesos / days_in_month
        daily_rop = val_rop_pesos / days_in_month
        
        for d in range(1, days_in_month + 1):
            new_rows.append({
                'fecha': pd.Timestamp(year=y, month=m, day=d),
                'esperada': daily_ron,
                'esperada_prov': daily_rop,
                'day': d,
                'month': m,
                'year': y
            })
            
    df = pd.DataFrame(new_rows)
    df = df.sort_values('fecha')
    
    return df[['fecha', 'esperada', 'esperada_prov', 'day', 'month', 'year']]

def fetch_masa_salarial(target_years):
    """
    Fetches monthly salary bill (Masa Salarial) for specified years.
    
    Data sources (in order of priority):
      1. Excel file 'masa_salarial.xlsx' in inputs/ (manual overrides, highest priority)
      2. MySQL table 'plantilla_personal_provincia' (SUM(importe_gral), historical data)
      3. PostgreSQL table 'copa_gastos' (GASTOS EN PERSONAL, fuentes 10+14, estado=Comprometido)
         → Fills months not covered by Excel or MySQL (e.g. most recent months).
    
    Args:
        target_years (list): List of integers representing the years to query.
        
    Returns:
        pd.DataFrame: Aggregated monetary mass by year and month, columns: ['anio', 'mes', 'masa_salarial'].
    """
    df_mysql = pd.DataFrame(columns=['anio', 'mes', 'masa_salarial'])
    # --- Source 2: MySQL ---
    print("  [masa_salarial] Leyendo tabla histórica desde MySQL (plantilla_personal_provincia)...")
    years_str = ",".join(map(str, target_years))
    query = f"""
    SELECT anio, mes, SUM(importe_gral) AS masa_salarial
    FROM plantilla_personal_provincia
    WHERE anio IN ({years_str})
    GROUP BY anio, mes
    ORDER BY anio, mes
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query)
        columns = [col[0] for col in cursor.description]
        data = cursor.fetchall()
        df_mysql = pd.DataFrame(data, columns=columns)
        df_mysql['masa_salarial'] = pd.to_numeric(df_mysql['masa_salarial'], errors='coerce').fillna(0)
        df_mysql['anio'] = df_mysql['anio'].astype(int)
        df_mysql['mes'] = df_mysql['mes'].astype(int)
        print(f"  [masa_salarial] {len(df_mysql)} registros cargados desde MySQL.")
    except Exception as e:
        print(f"  [masa_salarial] ERROR al leer MySQL: {e}.")
    finally:
        conn.close()

    # --- Source 1: Excel Overrides/Data (highest priority) ---
    df_excel = pd.DataFrame(columns=['anio', 'mes', 'masa_salarial'])
    excel_path = os.path.join(os.path.dirname(__file__), 'inputs', 'masa_salarial.xlsx')
    if os.path.exists(excel_path):
        print("  [masa_salarial] Leyendo extensiones/ajustes desde Excel...")
        df_e = pd.read_excel(excel_path, engine='openpyxl')
        
        # Robust detection
        col_month = find_column(df_e, ['mes', 'month'])
        col_year = find_column(df_e, ['año', 'anio', 'ao', 'year'])
        col_masa = find_column(df_e, ['masa salarial', 'masa'])
        
        if col_year and col_month:
            df_e = df_e.rename(columns={col_year: 'anio', col_month: 'mes', col_masa: 'masa_salarial'})
            df_e = df_e[df_e['anio'].isin(target_years)].copy()
            df_e['masa_salarial'] = pd.to_numeric(df_e.get('masa_salarial', 0), errors='coerce').fillna(0)
            df_excel = df_e.groupby(['anio', 'mes'])['masa_salarial'].sum().reset_index()
            print(f"  [masa_salarial] {len(df_excel)} registros cargados desde Excel.")
        else:
            print("  [masa_salarial] WARNING: No se encontró columna de año/mes en Excel.")

    # --- Source 3: PostgreSQL copa_gastos (lowest priority, fills gaps) ---
    df_pg = pd.DataFrame(columns=['anio', 'mes', 'masa_salarial'])
    print("  [masa_salarial] Leyendo copa_gastos desde PostgreSQL (fuentes 10+14, Comprometido)...")
    try:
        conn_pg = get_pg_connection()
        query_pg = """
        SELECT 
            EXTRACT(YEAR FROM periodo)::int AS anio,
            EXTRACT(MONTH FROM periodo)::int AS mes,
            SUM(monto) AS masa_salarial
        FROM copa_gastos
        WHERE partida IN ('GASTOS EN PERSONAL', 'GASTO EN PERSONAL')
          AND tipo_financ IN ('10', '14')
          AND estado = 'Comprometido'
        GROUP BY EXTRACT(YEAR FROM periodo), EXTRACT(MONTH FROM periodo)
        ORDER BY anio, mes
        """
        df_pg = pd.read_sql(query_pg, conn_pg)
        df_pg['masa_salarial'] = pd.to_numeric(df_pg['masa_salarial'], errors='coerce').fillna(0)
        df_pg['anio'] = df_pg['anio'].astype(int)
        df_pg['mes'] = df_pg['mes'].astype(int)
        # Filter to target years
        df_pg = df_pg[df_pg['anio'].isin(target_years)].copy()
        # Convert from copa_gastos units (already in pesos) to match the other sources
        print(f"  [masa_salarial] {len(df_pg)} registros cargados desde copa_gastos (PostgreSQL).")
    except Exception as e:
        print(f"  [masa_salarial] WARNING: No se pudo leer copa_gastos: {e}.")
    finally:
        if 'conn_pg' in locals() and conn_pg:
            conn_pg.close()

    # --- Combine: Excel > MySQL > copa_gastos ---
    # Start with copa_gastos as base (lowest priority)
    frames = []
    if not df_pg.empty:
        frames.append(df_pg)
    if not df_mysql.empty:
        frames.append(df_mysql)
    if not df_excel.empty:
        frames.append(df_excel)
    
    if frames:
        # Reverse concat: last added (Excel) takes priority via keep='last'
        df_combined = pd.concat(frames, ignore_index=True)
        df_combined = df_combined.drop_duplicates(subset=['anio', 'mes'], keep='last')
        df_combined = df_combined.sort_values(['anio', 'mes']).reset_index(drop=True)
        print(f"  [masa_salarial] Total combinado: {len(df_combined)} periodos únicos.")
        return df_combined
    else:
        return pd.DataFrame(columns=['anio', 'mes', 'masa_salarial'])

def fetch_recaudacion_provincial():
    """
    Fetches monthly provincial tax collection (Recaudación Provincial) from the Excel file (reca.xlsx).
    Calculates total collection and the municipal distribution portion.
    
    Returns:
        pd.DataFrame: Aggregated provincial collection and municipal distribution by year and month.
    """
    excel_path = os.path.join(os.path.dirname(__file__), 'inputs', 'reca.xlsx')
    
    if not os.path.exists(excel_path):
        return pd.DataFrame(columns=['year', 'month', 'recaudacion_provincial', 'distribucion_municipal_prov'])
        
    df = pd.read_excel(excel_path, engine='openpyxl')
    
    # Robust detection
    col_month = find_column(df, ['mes', 'month'])
    col_year = find_column(df, ['año', 'anio', 'ao', 'year'])
    
    if not col_month or not col_year:
        print(f"  [reca] ERROR: No se encontró columna de mes/año en {excel_path}")
        return pd.DataFrame(columns=['year', 'month', 'recaudacion_provincial', 'distribucion_municipal_prov'])

    df = df.rename(columns={col_year: 'year', col_month: 'month'})

    # Ensure numeric for all tax columns
    tax_cols = [col for col in df.columns if col not in ['year', 'month']]
    for col in tax_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        
    # Total Provincial Collection
    df['recaudacion_provincial'] = df[tax_cols].sum(axis=1)
    
    # Municipal Distribution from Provincial sources (19% of specific taxes)
    target_taxes = ['inmobiliario rural', 'sellos', 'ingresos brutos']
    # Check if columns exist to avoid KeyError
    available_target_taxes = [col for col in target_taxes if col in df.columns]
    
    df['distribucion_municipal_prov'] = df[available_target_taxes].sum(axis=1) * 0.19
    
    # Rename mapping already applied above for year/month
    
    grouped = df.groupby(['year', 'month'])[['recaudacion_provincial', 'distribucion_municipal_prov']].sum().reset_index()
    
    return grouped

def fetch_rem_projections():
    """
    Fetch REM (Relevamiento de Expectativas de Mercado) monthly CPI projections from PostgreSQL.
    
    Data Source: datalake_economico.rem_precios_minoristas
    Uses the latest survey (max fecha_consulta) which typically contains 6-7 months
    of projections (1-2 backward, 4-5 forward).
    
    Returns:
        dict: {(year, month): decimal_variation} e.g. {(2026, 3): 0.027} for 2.7%
    """
    query = """
    SELECT fecha, mediana
    FROM rem_precios_minoristas
    WHERE fecha_consulta = (SELECT MAX(fecha_consulta) FROM rem_precios_minoristas)
    ORDER BY fecha ASC
    """
    conn = get_pg_ipc_connection()
    try:
        df = pd.read_sql(query, conn)
        projections = {}
        for _, row in df.iterrows():
            fecha = pd.to_datetime(row['fecha'])
            # mediana comes as percentage (e.g. 2.7 for 2.7%), convert to decimal
            projections[(fecha.year, fecha.month)] = float(row['mediana']) / 100
        print(f"  REM: Loaded {len(projections)} monthly projections from latest survey")
        return projections
    except Exception as e:
        print(f"  WARNING: Could not fetch REM projections: {e}")
        return {}
    finally:
        conn.close()

def fetch_ipc():
    """
    Fetch IPC (Índice de Precios al Consumidor) from the database.
    Uses only Region 1 (Nación) for all deflation calculations.
    If official data for recent months is missing, it seamlessly estimates using
    REM projections from rem_precios_minoristas (BCRA survey).
    
    Returns:
        pd.DataFrame: IPC values by year and month since 2020 (Nación only).
    """
    query = """
    SELECT 
        EXTRACT(YEAR FROM fecha)::int as year, 
        EXTRACT(MONTH FROM fecha)::int as month, 
        valor as ipc_valor
    FROM ipc
    WHERE id_region = 1 AND id_categoria = 1 AND id_division = 1
      AND EXTRACT(YEAR FROM fecha) >= 2020
    """
    conn = get_pg_ipc_connection()
    try:
        df = pd.read_sql(query, conn)
        
        # --- PROYECCIONES REM (COMPOUNDING) ---
        rem_projections = fetch_rem_projections()
        
        df_sorted = df.sort_values(['year', 'month'])
        if df_sorted.empty:
            return df
            
        # Find the last official entry
        last_row = df_sorted.iloc[-1]
        last_year = int(last_row['year'])
        last_month = int(last_row['month'])
        current_val = float(last_row['ipc_valor'])
        
        print(f"  IPC: Last official data: {last_year}-{last_month:02d} (valor={current_val:.2f})")
        
        # Walk forward from last official month, compounding REM projections
        new_ipc_rows = []
        curr_y = last_year
        curr_m = last_month
        
        while True:
            curr_m += 1
            if curr_m > 12:
                curr_m = 1
                curr_y += 1
            
            if (curr_y, curr_m) in rem_projections:
                monthly_var = rem_projections[(curr_y, curr_m)]
                current_val = current_val * (1 + monthly_var)
                new_ipc_rows.append({
                    'year': curr_y,
                    'month': curr_m,
                    'ipc_valor': current_val
                })
                print(f"  IPC: Projected {curr_y}-{curr_m:02d} with REM {monthly_var*100:.1f}% -> {current_val:.2f}")
            else:
                break
                    
        if new_ipc_rows:
            df_new = pd.DataFrame(new_ipc_rows)
            df = pd.concat([df, df_new], ignore_index=True)
            
        return df
    finally:
        conn.close()

import calendar

def process_data(df_daily, df_salary, df_ipc, df_esperada, df_reca_prov):
    """
    Core business logic processor for the 'Monitor Mensual' dashboard.
    
    Takes the raw pandas DataFrames and aggregates them month by month.
    It calculates nominal variations, real variations (adjusting by IPC), and Coverage (Masa Salarial vs Coparticipacion).
    It handles logic for running/incomplete months (comparing current days vs same amount of days in the previous year).
    
    Returns:
        dict: A heavily nested dictionary structured precisely for the frontend JSON consumption.
    """
    # Dynamic year detection fallback
    current_year = int(df_daily['year'].max()) if not df_daily.empty else datetime.now().year
    
    # Find up to last 12 distinct months in the dataset
    df_daily_months = df_daily[['year', 'month']].drop_duplicates().sort_values(['year', 'month'])
    target_months = df_daily_months.tail(12)
    
    available_periods = []
    data_by_period = {}
    
    MONTH_NAMES = {
        1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
        7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
    }

    # 1. Prepare Daily Data Template
    all_days = pd.DataFrame({'day': range(1, 32)})

    # Track completeness to find default
    default_period_id = None
    last_available_period_id = None

    # Refactored for performance: Using itertuples instead of iterrows (Fix 2-B)
    for row in target_months.itertuples(index=False):
        iter_year = int(row.year)
        m = int(row.month)
        prev_year = iter_year - 1
        
        month_label = MONTH_NAMES.get(m, str(m))
        period_id = f"{iter_year}-{m:02d}"
        last_available_period_id = period_id
        
        available_periods.append({
            "id": period_id,
            "label": month_label,
            "month": m,
            "year": iter_year
        })
        
        # --- Filter Data ---
        
        # Daily Data
        df_daily_prev = df_daily[(df_daily['year'] == prev_year) & (df_daily['month'] == m)].copy()
        df_daily_curr = df_daily[(df_daily['year'] == iter_year) & (df_daily['month'] == m)].copy()

        # Generate required variable for chart truncation
        real_data_curr = df_daily_curr[df_daily_curr['recaudacion'] > 0]
        max_day_curr = real_data_curr['day'].max() if not real_data_curr.empty else 0
        
        # Determine Completeness: A month is complete only if the NEXT month has data
        next_m = m % 12 + 1
        next_y = iter_year if m < 12 else iter_year + 1
        has_next_month_data = not df_daily[(df_daily['year'] == next_y) & (df_daily['month'] == next_m) & (df_daily['recaudacion'] > 0)].empty
        
        is_complete = bool(has_next_month_data)
        
        if is_complete:
            default_period_id = period_id
        
        # --- Aggregates for Variation (FULL vs FULL) ---
        # User request: "conceptualmente es erroneo ajustar la cantidad de dias de enero, tene en cuenta enero completo"
        # We compare Total Current vs Total Previous (Complete Month)
        
        total_recaudacion_curr = df_daily_curr['recaudacion'].sum()
        total_bruta_curr = df_daily_curr['recaudacion_bruta'].sum() if 'recaudacion_bruta' in df_daily_curr.columns else total_recaudacion_curr
        total_neta_curr = df_daily_curr['recaudacion_neta'].sum() if 'recaudacion_neta' in df_daily_curr.columns else total_recaudacion_curr
        total_dist_muni_curr = df_daily_curr['distribucion_municipal'].sum() if 'distribucion_municipal' in df_daily_curr.columns else 0
        
        # Full previous for Variation Calc (and Display)
        total_recaudacion_prev_full = df_daily_prev['recaudacion'].sum()
        total_bruta_prev_full = df_daily_prev['recaudacion_bruta'].sum() if 'recaudacion_bruta' in df_daily_prev.columns else total_recaudacion_prev_full
        total_neta_prev_full = df_daily_prev['recaudacion_neta'].sum() if 'recaudacion_neta' in df_daily_prev.columns else total_recaudacion_prev_full
        total_dist_muni_prev_full = df_daily_prev['distribucion_municipal'].sum() if 'distribucion_municipal' in df_daily_prev.columns else 0
        
        df_esperada_curr = df_esperada[(df_esperada['year'] == iter_year) & (df_esperada['month'] == m)].copy()
        
        daily_prev = pd.merge(all_days, df_daily_prev[['day', 'recaudacion']], on='day', how='left').fillna(0)
        daily_curr = pd.merge(all_days, df_daily_curr[['day', 'recaudacion']], on='day', how='left').fillna(0)
        
        # 'esperada' columns in the daily dataframe
        if 'esperada' in df_esperada_curr.columns and 'esperada_prov' in df_esperada_curr.columns:
             daily_esperada = pd.merge(all_days, df_esperada_curr[['day', 'esperada', 'esperada_prov']], on='day', how='left').fillna(0)
             total_esperada_curr = df_esperada_curr['esperada'].sum()
             total_esperada_prov_curr = df_esperada_curr['esperada_prov'].sum()
        else:
             # fallback if structure lacks the columns somehow
             daily_esperada = pd.merge(all_days, df_esperada_curr[['day', 'esperada']], on='day', how='left').fillna(0)
             daily_esperada['esperada_prov'] = 0
             total_esperada_curr = df_esperada_curr['esperada'].sum() if 'esperada' in df_esperada_curr.columns else 0
             total_esperada_prov_curr = 0

        daily_curr = pd.merge(daily_curr, daily_esperada, on='day', how='left')
        
        # Salary
        salary_prev_row = df_salary[(df_salary['anio'] == prev_year) & (df_salary['mes'] == m)]
        salary_curr_row = df_salary[(df_salary['anio'] == iter_year) & (df_salary['mes'] == m)]
        
        total_salary_prev = salary_prev_row['masa_salarial'].values[0] if not salary_prev_row.empty else 0
        total_salary_curr = salary_curr_row['masa_salarial'].values[0] if not salary_curr_row.empty else 0
        
        is_masa_incomplete = bool(total_salary_curr == 0)

        # ROP (Recaudacion de Origen Provincial)
        reca_prov_prev_row = df_reca_prov[(df_reca_prov['year'] == prev_year) & (df_reca_prov['month'] == m)]
        reca_prov_curr_row = df_reca_prov[(df_reca_prov['year'] == iter_year) & (df_reca_prov['month'] == m)]
        
        # ROP Bruta (formerly Total)
        rop_bruta_prev = reca_prov_prev_row['recaudacion_provincial'].values[0] if not reca_prov_prev_row.empty else 0
        rop_bruta_curr = reca_prov_curr_row['recaudacion_provincial'].values[0] if not reca_prov_curr_row.empty else 0
        
        # ROP Disponible (Total - Dist Muni Prov)
        dist_muni_prov_prev = reca_prov_prev_row['distribucion_municipal_prov'].values[0] if not reca_prov_prev_row.empty else 0
        dist_muni_prov_curr = reca_prov_curr_row['distribucion_municipal_prov'].values[0] if not reca_prov_curr_row.empty else 0
        
        rop_disponible_prev = rop_bruta_prev - dist_muni_prov_prev
        rop_disponible_curr = rop_bruta_curr - dist_muni_prov_curr
        
        # Combined Summary Metrics
        # RON Disponible is 'total_recaudacion_curr' (refactored from old 'recaudacion')
        total_disponible_prev = total_recaudacion_prev_full + rop_disponible_prev
        total_disponible_curr = total_recaudacion_curr + rop_disponible_curr
        
        # Salary Fallback Logic for Recursos Post Sueldos
        salary_for_calc_curr = total_salary_curr
        if total_salary_curr == 0:
            # Fallback to previous month
            prev_m_target = m - 1
            prev_y_target = iter_year
            if prev_m_target == 0:
                prev_m_target = 12
                prev_y_target = iter_year - 1
            salary_fallback_row = df_salary[(df_salary['anio'] == prev_y_target) & (df_salary['mes'] == prev_m_target)]
            salary_for_calc_curr = salary_fallback_row['masa_salarial'].values[0] if not salary_fallback_row.empty else 0
            
        recursos_post_sueldos_prev = total_disponible_prev - total_salary_prev
        recursos_post_sueldos_curr = total_disponible_curr - salary_for_calc_curr
        
        # Unified Municipal Distribution (for reference/legacy chart)
        unified_dist_muni_prev = total_dist_muni_prev_full + dist_muni_prov_prev
        unified_dist_muni_curr = total_dist_muni_curr + dist_muni_prov_curr

        # IPC & Real Variation (Unified: Nación for all calculations)
        ipc_prev_row = df_ipc[(df_ipc['year'] == prev_year) & (df_ipc['month'] == m)]
        ipc_curr_row = df_ipc[(df_ipc['year'] == iter_year) & (df_ipc['month'] == m)]
        
        val_ipc_prev = ipc_prev_row['ipc_valor'].values[0] if not ipc_prev_row.empty else None
        val_ipc_curr = ipc_curr_row['ipc_valor'].values[0] if not ipc_curr_row.empty else None

        var_ipc_ia = 0
        ipc_missing = True 
        if val_ipc_prev and val_ipc_curr:
            var_ipc_ia = (val_ipc_curr / val_ipc_prev) - 1
            ipc_missing = False
        
        # Variations Recaudacion (Using Full Previous)
        if total_recaudacion_prev_full > 0:
            rec_var_nom = (total_recaudacion_curr / total_recaudacion_prev_full - 1)
            rec_diff_nom = total_recaudacion_curr - total_recaudacion_prev_full
        else:
            rec_var_nom = 0
            rec_diff_nom = 0
            
        # Real Variation using IPC Nación
        rec_var_real = ((1 + rec_var_nom) / (1 + var_ipc_ia) - 1) if not ipc_missing else None
        
        # Variations ROP (formerly Recaudacion Provincial)
        if rop_bruta_prev > 0:
            rop_var_nom = (rop_bruta_curr / rop_bruta_prev - 1)
            rop_diff_nom = rop_bruta_curr - rop_bruta_prev
        else:
            rop_var_nom = 0
            rop_diff_nom = 0
            
        # Real Variation using IPC Nación for ROP
        rop_var_real = ((1 + rop_var_nom) / (1 + var_ipc_ia) - 1) if not ipc_missing else None
        
        # Variations Dist Muni (Unified)
        if unified_dist_muni_prev > 0:
            dist_muni_var_nom = (unified_dist_muni_curr / unified_dist_muni_prev - 1)
            dist_muni_diff_nom = unified_dist_muni_curr - unified_dist_muni_prev
        else:
            dist_muni_var_nom = 0
            dist_muni_diff_nom = 0
            
        # Real Variation Dist Muni Unified (using IPC Nación)
        if unified_dist_muni_prev > 0 and not ipc_missing:
            unified_dist_muni_prev_adj = unified_dist_muni_prev * (1 + var_ipc_ia)
            
            dist_muni_var_real = (unified_dist_muni_curr / unified_dist_muni_prev_adj) - 1
            dist_muni_diff_real = unified_dist_muni_curr - unified_dist_muni_prev_adj
            dist_muni_var_real_fallback = False
        else:
            dist_muni_var_real = None
            dist_muni_diff_real = None
            dist_muni_var_real_fallback = True
        
        # Variations Salario
        if not is_masa_incomplete and total_salary_prev > 0:
            sal_var_nom = (total_salary_curr / total_salary_prev - 1)
            # Real Variation using IPC Nación for Masa Salarial
            sal_var_real = ((1 + sal_var_nom) / (1 + var_ipc_ia) - 1) if not ipc_missing else None
            sal_diff_nom = total_salary_curr - total_salary_prev
        else:
            sal_var_nom = 0
            sal_var_real = 0
            sal_diff_nom = 0
            
        # Variación Real Recursos Totales (RON Bruta + ROP Bruta)
        total_bruta_comb_prev = total_bruta_prev_full + rop_bruta_prev
        total_bruta_comb_curr = total_bruta_curr + rop_bruta_curr
        
        if total_bruta_comb_prev > 0 and not ipc_missing:
             total_bruta_prev_adj = total_bruta_comb_prev * (1 + var_ipc_ia)
             total_recursos_var_real = (total_bruta_comb_curr / total_bruta_prev_adj) - 1
        else:
             total_recursos_var_real = None
        
        # Coverage Calculation (Updated formula)
        # New: Masa Salarial / (RON Bruto + ROP Bruta)
        denom_prev = total_bruta_prev_full + rop_bruta_prev
        denom_curr = total_bruta_curr + rop_bruta_curr
        
        cov_prev = (total_salary_prev / denom_prev) if denom_prev > 0 else 0
        cov_curr = (total_salary_curr / denom_curr) if denom_curr > 0 else 0
        
        # Build Data Object
        data_by_period[period_id] = {
            "kpi": {
                "recaudacion": {
                    "current": total_recaudacion_curr / 1_000_000,
                    "prev": total_recaudacion_prev_full / 1_000_000, 
                    "neta_current": total_neta_curr / 1_000_000,
                    "neta_prev": total_neta_prev_full / 1_000_000,
                    "bruta_current": total_bruta_curr / 1_000_000,
                    "bruta_prev": total_bruta_prev_full / 1_000_000,
                    "disponible_current": total_recaudacion_curr / 1_000_000,
                    "disponible_prev": total_recaudacion_prev_full / 1_000_000,

                    "var_nom": rec_var_nom * 100,
                    "var_real": (rec_var_real * 100) if rec_var_real is not None else None,
                    "diff_nom": rec_diff_nom / 1_000_000,
                    "ipc_missing": ipc_missing,
                    "ipc_used_for_calc": var_ipc_ia * 100,
                    "esperada": total_esperada_curr / 1_000_000,
                    "brecha_abs": (total_neta_curr - total_esperada_curr) / 1_000_000,
                    "brecha_pct": ((total_neta_curr / total_esperada_curr) - 1) * 100 if total_esperada_curr > 0 else 0
                },
                "rop": {
                    "bruta_current": rop_bruta_curr / 1_000_000,
                    "bruta_prev": rop_bruta_prev / 1_000_000,
                    "disponible_current": rop_disponible_curr / 1_000_000,
                    "disponible_prev": rop_disponible_prev / 1_000_000,
                    "var_nom": rop_var_nom * 100,
                    "var_real": (rop_var_real * 100) if rop_var_real is not None else None,
                    "diff_nom": rop_diff_nom / 1_000_000,
                    "diff_real": (rop_var_real * (rop_bruta_prev / (1 + var_ipc_ia)) / 1_000_000) if rop_var_real is not None else 0,

                    "ipc_missing": ipc_missing,
                    "ipc_used_for_calc": var_ipc_ia * 100,
                    "esperada_prov": total_esperada_prov_curr / 1_000_000,
                    "brecha_abs_prov": (rop_bruta_curr - total_esperada_prov_curr) / 1_000_000,
                    "brecha_pct_prov": ((rop_bruta_curr / total_esperada_prov_curr) - 1) * 100 if total_esperada_prov_curr > 0 else 0
                },
                "resumen": {
                    "total_disponible_current": total_disponible_curr / 1_000_000,
                    "total_disponible_prev": total_disponible_prev / 1_000_000,
                    "total_recursos_brutos_var_real": total_recursos_var_real * 100 if total_recursos_var_real is not None else None,
                    "ron_disponible": total_recaudacion_curr / 1_000_000,
                    "rop_disponible": rop_disponible_curr / 1_000_000,
                    "post_sueldos_current": recursos_post_sueldos_curr / 1_000_000,
                    "post_sueldos_prev": recursos_post_sueldos_prev / 1_000_000,
                    "using_fallback_salary": bool(total_salary_curr == 0)
                },
                "distribucion_municipal": {
                    "current": unified_dist_muni_curr / 1_000_000,
                    "prev": unified_dist_muni_prev / 1_000_000,
                    "nacion_current": total_dist_muni_curr / 1_000_000,
                    "nacion_prev": total_dist_muni_prev_full / 1_000_000,
                    "provincia_current": dist_muni_prov_curr / 1_000_000,
                    "provincia_prev": dist_muni_prov_prev / 1_000_000,
                    "var_nom": dist_muni_var_nom * 100,
                    "var_real": (dist_muni_var_real * 100) if dist_muni_var_real is not None else None,
                    "diff_nom": dist_muni_diff_nom / 1_000_000,
                    "diff_real": (dist_muni_diff_real / 1_000_000) if dist_muni_diff_real is not None else None,
                    "ipc_missing": dist_muni_var_real_fallback,
                    "ipc_used_for_calc": 0 # Compound weighting makes this hard to display as a single number
                },
                "masa_salarial": {
                    "current": total_salary_curr / 1_000_000,
                    "prev": total_salary_prev / 1_000_000,
                    "var_nom": sal_var_nom * 100,
                    "var_real": (sal_var_real * 100) if sal_var_real is not None else None,
                    "ipc_missing": ipc_missing,
                    "ipc_used_for_calc": var_ipc_ia * 100,
                    "diff_nom": sal_diff_nom / 1_000_000,
                    "cobertura_current": cov_curr * 100,
                    "cobertura_prev": cov_prev * 100,
                    "is_incomplete": is_masa_incomplete,
                    "recurso_municipal_total": unified_dist_muni_curr / 1_000_000,
                    "recurso_municipal_disponible": total_dist_muni_curr / 1_000_000
                },
                "meta": {
                    "periodo": f"{month_label} {iter_year}",
                    "ipc_ia": var_ipc_ia * 100
                }
            },
            "charts": {
                "daily": {
                    "labels": all_days['day'].astype(str).tolist(),
                    "data_prev_nom": (daily_prev['recaudacion'] / 1_000_000).tolist(),
                    "data_curr": (daily_curr['recaudacion'] / 1_000_000).tolist(),
                    "data_esperada": (daily_curr['esperada'] / 1_000_000).tolist(),
                }
            }
        }
        
        # Add copa_vs_salario chart data 
        masa_salarial_target = total_salary_curr
        salary_target_month = month_label
        if is_masa_incomplete:
            prev_m_target = m - 1
            prev_y_target = iter_year
            if prev_m_target == 0:
                prev_m_target = 12
                prev_y_target = iter_year - 1
            salary_imm_prev_row = df_salary[(df_salary['anio'] == prev_y_target) & (df_salary['mes'] == prev_m_target)]
            if not salary_imm_prev_row.empty:
                masa_salarial_target = salary_imm_prev_row['masa_salarial'].values[0]
                # FIX: actualizar el label al mes de donde se toma la masa salarial
                salary_target_month = MONTH_NAMES.get(prev_m_target, str(prev_m_target))
            else:
                masa_salarial_target = total_salary_prev # Fallback to same month previous year if immediately previous is also missing
                salary_target_month = month_label
            
        daily_curr['recaudacion_acumulada'] = daily_curr['recaudacion'].cumsum()
        daily_curr['neta_acumulada'] = (df_daily_curr['recaudacion_neta'].cumsum() if 'recaudacion_neta' in df_daily_curr.columns else daily_curr['recaudacion_acumulada'])
        daily_curr['esperada_acumulada'] = daily_curr['esperada'].cumsum()
        now = datetime.now()
        is_running_month = (iter_year == now.year and m == now.month)
        
        if (is_running_month or not is_complete) and max_day_curr > 0:
            daily_curr.loc[daily_curr['day'] > max_day_curr, 'recaudacion_acumulada'] = None
            daily_curr.loc[daily_curr['day'] > max_day_curr, 'neta_acumulada'] = None
            daily_curr.loc[daily_curr['day'] > max_day_curr, 'esperada_acumulada'] = None
        elif not is_running_month and max_day_curr == 0:
             daily_curr['recaudacion_acumulada'] = None
             daily_curr['neta_acumulada'] = None
             daily_curr['esperada_acumulada'] = None

        # ROP: serie mensual concentrada en el último día con datos
        cumulative_rop = [None] * len(daily_curr)
        if max_day_curr > 0:
            cumulative_rop[max_day_curr - 1] = rop_disponible_curr / 1_000_000

        data_by_period[period_id]["charts"]["copa_vs_salario"] = {
            "labels": daily_curr['day'].astype(str).tolist(),
            "cumulative_copa": [x / 1_000_000 if pd.notna(x) else None for x in daily_curr['recaudacion_acumulada'].tolist()],
            "cumulative_neta": [x / 1_000_000 if pd.notna(x) else None for x in daily_curr['neta_acumulada'].tolist()],
            "cumulative_esperada": [x / 1_000_000 if pd.notna(x) else None for x in daily_curr['esperada_acumulada'].tolist()],
            "cumulative_rop": cumulative_rop,
            "rop_disponible": rop_disponible_curr / 1_000_000,
            "salario_target": [(masa_salarial_target / 1_000_000)] * len(daily_curr),
            "copa_label": month_label,
            "salario_label": salary_target_month
        }
        
    # If no complete period found, default to available latest
    if default_period_id is None:
        default_period_id = last_available_period_id

    # Final JSON Structure
    data = {
        "meta": {
            "available_periods": available_periods,
            "default_period_id": default_period_id
        },
        "data": data_by_period
    }
    
    return data

def process_annual_monitor_data(df_daily, df_salary, df_ipc, df_esperada, df_reca_prov):
    """
    Generate data for the Monitor Anual: Years are selectable backward.
    Logic includes YTD for incomplete current year.
    """
    all_years = sorted(df_daily['year'].unique(), reverse=True)
    
    available_periods = []
    data_by_period = {}
    
    default_period_id = None
    
    MONTH_NAMES = {
        1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
        7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
    }

    for iter_year in all_years:
        prev_year = iter_year - 1
        
        df_y_curr = df_daily[df_daily['year'] == iter_year]
        if df_y_curr.empty:
            continue
            
        # Determine max month for iter_year with actual data
        df_y_curr_real = df_y_curr[df_y_curr['recaudacion'] > 0]
        if df_y_curr_real.empty:
            continue
            
        max_month_curr = int(df_y_curr_real['month'].max())
        is_complete = (max_month_curr == 12)
        
        if is_complete and default_period_id is None:
            default_period_id = str(iter_year)
            
        period_id = str(iter_year)
        available_periods.append({
            "id": period_id,
            "label": f"Año {iter_year}",
            "year": int(iter_year),
            "incomplete": not is_complete
        })
        
        df_y_prev = df_daily[df_daily['year'] == prev_year]
        
        # YTD KPIs
        recaudacion_curr = 0
        recaudacion_prev = 0
        recaudacion_neta_curr = 0
        recaudacion_neta_prev = 0
        recaudacion_bruta_curr = 0
        recaudacion_bruta_prev = 0
        avg_ipc_used = 0
        ipc_count = 0
        ipc_missing_flag = False
        distribucion_municipal_curr = 0
        distribucion_municipal_prev = 0
        distribucion_municipal_nacion_curr = 0
        distribucion_municipal_nacion_prev = 0
        distribucion_municipal_prov_curr = 0
        distribucion_municipal_prov_prev = 0
        
        recaudacion_provincial_curr = 0
        recaudacion_provincial_prev = 0
        
        real_prev_adjusted = 0
        real_muni_prev_adjusted = 0
        real_reca_prov_prev_adjusted = 0
        
        masa_curr = 0
        masa_prev = 0
        
        # Monthly charts arrays
        monthly_nom_curr = []
        monthly_nom_prev = []
        labels_months = []
        
        cumulative_copa = []
        cumulative_bruta = []
        cumulative_neta = []
        cumulative_esperada = []
        salario_target = []
        
        sum_copa = 0
        sum_bruta = 0
        sum_neta = 0
        sum_esperada = 0
        sum_esperada_prov = 0
        sum_salario = 0


        for m in range(1, 13):
            labels_months.append(MONTH_NAMES[m])
            
            df_m_curr = df_y_curr[df_y_curr['month'] == m]
            df_m_prev = df_y_prev[df_y_prev['month'] == m]
            df_m_esp = df_esperada[(df_esperada['year'] == iter_year) & (df_esperada['month'] == m)]
            
            val_curr = float(df_m_curr['recaudacion'].sum()) if not df_m_curr.empty else 0.0
            val_prev = float(df_m_prev['recaudacion'].sum()) if not df_m_prev.empty else 0.0
            
            val_bruta_curr = float(df_m_curr['recaudacion_bruta'].sum()) if not df_m_curr.empty else 0.0
            val_bruta_prev = float(df_m_prev['recaudacion_bruta'].sum()) if not df_m_prev.empty else 0.0
            
            # Provincial Distribution - ROP (Recaudacion de Origen Provincial)
            df_reca_prov_m_curr = df_reca_prov[(df_reca_prov['year'] == iter_year) & (df_reca_prov['month'] == m)]
            val_rop_bruta_curr = float(df_reca_prov_m_curr['recaudacion_provincial'].sum()) if not df_reca_prov_m_curr.empty else 0.0
            val_muni_prov_curr = float(df_reca_prov_m_curr['distribucion_municipal_prov'].sum()) if not df_reca_prov_m_curr.empty else 0.0
            val_rop_disponible_curr = val_rop_bruta_curr - val_muni_prov_curr
            
            df_reca_prov_m_prev = df_reca_prov[(df_reca_prov['year'] == prev_year) & (df_reca_prov['month'] == m)]
            val_rop_bruta_prev = float(df_reca_prov_m_prev['recaudacion_provincial'].sum()) if not df_reca_prov_m_prev.empty else 0.0
            val_muni_prov_prev = float(df_reca_prov_m_prev['distribucion_municipal_prov'].sum()) if not df_reca_prov_m_prev.empty else 0.0
            val_rop_disponible_prev = val_rop_bruta_prev - val_muni_prov_prev

            val_muni_nacion_curr = float(df_m_curr['distribucion_municipal'].sum()) if not df_m_curr.empty else 0.0
            val_muni_nacion_prev = float(df_m_prev['distribucion_municipal'].sum()) if not df_m_prev.empty else 0.0

            val_muni_curr = val_muni_nacion_curr + val_muni_prov_curr
            val_muni_prev = val_muni_nacion_prev + val_muni_prov_prev
                
            if 'recaudacion_neta' in df_m_curr.columns:
                val_neta_curr = float(df_m_curr['recaudacion_neta'].sum())
            else:
                val_neta_curr = val_curr

            val_esp = float(df_m_esp['esperada'].sum()) if not df_m_esp.empty and 'esperada' in df_m_esp.columns else 0.0
            val_esp_prov = float(df_m_esp['esperada_prov'].sum()) if not df_m_esp.empty and 'esperada_prov' in df_m_esp.columns else 0.0
            
            masa_curr_row = df_salary[(df_salary['anio'] == iter_year) & (df_salary['mes'] == m)]
            masa_prev_row = df_salary[(df_salary['anio'] == prev_year) & (df_salary['mes'] == m)]
            
            m_curr = float(masa_curr_row['masa_salarial'].values[0]) if not masa_curr_row.empty else 0.0
            m_prev = float(masa_prev_row['masa_salarial'].values[0]) if not masa_prev_row.empty else 0.0
            
            monthly_nom_curr.append(val_curr if val_curr > 0 else None)
            monthly_nom_prev.append(val_prev if val_prev > 0 else None)
            
            # Cumulative values build up to Month 12 but use None if missing
            sum_copa += val_curr
            sum_bruta += val_bruta_curr
            sum_neta += val_neta_curr
            sum_esperada += val_esp
            sum_esperada_prov += val_esp_prov
            sum_salario += m_curr
            
            # Additional logic for Summary row and Salary fallback
            sal_for_calc_m_curr = m_curr
            if m_curr == 0 and m <= max_month_curr:
                # Try fallback for annual calculation
                prev_m_t = m - 1
                prev_y_t = iter_year
                if prev_m_t == 0:
                    prev_m_t = 12
                    prev_y_t = iter_year - 1
                sal_fallback_row = df_salary[(df_salary['anio'] == prev_y_t) & (df_salary['mes'] == prev_m_t)]
                sal_for_calc_m_curr = sal_fallback_row['masa_salarial'].values[0] if not sal_fallback_row.empty else 0

            # Cumulative build up - using available data
            cumulative_copa.append(sum_copa if val_curr > 0 else None)
            cumulative_bruta.append(sum_bruta if val_bruta_curr > 0 else None)
            cumulative_neta.append(sum_neta if val_neta_curr > 0 else None)
            cumulative_esperada.append(sum_esperada if val_esp > 0 or (iter_year == 2026 and m <= 12) else None)
            salario_target.append(sum_salario if m_curr > 0 else None)
            
            # YTD Accumulation
            if m <= max_month_curr:
                recaudacion_curr += val_curr
                recaudacion_prev += val_prev
                recaudacion_neta_curr += val_neta_curr
                recaudacion_neta_prev += float(df_m_prev['recaudacion_neta'].sum()) if not df_m_prev.empty else 0.0
                recaudacion_bruta_curr += val_bruta_curr
                recaudacion_bruta_prev += val_bruta_prev
                
                distribucion_municipal_curr += val_muni_curr
                distribucion_municipal_prev += val_muni_prev
                distribucion_municipal_nacion_curr += val_muni_nacion_curr
                distribucion_municipal_nacion_prev += val_muni_nacion_prev
                distribucion_municipal_prov_curr += val_muni_prov_curr
                distribucion_municipal_prov_prev += val_muni_prov_prev
                
                recaudacion_provincial_curr += val_rop_bruta_curr
                recaudacion_provincial_prev += val_rop_bruta_prev
                
                masa_curr += m_curr
                # For summary we might need the fallback accumulated
                # (Skipping deep accumulation fallback for post_sueldos_total for now unless strictly needed)
                masa_prev += m_prev
                
                # IPC Unified Logic (Nación only)
                ipc_c = df_ipc[(df_ipc['year'] == iter_year) & (df_ipc['month'] == m)]
                ipc_p = df_ipc[(df_ipc['year'] == prev_year) & (df_ipc['month'] == m)]
                
                val_ipc_c = ipc_c['ipc_valor'].values[0] if not ipc_c.empty else None
                val_ipc_p = ipc_p['ipc_valor'].values[0] if not ipc_p.empty else None
                
                var_ipc_ia = 0
                if val_ipc_c and val_ipc_p:
                    var_ipc_ia = (val_ipc_c / val_ipc_p) - 1
                else:
                    ipc_missing_flag = True
                    var_ipc_ia = 0
                
                avg_ipc_used += var_ipc_ia
                ipc_count += 1
                
                real_prev_adjusted += val_prev * (1 + var_ipc_ia)
                real_muni_prev_adjusted += val_muni_prev * (1 + var_ipc_ia)
                real_reca_prov_prev_adjusted += val_rop_bruta_prev * (1 + var_ipc_ia)

        avg_ipc_ia = (avg_ipc_used / ipc_count) if ipc_count > 0 else 0
        
        diff_nom_rec = recaudacion_curr - recaudacion_prev
        var_nom_rec = (diff_nom_rec / recaudacion_prev * 100) if recaudacion_prev > 0 else 0
        
        diff_real_rec = recaudacion_curr - real_prev_adjusted
        var_real_rec = (diff_real_rec / real_prev_adjusted * 100) if real_prev_adjusted > 0 else 0
        
        # Distribucion Municipal Unified
        diff_nom_muni = distribucion_municipal_curr - distribucion_municipal_prev
        var_nom_muni = (diff_nom_muni / distribucion_municipal_prev * 100) if distribucion_municipal_prev > 0 else 0
        
        real_muni_unified_prev_adjusted = real_muni_prev_adjusted
        diff_real_muni = distribucion_municipal_curr - real_muni_unified_prev_adjusted
        var_real_muni = (diff_real_muni / real_muni_unified_prev_adjusted * 100) if real_muni_unified_prev_adjusted > 0 else 0
        # Summary KPIs
        ron_disponible_curr = recaudacion_curr
        rop_disponible_curr = recaudacion_provincial_curr - distribucion_municipal_prov_curr
        total_disponible_curr = ron_disponible_curr + rop_disponible_curr
        
        ron_disponible_prev = recaudacion_prev
        rop_disponible_prev = recaudacion_provincial_prev - distribucion_municipal_prov_prev
        total_disponible_prev = ron_disponible_prev + rop_disponible_prev
        
        post_sueldos_curr = total_disponible_curr - masa_curr
        post_sueldos_prev = total_disponible_prev - masa_prev
        
        # Coverage calculation for year (Salary / (RON Bruta + ROP Bruta))
        denom_y_curr = recaudacion_bruta_curr + recaudacion_provincial_curr
        denom_y_prev = recaudacion_bruta_prev + recaudacion_provincial_prev
        
        coverage_y_curr = (masa_curr / denom_y_curr) if denom_y_curr > 0 else 0
        coverage_y_prev = (masa_prev / denom_y_prev) if denom_y_prev > 0 else 0
        
        # Recaudacion Provincial
        diff_nom_reca_prov = recaudacion_provincial_curr - recaudacion_provincial_prev
        var_nom_reca_prov = (diff_nom_reca_prov / recaudacion_provincial_prev * 100) if recaudacion_provincial_prev > 0 else 0
        
        diff_real_reca_prov = recaudacion_provincial_curr - real_reca_prov_prev_adjusted
        var_real_reca_prov = (diff_real_reca_prov / real_reca_prov_prev_adjusted * 100) if real_reca_prov_prev_adjusted > 0 else 0

        diff_nom_masa = masa_curr - masa_prev
        var_nom_masa = (diff_nom_masa / masa_prev * 100) if masa_prev > 0 else 0
        
        masa_prev_adjusted = masa_prev * (1 + avg_ipc_ia)
        diff_real_masa = masa_curr - masa_prev_adjusted
        var_real_masa = (diff_real_masa / masa_prev_adjusted * 100) if masa_prev_adjusted > 0 else 0
        
        data_by_period[period_id] = {
            "kpi": {
                "meta": {
                    "periodo": f"Año {iter_year}" + (" (YTD)" if not is_complete else ""),
                    "max_month": max_month_curr,
                    "is_complete": is_complete
                },
                "resumen": {
                    "total_disponible_current": total_disponible_curr / 1_000_000,
                    "total_disponible_prev": total_disponible_prev / 1_000_000,
                    "post_sueldos_current": post_sueldos_curr / 1_000_000,
                    "post_sueldos_prev": post_sueldos_prev / 1_000_000,
                    "ron_disponible": ron_disponible_curr / 1_000_000,
                    "rop_disponible": rop_disponible_curr / 1_000_000
                },
                "recaudacion": {
                    "current": recaudacion_curr / 1_000_000,
                    "prev": recaudacion_prev / 1_000_000,
                    "neta_current": recaudacion_neta_curr / 1_000_000,
                    "neta_prev": recaudacion_neta_prev / 1_000_000,
                    "bruta_current": recaudacion_bruta_curr / 1_000_000,
                    "bruta_prev": recaudacion_bruta_prev / 1_000_000,
                    "diff_nom": diff_nom_rec / 1_000_000,
                    "var_nom": var_nom_rec,
                    "var_real": var_real_rec,
                    "ipc_missing": ipc_missing_flag,
                    "avg_ipc_used": avg_ipc_ia * 100,
                    "esperada": sum_esperada / 1_000_000 if sum_esperada > 0 else 0,
                    "brecha_abs": (recaudacion_neta_curr - sum_esperada) / 1_000_000 if sum_esperada > 0 else 0,
                    "brecha_pct": ((recaudacion_neta_curr / sum_esperada) - 1) * 100 if sum_esperada > 0 else 0
                },
                "rop": {
                    "bruta_current": recaudacion_provincial_curr / 1_000_000,
                    "bruta_prev": recaudacion_provincial_prev / 1_000_000,
                    "disponible_current": rop_disponible_curr / 1_000_000,
                    "disponible_prev": rop_disponible_prev / 1_000_000,
                    "var_nom": var_nom_reca_prov,
                    "var_real": var_real_reca_prov,
                    "diff_nom": diff_nom_reca_prov / 1_000_000,
                    "ipc_missing": ipc_missing_flag,
                    "avg_ipc_used": avg_ipc_ia * 100,
                    "esperada_prov": sum_esperada_prov / 1_000_000 if sum_esperada_prov > 0 else 0,
                    "brecha_abs_prov": (recaudacion_provincial_curr - sum_esperada_prov) / 1_000_000 if sum_esperada_prov > 0 else 0,
                    "brecha_pct_prov": ((recaudacion_provincial_curr / sum_esperada_prov) - 1) * 100 if sum_esperada_prov > 0 else 0
                },
                "distribucion_municipal": {
                    "current": distribucion_municipal_curr / 1_000_000,
                    "prev": distribucion_municipal_prev / 1_000_000,
                    "nacion_current": distribucion_municipal_nacion_curr / 1_000_000,
                    "nacion_prev": distribucion_municipal_nacion_prev / 1_000_000,
                    "provincia_current": distribucion_municipal_prov_curr / 1_000_000,
                    "provincia_prev": distribucion_municipal_prov_prev / 1_000_000,
                    "diff_nom": diff_nom_muni / 1_000_000,
                    "diff_real": diff_real_muni / 1_000_000,
                    "var_nom": var_nom_muni,
                    "var_real": var_real_muni,
                    "ipc_missing": ipc_missing_flag,
                    "ipc_used_for_calc": 0
                },
                "masa_salarial": {
                    "current": masa_curr / 1_000_000,
                    "prev": masa_prev / 1_000_000,
                    "diff_nom": diff_nom_masa / 1_000_000,
                    "var_nom": var_nom_masa,
                    "var_real": var_real_masa,
                    "ipc_missing": ipc_missing_flag,
                    "avg_ipc_used": avg_ipc_ia * 100,
                    "cobertura_current": coverage_y_curr * 100,
                    "cobertura_prev": coverage_y_prev * 100,
                    "is_incomplete": (masa_curr == 0),
                    "recurso_municipal_total": distribucion_municipal_curr / 1_000_000,
                    "recurso_municipal_disponible": distribucion_municipal_nacion_curr / 1_000_000
                }
            },
            "charts": {
                "monthly": {
                    "labels": labels_months,
                    "data_curr": monthly_nom_curr,
                    "data_prev": monthly_nom_prev
                },
                "copa_vs_salario": {
                    "labels": labels_months,
                    "cumulative_copa": cumulative_copa,
                    "cumulative_bruta": cumulative_bruta,
                    "cumulative_neta": cumulative_neta,
                    "salario_target": salario_target,
                    "cumulative_esperada": cumulative_esperada,
                    "copa_label": f"Año {iter_year}",
                    "salario_label": f"Año {iter_year}"
                }
            }
        }

    return {
        "meta": {
            "available_periods": available_periods,
            "default_period_id": default_period_id if default_period_id else (available_periods[0]['id'] if available_periods else None)
        },
        "data": data_by_period
    }

def process_annual_data(df_daily, df_ipc):
    """
    Process annual data for the last 4 years (regardless of completeness).
    """
    # 1. Identify COMPLETE years (having data for December)
    all_years = sorted(df_daily['year'].unique())
    
    complete_years = []
    for y in all_years:
        has_december = not df_daily[(df_daily['year'] == y) & (df_daily['month'] == 12)].empty
        if has_december:
            complete_years.append(y)
            
    # Select last 4 complete years
    target_years = complete_years[-4:] if len(complete_years) > 0 else []
    
    # 3. Calculate metrics for these years
    annual_metrics = []
    
    # Find Base IPC (Fixed: Jan 2022) or first available year in target
    base_year = target_years[0] if target_years else 2022
    ipc_base_row = df_ipc[(df_ipc['year'] == base_year) & (df_ipc['month'] == 1)]
    
    if not ipc_base_row.empty:
        ipc_base_val = ipc_base_row['ipc_valor'].values[0]
        base_label = f"Enero {base_year}"
    else:
        ipc_base_val = df_ipc['ipc_valor'].iloc[0] if not df_ipc.empty else 100
        base_label = "Base Inicial"
        
    prev_nominal = None
    prev_real = None

    for y in target_years:
        # Aggregates
        df_y = df_daily[df_daily['year'] == y]
        nominal_total = df_y['recaudacion'].sum()
        
        # Real Total (Deflated to Base Period)
        real_total = 0
        for m in range(1, 13):
            month_revRev = df_y[df_y['month'] == m]['recaudacion'].sum()
            
            ipc_m_row = df_ipc[(df_ipc['year'] == y) & (df_ipc['month'] == m)]
            ipc_m_val = ipc_m_row['ipc_valor'].values[0] if not ipc_m_row.empty else None
            
            if ipc_m_val and ipc_base_val:
                factor = ipc_base_val / ipc_m_val
                real_month = month_revRev * factor
                real_total += real_month
            else:
                real_total += month_revRev

        # Calculate Variations
        var_nom = None
        var_real = None
        
        if prev_nominal is not None and prev_nominal > 0:
            var_nom = (nominal_total / prev_nominal - 1) * 100
            
        if prev_real is not None and prev_real > 0:
            var_real = (real_total / prev_real - 1) * 100

        annual_metrics.append({
            "year": int(y),
            "nominal": nominal_total,
            "real": real_total,
            "var_nominal": var_nom,
            "var_real": var_real
        })
        
        prev_nominal = nominal_total
        prev_real = real_total
        
    return {
        "periods": annual_metrics,
        "meta": {
            "base_ipc": base_label,
            "years_included": [int(y) for y in target_years]
        }
    }

def process_chart_data(df_daily, df_ipc, df_reca_prov=None):
    """
    Process interannual variations for Total Resources and inflation for the last 12 COMPLETE months.
    Only includes months where we have complete data (through at least day 25).
    """
    # 1. Determine completeness for each month
    completeness_data = []
    
    for (year, month), group in df_daily.groupby(['year', 'month']):
        real_data = group[group['recaudacion'] > 0]
        max_day = real_data['day'].max() if not real_data.empty else 0
        is_complete = max_day >= 25
        
        completeness_data.append({
            'year': year,
            'month': month,
            'is_complete': is_complete
        })
    
    df_completeness = pd.DataFrame(completeness_data)
    
    # 2. Group daily coparticipation by year and month using Bruta
    group_cols = ['year', 'month']
    df_monthly = df_daily.groupby(group_cols)[['recaudacion', 'recaudacion_neta', 'recaudacion_bruta']].sum().reset_index()
    
    # Merge with Provincial Recaudacion (ROP) for "Total Resources"
    if df_reca_prov is not None:
        df_rop_monthly = df_reca_prov[['year', 'month', 'recaudacion_provincial']].copy()
        df_monthly = pd.merge(df_monthly, df_rop_monthly, on=['year', 'month'], how='left').fillna(0)
        # Total Resources = RON Bruta + ROP Bruta
        df_monthly['recursos_totales'] = df_monthly['recaudacion_bruta'] + df_monthly['recaudacion_provincial']
    else:
        df_monthly['recursos_totales'] = df_monthly['recaudacion_bruta']
        
    df_monthly = df_monthly.sort_values(['year', 'month'])
    
    # 3. Merge with completeness info
    df_monthly = pd.merge(df_monthly, df_completeness, on=['year', 'month'], how='left')
    
    # 4. Filter only complete months
    df_monthly = df_monthly[df_monthly['is_complete'] == True].copy()
    
    # 5. Merge with IPC (Nación)
    df_combined = pd.merge(df_monthly, df_ipc, on=['year', 'month'], how='left')
    df_combined = df_combined.sort_values(['year', 'month'])
    
    # 6. Calculate interannual variations (year-over-year)
    df_combined['year_prev'] = df_combined['year'] - 1
    
    df_prev = df_combined[['year', 'month', 'recursos_totales', 'ipc_valor']].copy()
    df_prev.columns = ['year_prev', 'month', 'recursos_totales_prev', 'ipc_valor_prev']
    
    df_combined = pd.merge(
        df_combined, 
        df_prev, 
        on=['year_prev', 'month'], 
        how='left'
    )
    
    df_combined['total_var_interanual'] = ((df_combined['recursos_totales'] / df_combined['recursos_totales_prev']) - 1) * 100
    df_combined['ipc_var_interanual'] = ((df_combined['ipc_valor'] / df_combined['ipc_valor_prev']) - 1) * 100
    
    # 7. Get last 12 complete months
    df_chart = df_combined.dropna(subset=['total_var_interanual', 'ipc_var_interanual']).tail(12)
    
    MONTH_NAMES = {
        1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
        7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
    }
    
    return {
        "labels": [f"{MONTH_NAMES.get(m, str(m))[:3]} {str(y)[-2:]}" for y, m in zip(df_chart['year'], df_chart['month'])],
        "total_var_interanual": df_chart['total_var_interanual'].tolist(),
        "ipc_var_interanual": df_chart['ipc_var_interanual'].tolist()
    }

def fetch_cbt():
    """
    Fetch CBT NEA from Google Sheets CSV export.
    """
    import io
    import requests
    from datetime import datetime
    from dateutil.relativedelta import relativedelta
    
    url = "https://docs.google.com/spreadsheets/d/17K0k_OvXFa-9jjIaX7Q5Nwz5TkxHMqXIxm-qYhDWYyA/export?format=csv&gid=1100278723"
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
    except Exception as e:
        print(f"Error fetching CBT: {e}")
        return pd.DataFrame(columns=['fecha', 'cbt_nea', 'year', 'month'])
    
    csv_data = io.StringIO(response.text)
    df = pd.read_csv(csv_data)
    
    cbt_column = df.iloc[:, 4]  # Column E
    start_date = datetime(2016, 4, 1)
    
    data = []
    for idx, value in enumerate(cbt_column):
        if pd.isna(value) or value == '':
            continue
            
        if isinstance(value, str):
            cleaned = value.replace('$', '').replace(' ', '').strip()
            cleaned = cleaned.replace('.', '')
            cleaned = cleaned.replace(',', '.')
            try:
                cbt_value = float(cleaned)
            except ValueError:
                continue
        else:
            cbt_value = float(value)
        
        if cbt_value > 0:
            fecha = start_date + relativedelta(months=idx)
            data.append({
                'fecha': fecha,
                'cbt_nea': cbt_value
            })
    
    df_cbt = pd.DataFrame(data)
    
    # Filter for historical context (we can keep all or filter for reasonable window)
    if not df_cbt.empty:
        df_cbt['year'] = df_cbt['fecha'].dt.year
        df_cbt['month'] = df_cbt['fecha'].dt.month
        
    return df_cbt

def fetch_salary_details(target_years):
    """
    Fetch detailed salary data for Purchasing Power calculation.
    """
    years_str = ",".join(map(str, target_years))
    query = f"""
    SELECT 
        anio, 
        mes, 
        liquidacion,
        importe_gral,
        total_gral
    FROM plantilla_personal_provincia
    WHERE anio IN ({years_str})
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query)
        columns = [col[0] for col in cursor.description]
        data = cursor.fetchall()
        df = pd.DataFrame(data, columns=columns)
        
        df['importe_gral'] = pd.to_numeric(df['importe_gral'], errors='coerce').fillna(0)
        df['total_gral'] = pd.to_numeric(df['total_gral'], errors='coerce').fillna(0)
        
        return df
    finally:
        conn.close()

def process_new_charts(df_daily, df_salary_details, df_cbt):
    """
    Process Purchasing Power and Coverage.
    """
    
    # --- 1. Average Salary Calculation ---
    # Filter SAC for avg salary logic (Strict Regex)
    # User Request: "cuando hablamos de salario promedio no (se incluye sac)"
    # Regex for SAC variations
    sac_terms = r'SAC|S\.A\.C|sac|s\.a\.c|Cuota\s*SAC|Aguinaldo'
    df_no_sac = df_salary_details[~df_salary_details['liquidacion'].str.contains(sac_terms, case=False, na=False)].copy()
    
    # Wage amount for Avg Salary (No SAC)
    masa_avg = df_no_sac.groupby(['anio', 'mes'])['importe_gral'].sum().reset_index()
    masa_avg.rename(columns={'importe_gral': 'masa_para_promedio'}, inplace=True)
    
    # Employee count (from 'sueldo' rows only)
    # Assuming 'sueldo' identifies main salary rows for counting people
    df_empleados = df_no_sac[df_no_sac['liquidacion'].str.contains('sueldo', case=False, na=False)].copy()
    empleados = df_empleados.groupby(['anio', 'mes'])['total_gral'].sum().reset_index()
    empleados.rename(columns={'total_gral': 'cantidad_empleados'}, inplace=True)
    
    # Merge for Avg Salary
    df_salaries = pd.merge(masa_avg, empleados, on=['anio', 'mes'], how='inner')
    df_salaries['salario_promedio'] = df_salaries['masa_para_promedio'] / df_salaries['cantidad_empleados']
    
    # --- 2. Wage Bill (Total) Calculation ---
    # Include EVERYTHING for coverage (User Request: "todo lo que tenga que ver con masa salarial tiene que incluir el sac")
    masa_total = df_salary_details.groupby(['anio', 'mes'])['importe_gral'].sum().reset_index()
    masa_total.rename(columns={'importe_gral': 'masa_salarial_total'}, inplace=True)
    
    # --- 3. Purchasing Power Chart (Last 12 months) ---
    df_pp = pd.merge(df_salaries, df_cbt, left_on=['anio', 'mes'], right_on=['year', 'month'], how='left')
    df_pp = df_pp.sort_values(['anio', 'mes']).dropna(subset=['salario_promedio'])
    df_pp_chart = df_pp.tail(12).copy()
    
    df_pp_chart['purchasing_power'] = df_pp_chart['salario_promedio'] / df_pp_chart['cbt_nea']
    
    MONTH_NAMES = {
        1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "Mayo", 6: "Jun",
        7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic"
    }
    
    pp_chart_data = {
        "labels": [f"{MONTH_NAMES.get(m, str(m))} {str(y)[2:]}" for y, m in zip(df_pp_chart['anio'], df_pp_chart['mes'])],
        "values": [x if pd.notna(x) else None for x in df_pp_chart['purchasing_power'].tolist()],
        "cbt_values": [x if pd.notna(x) else None for x in df_pp_chart['cbt_nea'].tolist()],
        "salary_values": [x if pd.notna(x) else None for x in df_pp_chart['salario_promedio'].tolist()]
    }
    
    # --- 4. Coverage Chart (Latest Month) ---
    df_copa_monthly = df_daily.groupby(['year', 'month'])['recaudacion'].sum().reset_index()
    df_cov = pd.merge(masa_total, df_copa_monthly, left_on=['anio', 'mes'], right_on=['year', 'month'], how='inner')
    
    if not df_cov.empty:
        latest_cov = df_cov.sort_values(['anio', 'mes']).iloc[-1]
        
        copa_total = latest_cov['recaudacion']
        salary_total = latest_cov['masa_salarial_total']
        remainder = max(0, copa_total - salary_total)
        
        coverage_chart_data = {
            "period": f"{MONTH_NAMES.get(int(latest_cov['mes']))} {latest_cov['anio']}",
            "masa_salarial": float(salary_total) if pd.notna(salary_total) else 0,
            "resto_copa": float(remainder) if pd.notna(remainder) else 0,
            "total_copa": float(copa_total) if pd.notna(copa_total) else 0,
            "percentage_covered": float((salary_total / copa_total * 100)) if (pd.notna(copa_total) and copa_total > 0) else 0
        }
    else:
        coverage_chart_data = None
        
    return {
        "purchasing_power": pp_chart_data,
        "coverage": coverage_chart_data
    }

def process_personal_kpis(df_salary_details, df_cbt, df_ipc):
    sac_terms = r'SAC|S\.A\.C|sac|s\.a\.c|Cuota\s*SAC|Aguinaldo'
    df_no_sac = df_salary_details[~df_salary_details['liquidacion'].str.contains(sac_terms, case=False, na=False)].copy()
    
    masa_avg = df_no_sac.groupby(['anio', 'mes'])['importe_gral'].sum().reset_index()
    masa_avg.rename(columns={'importe_gral': 'masa_para_promedio'}, inplace=True)
    
    df_empleados = df_no_sac[df_no_sac['liquidacion'].str.contains('sueldo', case=False, na=False)].copy()
    empleados = df_empleados.groupby(['anio', 'mes'])['total_gral'].sum().reset_index()
    empleados.rename(columns={'total_gral': 'cantidad_empleados'}, inplace=True)
    
    df = pd.merge(masa_avg, empleados, on=['anio', 'mes'], how='inner')
    df['cantidad_empleados'] = df['cantidad_empleados'].replace(0, np.nan)
    df['salario_promedio'] = df['masa_para_promedio'] / df['cantidad_empleados']
    
    # Merge IPC (Nación for salary deflation)
    df = pd.merge(df, df_ipc, left_on=['anio', 'mes'], right_on=['year', 'month'], how='left')
    df = pd.merge(df, df_cbt, left_on=['anio', 'mes'], right_on=['year', 'month'], how='left')
    
    df.sort_values(by=['anio', 'mes'], inplace=True)
    
    df['anio_prev'] = df['anio'] - 1
    df_prev = df[['anio', 'mes', 'salario_promedio', 'ipc_valor']].copy()
    df_prev.columns = ['anio_prev', 'mes', 'salario_promedio_prev', 'ipc_valor_prev']
    
    df = pd.merge(df, df_prev, on=['anio_prev', 'mes'], how='left')
    
    df['var_nominal_ia'] = (df['salario_promedio'] / df['salario_promedio_prev']) - 1
    df['var_ipc_ia'] = (df['ipc_valor'] / df['ipc_valor_prev']) - 1
    # Safeguard division by zero
    val_div = 1 + df['var_ipc_ia']
    val_div = val_div.replace(0, np.nan)
    df['var_real_ia'] = ((1 + df['var_nominal_ia']) / val_div) - 1
    df['cbt_ratio'] = df['salario_promedio'] / df['cbt_nea']
    
    result = {}
    for _, row in df.iterrows():
        period_id = f"{int(row['anio'])}-{int(row['mes']):02d}"
        var_real_ia = row['var_real_ia'] * 100 if pd.notna(row['var_real_ia']) else None
        cbt_ratio = row['cbt_ratio'] if pd.notna(row['cbt_ratio']) else None
        
        result[period_id] = {
            "salario_var_real_ia": float(var_real_ia) if var_real_ia is not None else None,
            "cbt_ratio": float(cbt_ratio) if cbt_ratio is not None else None
        }
    return result

def main():
    print("Fetching Daily Coparticipation...")
    df_daily = fetch_coparticipacion_daily()
    
    print("Fetching Daily Expected Coparticipation...")
    df_esperada = fetch_copa_esperada()
    
    # Determine years to fetch based on daily data + system year
    years_present = df_daily['year'].unique().tolist()
    if not years_present:
        years_present = [datetime.now().year]
    
    # Determine years to fetch: current plus last 4 years to cover annual analysis correctly
    current_year = max(years_present)
    target_years = [current_year - i for i in range(5)]
    
    print(f"Target Years for Salary: {target_years}")
    
    print("Fetching Monthly Salary...")
    df_salary = fetch_masa_salarial(target_years)
    
    print("Fetching Provincial Recaudacion...")
    df_reca_prov = fetch_recaudacion_provincial()
    
    print("Fetching IPC Nación + REM Projections...")
    df_ipc = fetch_ipc()
    
    print("Processing Data...")
    json_data = process_data(df_daily, df_salary, df_ipc, df_esperada, df_reca_prov)
    
    print("Processing Annual Monitor Data...")
    json_data["annual_monitor"] = process_annual_monitor_data(df_daily, df_salary, df_ipc, df_esperada, df_reca_prov)
    
    print("Processing Annual Data...")
    annual_data = process_annual_data(df_daily, df_ipc)
    json_data["annual"] = annual_data
    
    print("Processing Chart Data (Monthly Variations)...")
    chart_data = process_chart_data(df_daily, df_ipc, df_reca_prov)
    json_data["global_charts"] = chart_data
    
    print("Fetching CBT Data for Secondary Charts...")
    df_cbt = fetch_cbt()
    
    print("Fetching Detailed Salary Data for Secondary Charts...")
    df_salary_details = fetch_salary_details(target_years)
    
    print("Processing Average Salary & Purchasing Power...")
    new_charts = process_new_charts(df_daily, df_salary_details, df_cbt)
    json_data["secondary_charts"] = new_charts

    print("Injecting Personal KPIs to Periods...")
    personal_kpis = process_personal_kpis(df_salary_details, df_cbt, df_ipc)
    for period_id, p_data in json_data.get("data", {}).items():
        if period_id in personal_kpis:
            p_data["kpi"]["personal"] = personal_kpis[period_id]
        else:
            p_data["kpi"]["personal"] = {"salario_var_real_ia": None, "cbt_ratio": None}

    # Obfuscated filename (Fix 1-B)
    output_path = os.path.join(os.path.dirname(__file__), '..', 'data', '_data_ipce_v1.json')
    with open(output_path, 'w') as f:
        json.dump(json_data, f, indent=2)
        
    print(f"Data saved to {output_path}")

    # Dashboard de Gastos desde Postgres
    print("Processing Gasto Data from PostgreSQL...")
    
    try:
        conn = get_pg_connection()
        query = """
            SELECT 
                periodo, 
                jurisdiccion, 
                tipo_financ, 
                partida, 
                estado, 
                monto 
            FROM copa_gastos 
            WHERE estado != 'Saldo' 
              AND partida != 'Total de la Fuente' 
              AND tipo_financ IN ('10','11','12','13','14')
        """
        df_gasto = pd.read_sql(query, conn)
        
        # Ensure periodo is YYYY-MM
        if pd.api.types.is_datetime64_any_dtype(df_gasto['periodo']):
            df_gasto['periodo'] = df_gasto['periodo'].dt.strftime('%Y-%m')
        else:
            df_gasto['periodo'] = pd.to_datetime(df_gasto['periodo'], errors='coerce').dt.strftime('%Y-%m')
            
        name_map = {
            "GASTO EN PERSONAL": "GASTOS EN PERSONAL",
            "SERVICIO DE LA DEUDA Y DISMINUCION DE OTROS": "SERVICIO DE LA DEUDA"
        }
        df_gasto["partida"] = df_gasto["partida"].apply(lambda x: name_map.get(x, x))
        
        # Mapeo de jurisdicciones debido a diferencias y truncados en la Base
        juris_map = {
            "MINISTERIO DE EDUCACION": "MINISTERIO DE EDUCACIÓN",
            "MINISTERIO DE SALUD PUBLICA": "MINISTERIO DE SALUD PÚBLICA",
            "MINISTERIO DE PRODUCCION": "MINISTERIO DE PRODUCCIÓN",
            "MINISTERIO DE OBRAS Y SERVICIOS PUBLICOS": "MINISTERIO DE OBRAS Y SERVICIOS PÚBLICOS",
            "MINISTERIO DE COORDINACION Y": "MINISTERIO DE COORDINACIÓN Y PLANIFICACIÓN",
            "MINISTERIO DE JUSTICIA Y DERECHOS": "MINISTERIO DE JUSTICIA Y DERECHOS HUMANOS",
            "MINISTERIO DE INDUSTRIA TRABAJO Y": "MINISTERIO DE INDUSTRIA TRABAJO Y COMERCIO",
            "INSTITUTO CORRENTINO DEL AGUA Y DEL": "INSTITUTO CORRENTINO DEL AGUA Y DEL AMBIENTE",
            "DIRECCION PROVINCIAL DE VIALIDAD": "DIRECCIÓN PROVINCIAL DEL VIALIDAD",
            "ADMINIST. DE OBRAS SANITARIAS DE": "ADMINISTRACIÓN DE OBRAS SANITARIAS DE CORRIENTES",
            "INSTITUTO DE DESARROLLO RURAL DE": "INSTITUTO DE DESARROLLO RURAL DE CORRIENTES",
            "CENTRO DE ONCOLOGIA \"ANNA ROCCA DE": "CENTRO DE ONCOLOGIA 'ANNA ROCCA DE BONATTI'",
            "AGENCIA CORRENTINA DE BIENES DEL": "AGENCIA CORRENTINA DE BIENES DEL ESTADO"
        }
        df_gasto["jurisdiccion"] = df_gasto["jurisdiccion"].str.strip().apply(lambda x: juris_map.get(x, x))
        
        gasto_data = df_gasto.to_dict(orient="records")
        gasto_json_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'gasto_data.json')
        
        with open(gasto_json_path, 'w', encoding='utf-8') as f:
            json.dump(gasto_data, f, ensure_ascii=False, indent=2)
            
        print(f"Gasto data saved to {gasto_json_path}")
    except Exception as e:
        print(f"Error processing Gasto data: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    main()
