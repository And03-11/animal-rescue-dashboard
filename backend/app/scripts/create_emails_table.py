import os
import psycopg2
from pyairtable import Api
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")

TABLE_EMAILS = "tbl709FbsHC58gvJc"

def create_and_populate():
    print("🛠️ Creating 'emails' table...")
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()
    
    try:
        # Create table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS emails (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                airtable_id TEXT UNIQUE NOT NULL,
                email TEXT,
                bounced BOOLEAN DEFAULT FALSE
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_airtable_id ON emails(airtable_id);")
        conn.commit()
        print("✅ Table 'emails' created.")
        
        # Populate from Airtable
        print("📥 Fetching all emails from Airtable...")
        api = Api(AIRTABLE_API_KEY)
        base = api.base(AIRTABLE_BASE_ID)
        table = base.table(TABLE_EMAILS)
        records = table.all(fields=["Email", "Bounced Account"])
        
        print(f"📦 Inserting {len(records)} emails...")
        data = []
        for rec in records:
            fields = rec.get('fields', {})
            data.append((
                rec['id'],
                fields.get('Email'),
                fields.get('Bounced Account', False)
            ))
        
        sql = """
            INSERT INTO emails (airtable_id, email, bounced)
            VALUES %s
            ON CONFLICT (airtable_id) 
            DO UPDATE SET email = EXCLUDED.email, bounced = EXCLUDED.bounced;
        """
        execute_values(cursor, sql, data, page_size=100)
        conn.commit()
        print(f"✅ {len(records)} emails inserted into Supabase.")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    create_and_populate()
