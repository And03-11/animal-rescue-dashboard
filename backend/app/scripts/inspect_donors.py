import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

conn = psycopg2.connect(SUPABASE_DB_URL)
cursor = conn.cursor()

print("🔍 Inspecting 'donors' table indices:")
cursor.execute("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'donors'")
for row in cursor.fetchall():
    print(f"- {row[0]}: {row[1]}")

print("\n🔍 Inspecting 'donors' table constraints:")
cursor.execute("""
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = 'donors'::regclass
""")
try:
    for row in cursor.fetchall():
        print(f"- {row[0]}: {row[1]}")
except Exception as e:
    print(f"Error fetching constraints: {e}")

cursor.close()
conn.close()
