# --- Archivo: backend/app/db/create_user.py ---
from app.db.database import SessionLocal
from app.db.models import User
from app.core.security import get_password_hash

# ⚠️ EDITA estos datos si necesitas otro usuario
email = "admin@example.com"
password = "admin123"

# Hashear la contraseña
hashed_password = get_password_hash(password)

# Crear una nueva sesión
db = SessionLocal()

# Verificar si el usuario ya existe
existing = db.query(User).filter(User.email == email).first()
if existing:
    print("❗ Usuario ya existe")
else:
    user = User(email=email, hashed_password=hashed_password)
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"✅ Usuario creado: {user.email}")

db.close()
