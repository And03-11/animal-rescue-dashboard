import psycopg2
import json

db_url = 'postgresql://postgres.fiascquqzimwbltpagir:Nhfkhutk1%24@aws-1-us-east-2.pooler.supabase.com:6543/postgres'
conn = psycopg2.connect(db_url)
cursor = conn.cursor()
cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
tables = [r[0] for r in cursor.fetchall()]

schema_info = {"tables": tables}

with open("output.json", "w") as f:
    json.dump(schema_info, f)
