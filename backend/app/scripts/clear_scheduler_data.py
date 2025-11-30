import sys
import os
from sqlalchemy import text

# Ensure the project root is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '../../../'))
sys.path.insert(0, project_root)

from backend.app.db.database import SessionLocal, engine

def clear_data():
    print(f"🔌 Connecting to database: {engine.url}")
    db = SessionLocal()
    try:
        print("🗑️  Deleting all scheduler data...")
        
        # 1. Scheduled Sends
        db.execute(text("DELETE FROM scheduled_sends"))
        print(f"   - Deleted sends")
        
        # 2. Campaign Emails
        db.execute(text("DELETE FROM campaign_emails"))
        print(f"   - Deleted emails")
        
        # 3. Scheduled Campaigns
        db.execute(text("DELETE FROM scheduled_campaigns"))
        print(f"   - Deleted campaigns")
        
        db.commit()
        print("✅ All scheduler data cleared successfully!")
        
    except Exception as e:
        print(f"❌ Error clearing data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    clear_data()
