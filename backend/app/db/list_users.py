# --- Archivo: backend/app/db/list_users.py ---
from app.db.database import SessionLocal
from app.db.models import User

# Crear sesión y listar usuarios
db = SessionLocal()
users = db.query(User).all()

db.close()

if not users:
    print("❌ No hay usuarios en la base de datos.")
else:
    print("📋 Lista de usuarios:")
    for user in users:
        print(f"🧑 {user.id}: {user.email}")
