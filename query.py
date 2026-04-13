import psycopg2
db_url = 'postgresql://postgres.fiascquqzimwbltpagir:Nhfkhutk1%24@aws-1-us-east-2.pooler.supabase.com:6543/postgres'
conn = psycopg2.connect(db_url)
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
