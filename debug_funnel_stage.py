import psycopg2
from dotenv import load_dotenv
import os

load_dotenv()

SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

def check_donors():
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cur = conn.cursor()
    
    # Check specific donors
    cur.execute("""
        SELECT name, funnel_stage, stage, status 
        FROM donors 
        WHERE name ILIKE '%April Minor%' OR name ILIKE '%Deborah Osborn%'
    """)
    
    print("=== Specific Donors ===")
    for row in cur.fetchall():
        print(f"Name: {row[0]}")
        print(f"  Funnel Stage: '{row[1]}'")
        print(f"  Stage: '{row[2]}'")
        print(f"  Status: '{row[3]}'")
        print()
    
    # Count total unknowns
    cur.execute("""
        SELECT COUNT(*) FROM donors 
        WHERE stage = 'Funnel' 
        AND (funnel_stage IS NULL OR funnel_stage = '')
    """)
    total = cur.fetchone()[0]
    print(f"Total with NULL/empty funnel_stage: {total}")
    
    conn.close()

if __name__ == "__main__":
    check_donors()
