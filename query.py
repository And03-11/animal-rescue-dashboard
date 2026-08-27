import os

import psycopg2
from dotenv import load_dotenv

load_dotenv("backend/.env")
conn = psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])
cursor = conn.cursor()
cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
tables = [r[0] for r in cursor.fetchall()]
print(tables)

if 'knowledge_templates' in tables:
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='knowledge_templates'")
    print("knowledge_templates columns:", [r[0] for r in cursor.fetchall()])
    
if 'templates' in tables:
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='templates'")
    print("templates columns:", [r[0] for r in cursor.fetchall()])

if 'email_templates' in tables:
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='email_templates'")
    print("email_templates columns:", [r[0] for r in cursor.fetchall()])
