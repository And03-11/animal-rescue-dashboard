import os
import psycopg2
from dotenv import load_dotenv
import sys

# Force UTF-8 for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

try:
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()

    print("\n--- TOP EXPENSIVE QUERY (Full Text) ---")
    try:
        cursor.execute("SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements'")
        if not cursor.fetchone():
            print("Extension pg_stat_statements NOT installed.")
        else:
            cursor.execute("""
                SELECT query, 
                       calls, 
                       total_exec_time::numeric(10,2), 
                       mean_exec_time::numeric(10,2)
                FROM pg_stat_statements
                WHERE query ILIKE '%RECURSIVE%'
                ORDER BY total_exec_time DESC
                LIMIT 1;
            """)
            row = cursor.fetchone()
            if row:
                print(f"Calls: {row[1]}, Total: {row[2]}ms, Mean: {row[3]}ms")
                print("Query:")
                print(row[0]) 
            else:
                print("No recursive queries found in stats.")

    except psycopg2.Error as e:
        print(f"Error querying pg_stat_statements: {e}")

except Exception as e:
    print(f"CRITICAL ERROR: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()
