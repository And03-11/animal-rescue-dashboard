import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from pathlib import Path

# Cargar .env de backend
BASE_DIR = Path(r"c:\Users\mjcha\Desktop\App desarrollo\AnimalDashboard\animal-rescue-dashboard\backend")
load_dotenv(BASE_DIR / ".env")

SQLALCHEMY_DATABASE_URL = os.getenv("SUPABASE_DATABASE_URL")
print(f"Connecting to: {SQLALCHEMY_DATABASE_URL}")

engine = create_engine(SQLALCHEMY_DATABASE_URL)

with engine.connect() as connection:
    result = connection.execute(text("SELECT username FROM users"))
    users = [row[0] for row in result]
    print(f"Users in DB: {users}")
