
import os
import sys
import psycopg2
from psycopg2.extras import execute_values
from pyairtable import Api
from dotenv import load_dotenv
from datetime import datetime, timezone
import traceback

# Adjust path to import from app
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

# Load environment variables
load_dotenv()

# --- CONFIGURATION ---
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

# Table IDs
TABLE_CAMPAIGNS = "tblkqsGw01v7E0LMh"
TABLE_FORM_TITLES = "tblatGFOw5214wSw9"
TABLE_DONORS = "tblU6V0pLJ1rS4aTX"
TABLE_EMAILS = "tbl709FbsHC58gvJc"
TABLE_DONATIONS = "tblF77oj9JmHAoJ5M"

api = None
base = None

if all([AIRTABLE_API_KEY, AIRTABLE_BASE_ID, SUPABASE_DB_URL]):
    api = Api(AIRTABLE_API_KEY)
    base = api.base(AIRTABLE_BASE_ID)
else:
    print("❌ Error: Missing environment variables.")
    sys.exit(1)

def get_last_sync_time(cursor, table_name):
    """Get the last successful sync timestamp for a table"""
    cursor.execute("SELECT last_sync_at FROM sync_state WHERE table_name = %s", (table_name,))
    result = cursor.fetchone()
    return result[0] if result else None

def update_last_sync_time(cursor, conn, table_name):
    """Update the last sync timestamp to NOW()"""
    now = datetime.now(timezone.utc)
    cursor.execute("""
        INSERT INTO sync_state (table_name, last_sync_at) 
        VALUES (%s, %s)
        ON CONFLICT (table_name) 
        DO UPDATE SET last_sync_at = EXCLUDED.last_sync_at
    """, (table_name, now))
    conn.commit()
    print(f"🕒 Updated sync time for {table_name} to {now}")

def fetch_modified_records(table_id, last_sync_time):
    """Fetch only records modified after last_sync_time"""
    table = base.table(table_id)
    
    if last_sync_time:
        # Format for Airtable formula: IS_AFTER({Last Modified}, 'YYYY-MM-DDTHH:mm:ss.000Z')
        iso_time = last_sync_time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        formula = f"IS_AFTER({{Last Modified}}, '{iso_time}')"
        print(f"📥 Fetching updates from {table_id} since {iso_time}...")
        return table.all(formula=formula)
    else:
        print(f"📥 Fetching FULL load from {table_id} (No previous sync found)...")
        return table.all()

def upsert_batch(cursor, conn, table_name, columns, data, conflict_col='airtable_id', batch_size=100):
    """Upsert data in batches"""
    if not data:
        return

    cols_str = ', '.join(columns)
    vals_placeholder = "%s"
    update_cols = [c for c in columns if c != 'airtable_id']
    update_str = ', '.join([f"{c} = EXCLUDED.{c}" for c in update_cols])

    sql = f"""
        INSERT INTO {table_name} ({cols_str})
        VALUES {vals_placeholder}
        ON CONFLICT ({conflict_col}) 
        DO UPDATE SET {update_str};
    """

    total_batches = (len(data) + batch_size - 1) // batch_size
    print(f"📦 Upserting {len(data)} records into {table_name}...")

    try:
        for i in range(0, len(data), batch_size):
            chunk = data[i:i+batch_size]
            values = []
            for item in chunk:
                row = tuple(item[c] for c in columns)
                values.append(row)
            
            execute_values(cursor, sql, values, page_size=batch_size)
            conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"❌ Error inserting into {table_name}: {e}")
        raise e

# --- Reusing logic from migrate_to_supabase.py for data mapping ---
# We need to build ID maps dynamically, similar to the full migration but perhaps only for referenced items if possible.
# For simplicity in this incremental step, we will fetching mapped IDs from DB as needed or cache them?
# Actually, for incremental updates to work reliably, we still need to resolve FKs (Campaign -> Form, Donor -> Donation).
# The safest approach for FK resolution in incremental sync is:
# 1. Fetch updated parent records (Campaigns) -> Upsert
# 2. Fetch updated child records (Forms) -> Resolve FKs using DB lookup -> Upsert
# ...


def resolve_id_map(cursor, table_name, airtable_ids):
    """Fetch UUIDs only for the specified Airtable IDs"""
    if not airtable_ids:
        return {}
    
    # Filter out None values and ensure unique
    ids_to_fetch = list(set([x for x in airtable_ids if x]))
    
    if not ids_to_fetch:
        return {}
        
    query = f"SELECT airtable_id, id FROM {table_name} WHERE airtable_id = ANY(%s)"
    cursor.execute(query, (ids_to_fetch,))
    return {row[0]: row[1] for row in cursor.fetchall()}

def run_sync():
    print(f"🚀 Starting Incremental Sync (Time: {datetime.now()})...")
    
    try:
        conn = psycopg2.connect(SUPABASE_DB_URL)
        cursor = conn.cursor()
        
        # 1. Campaigns
        last_sync = get_last_sync_time(cursor, 'campaigns')
        updates = fetch_modified_records(TABLE_CAMPAIGNS, last_sync)
        if updates:
            pg_data = []
            for rec in updates:
                pg_data.append({
                    'airtable_id': rec['id'],
                    'name': rec.get('fields', {}).get('Name'),
                    'source': rec.get('fields', {}).get('Source'),
                    'created_at': rec.get('createdTime')
                })
            upsert_batch(cursor, conn, 'campaigns', ['airtable_id', 'name', 'source', 'created_at'], pg_data)
        update_last_sync_time(cursor, conn, 'campaigns')
        
        # 2. Form Titles
        last_sync = get_last_sync_time(cursor, 'form_titles')
        updates = fetch_modified_records(TABLE_FORM_TITLES, last_sync)
        if updates:
            # Collect referenced Campaign IDs
            campaign_refs = set()
            for rec in updates:
                camp_links = rec.get('fields', {}).get('Campaign', [])
                if camp_links: campaign_refs.add(camp_links[0])
            
            # Resolve only needed Campaigns
            campaign_map = resolve_id_map(cursor, 'campaigns', list(campaign_refs))
            
            pg_data = []
            for rec in updates:
                rec_fields = rec.get('fields', {})
                camp_links = rec_fields.get('Campaign', [])
                campaign_uuid = campaign_map.get(camp_links[0]) if camp_links else None
                pg_data.append({
                    'airtable_id': rec['id'],
                    'name': rec_fields.get('Name'),
                    'campaign_id': campaign_uuid
                })
            upsert_batch(cursor, conn, 'form_titles', ['airtable_id', 'name', 'campaign_id'], pg_data)
        update_last_sync_time(cursor, conn, 'form_titles')

        # 3. Emails (Lookup Map Build) - Still needed FULL or Optimized?
        # Emails are used to look up by ID *within* the Donors loop.
        # Since Donors have a list of Email IDs, we can collect them first.
        
        # 4. Donors
        last_sync = get_last_sync_time(cursor, 'donors')
        updates = fetch_modified_records(TABLE_DONORS, last_sync)
        
        if updates:
            # Pre-fetch referenced emails logic could go here, but Emails table is separate in Airtable 
            # and seemingly not stored as a separate table in our PG schema, just embedded/extracted.
            # For simplicity provided usage, we keep fetching emails map or optimize it?
            # User request specifically targeted "build_id_map_from_db" usage. 
            # Emails fetching from AT logic takes ~1-2s for 40k records via API? No, that's heavy too if full.
            # But the user specifically pointed out the DB lookup part. 
            # Let's keep Emails as is for now (unless it's a bottleneck) or optimize if easy.
            # Optimization: Collect Email IDs from donor updates -> Fetch only those from Airtable?
            # pyAirtable doesn't support "WHERE ID IN (...)" easily without formula.
            # OR(RECORD_ID()='...', RECORD_ID()='...')
            
            # Let's stick to optimizing the DB Lookups first as requested.
            print("📥 Fetching Emails for lookup (Full load for map)...") 
            # Keeping full load for emails for safety/simplicity as it's an external API fetch, not DB lookup.
            all_emails = base.table(TABLE_EMAILS).all(fields=["Email", "Bounced Account"])
            email_lookup = {}
            for rec in all_emails:
                fields = rec.get('fields', {})
                email_lookup[rec['id']] = {
                    'email': fields.get('Email'),
                    'bounced': fields.get('Bounced Account', False)
                }

            pg_data = []
            for rec in updates:
                fields = rec.get('fields', {})
                linked_email_ids = fields.get('Emails', [])
                email_addresses = []
                is_bounced = False
                
                for email_id in linked_email_ids:
                    data = email_lookup.get(email_id)
                    if data:
                        if data['email']: email_addresses.append(data['email'])
                        if data['bounced']: is_bounced = True

                full_name = f"{fields.get('Name', '')} {fields.get('Last Name', '')}".strip()
                
                status_val = fields.get("Status")
                if isinstance(status_val, list) and status_val: status_val = status_val[0]
                
                funnel_stage_val = fields.get("Funnel Stage")
                if isinstance(funnel_stage_val, list) and funnel_stage_val: funnel_stage_val = funnel_stage_val[0]

                pg_data.append({
                    'airtable_id': rec['id'],
                    'name': full_name,
                    'emails': email_addresses,
                    'region': fields.get('Region'),
                    'stage': fields.get('Stage'),
                    'bounced': is_bounced,
                    'status': status_val,
                    'funnel_stage': funnel_stage_val
                })
            upsert_batch(cursor, conn, 'donors', ['airtable_id', 'name', 'emails', 'region', 'stage', 'bounced', 'status', 'funnel_stage'], pg_data)
        update_last_sync_time(cursor, conn, 'donors')

        # 5. Donations
        last_sync = get_last_sync_time(cursor, 'donations')
        updates = fetch_modified_records(TABLE_DONATIONS, last_sync)
        if updates:
            # Collect referenced IDs
            donor_refs = set()
            form_refs = set()
            for rec in updates:
                fields = rec.get('fields', {})
                if d := fields.get('Donor'): donor_refs.add(d[0])
                if f := fields.get('Form Title'): form_refs.add(f[0])

            # Resolve Maps (Pointed Lookup)
            donor_map = resolve_id_map(cursor, 'donors', list(donor_refs))
            form_map = resolve_id_map(cursor, 'form_titles', list(form_refs))

            pg_data = []
            for rec in updates:
                fields = rec.get('fields', {})
                donor_links = fields.get('Donor', [])
                donor_uuid = donor_map.get(donor_links[0]) if donor_links else None
                
                form_links = fields.get('Form Title', [])
                form_uuid = form_map.get(form_links[0]) if form_links else None
                
                pg_data.append({
                    'airtable_id': rec['id'],
                    'amount': fields.get('Amount'),
                    'donation_date': fields.get('Date'),
                    'donor_id': donor_uuid,
                    'form_title_id': form_uuid
                })
            upsert_batch(cursor, conn, 'donations', ['airtable_id', 'amount', 'donation_date', 'donor_id', 'form_title_id'], pg_data)
        update_last_sync_time(cursor, conn, 'donations')

        print("✨ Incremental Sync Completed Successfully.")

    except Exception as e:
        print(f"❌ Error during incremental sync: {e}")
        traceback.print_exc()
    finally:
        if 'conn' in locals() and conn: conn.close()

if __name__ == "__main__":
    run_sync()
