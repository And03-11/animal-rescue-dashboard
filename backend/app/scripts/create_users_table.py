from backend.app.db.database import engine, Base
from backend.app.db.models import User

def create_users_table():
    print("📋 Creating 'users' table in Supabase...")
    try:
        # Create the table
        User.__table__.create(bind=engine)
        print("✅ Table 'users' created successfully!")
    except Exception as e:
        print(f"❌ Error creating table: {e}")

if __name__ == "__main__":
    create_users_table()
