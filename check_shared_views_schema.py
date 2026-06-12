import os
import psycopg2
from dotenv import load_dotenv

# Load env variables from backend/.env
load_dotenv(dotenv_path="backend/.env")

db_url = os.getenv("SUPABASE_DATABASE_URL")
if not db_url:
    print("❌ SUPABASE_DATABASE_URL not found")
    exit(1)

try:
    print(f"Connecting to database...")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    # Check if table exists
    cur.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'analytics_shared_views'
        )
    """)
    exists = cur.fetchone()[0]
    print(f"Table 'analytics_shared_views' exists: {exists}")
    
    if exists:
        cur.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'analytics_shared_views'
            ORDER BY ordinal_position
        """)
        columns = cur.fetchall()
        print("\nTable structure:")
        for col in columns:
            print(f"   - {col[0]}: {col[1]} {'(nullable)' if col[2] == 'YES' else '(required)'}, default: {col[3]}")
            
except Exception as e:
    print(f"Error: {e}")
