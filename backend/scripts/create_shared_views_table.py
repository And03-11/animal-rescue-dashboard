import asyncio
import os
import sys
from dotenv import load_dotenv
import psycopg2

# Add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

# from backend.app.services.supabase_service import get_supabase_service

def create_table():
    load_dotenv()
    db_url = os.getenv("SUPABASE_DATABASE_URL")
    if not db_url:
        print("❌ SUPABASE_DATABASE_URL not found")
        return

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        print("Checking if analytics_shared_views table exists...")
        
        # Create table if not exists
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS analytics_shared_views (
            token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            configuration JSONB NOT NULL,
            created_by TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        
        cur.execute(create_table_sql)
        conn.commit()
        print("✅ Table analytics_shared_views checked/created successfully.")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error creating table: {e}")

if __name__ == "__main__":
    create_table()
