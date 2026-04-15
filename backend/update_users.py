import os
import json
import psycopg2
from dotenv import load_dotenv

# Load environment variables from the root directory
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path)

def get_pg_connection():
    """Establishes a connection to the PostgreSQL database."""
    try:
        conn = psycopg2.connect(
            host=os.getenv('PG_HOST'),
            port=os.getenv('PG_PORT'),
            user=os.getenv('PG_USER'),
            password=os.getenv('PG_PASSWORD'),
            database=os.getenv('PG_DATABASE')
        )
        return conn
    except Exception as e:
        print(f"Error connecting to PostgreSQL: {e}")
        return None

def update_users():
    """Fetches users from the database and saves them to a JSON file."""
    print("Fetching users from PostgreSQL (public.usuarios_tableros)...")
    conn = get_pg_connection()
    if not conn:
        return

    try:
        cur = conn.cursor()
        # Using the actual table name found in the DB: usuarios_tableros
        query = """
            SELECT id_usuario, username, password_hash
            FROM public.usuarios_tableros 
            WHERE activo = true;
        """
        cur.execute(query)
        
        users_list = cur.fetchall()
        
        users_dict = {}
        for u in users_list:
            db_username = u[1]
            db_password = u[2]
            
            display_name = "Gob. JP. Valdes" if db_username == "gobernador" else db_username.capitalize()
            
            users_dict[db_username] = {
                'id': u[0], # Added ID for telemetry
                'password': db_password,
                'name': display_name,
                'role': 'user'
            }
            
        # Target path for the users JSON
        output_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'users.json')
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(users_dict, f, ensure_ascii=False, indent=2)
            
        print(f"Successfully updated {len(users_dict)} users (with IDs) and saved to {output_path}")

        # Generate config.json for frontend
        config_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'config.json')
        config_data = {
            "API_URL_POST": os.getenv('API_URL_POST_COPA', os.getenv('API_URL_POST', '/api/coparticipacion/log')).strip()
        }
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2)
        print(f"Config saved to {config_path}")
        
    except Exception as e:
        print(f"Error updating users: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    update_users()
