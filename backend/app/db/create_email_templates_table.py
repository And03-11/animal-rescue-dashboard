# --- Script: backend/app/db/create_email_templates_table.py ---
"""
Script para crear la tabla email_templates en Supabase.
Ejecutar una sola vez después de agregar el modelo EmailTemplate.

Uso:
    python -m backend.app.db.create_email_templates_table
"""

from backend.app.db.database import engine, Base
from backend.app.db.models import EmailTemplate  # Importar para registrar el modelo

def create_tables():
    print("🔄 Conectando a la base de datos...")
    print(f"   URL: {engine.url}")
    
    print("📦 Creando tabla 'email_templates' si no existe...")
    # Esto solo crea las tablas que no existen, no modifica las existentes
    Base.metadata.create_all(bind=engine, tables=[EmailTemplate.__table__])
    
    print("✅ ¡Tabla 'email_templates' creada exitosamente!")

if __name__ == "__main__":
    create_tables()
