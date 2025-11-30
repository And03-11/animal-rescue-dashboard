# --- Archivo: backend/app/db/database.py ---
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent # backend/app/db -> backend/app -> backend
ENV_PATH = BASE_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)

# ✅ CAMBIO: Usar Supabase (PostgreSQL) en lugar de SQLite
SQLALCHEMY_DATABASE_URL = os.getenv("SUPABASE_DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    # Fallback a SQLite local si no hay variable de entorno (útil para dev local sin internet)
    print("⚠️ SUPABASE_DATABASE_URL not found, falling back to local SQLite.")
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(BASE_DIR, "app.db")
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
    connect_args = {"check_same_thread": False}
else:
    # Configuración para PostgreSQL
    print("✅ Connecting to Supabase PostgreSQL...")
    connect_args = {} # PostgreSQL no necesita check_same_thread

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
