import os
import psycopg2
from dotenv import load_dotenv
from pyairtable import Api
from collections import Counter

load_dotenv('backend/.env')

AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")
TABLE_DONORS = "tblU6V0pLJ1rS4aTX"

api = Api(AIRTABLE_API_KEY)
base = api.base(AIRTABLE_BASE_ID)
table = base.table(TABLE_DONORS)

print("=== Comparing Funnel Stage Counts: Airtable vs Supabase ===\n")

try:
    # 1. Get counts from Supabase
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT COALESCE(funnel_stage, 'Unknown') as stage, COUNT(*) as count 
        FROM donors 
        WHERE stage = 'Funnel' 
        AND (status IS NULL OR status != 'Unsubscribed')
        GROUP BY funnel_stage
        ORDER BY count DESC
    """)
    supabase_counts = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()
    
    print("SUPABASE counts:")
    for stage, count in sorted(supabase_counts.items()):
        print(f"  {stage}: {count}")
    
    # 2. Get counts from Airtable
    print("\nFetching from Airtable (this may take a moment)...")
    records = table.all(formula="{Stage}='Funnel'", fields=["Funnel Stage", "Status"])
    
    airtable_counts = Counter()
    for rec in records:
        fields = rec.get('fields', {})
        status = fields.get('Status')
        if status != 'Unsubscribed':
            funnel_stage = fields.get('Funnel Stage', 'Unknown')
            airtable_counts[funnel_stage] += 1
    
    print("\nAIRTABLE counts:")
    for stage, count in sorted(airtable_counts.items()):
        print(f"  {stage}: {count}")
    
    # 3. Compare
    print("\n=== COMPARISON ===")
    all_stages = set(supabase_counts.keys()) | set(airtable_counts.keys())
    for stage in sorted(all_stages):
        sb = supabase_counts.get(stage, 0)
        at = airtable_counts.get(stage, 0)
        diff = sb - at
        if diff != 0:
            print(f"  {stage}: Supabase={sb}, Airtable={at}, DIFF={diff}")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
