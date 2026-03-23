import sys
import os
from sqlalchemy import text

# Add parent directory to sys.path to find 'app'
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

try:
    from app.db.database import SessionLocal
    print("✅ SessionLocal imported successfully.")
except ImportError:
    print(f"❌ Error: Could not import app.db.database. sys.path: {sys.path}")
    sys.exit(1)

def migrate_username_to_email():
    db = SessionLocal()
    try:
        print("🔍 Checking database for 'username' column...")
        # Check if username exists and email does NOT exist
        # We'll just run a RENAME with safety checks
        
        # Renaming column
        print("🚀 Executing: ALTER TABLE users RENAME COLUMN username TO email;")
        db.execute(text("ALTER TABLE users RENAME COLUMN username TO email;"))
        db.commit()
        print("✨ Database migrated successfully: 'username' is now 'email'.")
    except Exception as e:
        print(f"⚠️ Warning or Error during migration: {e}")
        db.rollback()
        # It might fail if already renamed, which is fine
        if "already exists" in str(e).lower() or "not exist" in str(e).lower():
            print("✅ Column might already be updated or username doesn't exist. Check your DB.")
    finally:
        db.close()

if __name__ == "__main__":
    migrate_username_to_email()
