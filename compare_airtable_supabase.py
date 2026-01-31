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

print("=== Comparing Airtable vs Supabase for Funnel Donors ===\n")

try:
    # 1. Get 5 Funnel donors from Airtable
    at_records = table.all(formula="{Stage}='Funnel'", max_records=5)
    
    # 2. Connect to Supabase
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()
    
    for rec in at_records:
        fields = rec.get('fields', {})
        at_id = rec['id']
        at_name = f"{fields.get('Name', '')} {fields.get('Last Name', '')}"
        at_stage = fields.get('Stage')
        at_funnel_stage = fields.get('Funnel Stage')
        at_status = fields.get('Status')
        
        # Query Supabase for this donor
        cursor.execute("SELECT name, stage, funnel_stage, status FROM donors WHERE airtable_id = %s", (at_id,))
        row = cursor.fetchone()
        
        print(f"--- Donor: {at_name} ({at_id}) ---")
        print(f"  AIRTABLE:")
        print(f"    Stage: {at_stage}")
        print(f"    Funnel Stage: {at_funnel_stage}")
        print(f"    Status: {at_status}")
        
        if row:
            print(f"  SUPABASE:")
            print(f"    Stage: {row[1]}")
            print(f"    Funnel Stage: {row[2]}")
            print(f"    Status: {row[3]}")
            
            # Highlight mismatch
            if at_funnel_stage != row[2]:
                print(f"  *** MISMATCH! Airtable has '{at_funnel_stage}', Supabase has '{row[2]}' ***")
        else:
            print(f"  SUPABASE: NOT FOUND!")
        print()
        
    conn.close()
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
