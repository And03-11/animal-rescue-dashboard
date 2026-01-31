import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('backend/.env')

SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

try:
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()
    
    # Count total Unknown (NULL or empty funnel_stage)
    cursor.execute("""
        SELECT COUNT(*) FROM donors 
        WHERE stage = 'Funnel' 
        AND (funnel_stage IS NULL OR funnel_stage = '')
        AND (status IS NULL OR status != 'Unsubscribed')
    """)
    unknown_count = cursor.fetchone()[0]
    print(f"Total 'Unknown' donors: {unknown_count}")
    
    # Get sample names
    cursor.execute("""
        SELECT name, airtable_id FROM donors 
        WHERE stage = 'Funnel' 
        AND (funnel_stage IS NULL OR funnel_stage = '')
        AND (status IS NULL OR status != 'Unsubscribed')
        LIMIT 5
    """)
    print("\nSample Unknown donors:")
    for row in cursor.fetchall():
        print(f"  - {row[0]} (ID: {row[1]})")
    
    conn.close()
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
