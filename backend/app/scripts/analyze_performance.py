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
    print(f"Connecting to DB...")
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()
    print("Connected.")

    print("\n--- 1. ACTIVE QUERIES (pg_stat_activity) ---")
    cursor.execute("""
        SELECT pid, state, now() - query_start as duration, query
        FROM pg_stat_activity
        WHERE state != 'idle'
        AND pid != pg_backend_pid()
        ORDER BY duration DESC
        LIMIT 5;
    """)
    rows = cursor.fetchall()
    if not rows:
        print("No active non-idle queries found.")
    for row in rows:
        print(f"PID: {row[0]}, State: {row[1]}, Duration: {row[2]}")
        print(f"Query: {row[3][:100]}...")
        print("-" * 20)

    print("\n--- 2. BLOCKING QUERIES ---")
    cursor.execute("""
        SELECT pid, pg_blocking_pids(pid)
        FROM pg_stat_activity
        WHERE cardinality(pg_blocking_pids(pid)) > 0;
    """)
    rows = cursor.fetchall()
    if not rows:
        print("No blocking queries found.")
    for row in rows:
        print(f"PID: {row[0]}, Blocked by: {row[1]}")

    print("\n--- 3. TOP EXPENSIVE QUERIES (pg_stat_statements) ---")
    try:
        cursor.execute("SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements'")
        if not cursor.fetchone():
            print("Extension pg_stat_statements NOT installed.")
        else:
            cursor.execute("""
                SELECT substring(query, 1, 100) as short_query, 
                       calls, 
                       total_exec_time::numeric(10,2), 
                       mean_exec_time::numeric(10,2)
                FROM pg_stat_statements
                ORDER BY total_exec_time DESC
                LIMIT 5;
            """)
            rows = cursor.fetchall()
            for row in rows:
                print(f"Query: {row[0]}")
                print(f"Calls: {row[1]}, Total: {row[2]}ms, Mean: {row[3]}ms")
                print("-" * 20)
    except psycopg2.Error as e:
        print(f"Error querying pg_stat_statements: {e}")

except Exception as e:
    print(f"CRITICAL ERROR: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()
