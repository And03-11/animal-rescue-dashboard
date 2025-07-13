# --- Archivo: backend/app/db/inspect_users.py (Versión final corregida) ---

# Corregimos las rutas de importación para que funcionen con 'python -m' desde la raíz
from backend.app.db.database import SessionLocal, engine
from backend.app.db.models import User

print(f"🔍 Conectando a la base de datos definida por la aplicación:")
print(f"   (Motor: {engine.url})")

db = SessionLocal()

print("\n📋 Verificación de Permisos de Usuario:")
try:
    # Hacemos la consulta directamente sobre el modelo User
    users = db.query(User).all()
    if not users:
        print("❌ No hay usuarios registrados en la base de datos.")
    else:
        print("-" * 60)
        for user in users:
            admin_status = "✅ SÍ" if user.is_admin else "❌ NO"
            print(f"🧑 ID: {user.id:<3} | Es Admin: {admin_status:<7} | Email: {user.email}")
        print("-" * 60)
except Exception as e:
    print(f"⚠️ Ocurrió un error inesperado al consultar los usuarios: {e}")
finally:
    # Es crucial cerrar la sesión de la base de datos
    db.close()