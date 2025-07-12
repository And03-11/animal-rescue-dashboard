# --- Archivo: backend/app/db/init_db.py ---
from app.db.database import Base, engine
from app.db.models import User  # importa aquí todos tus modelos para que se registren

print("📦 Creando tablas en la base de datos...")
Base.metadata.create_all(bind=engine)
print("✅ Tablas creadas correctamente.")
