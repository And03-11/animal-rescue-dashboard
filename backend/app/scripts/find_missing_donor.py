import os
import sys
import psycopg2
from pyairtable import Api
from dotenv import load_dotenv

# Ajustar path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
load_dotenv()

# Configuración
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")
TABLE_DONORS = "tblU6V0pLJ1rS4aTX" # Tu ID de tabla Donors

api = Api(AIRTABLE_API_KEY)
table = api.base(AIRTABLE_BASE_ID).table(TABLE_DONORS)

print("🔍 Iniciando auditoría de Donantes...")

try:
    # 1. Obtener IDs de Supabase
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()
    print("📥 Descargando IDs de Supabase...")
    cursor.execute("SELECT airtable_id FROM donors")
    supabase_ids = {row[0] for row in cursor.fetchall()} # Convertimos a Conjunto (Set)
    print(f"   -> Supabase tiene {len(supabase_ids)} donantes.")

    # 2. Obtener IDs de Airtable
    print("📥 Descargando IDs de Airtable (esto puede tardar unos segundos)...")
    # Solo pedimos el campo ID para que sea rápido
    airtable_records = table.all(fields=[]) 
    airtable_ids = {rec['id'] for rec in airtable_records}
    print(f"   -> Airtable tiene {len(airtable_ids)} donantes.")

    # 3. Encontrar la diferencia
    missing_ids = airtable_ids - supabase_ids

    if not missing_ids:
        print("\n✅ ¡Felicidades! No falta ningún donante. Las bases están sincronizadas.")
        # Si los números son diferentes pero el set es igual, puede ser un duplicado en Supabase.
        if len(supabase_ids) > len(airtable_ids):
             print(f"⚠️ OJO: Supabase tiene {len(supabase_ids) - len(airtable_ids)} registros EXTRA que no están en Airtable (posibles borrados).")
    else:
        print(f"\n❌ SE ENCONTRARON {len(missing_ids)} DONANTES FALTANTES EN SUPABASE:")
        print("-" * 60)
        
        for missing_id in missing_ids:
            # Buscar detalles del perdido para saber quién es
            try:
                record = table.get(missing_id)
                fields = record.get('fields', {})
                name = fields.get('Name', 'Sin Nombre')
                last_name = fields.get('Last Name', '')
                email = fields.get('Email (from Emails)', ['Sin Email'])
                print(f"🆔 ID: {missing_id}")
                print(f"👤 Nombre: {name} {last_name}")
                print(f"📧 Email: {email}")
                print("-" * 60)
            except Exception as e:
                print(f"🆔 ID: {missing_id} (No se pudo descargar info: {e})")

except Exception as e:
    print(f"Error crítico: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()