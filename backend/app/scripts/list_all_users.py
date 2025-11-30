from backend.app.db.database import SessionLocal
from backend.app.db.models import User

def list_all_users():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        print(f"📋 Found {len(users)} users in database:")
        for user in users:
            print(f"  - ID: {user.id}, Username: {user.username}, Admin: {user.is_admin}")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    list_all_users()
