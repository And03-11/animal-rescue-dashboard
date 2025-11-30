from backend.app.db.database import SessionLocal
from backend.app.db.models import User

def check_admin():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "admin").first()
        if user:
            print(f"✅ User 'admin' found. ID: {user.id}, Is Admin: {user.is_admin}")
        else:
            print("❌ User 'admin' NOT found.")
    except Exception as e:
        print(f"❌ Error querying database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_admin()
