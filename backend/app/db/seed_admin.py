# --- Archivo: backend/app/db/seed_admin.py ---
from app.db.database import SessionLocal
from app.db.models import User
from app.core.security import get_password_hash

db = SessionLocal()

admin_email = "pepandrey12@gmail.com"
admin_password = "Androc1020@"

existing = db.query(User).filter(User.email == admin_email).first()

if not existing:
    user = User(
        email=admin_email,
        hashed_password=get_password_hash(admin_password),
        is_admin=True  # ✅ admin activo
    )
    db.add(user)
    db.commit()
    print("✅ Usuario admin creado.")
else:
    print("ℹ️ Usuario admin ya existe.")

db.close()
