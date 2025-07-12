# --- backend/init_db.py ---
from app.db.database import Base, engine
from app.db.models import User

# Crear todas las tablas
Base.metadata.create_all(bind=engine)

print("✅ Base de datos SQLite inicializada")
