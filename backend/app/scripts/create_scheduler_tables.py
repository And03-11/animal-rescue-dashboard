"""
Script to create scheduler tables in Supabase
Run this to create the necessary tables for campaign scheduling
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def create_scheduler_tables():
    """Create scheduler tables in Supabase"""
    db_url = os.getenv("SUPABASE_DATABASE_URL")
    if not db_url:
        print("❌ SUPABASE_DATABASE_URL not found in .env")
        return
    
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    try:
        # Drop existing tables if they exist (CASCADE to handle foreign keys)
        print("🗑️  Dropping existing tables if they exist...")
        cur.execute("DROP TABLE IF EXISTS scheduled_sends CASCADE")
        cur.execute("DROP TABLE IF EXISTS campaign_emails CASCADE")
        cur.execute("DROP TABLE IF EXISTS scheduled_campaigns CASCADE")
        
        # Create scheduled_campaigns table
        print("📋 Creating scheduled_campaigns table...")
        cur.execute("""
            CREATE TABLE scheduled_campaigns (
                id SERIAL PRIMARY KEY,
                title VARCHAR NOT NULL DEFAULT 'Nueva Campaña',
                start_date TIMESTAMP NOT NULL,
                end_date TIMESTAMP NOT NULL,
                category VARCHAR,
                notes TEXT,
                segmentation_mode VARCHAR DEFAULT 'bc',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes for scheduled_campaigns
        cur.execute("CREATE INDEX idx_scheduled_campaigns_start_date ON scheduled_campaigns(start_date)")
        cur.execute("CREATE INDEX idx_scheduled_campaigns_end_date ON scheduled_campaigns(end_date)")
        cur.execute("CREATE INDEX idx_scheduled_campaigns_category ON scheduled_campaigns(category)")
        
        # Create campaign_emails table
        print("📧 Creating campaign_emails table...")
        cur.execute("""
            CREATE TABLE campaign_emails (
                id SERIAL PRIMARY KEY,
                title VARCHAR NOT NULL DEFAULT 'Nuevo Email',
                subject VARCHAR,
                button_name VARCHAR,
                link_donation VARCHAR,
                link_contact_us VARCHAR,
                custom_links TEXT,
                campaign_id INTEGER NOT NULL REFERENCES scheduled_campaigns(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes for campaign_emails
        cur.execute("CREATE INDEX idx_campaign_emails_campaign_id ON campaign_emails(campaign_id)")
        
        # Create scheduled_sends table
        print("⏰ Creating scheduled_sends table...")
        cur.execute("""
            CREATE TABLE scheduled_sends (
                id SERIAL PRIMARY KEY,
                send_at TIMESTAMP NOT NULL,
                service VARCHAR NOT NULL DEFAULT 'Other',
                status VARCHAR NOT NULL DEFAULT 'pending',
                segment_tag VARCHAR,
                campaign_email_id INTEGER NOT NULL REFERENCES campaign_emails(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes for scheduled_sends
        cur.execute("CREATE INDEX idx_scheduled_sends_send_at ON scheduled_sends(send_at)")
        cur.execute("CREATE INDEX idx_scheduled_sends_service ON scheduled_sends(service)")
        cur.execute("CREATE INDEX idx_scheduled_sends_status ON scheduled_sends(status)")
        cur.execute("CREATE INDEX idx_scheduled_sends_segment_tag ON scheduled_sends(segment_tag)")
        cur.execute("CREATE INDEX idx_scheduled_sends_campaign_email_id ON scheduled_sends(campaign_email_id)")
        
        # Commit changes
        conn.commit()
        print("✅ All scheduler tables created successfully!")
        
        # Show table counts
        cur.execute("SELECT COUNT(*) FROM scheduled_campaigns")
        campaigns_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM campaign_emails")
        emails_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM scheduled_sends")
        sends_count = cur.fetchone()[0]
        
        print(f"\n📊 Current counts:")
        print(f"   - Campaigns: {campaigns_count}")
        print(f"   - Emails: {emails_count}")
        print(f"   - Sends: {sends_count}")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error creating tables: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    create_scheduler_tables()
