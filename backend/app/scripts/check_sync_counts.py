import os
import sys
import psycopg2
from pyairtable import Api
from dotenv import load_dotenv

# Ajustar path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

load_dotenv()

AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

TABLE_CAMPAIGNS = "tblkqsGw01v7E0LMh"
TABLE_FORM_TITLES = "tblatGFOw5214wSw9"
TABLE_DONORS = "tblU6V0pLJ1rS4aTX"
TABLE_DONATIONS = "tblF77oj9JmHAoJ5M" # Just in case
TABLE_EMAILS = "tbl709FbsHC58gvJc"

api = Api(AIRTABLE_API_KEY)
base = api.base(AIRTABLE_BASE_ID)

def get_airtable_count(table_name, table_id):
    print(f"Counting Airtable {table_name} ({table_id})...")
    try:
        table = base.table(table_id)
        # Fetch minimal fields to speed up
        records = table.all(fields=[]) 
        return len(records)
    except Exception as e:
        print(f"Error fetching Airtable {table_name}: {e}")
        return 0

def get_postgres_count(cursor, table_name):
    print(f"Counting Postgres {table_name}...")
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        return cursor.fetchone()[0]
    except Exception as e:
        print(f"Error fetching Postgres {table_name}: {e}")
        return 0

def main():
    if not all([AIRTABLE_API_KEY, AIRTABLE_BASE_ID, SUPABASE_DB_URL]):
        print("Missing env vars")
        return

    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()

    tables = [
        ("Campaigns", TABLE_CAMPAIGNS, "campaigns"),
        ("Form Titles", TABLE_FORM_TITLES, "form_titles"),
        ("Donors", TABLE_DONORS, "donors"),
        ("Donations", TABLE_DONATIONS, "donations"),
        # Emails don't have a direct table in Supabase usually, they are merged into Donors or ignored if standalone?
        # The migration script uses Emails to lookup, but inserts into 'donors' table.
    ]

    print(f"{'Table':<20} | {'Airtable':<10} | {'Supabase':<10} | {'Diff':<10}")
    print("-" * 60)

    for label, at_id, pg_table in tables:
        at_count = get_airtable_count(label, at_id)
        pg_count = get_postgres_count(cursor, pg_table)
        diff = at_count - pg_count
        print(f"{label:<20} | {at_count:<10} | {pg_count:<10} | {diff:<10}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    main()
