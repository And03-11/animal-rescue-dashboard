import os
from dotenv import load_dotenv
from pyairtable import Api

load_dotenv('backend/.env')

AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
TABLE_DONORS = "tblU6V0pLJ1rS4aTX"

api = Api(AIRTABLE_API_KEY)
base = api.base(AIRTABLE_BASE_ID)
table = base.table(TABLE_DONORS)

print("=== Fetching donors with Stage=Funnel (first 5) ===")

try:
    # Get records where Stage = Funnel
    records = table.all(formula="{Stage}='Funnel'", max_records=5)
    
    for rec in records:
        fields = rec.get('fields', {})
        name = f"{fields.get('Name', '')} {fields.get('Last Name', '')}"
        print(f"\nID: {rec['id']}")
        print(f"  Name: {name}")
        print(f"  Stage: {fields.get('Stage')}")
        print(f"  Funnel Stage: {fields.get('Funnel Stage')}")
        print(f"  Status: {fields.get('Status')}")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
