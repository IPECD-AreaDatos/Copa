import time
import os
import mysql.connector
import psycopg2
import pandas as pd
from datetime import datetime
from mysql.connector import Error
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# DB Configuration from Environment Variables (Fix 1-C: Remove hardcoded defaults)
DB_CONFIG = {
    'user': os.getenv('DB_USER'),
    'host': os.getenv('DB_HOST'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_DATABASE'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'connect_timeout': 20
}

def get_connection(max_retries=3):
    retry_count = 0
    while retry_count < max_retries:
        try:
            conn = mysql.connector.connect(**DB_CONFIG)
            if conn.is_connected():
                return conn
        except Error as e:
            print(f"Connection attempt {retry_count + 1} failed: {e}")
            retry_count += 1
            if retry_count < max_retries:
                print("Retrying in 5 seconds...")
                time.sleep(5)
            else:
                print("Max retries reached. Exiting.")
                raise e

def get_pg_ipc_connection():
    return psycopg2.connect(
        host=os.getenv("PG_HOST"),
        port=os.getenv("PG_PORT"),
        user=os.getenv("PG_USER"),
        password=os.getenv("PG_PASSWORD"),
        dbname="datalake_economico"
    )

def fetch_data():
    query = """
    SELECT 
        anio, 
        mes, 
        jurisdiccion, 
        liquidacion, 
        total_gral, 
        importe_gral 
    FROM plantilla_personal_provincia
    """
    
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query)
        columns = [col[0] for col in cursor.description]
        data = cursor.fetchall()
        df = pd.DataFrame(data, columns=columns)
        return df
    finally:
        if 'cursor' in locals():
            cursor.close()
        conn.close()

def fetch_rem_projections():
    """
    Fetch REM monthly CPI projections from PostgreSQL (latest survey).
    Returns dict: {(year, month): decimal_variation}
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
            projections[(fecha.year, fecha.month)] = float(row['mediana']) / 100
        print(f"  REM: Loaded {len(projections)} monthly projections")
        return projections
    except Exception as e:
        print(f"  WARNING: Could not fetch REM projections: {e}")
        return {}
    finally:
        conn.close()

def fetch_ipc_nacion():
    # Fetch IPC data for Region 1 (Nación), Category 1 (General), Division 1
    # Fills missing months with REM projections
    query = """
    SELECT 
        EXTRACT(YEAR FROM fecha)::int as anio, 
        EXTRACT(MONTH FROM fecha)::int as mes, 
        valor as ipc_valor,
        var_mensual as ipc_var_mensual
    FROM ipc
    WHERE id_region = 1 AND id_categoria = 1 AND id_division = 1
    ORDER BY fecha
    """
    conn = get_pg_ipc_connection()
    try:
        df = pd.read_sql(query, conn)
        
        # Fill missing months with REM projections
        rem_projections = fetch_rem_projections()
        
        if df.empty:
            return df
            
        last_row = df.iloc[-1]
        last_year = int(last_row['anio'])
        last_month = int(last_row['mes'])
        current_val = float(last_row['ipc_valor'])
        
        print(f"  IPC: Last official data: {last_year}-{last_month:02d}")
        
        new_rows = []
        curr_y, curr_m = last_year, last_month
        
        while True:
            curr_m += 1
            if curr_m > 12:
                curr_m = 1
                curr_y += 1
            
            if (curr_y, curr_m) in rem_projections:
                monthly_var = rem_projections[(curr_y, curr_m)]
                current_val = current_val * (1 + monthly_var)
                new_rows.append({
                    'anio': curr_y,
                    'mes': curr_m,
                    'ipc_valor': current_val,
                    'ipc_var_mensual': monthly_var
                })
                print(f"  IPC: Projected {curr_y}-{curr_m:02d} with REM {monthly_var*100:.1f}%")
            else:
                break
        
        if new_rows:
            df = pd.concat([df, pd.DataFrame(new_rows)], ignore_index=True)
        
        return df
    finally:
        conn.close()

def fetch_ripte():
    query = "SELECT YEAR(fecha) as anio, MONTH(fecha) as mes, valor as ripte_valor FROM ripte ORDER BY fecha"
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query)
        columns = [col[0] for col in cursor.description]
        data = cursor.fetchall()
        df = pd.DataFrame(data, columns=columns)
        # Calculate monthly variation for RIPTE
        df['ripte_var_mensual'] = df['ripte_valor'].pct_change()
        return df
    finally:
        if 'cursor' in locals():
            cursor.close()
        conn.close()

def process_data(df_personnel, df_ipc, df_ripte):
    # --- Personnel Data Processing ---
    df_personnel['total_gral'] = pd.to_numeric(df_personnel['total_gral'], errors='coerce').fillna(0)
    df_personnel['importe_gral'] = pd.to_numeric(df_personnel['importe_gral'], errors='coerce').fillna(0)
    
    # 1. Total Wage Bill: Sum EVERYTHING (including SAC) as requested by user
    masa_salarial_total = df_personnel.groupby(['anio', 'mes'])['importe_gral'].sum().reset_index()
    masa_salarial_total.rename(columns={'importe_gral': 'masa_salarial'}, inplace=True)

    # 2. Filter out SAC for Average Salary calculation
    sac_terms = r'SAC|S\.A\.C|sac|s\.a\.c|Cuota\s*SAC|Aguinaldo'
    df_no_sac = df_personnel[~df_personnel['liquidacion'].str.contains(sac_terms, case=False, na=False)].copy()
    
    # 3. Employee Count: from sueldo rows (excluding SAC)
    df_empleados = df_no_sac[df_no_sac['liquidacion'].str.contains('sueldo', case=False, na=False)].copy()
    empleados_grouped = df_empleados.groupby(['anio', 'mes'])['total_gral'].sum().reset_index()
    empleados_grouped.rename(columns={'total_gral': 'cantidad_empleados'}, inplace=True)
    
    # 4. Wage amount for Average Salary: exclude SAC
    masa_sin_sac = df_no_sac.groupby(['anio', 'mes'])['importe_gral'].sum().reset_index()
    masa_sin_sac.rename(columns={'importe_gral': 'masa_sin_sac'}, inplace=True)
    
    # Merge Measures
    df_dashboard = pd.merge(empleados_grouped, masa_salarial_total, on=['anio', 'mes'], how='outer')
    df_dashboard = pd.merge(df_dashboard, masa_sin_sac, on=['anio', 'mes'], how='outer')
    
    # Calculate Average Salary using masa_sin_sac (without SAC)
    df_dashboard['salario_promedio'] = df_dashboard['masa_sin_sac'] / df_dashboard['cantidad_empleados']
    
    # Merge External Data
    df_dashboard = pd.merge(df_dashboard, df_ipc, on=['anio', 'mes'], how='left')
    df_dashboard = pd.merge(df_dashboard, df_ripte, on=['anio', 'mes'], how='left')
    
    # Calculations
    df_dashboard.sort_values(by=['anio', 'mes'], inplace=True)
    
    # 1. Monthly Variations
    df_dashboard['salario_var_mensual'] = df_dashboard['salario_promedio'].pct_change()
    
    # 2. Interannual Variations (Self-Join)
    df_dashboard['anio_prev'] = df_dashboard['anio'] - 1
    
    df_prev = df_dashboard[['anio', 'mes', 'salario_promedio', 'ipc_valor']].copy()
    df_prev.columns = ['anio_prev', 'mes', 'salario_promedio_prev', 'ipc_valor_prev']
    
    df_dashboard = pd.merge(df_dashboard, df_prev, on=['anio_prev', 'mes'], how='left')
    
    # Variations
    df_dashboard['var_nominal_ia'] = (df_dashboard['salario_promedio'] / df_dashboard['salario_promedio_prev']) - 1
    
    # Calculate IPC interannual variation
    df_dashboard['var_ipc_ia'] = (df_dashboard['ipc_valor'] / df_dashboard['ipc_valor_prev']) - 1
    
    # Real Variation
    df_dashboard['var_real_ia'] = ((1 + df_dashboard['var_nominal_ia']) / (1 + df_dashboard['var_ipc_ia'])) - 1
    
    # Where IPC is missing, set real variation to None explicitly
    df_dashboard.loc[df_dashboard['var_ipc_ia'].isna(), 'var_real_ia'] = None

    return df_dashboard

import json

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
        print(f"CRITICAL ERROR: Failed to fetch CBT data from Google Sheets: {e}")
        raise e
    
    csv_data = io.StringIO(response.text)
    df = pd.read_csv(csv_data)
    
    cbt_column = df['CBT NEA']
    start_date = datetime(2016, 4, 1)
    
    data = []
    for idx, value in enumerate(cbt_column):
        if pd.isna(value) or value == '':
            continue
            
        if isinstance(value, str):
            cleaned = value.replace('$', '').replace(' ', '').replace('.', '').replace(',', '.').strip()
            try:
                cbt_value = float(cleaned)
            except ValueError:
                continue
        else:
            cbt_value = float(value)
        
        if cbt_value > 0:
            fecha = start_date + relativedelta(months=idx)
            data.append({
                'anio': fecha.year,
                'mes': fecha.month,
                'cbt_nea': cbt_value
            })
    
    return pd.DataFrame(data)

def generate_json(df):
    MONTH_NAMES = {
        1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
        7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
    }

    valid_rows = df[df['salario_promedio'].notna()].copy()
    if valid_rows.empty:
        print("Error: No valid salary data found to generate JSON.")
        return

    tail_months = valid_rows.tail(12)

    available_periods = []
    default_period_id = None
    data_by_period = {}

    for _, row in tail_months.iterrows():
        y = int(row['anio'])
        m = int(row['mes'])
        period_id = f"{y}-{m:02d}"
        month_label = MONTH_NAMES.get(m, str(m))

        available_periods.append({
            "id": period_id,
            "label": month_label,
            "month": m,
            "year": y
        })

        # By iterating to the end, default_period_id will end up as the latest month
        default_period_id = period_id

        # CBT Analysis
        salario_avg = row['salario_promedio']
        cbt_value = row['cbt_nea'] if 'cbt_nea' in row and pd.notna(row['cbt_nea']) else None
        cbt_ratio = salario_avg / cbt_value if cbt_value else None

        current_period = f"{month_label} {y}"

        prev_series = df[(df['anio'] == y - 1) & (df['mes'] == m)]
        prev_period = "Año Anterior"
        if not prev_series.empty:
            prev_period = f"{MONTH_NAMES.get(int(prev_series.iloc[0]['mes']), '')} {int(prev_series.iloc[0]['anio'])}"

        kpis = {
            "salario_promedio": salario_avg,
            "masa_salarial": row['masa_salarial'] / 1_000_000,
            "empleados": row['cantidad_empleados'],
            "var_nominal_ia": row['var_nominal_ia'] * 100 if pd.notna(row['var_nominal_ia']) else 0,
            "var_real_ia": row['var_real_ia'] * 100 if pd.notna(row['var_real_ia']) else None,
            "mes": m,
            "anio": y,
            "periodo_actual": current_period,
            "periodo_anterior": prev_period,
            "cbt_valor": float(cbt_value) if cbt_value is not None else None,
            "cbt_ratio": float(cbt_ratio) if cbt_ratio is not None else None,
            "is_incomplete": (row['masa_salarial'] == 0 or pd.isna(row['masa_salarial']))
        }

        # Charts: Take last 12 months UP TO this period
        df_up_to = valid_rows[
            (valid_rows['anio'] < y) | 
            ((valid_rows['anio'] == y) & (valid_rows['mes'] <= m))
        ]
        df_last12 = df_up_to.tail(12)

        ripte_values = [x if pd.notna(x) else None for x in df_last12['ripte_valor'].tolist()]

        charts = {
            "labels": df_last12.apply(lambda x: f"{MONTH_NAMES.get(int(x['mes']), '')[:3]} {str(int(x['anio']))[-2:]}", axis=1).tolist(),
            "salario_promedio": df_last12['salario_promedio'].tolist(),
            "ripte_valor": ripte_values,
            "salario_var_mensual": (df_last12['salario_var_mensual'] * 100).fillna(0).tolist(),
            "ipc_var_mensual": (df_last12['ipc_var_mensual'] * 100).fillna(0).tolist()
        }

        data_by_period[period_id] = {
            "kpi": kpis,
            "charts": charts
        }
        
    final_data = {
        "meta": {
            "available_periods": available_periods,
            "default_period_id": default_period_id
        },
        "data": data_by_period
    }
    
    # Save to the script's directory with an obfuscated name (Fix 1-B)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, '..', 'data', 'data_personal_v1.json')
    
    with open(output_path, 'w') as f:
        json.dump(final_data, f, indent=2, ensure_ascii=False)
    print(f"Generated {output_path} with updated logic")

def main():
    print("Fetching Personnel Data...")
    df_personnel = fetch_data() # Reuse existing function for raw data
    
    print("Fetching IPC Nación + REM Projections...")
    df_ipc = fetch_ipc_nacion()
    
    print("Fetching RIPTE Data...")
    df_ripte = fetch_ripte()
    
    print("Fetching CBT Data...")
    df_cbt = fetch_cbt()
    
    print("Processing Dashboard Data...")
    df_dashboard = process_data(df_personnel, df_ipc, df_ripte)
    
    df_dashboard = pd.merge(df_dashboard, df_cbt, on=['anio', 'mes'], how='left')
    
    generate_json(df_dashboard)


if __name__ == "__main__":
    main()
