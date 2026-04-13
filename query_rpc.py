import psycopg2
db_url = 'postgresql://postgres.fiascquqzimwbltpagir:Nhfkhutk1%24@aws-1-us-east-2.pooler.supabase.com:6543/postgres'
conn = psycopg2.connect(db_url)
cursor = conn.cursor()
cursor.execute("SELECT prosrc FROM pg_proc WHERE proname='search_templates'")
res = cursor.fetchall()
with open("output.txt", "w", encoding="utf-8") as f:
    for row in res:
        f.write(row[0] + "\n")
