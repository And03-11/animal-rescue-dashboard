# --- File: backend/app/db/init_db.py (MODIFICADO) ---
from backend.app.db.database import Base, engine

# ✅ 1. Importamos TODOS los modelos que Base necesita conocer
from backend.app.db.models import User, ScheduledCampaign, CampaignEmail, ScheduledSend

def main():
    print("This script will DELETE and recreate all database tables.")
    print("WARNING: This will erase all existing Users, Campaigns, and Emails.")
    print("New Schema: User, ScheduledCampaign, CampaignEmail, ScheduledSend")
    confirm = input("Are you sure you want to continue? (y/n): ")
    
    if confirm.lower() == 'y':
        print("Recreating database...")
        # Borra todas las tablas existentes
        Base.metadata.drop_all(bind=engine)
        # Crea todas las tablas que Base conoce
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully.")
    else:
        print("Operation cancelled.")

if __name__ == "__main__":
    main()