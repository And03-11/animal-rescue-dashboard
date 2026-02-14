import os
import sys
import json
from pyairtable import Api
from dotenv import load_dotenv

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

load_dotenv()

AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")

TABLE_CAMPAIGNS = "tblkqsGw01v7E0LMh"
TABLE_FORM_TITLES = "tblatGFOw5214wSw9"
TABLE_DONORS = "tblU6V0pLJ1rS4aTX"
TABLE_EMAILS = "tbl709FbsHC58gvJc"
TABLE_DONATIONS = "tblF77oj9JmHAoJ5M"

api = Api(AIRTABLE_API_KEY)
base = api.base(AIRTABLE_BASE_ID)

def check_fields(table_id, table_name):
    print(f"\n--- {table_name} ---")
    try:
        table = base.table(table_id)
        records = table.all(max_records=1)
        if records:
            r = records[0]
            keys = list(r['fields'].keys())
            if "Last Modified" in keys:
                 print(f"✅ 'Last Modified' FOUND in {table_name}.")
                 print(f"   Value sample: {r['fields']['Last Modified']}")
            else:
                 print(f"❌ 'Last Modified' request NOT FOUND in {table_name}.")
                 print(f"   Available: {keys}")
        else:
            print("Empty.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_fields(TABLE_CAMPAIGNS, "Campaigns")
    check_fields(TABLE_FORM_TITLES, "Form Titles")
    check_fields(TABLE_EMAILS, "Emails")
    check_fields(TABLE_DONORS, "Donors")
    check_fields(TABLE_DONATIONS, "Donations")
