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

    output_file = "full_query_report.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("--- TOP 5 EXPENSIVE QUERIES ---\n")
        try:
            cursor.execute("SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements'")
            if not cursor.fetchone():
                f.write("Extension pg_stat_statements NOT installed.\n")
            else:
                cursor.execute("""
                    SELECT query, 
                           calls, 
                           total_exec_time::numeric(10,2), 
                           mean_exec_time::numeric(10,2)
                    FROM pg_stat_statements
                    ORDER BY total_exec_time DESC
                    LIMIT 5;
                """)
                rows = cursor.fetchall()
                for i, row in enumerate(rows):
                    f.write(f"\n--- QUERY #{i+1} ---\n")
                    f.write(f"Calls: {row[1]}, Total: {row[2]}ms, Mean: {row[3]}ms\n")
                    f.write("Query:\n")
                    f.write(row[0] + "\n")
                    f.write("-" * 50 + "\n")
        except psycopg2.Error as e:
            f.write(f"Error querying pg_stat_statements: {e}\n")

    print(f"Report written to {output_file}")

except Exception as e:
    print(f"CRITICAL ERROR: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()
