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

api = None
base = None

if all([AIRTABLE_API_KEY, AIRTABLE_BASE_ID, SUPABASE_DB_URL]):
    api = Api(AIRTABLE_API_KEY)
    base = api.base(AIRTABLE_BASE_ID)
else:
    print("❌ Error: Faltan variables de entorno.")

# --- FUNCIONES HELPER ---

def fetch_all(table_id, fields=None):
    """Descarga todos los registros de una tabla de Airtable"""
    if not base: return []
    table = base.table(table_id)
    print(f"📥 Descargando tabla {table_id} de Airtable...")
    try:
        return table.all(fields=fields)
    except Exception as e:
        print(f"⚠️ Error descargando tabla: {e}")
        return []

def upsert_batch(cursor, conn, table_name, columns, data, conflict_col='airtable_id', batch_size=50):
    """
    Inserta datos masivamente en Postgres (Upsert) por lotes para evitar timeouts.
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
    
    total_batches = (len(data) + batch_size - 1) // batch_size
    print(f"📦 Iniciando upsert de {len(data)} registros en {table_name} ({total_batches} lotes)...")
    
    try:
        for i in range(0, len(data), batch_size):
            chunk = data[i:i+batch_size]
            values = []
            for item in chunk:
                row = tuple(item[c] for c in columns)
                values.append(row)
            
            execute_values(cursor, sql, values, page_size=batch_size)
            conn.commit()
            print(f"   ✅ Lote {i//batch_size + 1}/{total_batches} insertado in {table_name}")
            
        print(f"✨ {table_name}: Todos los registros upsertados correctamente.")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error insertando en {table_name}: {e}")
        raise e

def build_id_map_from_db(cursor, table_name):
    """
    Consulta la DB para crear un mapa VERDADERO de airtable_id -> uuid.
    Esto asegura que no haya referencias perdidas.
    """
    print(f"🔄 Reconstruyendo mapa de IDs para {table_name}...")
    cursor.execute(f"SELECT airtable_id, id FROM {table_name}")
    return {row[0]: row[1] for row in cursor.fetchall()}

def delete_obsolete_records(cursor, conn, table_name, valid_ids_set):
    """
    Elimina registros en Postgres que ya no existen en Airtable.
    """
    print(f"🧹 Verificando registros obsoletos en {table_name}...")
    cursor.execute(f"SELECT airtable_id FROM {table_name}")
    db_ids = set(row[0] for row in cursor.fetchall())
    
    ids_to_delete = db_ids - valid_ids_set
    
    if ids_to_delete:
        print(f"🗑️ Eliminando {len(ids_to_delete)} registros obsoletos de {table_name}...")
        delete_list = list(ids_to_delete)
        chunk_size = 500
        total_chunks = (len(delete_list) + chunk_size - 1) // chunk_size
        
        try:
            for i in range(0, len(delete_list), chunk_size):
                chunk = delete_list[i:i+chunk_size]
                # Format properly for SQL IN clause
                val_str = ",".join(f"'{x}'" for x in chunk)
                cursor.execute(f"DELETE FROM {table_name} WHERE airtable_id IN ({val_str})")
                conn.commit()
                print(f"   Deleted chunk {i//chunk_size + 1}/{total_chunks}")
            print("✅ Eliminación completada.")
        except Exception as e:
            conn.rollback()
            print(f"❌ Error eliminando en {table_name}: {e}")
    else:
        print(f"✨ Todo sincronizado en {table_name}.")

def ensure_schema(cursor, conn):
    """
    Asegura que la tabla donors tenga las columnas necesarias.
    """
    print("🛠️ Verificando esquema de base de datos...")
    required_columns = {
        'status': 'TEXT',
        'funnel_stage': 'TEXT'
    }
    
    try:
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'donors'")
        existing_columns = {row[0] for row in cursor.fetchall()}
        
        for col, dtype in required_columns.items():
            if col not in existing_columns:
                print(f"➕ Añadiendo columna '{col}' a la tabla donors...")
                cursor.execute(f"ALTER TABLE donors ADD COLUMN {col} {dtype}")
        
        conn.commit()
        print("✅ Esquema verificado.")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error verificando esquema: {e}")
        raise e

def run_migration():
    print(f"🚀 Iniciando migración a Supabase (Hora: {datetime.now()})...")

    if not all([AIRTABLE_API_KEY, AIRTABLE_BASE_ID, SUPABASE_DB_URL]):
        print("❌ Error: Faltan variables de entorno.")
        return

    try:
        conn = psycopg2.connect(SUPABASE_DB_URL)
        cursor = conn.cursor()
        print("✅ Conexión a Supabase exitosa.")
        # Set statement timeout to 60 seconds (60000ms) to avoid premature termination
        cursor.execute("SET statement_timeout = '60s'")
        conn.commit()
        print("🕒 Timeout configurado a 60s.")
    except Exception as e:
        print(f"❌ Error conectando a Supabase: {e}")
        return

    try:
        # Llama a la funcion para asegurar el schema
        ensure_schema(cursor, conn)

        # ==========================================
        # 1. CAMPAIGNS
        # ==========================================
        print("\n--- Paso 1: Campaigns ---")
        # Removed "Created Time" from fields as it is a metadata field
        at_campaigns = fetch_all(TABLE_CAMPAIGNS, fields=["Name", "Source"])
        pg_campaigns_data = []
        valid_campaign_ids = set()

        for rec in at_campaigns:
            valid_campaign_ids.add(rec['id'])
            pg_campaigns_data.append({
                'airtable_id': rec['id'],
                'name': rec.get('fields', {}).get('Name'),
                'source': rec.get('fields', {}).get('Source'),
                'created_at': rec.get('createdTime')
            })

        upsert_batch(cursor, conn, 'campaigns', ['airtable_id', 'name', 'source', 'created_at'], pg_campaigns_data)
        # Recuperar mapa real desde la base de datos
        campaign_map = build_id_map_from_db(cursor, 'campaigns')


        # ==========================================
        # 2. FORM TITLES
        # ==========================================
        print("\n--- Paso 2: Form Titles ---")
        at_forms = fetch_all(TABLE_FORM_TITLES, fields=["Name", "Campaign"])
        pg_forms_data = []
        valid_form_ids = set()

        for rec in at_forms:
            valid_form_ids.add(rec['id'])
            camp_links = rec.get('fields', {}).get('Campaign', [])
            campaign_uuid = campaign_map.get(camp_links[0]) if camp_links else None
            
            pg_forms_data.append({
                'airtable_id': rec['id'],
                'name': rec.get('fields', {}).get('Name'),
                'campaign_id': campaign_uuid
            })

        upsert_batch(cursor, conn, 'form_titles', ['airtable_id', 'name', 'campaign_id'], pg_forms_data)
        # Recuperar mapa real
        form_title_map = build_id_map_from_db(cursor, 'form_titles')


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
        # UPDATED: Fetching Status and Funnel Stage
        at_donors = fetch_all(TABLE_DONORS, fields=["Name", "Last Name", "Emails", "Region", "Stage", "Status", "Funnel Stage"])
        pg_donors_data = []
        valid_donor_ids = set()

        for rec in at_donors:
            valid_donor_ids.add(rec['id'])
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
            
            # Handle list fields for Status and Funnel Stage (Dropdowns/Multiselects usually come as lists in API)
            status_val = fields.get("Status")
            if isinstance(status_val, list) and status_val:
                status_val = status_val[0] # Take first item if list
            
            funnel_stage_val = fields.get("Funnel Stage")
            if isinstance(funnel_stage_val, list) and funnel_stage_val:
                funnel_stage_val = funnel_stage_val[0]

            pg_donors_data.append({
                'airtable_id': rec['id'],
                'name': full_name,
                'emails': email_addresses,
                'region': fields.get('Region'),
                'stage': fields.get('Stage'),
                'bounced': is_bounced,
                'status': status_val,
                'funnel_stage': funnel_stage_val
            })

        upsert_batch(cursor, conn, 'donors', ['airtable_id', 'name', 'emails', 'region', 'stage', 'bounced', 'status', 'funnel_stage'], pg_donors_data)
        # Recuperar mapa real (CRUCIAL: Ahora sí tendremos TODOS los IDs)
        donor_map = build_id_map_from_db(cursor, 'donors')


        # ==========================================
        # 4. DONATIONS
        # ==========================================
        print("\n--- Paso 4: Donations ---")
        at_donations = fetch_all(TABLE_DONATIONS, fields=["Amount", "Date", "Donor", "Form Title"])
        pg_donations_data = []
        valid_donation_ids = set()

        missing_donor_count = 0

        for rec in at_donations:
            valid_donation_ids.add(rec['id'])
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

        upsert_batch(cursor, conn, 'donations', ['airtable_id', 'amount', 'donation_date', 'donor_id', 'form_title_id'], pg_donations_data)

        # ==========================================
        # 5. CLEANUP / DELETIONS
        # ==========================================
        print("\n--- Paso 5: Limpieza de registros obsoletos ---")
        # Importante: El orden importa para respetar Foreign Keys (aunque ON DELETE CASCADE ayudaría, mejor ser explícitos)
        # 1. Donations (Nadie depende de ellas)
        delete_obsolete_records(cursor, conn, 'donations', valid_donation_ids)
        # 2. Donors (Donations dependen de ellos)
        delete_obsolete_records(cursor, conn, 'donors', valid_donor_ids)
        # 3. Form Titles (Donations dependen de ellos)
        delete_obsolete_records(cursor, conn, 'form_titles', valid_form_ids)
        # 4. Campaigns (Form Titles dependen de ellas)
        delete_obsolete_records(cursor, conn, 'campaigns', valid_campaign_ids)

        print("\n✨ Migración completada exitosamente.")
        
    except Exception as e:
        print(f"❌ Error durante la migración: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

if __name__ == "__main__":
    run_migration()