# --- File: backend/app/db/init_db.py (Corrected Again) ---
from backend.app.db.database import Base, engine
# ✅ CORRECCIÓN: Solo importamos el modelo 'User' que sí existe.
from backend.app.db.models import User, ScheduledCampaign

def main():
    print("This script will delete and recreate the database.")
    confirm = input("Are you sure you want to continue? (y/n): ")
    if confirm.lower() == 'y':
        print("Recreating database...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully.")
    else:
        print("Operation cancelled.")

if __name__ == "__main__":
    main()