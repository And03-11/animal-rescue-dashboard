import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

def create_sync_state_table():
    print("🛠️ Creating 'sync_state' table...")
    try:
        conn = psycopg2.connect(SUPABASE_DB_URL)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sync_state (
                table_name TEXT PRIMARY KEY,
                last_sync_at TIMESTAMP WITH TIME ZONE
            );
        """)
        
        conn.commit()
        print("✅ Table 'sync_state' created (or already exists).")
        
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"❌ Error creating table: {e}")

if __name__ == "__main__":
    create_sync_state_table()
