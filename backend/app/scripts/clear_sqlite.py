import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Path to local SQLite db
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Go up one level from 'scripts' to 'app', then to 'backend/app'?? 
# No, scripts is in backend/app/scripts.
# database.py says: BASE_DIR = os.path.dirname(os.path.abspath(__file__)) (which is backend/app/db)
# DB_PATH = os.path.join(BASE_DIR, "app.db") -> backend/app/db/app.db ??
# Let's check where database.py thinks it is.

# Actually, let's just look for the file we found in the previous step (if any).
# But assuming standard location based on database.py:
# backend/app/db/database.py -> BASE_DIR is backend/app/db
# DB_PATH is backend/app/db/app.db

def clear_sqlite_data():
    # Construct path to potential sqlite db
    # We need to match exactly what database.py does
    # database.py is in backend/app/db/
    
    # Let's try to find it relative to this script (backend/app/scripts/clear_sqlite.py)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # backend/app/db/app.db
    db_path = os.path.abspath(os.path.join(current_dir, '../db/app.db'))
    
    print(f"🔎 Looking for SQLite DB at: {db_path}")
    
    if not os.path.exists(db_path):
        print("❌ SQLite DB file not found at expected path.")
        # Try one level up just in case (backend/app.db)
        db_path_alt = os.path.abspath(os.path.join(current_dir, '../app.db'))
        print(f"🔎 Looking for SQLite DB at: {db_path_alt}")
        if os.path.exists(db_path_alt):
            db_path = db_path_alt
        else:
            print("❌ SQLite DB file not found at alternate path either.")
            return

    print(f"✅ Found SQLite DB at: {db_path}")
    sqlite_url = f"sqlite:///{db_path}"
    engine = create_engine(sqlite_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        print("🗑️  Clearing SQLite data...")
        session.execute(text("DELETE FROM scheduled_sends"))
        session.execute(text("DELETE FROM campaign_emails"))
        session.execute(text("DELETE FROM scheduled_campaigns"))
        session.commit()
        print("✅ SQLite data cleared successfully!")
    except Exception as e:
        print(f"❌ Error clearing SQLite: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    clear_sqlite_data()
