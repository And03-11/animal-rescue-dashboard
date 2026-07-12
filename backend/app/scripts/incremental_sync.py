
import os
import sys
import psycopg2
from psycopg2.extras import execute_values
from pyairtable import Api
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import traceback

try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    # Standard production CA chains work without the Windows trust-store shim.
    pass

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
TABLE_EMAIL_ENGAGEMENT = "tblrUarrA43iJCUbF"
SYNC_ADVISORY_LOCK_ID = 742031

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
    """Advance the sync watermark with the database clock, never backwards."""
    now = datetime.now(timezone.utc)
    cursor.execute("""
        INSERT INTO sync_state (table_name, last_sync_at) 
        VALUES (%s, NOW())
        ON CONFLICT (table_name) 
        DO UPDATE SET last_sync_at = GREATEST(sync_state.last_sync_at, EXCLUDED.last_sync_at)
    """, (table_name,))
    conn.commit()
    print(f"🕒 Updated sync time for {table_name} to {now}")

def fetch_modified_records(table_id, last_sync_time):
    """Fetch only records modified after last_sync_time"""
    table = base.table(table_id)
    
    if last_sync_time:
        # Re-read a small overlap so concurrent edits and clock skew cannot
        # create a gap. Upserts make duplicate reads harmless.
        last_sync_time = last_sync_time - timedelta(minutes=5)
        # Format for Airtable formula: IS_AFTER({Last Modified}, 'YYYY-MM-DDTHH:mm:ss.000Z')
        iso_time = last_sync_time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        formula = f"IS_AFTER({{Last Modified}}, '{iso_time}')"
        print(f"📥 Fetching updates from {table_id} since {iso_time}...")
        return table.all(formula=formula)
    else:
        print(f"📥 Fetching FULL load from {table_id} (No previous sync found)...")
        return table.all()

def fetch_new_records(table_id, last_sync_time):
    """Fetch append-only records created after the previous sync."""
    table = base.table(table_id)
    if not last_sync_time:
        print(f"Fetching full append-only load from {table_id}...")
        return table.all()

    last_sync_time = last_sync_time - timedelta(minutes=5)
    iso_time = last_sync_time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
    formula = f"IS_AFTER(CREATED_TIME(), '{iso_time}')"
    print(f"Fetching new records from {table_id} since {iso_time}...")
    return table.all(formula=formula)

def ensure_replica_schema(cursor, conn):
    """Create additive sync schema changes without dropping existing data."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS email_engagement (
            id BIGSERIAL PRIMARY KEY,
            airtable_id TEXT UNIQUE NOT NULL,
            donor_airtable_id TEXT,
            event_type TEXT,
            event_timestamp TIMESTAMP WITH TIME ZONE,
            campaign_tag TEXT,
            subject TEXT,
            email TEXT,
            clicked_url TEXT,
            device TEXT,
            template_id INTEGER,
            reason TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_email_engagement_timestamp ON email_engagement(event_timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_email_engagement_type ON email_engagement(event_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_email_engagement_donor ON email_engagement(donor_airtable_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_email_engagement_campaign_tag ON email_engagement(campaign_tag)")
    conn.commit()

def fetch_airtable_ids(table_id, primary_field):
    """Fetch a complete ID snapshot for deletion reconciliation."""
    records = base.table(table_id).all(fields=[primary_field])
    return {record['id'] for record in records}

def reconcile_mirror_table(cursor, conn, table_name, airtable_ids):
    """Delete rows absent from Airtable with a partial-response safety guard."""
    cursor.execute(f"SELECT airtable_id FROM {table_name}")
    database_ids = {row[0] for row in cursor.fetchall()}

    if database_ids and len(airtable_ids) < len(database_ids) * 0.8:
        raise RuntimeError(
            f"Reconciliation aborted for {table_name}: Airtable returned "
            f"{len(airtable_ids)} IDs for {len(database_ids)} replica rows"
        )

    stale_ids = database_ids - airtable_ids
    if not stale_ids:
        print(f"Reconciliation {table_name}: no stale rows")
        return 0

    stale_list = list(stale_ids)
    try:
        if table_name == 'donors':
            # Preserve financial history when its Airtable contact is removed.
            cursor.execute("""
                UPDATE donations
                SET donor_id = NULL
                WHERE donor_id IN (
                    SELECT id FROM donors WHERE airtable_id = ANY(%s)
                )
            """, (stale_list,))

        cursor.execute(
            f"DELETE FROM {table_name} WHERE airtable_id = ANY(%s)",
            (stale_list,)
        )
        deleted = cursor.rowcount
        conn.commit()
        print(f"Reconciliation {table_name}: removed {deleted} stale rows")
        return deleted
    except Exception:
        conn.rollback()
        raise

def maybe_reconcile_deletions(cursor, conn):
    """Run a complete mirror reconciliation at most once every 24 hours."""
    # Full Airtable ID snapshots are intentionally restricted to a quiet local
    # window so they cannot compete with daytime automations using Supabase.
    local_hour = datetime.now(ZoneInfo("America/Guatemala")).hour
    if not 2 <= local_hour < 5:
        return

    marker = '__deletion_reconciliation__'
    last_reconciliation = get_last_sync_time(cursor, marker)
    now = datetime.now(timezone.utc)
    if last_reconciliation and now - last_reconciliation < timedelta(hours=24):
        return

    print("Starting daily Airtable deletion reconciliation...")
    plans = [
        ('email_engagement', TABLE_EMAIL_ENGAGEMENT, 'Message ID'),
        ('emails', TABLE_EMAILS, 'Email'),
        ('donors', TABLE_DONORS, 'Name'),
    ]
    for table_name, table_id, primary_field in plans:
        airtable_ids = fetch_airtable_ids(table_id, primary_field)
        reconcile_mirror_table(cursor, conn, table_name, airtable_ids)

    update_last_sync_time(cursor, conn, marker)

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
    conn = None
    cursor = None
    lock_acquired = False
    print(f"🚀 Starting Incremental Sync (Time: {datetime.now()})...")
    
    try:
        conn = psycopg2.connect(
            SUPABASE_DB_URL,
            connect_timeout=10,
            application_name="airtable_incremental_sync",
        )
        cursor = conn.cursor()
        cursor.execute("SET statement_timeout TO 30000")
        cursor.execute("SET lock_timeout TO 3000")
        cursor.execute("SET idle_in_transaction_session_timeout TO 30000")
        cursor.execute("SELECT pg_try_advisory_lock(%s)", (SYNC_ADVISORY_LOCK_ID,))
        lock_acquired = bool(cursor.fetchone()[0])
        if not lock_acquired:
            print("Another Airtable sync is already active; skipping this run")
            return
        ensure_replica_schema(cursor, conn)
        
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

        # 3. Emails (Incremental Sync to local table)
        last_sync = get_last_sync_time(cursor, 'emails')
        updates = fetch_modified_records(TABLE_EMAILS, last_sync)
        if updates:
            pg_data = []
            for rec in updates:
                fields = rec.get('fields', {})
                pg_data.append({
                    'airtable_id': rec['id'],
                    'email': fields.get('Email'),
                    'bounced': fields.get('Bounced Account', False)
                })
            upsert_batch(cursor, conn, 'emails', ['airtable_id', 'email', 'bounced'], pg_data)
        update_last_sync_time(cursor, conn, 'emails')

        # 4. Donors
        last_sync = get_last_sync_time(cursor, 'donors')
        updates = fetch_modified_records(TABLE_DONORS, last_sync)
        
        if updates:
            # Collect all referenced email Airtable IDs from updated donors
            all_email_refs = set()
            for rec in updates:
                for eid in rec.get('fields', {}).get('Emails', []):
                    all_email_refs.add(eid)

            # Pointed lookup: fetch only referenced emails from LOCAL DB (not Airtable!)
            email_lookup = {}
            if all_email_refs:
                cursor.execute(
                    "SELECT airtable_id, email, bounced FROM emails WHERE airtable_id = ANY(%s)",
                    (list(all_email_refs),)
                )
                for row in cursor.fetchall():
                    email_lookup[row[0]] = {'email': row[1], 'bounced': row[2]}

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

        # 6. Funnel Email Engagement (append-only event stream)
        last_sync = get_last_sync_time(cursor, 'email_engagement')
        updates = fetch_new_records(TABLE_EMAIL_ENGAGEMENT, last_sync)
        if updates:
            pg_data = []
            for rec in updates:
                fields = rec.get('fields', {})
                donor_links = fields.get('Donor', [])
                pg_data.append({
                    'airtable_id': rec['id'],
                    'donor_airtable_id': donor_links[0] if donor_links else None,
                    'event_type': fields.get('Event Type'),
                    'event_timestamp': fields.get('Timestamp'),
                    'campaign_tag': fields.get('Campaign Tag'),
                    'subject': fields.get('Subject'),
                    'email': fields.get('Email'),
                    'clicked_url': fields.get('Clicked URL'),
                    'device': fields.get('Device'),
                    'template_id': fields.get('Template ID'),
                    'reason': fields.get('Reason'),
                    'updated_at': datetime.now(timezone.utc),
                })
            upsert_batch(
                cursor,
                conn,
                'email_engagement',
                [
                    'airtable_id', 'donor_airtable_id', 'event_type',
                    'event_timestamp', 'campaign_tag', 'subject', 'email',
                    'clicked_url', 'device', 'template_id', 'reason', 'updated_at'
                ],
                pg_data,
                batch_size=200,
            )
        update_last_sync_time(cursor, conn, 'email_engagement')

        # Incremental reads cannot see deleted Airtable records.
        maybe_reconcile_deletions(cursor, conn)

        print("✨ Incremental Sync Completed Successfully.")

    except Exception as e:
        print(f"❌ Error during incremental sync: {e}")
        traceback.print_exc()
    finally:
        if cursor and lock_acquired:
            try:
                cursor.execute(
                    "SELECT pg_advisory_unlock(%s)",
                    (SYNC_ADVISORY_LOCK_ID,),
                )
            except Exception:
                pass
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    run_sync()
