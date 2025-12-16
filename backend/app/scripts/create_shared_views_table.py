"""
Script to create analytics_shared_views table in Supabase
Enables sharing of analytics views via public links
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def create_shared_views_table():
    """Create analytics_shared_views table in Supabase"""
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
                WHERE table_name = 'analytics_shared_views'
            )
        """)
        table_exists = cur.fetchone()[0]
        
        if table_exists:
            print("⚠️  Table analytics_shared_views already exists.")
            return True
        
        # Create analytics_shared_views table
        print("🔗 Creating analytics_shared_views table...")
        cur.execute("""
            CREATE TABLE analytics_shared_views (
                token TEXT PRIMARY KEY,
                config JSONB NOT NULL,
                created_by UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE
            )
        """)
        
        # Create indexes
        print("📊 Creating indexes...")
        cur.execute("""
            CREATE INDEX idx_shared_views_created_at 
            ON analytics_shared_views(created_at DESC)
        """)
        
        # Commit changes
        conn.commit()
        print("✅ analytics_shared_views table created successfully!")
        
        # Show table info
        cur.execute("""
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'analytics_shared_views'
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
    create_shared_views_table()
