import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from datetime import datetime

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

load_dotenv()

def check_scheduled():
    db_url = os.getenv("SUPABASE_DATABASE_URL")
    if not db_url:
        print("No DB URL found")
        return

    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        print(f"Current Server Time (Python): {datetime.now()}")
        
        cur.execute("SELECT NOW()")
        db_time = cur.fetchone()['now']
        print(f"Current DB Time (NOW()): {db_time}")
        
        print("\n--- Checking 'Scheduled' Campaigns ---")
        cur.execute("""
            SELECT id, campaign_name, status, scheduled_at, created_at 
            FROM email_sender_campaigns 
            WHERE status = 'Scheduled'
        """)
        rows = cur.fetchall()
        
        if not rows:
            print("No campaigns found with status 'Scheduled'.")
        else:
            for row in rows:
                print(f"ID: {row['id']}")
                print(f"  Name: {row['campaign_name']}")
                print(f"  Status: {row['status']}")
                print(f"  Scheduled At: {row['scheduled_at']}")
                print(f"  Created At: {row['created_at']}")
                print("-" * 30)

        print("\n--- Checking All Campaigns (Limit 5) ---")
        cur.execute("SELECT id, campaign_name, status, scheduled_at FROM email_sender_campaigns ORDER BY created_at DESC LIMIT 5")
        for row in cur.fetchall():
            print(f"[{row['status']}] {row['campaign_name']} (Scheduled: {row['scheduled_at']})")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    check_scheduled()
