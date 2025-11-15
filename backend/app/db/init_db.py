# --- File: backend/app/db/init_db.py (Paso 2) ---
from backend.app.db.database import Base, engine
# ✅ Importamos TODOS los modelos que Base necesita conocer
from backend.app.db.models import User, ScheduledCampaign, ScheduledEmail

def main():
    print("This script will delete and recreate the database.")
    # Añadimos una advertencia más clara sobre la nueva tabla
    print("WARNING: This will create the new 'scheduled_emails' table.")
    confirm = input("Are you sure you want to continue? (y/n): ")
    
    if confirm.lower() == 'y':
        print("Recreating database...")
        # Borra todas las tablas existentes
        Base.metadata.drop_all(bind=engine)
        # Crea todas las tablas que Base conoce (ahora incluye la nueva)
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully (User, ScheduledCampaign, ScheduledEmail).")
    else:
        print("Operation cancelled.")

if __name__ == "__main__":
    main()