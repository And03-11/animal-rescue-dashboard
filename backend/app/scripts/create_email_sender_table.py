"""
Script to create email_sender_campaigns table in Supabase
Enables scheduled email campaign sending with APScheduler
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def create_email_sender_table():
    """Create email_sender_campaigns table in Supabase"""
    db_url = os.getenv("SUPABASE_DATABASE_URL")
    if not db_url:
        print("❌ SUPABASE_DATABASE_URL not found in .env")
        return False
    
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    try:
        # Check if table already exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'email_sender_campaigns'
            )
        """)
        table_exists = cur.fetchone()[0]
        
        if table_exists:
            print("⚠️  Table email_sender_campaigns already exists.")
            # Just add the scheduled_at column if missing
            cur.execute("""
                ALTER TABLE email_sender_campaigns 
                ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE
            """)
            conn.commit()
            print("✅ Added scheduled_at column if missing.")
            return True
        
        # Create email_sender_campaigns table
        print("📧 Creating email_sender_campaigns table...")
        cur.execute("""
            CREATE TABLE email_sender_campaigns (
                id VARCHAR(100) PRIMARY KEY,
                campaign_name VARCHAR(255) NOT NULL,
                source_type VARCHAR(20) NOT NULL,
                subject TEXT,
                html_body TEXT,
                region VARCHAR(20),
                is_bounced BOOLEAN DEFAULT FALSE,
                sender_config JSONB,
                csv_filename VARCHAR(255),
                mapping JSONB,
                target_count INTEGER DEFAULT 0,
                status VARCHAR(50) DEFAULT 'Draft',
                scheduled_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                completed_at TIMESTAMP WITH TIME ZONE,
                sent_count_final INTEGER DEFAULT 0,
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        """)
        
        # Create indexes for efficient querying
        print("📊 Creating indexes...")
        cur.execute("""
            CREATE INDEX idx_email_campaigns_status 
            ON email_sender_campaigns(status)
        """)
        cur.execute("""
            CREATE INDEX idx_email_campaigns_scheduled 
            ON email_sender_campaigns(scheduled_at, status) 
            WHERE status = 'Scheduled' AND scheduled_at IS NOT NULL
        """)
        cur.execute("""
            CREATE INDEX idx_email_campaigns_created 
            ON email_sender_campaigns(created_at DESC)
        """)
        
        # Commit changes
        conn.commit()
        print("✅ email_sender_campaigns table created successfully!")
        
        # Show table info
        cur.execute("""
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'email_sender_campaigns'
            ORDER BY ordinal_position
        """)
        columns = cur.fetchall()
        
        print(f"\n📋 Table structure:")
        for col in columns:
            print(f"   - {col[0]}: {col[1]} {'(nullable)' if col[2] == 'YES' else '(required)'}")
        
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error creating table: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    create_email_sender_table()
