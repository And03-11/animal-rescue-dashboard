import os
import sys
import psycopg2
from psycopg2.extras import execute_values
from pyairtable import Api
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime

# Ajustar path para importar desde app si fuera necesario
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

# Cargar variables de entorno
load_dotenv()

# --- CONFIGURACIÓN ---
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

# IDs de Tablas en Airtable
TABLE_CAMPAIGNS = "tblkqsGw01v7E0LMh"
TABLE_FORM_TITLES = "tblatGFOw5214wSw9"
TABLE_DONORS = "tblU6V0pLJ1rS4aTX"
TABLE_EMAILS = "tbl709FbsHC58gvJc"
TABLE_DONATIONS = "tblF77oj9JmHAoJ5M"

if not all([AIRTABLE_API_KEY, AIRTABLE_BASE_ID, SUPABASE_DB_URL]):
    print("❌ Error: Faltan variables de entorno.")
    sys.exit(1)

api = Api(AIRTABLE_API_KEY)
base = api.base(AIRTABLE_BASE_ID)

print("🚀 Iniciando migración ROBUSTA a Supabase...")

try:
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()
    print("✅ Conexión a Supabase exitosa.")
except Exception as e:
    print(f"❌ Error conectando a Supabase: {e}")
    sys.exit(1)

# --- FUNCIONES HELPER ---

def fetch_all(table_id, fields=None):
    """Descarga todos los registros de una tabla de Airtable"""
    table = base.table(table_id)
    print(f"📥 Descargando tabla {table_id} de Airtable...")
    try:
        return table.all(fields=fields)
    except Exception as e:
        print(f"⚠️ Error descargando tabla: {e}")
        return []

def upsert_batch(table_name, columns, data, conflict_col='airtable_id'):
    """
    Inserta datos masivamente en Postgres (Upsert).
    """
    if not data:
        return
    
    cols_str = ', '.join(columns)
    vals_placeholder = "%s"
    update_cols = [c for c in columns if c != 'airtable_id'] 
    update_str = ', '.join([f"{c} = EXCLUDED.{c}" for c in update_cols])
    
    sql = f"""
        INSERT INTO {table_name} ({cols_str})
        VALUES {vals_placeholder}
        ON CONFLICT ({conflict_col}) 
        DO UPDATE SET {update_str};
    """
    
    values = []
    for item in data:
        row = tuple(item[c] for c in columns)
        values.append(row)
    
    try:
        execute_values(cursor, sql, values, page_size=1000)
        conn.commit()
        print(f"✅ {table_name}: {len(data)} registros upsertados/actualizados.")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error insertando en {table_name}: {e}")
        sys.exit(1)

def build_id_map_from_db(table_name):
    """
    Consulta la DB para crear un mapa VERDADERO de airtable_id -> uuid.
    Esto asegura que no haya referencias perdidas.
    """
    print(f"🔄 Reconstruyendo mapa de IDs para {table_name}...")
    cursor.execute(f"SELECT airtable_id, id FROM {table_name}")
    return {row[0]: row[1] for row in cursor.fetchall()}

# ==========================================
# 1. CAMPAIGNS
# ==========================================
print("\n--- Paso 1: Campaigns ---")
# Removed "Created Time" from fields as it is a metadata field
at_campaigns = fetch_all(TABLE_CAMPAIGNS, fields=["Name", "Source"])
pg_campaigns_data = []
for rec in at_campaigns:
    pg_campaigns_data.append({
        'airtable_id': rec['id'],
        'name': rec.get('fields', {}).get('Name'),
        'source': rec.get('fields', {}).get('Source'),
        'created_at': rec.get('createdTime')
    })

upsert_batch('campaigns', ['airtable_id', 'name', 'source', 'created_at'], pg_campaigns_data)
# Recuperar mapa real desde la base de datos
campaign_map = build_id_map_from_db('campaigns')


# ==========================================
# 2. FORM TITLES
# ==========================================
print("\n--- Paso 2: Form Titles ---")
at_forms = fetch_all(TABLE_FORM_TITLES, fields=["Name", "Campaign"])
pg_forms_data = []
for rec in at_forms:
    camp_links = rec.get('fields', {}).get('Campaign', [])
    campaign_uuid = campaign_map.get(camp_links[0]) if camp_links else None
    
    pg_forms_data.append({
        'airtable_id': rec['id'],
        'name': rec.get('fields', {}).get('Name'),
        'campaign_id': campaign_uuid
    })

upsert_batch('form_titles', ['airtable_id', 'name', 'campaign_id'], pg_forms_data)
# Recuperar mapa real
form_title_map = build_id_map_from_db('form_titles')


# ==========================================
# 3. DONORS & EMAILS
# ==========================================
print("\n--- Paso 3: Donors & Emails ---")

# 3a. Emails Lookup
at_emails = fetch_all(TABLE_EMAILS, fields=["Email", "Bounced Account"])
email_lookup = {} 
for rec in at_emails:
    fields = rec.get('fields', {})
    email_lookup[rec['id']] = {
        'email': fields.get('Email'),
        'bounced': fields.get('Bounced Account', False)
    }

# 3b. Donors
at_donors = fetch_all(TABLE_DONORS, fields=["Name", "Last Name", "Emails", "Region", "Stage"])
pg_donors_data = []

for rec in at_donors:
    fields = rec.get('fields', {})
    linked_email_ids = fields.get('Emails', [])
    email_addresses = []
    is_bounced = False
    
    for email_id in linked_email_ids:
        data = email_lookup.get(email_id)
        if data:
            if data['email']: email_addresses.append(data['email'])
            if data['bounced']: is_bounced = True

    full_name = f"{fields.get('Name', '')} {fields.get('Last Name', '')}".strip()

    pg_donors_data.append({
        'airtable_id': rec['id'],
        'name': full_name,
        'emails': email_addresses,
        'region': fields.get('Region'),
        'stage': fields.get('Stage'),
        'bounced': is_bounced
    })

upsert_batch('donors', ['airtable_id', 'name', 'emails', 'region', 'stage', 'bounced'], pg_donors_data)
# Recuperar mapa real (CRUCIAL: Ahora sí tendremos TODOS los IDs)
donor_map = build_id_map_from_db('donors')


# ==========================================
# 4. DONATIONS
# ==========================================
print("\n--- Paso 4: Donations ---")
at_donations = fetch_all(TABLE_DONATIONS, fields=["Amount", "Date", "Donor", "Form Title"])
if at_donations:
    print(f"🔍 MUESTRA DE FECHA RECIBIDA: {at_donations[0].get('fields', {}).get('Date')}")
pg_donations_data = []

missing_donor_count = 0

for rec in at_donations:
    fields = rec.get('fields', {})
    
    # Resolver Donante
    donor_links = fields.get('Donor', [])
    donor_uuid = None
    if donor_links:
        # Aquí está la magia: donor_map ahora contiene todo lo que hay en SQL
        donor_uuid = donor_map.get(donor_links[0])
        if not donor_uuid:
            missing_donor_count += 1
    
    # Resolver Form Title
    form_links = fields.get('Form Title', [])
    form_uuid = form_title_map.get(form_links[0]) if form_links else None
    
    pg_donations_data.append({
        'airtable_id': rec['id'],
        'amount': fields.get('Amount'),
        'donation_date': fields.get('Date'),
        'donor_id': donor_uuid,
        'form_title_id': form_uuid
    })

if missing_donor_count > 0:
    print(f"⚠️ Advertencia: {missing_donor_count} donaciones tienen un ID de donante en Airtable que no se encontró en Supabase.")

upsert_batch('donations', ['airtable_id', 'amount', 'donation_date', 'donor_id', 'form_title_id'], pg_donations_data)

print("\n✨ Migración completada exitosamente.")
cursor.close()
conn.close()