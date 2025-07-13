# --- File: backend/app/db/seed_admin.py (Corrected) ---
from backend.app.db.database import SessionLocal
from backend.app.db.models import User
from backend.app.core.security import get_password_hash

db = SessionLocal()

# This uses the username 'admin' as defined in the previous steps
admin_username = "admin"
admin_password = "Androc1020@" # Make sure this is the password you want

# Verifying if the user already exists by username
existing_user = db.query(User).filter(User.username == admin_username).first()

if not existing_user:
    # If the user doesn't exist, create it
    admin_user = User(
        username=admin_username,
        hashed_password=get_password_hash(admin_password),
        is_admin=True
    )
    db.add(admin_user)
    db.commit()
    print(f"✅ Admin user '{admin_username}' created successfully.")
else:
    # If the user exists, you can optionally update it or just report it
    print(f"ℹ️ Admin user '{admin_username}' already exists.")

db.close()