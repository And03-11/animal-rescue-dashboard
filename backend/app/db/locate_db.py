# archivo temporal: locate_db.py
from app.db.database import engine

print("📂 Usando archivo de base de datos:")
print(engine.url.database)
