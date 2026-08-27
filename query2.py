import json
import os

import psycopg2
from dotenv import load_dotenv

load_dotenv("backend/.env")
conn = psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])
cursor = conn.cursor()
cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
tables = [r[0] for r in cursor.fetchall()]

schema_info = {"tables": tables}

with open("output.json", "w") as f:
    json.dump(schema_info, f)
