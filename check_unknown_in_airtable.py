import os
import psycopg2
from dotenv import load_dotenv
from pyairtable import Api

load_dotenv('backend/.env')

AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")
TABLE_DONORS = "tblU6V0pLJ1rS4aTX"

api = Api(AIRTABLE_API_KEY)
base = api.base(AIRTABLE_BASE_ID)
table = base.table(TABLE_DONORS)

print("=== Checking Unknown donors in Airtable ===\n")

try:
    # 1. Get Unknown donor IDs from Supabase
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT airtable_id, name FROM donors 
        WHERE stage = 'Funnel' 
        AND (funnel_stage IS NULL OR funnel_stage = '')
        AND (status IS NULL OR status != 'Unsubscribed')
        LIMIT 5
    """)
    unknown_donors = cursor.fetchall()
    conn.close()
    
    print(f"Found {len(unknown_donors)} Unknown donors in Supabase\n")
    
    # 2. Check each one in Airtable
    for at_id, name in unknown_donors:
        print(f"--- Checking: {name} ({at_id}) ---")
        try:
            rec = table.get(at_id)
            fields = rec.get('fields', {})
            at_stage = fields.get('Stage')
            at_funnel_stage = fields.get('Funnel Stage')
            at_status = fields.get('Status')
            
            print(f"  Airtable Stage: {at_stage}")
            print(f"  Airtable Funnel Stage: {at_funnel_stage}")
            print(f"  Airtable Status: {at_status}")
            
            if at_funnel_stage:
                print(f"  *** ISSUE: Airtable HAS Funnel Stage but Supabase does NOT! ***")
            else:
                print(f"  OK: Both agree this is Unknown")
        except Exception as e:
            print(f"  Error fetching from Airtable: {e}")
        print()
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
