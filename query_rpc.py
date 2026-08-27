import os

import psycopg2
from dotenv import load_dotenv

load_dotenv("backend/.env")
conn = psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])
cursor = conn.cursor()
cursor.execute("SELECT prosrc FROM pg_proc WHERE proname='search_templates'")
res = cursor.fetchall()
with open("output.txt", "w", encoding="utf-8") as f:
    for row in res:
        f.write(row[0] + "\n")
