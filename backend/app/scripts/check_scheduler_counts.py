import sys
import os
from sqlalchemy import text

# Ensure the project root is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '../../../'))
sys.path.insert(0, project_root)

from backend.app.db.database import SessionLocal, engine

def check_counts():
    print(f"🔌 Connecting to database: {engine.url}")
    db = SessionLocal()
    try:
        campaigns = db.execute(text("SELECT COUNT(*) FROM scheduled_campaigns")).scalar()
        emails = db.execute(text("SELECT COUNT(*) FROM campaign_emails")).scalar()
        sends = db.execute(text("SELECT COUNT(*) FROM scheduled_sends")).scalar()
        
        print(f"📊 Counts:")
        print(f"   - Campaigns: {campaigns}")
        print(f"   - Emails: {emails}")
        print(f"   - Sends: {sends}")
        
    except Exception as e:
        print(f"❌ Error checking counts: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_counts()
