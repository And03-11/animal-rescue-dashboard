# --- Archivo: backend/app/api/v1/endpoints/email_sender.py ---
import csv
import os
import time
import random
import json
import traceback
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any, Optional

from backend.app.services.airtable_service import AirtableService
from backend.app.services.gmail_service import GmailService

from fastapi import Depends
from backend.app.core.security import get_current_user

import shutil


class CSVMappingPayload(BaseModel):
    email_column: str = Field(..., alias='email') # Nombre columna o índice genérico (ej. "Columna 1") para email
    name_column: str = Field(..., alias='name')   # Nombre columna o índice genérico para nombre
    has_header: bool # Indica si el CSV tiene encabezado (y si los nombres son reales o genéricos)
# --- FIN de la clase ---

router = APIRouter()

CAMPAIGN_DATA_DIR = "campaign_data"
SENT_LOGS_DIR = "sent_logs"
TARGETS_DIR = "campaign_targets"
CREDENTIALS_BASE_DIR = "gmail_credentials"

os.makedirs(CAMPAIGN_DATA_DIR, exist_ok=True)
os.makedirs(SENT_LOGS_DIR, exist_ok=True)
os.makedirs(TARGETS_DIR, exist_ok=True)

class CampaignRequest(BaseModel):
    source_type: str # 'airtable' o 'csv'
    subject: str
    html_body: str
    # Campos específicos para Airtable (opcionales)
    region: Optional[str] = None
    is_bounced: Optional[bool] = None


# --- REEMPLAZA esta función completa ---
def run_campaign_task(campaign_id: str):
    """
    Tarea en segundo plano: Lee la configuración, obtiene los contactos
    (de Airtable o CSV según source_type) y envía los emails.
    """
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    target_csv_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv") # Ruta al CSV (puede estar vacío si es Airtable)
    sent_log_path = os.path.join(SENT_LOGS_DIR, f"sent_{campaign_id}.csv")

    # --- 1. Cargar Configuración ---
    try:
        with open(campaign_file_path, 'r') as f:
            config = json.load(f)
        print(f"[{campaign_id}] Loaded config: {config.get('subject')}, Source: {config.get('source_type')}")
    except FileNotFoundError:
        print(f"[{campaign_id}] ERROR: Campaign config file not found.")
        return
    except Exception as e:
        print(f"[{campaign_id}] ERROR: Could not read campaign config: {e}")
        return

    # --- Actualizar Estado a 'Sending' ---
    config['status'] = 'Sending'
    try:
        with open(campaign_file_path, 'w') as f:
            json.dump(config, f, indent=4)
    except Exception as e:
        print(f"[{campaign_id}] WARNING: Could not update status to 'Sending': {e}")
        # Continuamos igualmente, pero el frontend no verá el cambio inmediato

    # --- 2. Obtener Lista de Contactos (Email, Nombre) ---
    contact_data = [] # Lista de diccionarios {'Email': ..., 'Name': ...}
    source_type = config.get('source_type')

    if source_type == 'airtable':
        print(f"[{campaign_id}] Fetching contacts from Airtable...")
        try:
            # Instanciamos AirtableService aquí, dentro de la tarea
            airtable_service = AirtableService()
            # Usamos los filtros guardados en la config
            airtable_contacts_raw = airtable_service.get_campaign_contacts(
                region=config.get('region'),
                is_bounced=config.get('is_bounced', False) # Usa False si no está definido
            )
            # Necesitamos adaptar esto si get_campaign_contacts no devuelve nombres
            # Por ahora, asumimos que solo devuelve Email
            contact_data = [{'Email': c.get('Email'), 'Name': 'Valued Supporter'} # Nombre genérico
                            for c in airtable_contacts_raw if c.get('Email')]
            print(f"[{campaign_id}] Found {len(contact_data)} contacts in Airtable.")
        except Exception as e:
            print(f"[{campaign_id}] ERROR: Failed to get contacts from Airtable: {e}")
            config['status'] = 'Error - Airtable Fetch Failed' # Actualiza estado a error
            # (Guardar estado de error - Opcional aquí, o manejar al final)
            return # Detiene la tarea

    elif source_type == 'csv':
        print(f"[{campaign_id}] Processing contacts from CSV...")
        mapping = config.get('mapping')
        if not mapping or not mapping.get('email') or not mapping.get('name'):
            print(f"[{campaign_id}] ERROR: CSV mapping is missing or incomplete in config.")
            config['status'] = 'Error - Mapping Missing'
            # (Guardar estado de error)
            return

        if not os.path.exists(target_csv_path):
             print(f"[{campaign_id}] ERROR: Target CSV file not found: {target_csv_path}")
             config['status'] = 'Error - CSV File Missing'
             # (Guardar estado de error)
             return

        try:
            # Re-detectar delimitador (o guardarlo en config si prefieres)
            delimiter = ','
            with open(target_csv_path, 'r', newline='', encoding='utf-8-sig') as csvfile_sniffer:
               try:
                   sniffer = csv.Sniffer(); sample = csvfile_sniffer.read(2048); dialect = sniffer.sniff(sample); delimiter = dialect.delimiter
                   print(f"[{campaign_id}] Delimiter detected for processing: '{delimiter}'")
               except csv.Error:
                   print(f"[{campaign_id}] Delimiter detection failed, using default: ','")
                   pass # Usa coma si falla

            # Leer CSV con Pandas
            df = pd.read_csv(
                target_csv_path,
                delimiter=delimiter,
                dtype=str,
                keep_default_na=False,
                # Usa header=None si NO tiene encabezado, para que pandas asigne índices numéricos
                header=0 if mapping.get('has_header', False) else None
            )
            print(f"[{campaign_id}] CSV loaded into DataFrame. Columns found: {df.columns.tolist()}")

            # --- OBTENER NOMBRES/ÍNDICES DIRECTAMENTE DEL MAPEO GUARDADO ---
            email_col_ref = mapping['email'] # Nombre ("Email", "Correo") o índice genérico ("Columna 1")
            name_col_ref = mapping['name']   # Nombre ("Name", "Nombre") o índice genérico ("Columna 2")
            has_header = mapping.get('has_header', False)

            # Determinar la clave real para acceder a las columnas de Pandas
            if has_header:
                # Si tiene header, el mapeo YA DEBERÍA contener el nombre exacto que Pandas usará.
                # (La validación flexible ya la hicimos en save_mapping)
                # PERO, como precaución, verificamos si existen antes de usarlos.
                if email_col_ref not in df.columns:
                     raise ValueError(f"Saved email column '{email_col_ref}' not found in actual CSV header: {df.columns.tolist()}")
                if name_col_ref not in df.columns:
                     raise ValueError(f"Saved name column '{name_col_ref}' not found in actual CSV header: {df.columns.tolist()}")
                actual_email_key = email_col_ref
                actual_name_key = name_col_ref
            else:
                # Si no tiene header, Pandas usa índices (0, 1, 2...). Convertimos "Columna X" a índice.
                try:
                    email_col_index = int(email_col_ref.split(' ')[-1]) - 1
                    name_col_index = int(name_col_ref.split(' ')[-1]) - 1
                    # Validar índices contra el número de columnas que leyó Pandas
                    if not (0 <= email_col_index < len(df.columns)): raise IndexError("Email index out of bounds")
                    if not (0 <= name_col_index < len(df.columns)): raise IndexError("Name index out of bounds")
                    actual_email_key = email_col_index # Usar el índice numérico
                    actual_name_key = name_col_index   # Usar el índice numérico
                except (ValueError, IndexError, AttributeError) as e:
                     raise ValueError(f"Invalid generic column reference in saved mapping ('{email_col_ref}', '{name_col_ref}'). Error: {e}")

            print(f"[{campaign_id}] Accessing DataFrame columns using -> Email key: '{actual_email_key}', Name key: '{actual_name_key}'")

            # Crear la lista de contactos usando las claves correctas
            contact_data = []
            for index, row in df.iterrows():
                email_val = str(row[actual_email_key]).strip() if actual_email_key in row else ''
                name_val = str(row[actual_name_key]).strip() if actual_name_key in row else ''

                if email_val and '@' in email_val and '.' in email_val.split('@')[-1]:
                    contact_data.append({'Email': email_val, 'Name': name_val or 'Valued Supporter'})
                elif email_val:
                     print(f"[{campaign_id}] WARNING: Skipping row {index} due to invalid email format: '{email_val}'")

            print(f"[{campaign_id}] Processed {len(contact_data)} valid contacts from CSV.")
            # --- FIN DEL BLOQUE MODIFICADO ---

        except Exception as e:
            print(f"[{campaign_id}] ERROR: Failed to process CSV file: {e}")
            traceback.print_exc()
            config['status'] = f'Error - CSV Processing Failed'
            # (Guardar estado de error)
            return

    else:
        print(f"[{campaign_id}] ERROR: Unknown source_type '{source_type}'.")
        config['status'] = f'Error - Unknown Source'
        # (Guardar estado de error)
        return

    # --- 3. Preparar Envío ---
    if not contact_data:
        print(f"[{campaign_id}] No contacts found or processed. Campaign finished.")
        config['status'] = 'Completed - No Contacts'
        # (Guardar estado final)
        return

    subject = config.get('subject', '(No Subject)')
    html_body_template = config.get('html_body', '<p>Error: Email body missing.</p>')

    # Inicializar servicio de Gmail (requiere credenciales válidas)
    # TODO: Necesitarás decidir cómo manejar las credenciales. Por ahora, asumimos una fija.
    credentials_path = os.getenv("GMAIL_CREDENTIALS_PATH") # O una ruta específica
    if not credentials_path or not os.path.exists(credentials_path):
         print(f"[{campaign_id}] ERROR: Gmail credentials path not found or not set.")
         config['status'] = 'Error - Gmail Credentials'
         # (Guardar estado de error)
         return
    try:
        gmail_service = GmailService(credentials_path=credentials_path)
    except Exception as e:
         print(f"[{campaign_id}] ERROR: Failed to initialize Gmail service: {e}")
         config['status'] = 'Error - Gmail Init Failed'
         # (Guardar estado de error)
         return

    # --- 4. Iterar y Enviar Emails ---
    sent_emails = []
    # Cargar emails ya enviados si el log existe (para reanudar)
    if os.path.exists(sent_log_path):
        try:
            sent_df = pd.read_csv(sent_log_path)
            sent_emails = sent_df['Email'].tolist()
            print(f"[{campaign_id}] Resuming campaign, found {len(sent_emails)} already sent.")
        except Exception as e:
            print(f"[{campaign_id}] WARNING: Could not read previous sent log: {e}")
            sent_emails = [] # Empezar de cero si hay error

    sent_count_this_run = 0
    for contact in contact_data:
        email = contact.get('Email')
        name = contact.get('Name', 'Valued Supporter') # Usar nombre o genérico

        if not email or email in sent_emails:
            continue # Saltar si no hay email o ya se envió

        # Personalización simple (reemplazar placeholder)
        # Podrías hacer esto más sofisticado con plantillas (Jinja2, etc.)
        html_body_personalized = html_body_template.replace("{{name}}", name)

        print(f"[{campaign_id}] Sending email to {email}...")
        success = gmail_service.send_email(
            to_email=email,
            subject=subject,
            html_body=html_body_personalized
        )

        if success:
            sent_emails.append(email)
            sent_count_this_run += 1
            # Guardar en log CADA VEZ que se envía uno (más seguro)
            try:
                pd.DataFrame({'Email': [email]}).to_csv(
                    sent_log_path,
                    mode='a', # Añadir al archivo
                    header=not os.path.exists(sent_log_path), # Escribir header solo si no existe
                    index=False
                )
            except Exception as e:
                print(f"[{campaign_id}] WARNING: Failed to write to sent log {sent_log_path}: {e}")

            # Pausa aleatoria para evitar límites de envío
            time.sleep(random.uniform(0.5, 2.0))
        else:
            print(f"[{campaign_id}] FAILED to send email to {email}.")
            # Podríamos loguear fallos en otro archivo
            time.sleep(random.uniform(2.0, 5.0)) # Pausa más larga si falla

    # --- 5. Finalizar y Actualizar Estado ---
    print(f"[{campaign_id}] Campaign finished. Sent {sent_count_this_run} emails in this run. Total sent: {len(sent_emails)}/{len(contact_data)}")
    config['status'] = 'Completed'
    # Opcional: Guardar fecha de finalización
    config['completedAt'] = datetime.now().isoformat()
    try:
        with open(campaign_file_path, 'w') as f:
            json.dump(config, f, indent=4)
    except Exception as e:
        print(f"[{campaign_id}] WARNING: Could not update status to 'Completed': {e}")

# --- Fin función ---

# --- Reemplaza la función create_campaign existente ---
@router.post("/sender/campaigns", status_code=201, response_model=Dict[str, Any])
def create_campaign(
    req: CampaignRequest, # Usa el nuevo modelo
    current_user: str = Depends(get_current_user)
    ):
    """
    Crea una campaña: Define la fuente de contactos (Airtable o CSV)
    y guarda la configuración inicial. Si es Airtable, obtiene los contactos.
    """
    airtable_service = AirtableService() # Instancia local

    campaign_id = f"Campaign_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"
    target_contacts_list = [] # Inicializa lista vacía
    total_contacts = 0

    # --- Lógica Condicional para obtener contactos ---
    if req.source_type == 'airtable':
        # Valida que los campos requeridos para Airtable estén presentes
        if req.region is None or req.is_bounced is None:
            raise HTTPException(
                status_code=400,
                detail="Region and is_bounced are required for Airtable source type."
            )
        print(f"Fetching contacts from Airtable for campaign {campaign_id} (Region: {req.region}, Bounced: {req.is_bounced})")
        # Llama a la función actualizada que ya incluye el filtro 'Stage'
        target_contacts_list = airtable_service.get_campaign_contacts(
            region=req.region,
            is_bounced=req.is_bounced
        )
        total_contacts = len(target_contacts_list)
    elif req.source_type == 'csv':
        # Por ahora, solo preparamos. La lógica de carga y mapeo vendrá después.
        print(f"Campaign {campaign_id} created with CSV source type. Contact list will be processed later.")
        total_contacts = 0 # Se actualizará cuando se suba y procese el CSV
    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid source_type. Must be 'airtable' or 'csv'."
        )
    # --- Fin Lógica Condicional ---

    # Guarda la lista de emails (si existe) en el archivo de targets
    target_list_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv")
    # Asegurarnos de que target_contacts_list sea una lista de dicts con 'Email'
    df_data = [{'Email': contact.get('Email')} for contact in target_contacts_list if contact.get('Email')]
    pd.DataFrame(df_data).to_csv(target_list_path, index=False)

    # Guarda la configuración completa de la campaña
    campaign_config = req.model_dump() # Guarda todo lo recibido
    campaign_config.update({
        'id': campaign_id,
        'status': 'Draft', # Estado inicial
        'createdAt': datetime.now().isoformat(),
        'target_count': total_contacts # Puede ser 0 inicialmente para CSV
    })
    file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    with open(file_path, 'w') as f:
        json.dump(campaign_config, f, indent=4)

    return campaign_config

@router.get("/sender/campaigns", response_model=List[Dict[str, Any]])
def list_campaigns(current_user: str = Depends(get_current_user)):
    """
    Lista las campañas en disco con progreso.
    """
    campaigns = []
    # No usamos airtable_service aquí
    for filename in sorted(os.listdir(CAMPAIGN_DATA_DIR), reverse=True):
        if not filename.endswith('.json'):
            continue
        file_path = os.path.join(CAMPAIGN_DATA_DIR, filename)
        try:
            with open(file_path, 'r') as f:
                campaign_data = json.load(f)
            total_contacts = campaign_data.get('target_count', 0)
            campaign_id = campaign_data.get('id')
            sent_log_path = os.path.join(SENT_LOGS_DIR, f"sent_{campaign_id}.csv")
            sent_count = 0
            if os.path.exists(sent_log_path):
                try:
                    sent_count = len(pd.read_csv(sent_log_path))
                except pd.errors.EmptyDataError:
                    sent_count = 0
            percentage = (sent_count / total_contacts * 100) if total_contacts > 0 else 0
            campaign_data['progress'] = {
                "sent": sent_count,
                "total": total_contacts,
                "percentage": round(percentage, 2)
            }
            campaigns.append(campaign_data)
        except Exception as e:
            print(f"ERROR al procesar {filename}: {e}")
            continue
    return campaigns

@router.get("/sender/campaigns/{campaign_id}/details")
def get_campaign_details(
    campaign_id: str,
    current_user: str = Depends(get_current_user)
    ):
    """
    Detalles de envíos por contacto.
    """
    # No usamos airtable_service aquí
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    if not os.path.exists(campaign_file_path):
        raise HTTPException(status_code=404, detail="Campaign not found")
    with open(campaign_file_path, 'r') as f:
        campaign_details = json.load(f)
    target_list_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv")
    if not os.path.exists(target_list_path):
        return {"details": campaign_details, "contacts": []}
    target_df = pd.read_csv(target_list_path)
    target_contacts = target_df['Email'].tolist()
    sent_log_path = os.path.join(SENT_LOGS_DIR, f"sent_{campaign_id}.csv")
    sent_emails = set()
    if os.path.exists(sent_log_path):
        try:
            sent_df = pd.read_csv(sent_log_path)
            if 'Email' in sent_df.columns:
                sent_emails = set(sent_df['Email'].str.lower())
        except pd.errors.EmptyDataError:
            sent_emails = set()
    contact_list_with_status = [
        {"email": email, "status": "Sent" if email.lower() in sent_emails else "Pending"}
        for email in target_contacts
    ]
    return {"details": campaign_details, "contacts": contact_list_with_status}

@router.post("/sender/campaigns/{campaign_id}/launch")
def launch_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    current_user: str = Depends(get_current_user)):
    """
    Lanza la tarea de envío para una campaña.
    """
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    if not os.path.exists(campaign_file_path):
        raise HTTPException(status_code=404, detail="Campaign not found")
    background_tasks.add_task(run_campaign_task, campaign_id)
    return {"message": f"Campaign '{campaign_id}' has been launched."}



# --- Añade esta NUEVA función/endpoint al final del archivo ---
@router.post("/sender/campaigns/{campaign_id}/upload-csv", response_model=Dict[str, Any])
async def upload_campaign_csv(
    campaign_id: str,
    csv_file: UploadFile = File(...), # Recibe el archivo como form data
    current_user: str = Depends(get_current_user)
):
    """
    Recibe un archivo CSV para una campaña existente de tipo 'csv'.
    Guarda el archivo y actualiza la configuración de la campaña.
    """
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")

    # --- Validación 1: Existe la campaña? ---
    if not os.path.exists(campaign_file_path):
        raise HTTPException(status_code=404, detail="Campaign configuration not found.")

    # --- Cargar configuración y Validación 2: Es de tipo CSV? ---
    try:
        with open(campaign_file_path, 'r') as f:
            campaign_config = json.load(f)
        if campaign_config.get('source_type') != 'csv':
            raise HTTPException(
                status_code=400,
                detail="This campaign was not created with source_type 'csv'."
            )
        # Opcional: Validar si la campaña ya está 'Sending' o 'Completed'
        if campaign_config.get('status') not in ['Draft']:
             raise HTTPException(
                status_code=400,
                detail=f"Cannot upload CSV for campaign with status '{campaign_config.get('status')}'."
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading campaign config: {e}")

    # --- Validación 3: Es realmente un archivo CSV? ---
    if not csv_file.filename.lower().endswith('.csv') or csv_file.content_type != 'text/csv':
         raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a .csv file."
        )

    # --- Guardar el archivo CSV ---
    # Usamos el nombre estandarizado target_{campaign_id}.csv
    target_csv_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv")
    try:
        with open(target_csv_path, "wb") as buffer:
            # Copia el contenido del archivo subido al archivo destino
            shutil.copyfileobj(csv_file.file, buffer)
        print(f"Archivo CSV guardado en: {target_csv_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded CSV file: {e}")
    finally:
        await csv_file.close() # Cierra el archivo subido

    # --- Actualizar la configuración JSON de la campaña ---
    # Podríamos leer el CSV aquí para contar filas, pero lo haremos en el mapeo
    # Por ahora, solo guardamos el nombre original del archivo subido
    campaign_config['csv_filename'] = csv_file.filename
    # Podríamos resetear el target_count aquí si quisiéramos
    # campaign_config['target_count'] = 0 # O se calculará después del mapeo

    try:
        with open(campaign_file_path, 'w') as f:
            json.dump(campaign_config, f, indent=4)
    except Exception as e:
        # Si falla al actualizar el JSON, idealmente deberíamos borrar el CSV guardado
        # (rollback), pero por simplicidad ahora solo reportamos el error.
         print(f"Error updating campaign config file {campaign_file_path}: {e}")
         # Podríamos decidir si lanzar un error HTTP aquí o no
         # raise HTTPException(status_code=500, detail=f"Could not update campaign config: {e}")

    # Devuelve la configuración actualizada (o al menos un mensaje de éxito)
    # return campaign_config
    return {"message": f"CSV file '{csv_file.filename}' uploaded successfully for campaign {campaign_id}.", "target_path": target_csv_path}



# --- Añade esta NUEVA función/endpoint al final del archivo ---
@router.get("/sender/campaigns/{campaign_id}/csv-preview", response_model=Dict[str, Any])
async def get_csv_preview(
    campaign_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Lee las primeras filas del archivo CSV asociado a una campaña
    para obtener las cabeceras o una muestra de los datos y detectar el delimitador.
    """
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    target_csv_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv")

    # --- Validaciones ---
    if not os.path.exists(campaign_file_path) or not os.path.exists(target_csv_path):
        raise HTTPException(status_code=404, detail="Campaign or its CSV file not found.")

    try:
        with open(campaign_file_path, 'r') as f:
            campaign_config = json.load(f)
        if campaign_config.get('source_type') != 'csv':
            raise HTTPException(status_code=400, detail="Campaign is not of type 'csv'.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading campaign config: {e}")

    # --- Leer CSV y detectar cabeceras/muestra ---
    try:
    # --- Intenta leer con utf-8-sig primero ---
        try:
            print("Attempting to read CSV with utf-8-sig encoding...")
            with open(target_csv_path, 'r', newline='', encoding='utf-8-sig') as csvfile:
                # Detectar delimitador
                sniffer = csv.Sniffer()
                sample = csvfile.read(2048) # Leer muestra
                dialect = sniffer.sniff(sample)
                delimiter = dialect.delimiter
                csvfile.seek(0) # Volver al inicio

                # Leer filas para preview
                reader = csv.reader(csvfile, delimiter=delimiter)
                first_row = next(reader, None)
                second_row = next(reader, None)
                print(f"Successfully read preview with utf-8-sig. Delimiter: '{delimiter}'")

        except UnicodeDecodeError:
            # --- Si utf-8 falla, intenta con latin-1 ---
            print("UTF-8 decoding failed. Attempting to read CSV with latin-1 encoding...")
            with open(target_csv_path, 'r', newline='', encoding='latin-1') as csvfile:
                # Detectar delimitador (puede ser diferente con otra codificación)
                sniffer = csv.Sniffer()
                # OJO: Sniffer puede fallar con latin-1 si hay caracteres binarios
                # raros. Añadimos try/except para el sniffer también.
                try:
                    sample = csvfile.read(2048)
                    dialect = sniffer.sniff(sample)
                    delimiter = dialect.delimiter
                    csvfile.seek(0)
                except csv.Error:
                    delimiter = ',' # Asumir coma si falla detección en latin-1
                    csvfile.seek(0)
                    print("Could not detect delimiter with latin-1, defaulting to ','")


                # Leer filas para preview
                reader = csv.reader(csvfile, delimiter=delimiter)
                first_row = next(reader, None)
                second_row = next(reader, None)
                print(f"Successfully read preview with latin-1. Delimiter: '{delimiter}'")

        # --- El resto de la lógica (detección de header, etc.) sigue igual ---
        if first_row is None:
            raise HTTPException(status_code=400, detail="CSV file is empty.")

        has_header = False
        # ... (lógica de detección de header sin cambios) ...
        if second_row:
            first_row_is_text = all(not item.replace('.', '', 1).replace(',','',1).isdigit() for item in first_row if item) # Permitir comas en números
            if first_row_is_text:
                has_header = True

        column_options = []
        if has_header:
            column_options = first_row
            preview_data = second_row if second_row else []
            print(f"Detected header row: {column_options}")
        else:
            column_options = [f"Columna {i+1}" for i in range(len(first_row))]
            preview_data = first_row
            print(f"No header detected. Using generic names: {column_options}")

        preview_data = (preview_data + [''] * len(column_options))[:len(column_options)]

        return {
            "columns": column_options,
            "has_header": has_header,
            "preview_row": preview_data,
            "delimiter_detected": delimiter
        }

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="CSV file not found after upload.") # Error más específico
    except Exception as e:
        print(f"Error reading CSV preview for {campaign_id}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Could not read CSV preview: {e}")
    



# --- Añade esta NUEVA función/endpoint AL FINAL del archivo ---
@router.post("/sender/campaigns/{campaign_id}/save-mapping", response_model=Dict[str, Any])
async def save_csv_mapping(
    campaign_id: str,
    mapping_data: CSVMappingPayload, # Recibe los datos de mapeo validados
    current_user: str = Depends(get_current_user)
):
    """
    Guarda el mapeo de columnas CSV seleccionado por el usuario en el archivo
    de configuración de la campaña y actualiza el recuento total de contactos.
    """
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    target_csv_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv")

    # --- Validaciones (similares a /csv-preview) ---
    if not os.path.exists(campaign_file_path) or not os.path.exists(target_csv_path):
        raise HTTPException(status_code=404, detail="Campaign or its CSV file not found.")

    try:
        with open(campaign_file_path, 'r') as f:
            campaign_config = json.load(f)
        if campaign_config.get('source_type') != 'csv':
            raise HTTPException(status_code=400, detail="Campaign is not of type 'csv'.")
        if campaign_config.get('status') != 'Draft':
             raise HTTPException(status_code=400, detail="Mapping can only be saved for campaigns in 'Draft' status.")
        # Podríamos validar si el mapeo ya existe y qué hacer (¿sobrescribir?)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading campaign config: {e}")

    # --- Leer CSV para contar filas y validar columnas ---
    try:
        # Reutilizar la lógica de detección de delimitador de /csv-preview
        delimiter = ',' # Valor por defecto
        with open(target_csv_path, 'r', newline='', encoding='utf-8-sig') as csvfile_sniffer:
            sniffer = csv.Sniffer()
            try:
                sample = csvfile_sniffer.read(2048)
                dialect = sniffer.sniff(sample)
                delimiter = dialect.delimiter
            except csv.Error:
                pass # Usar coma por defecto si falla

        # Leer el CSV completo usando pandas para facilidad
        # Nota: Si los archivos son MUY grandes, podríamos necesitar leer línea por línea
        df = pd.read_csv(target_csv_path, delimiter=delimiter, dtype=str, keep_default_na=False) # Lee todo como texto

        total_rows = len(df)
        actual_header_row = df.columns.tolist() # Nombres reales de las columnas en el DataFrame

        # Validar si las columnas mapeadas existen realmente
        mapped_email_col = mapping_data.email_column
        mapped_name_col = mapping_data.name_column
        target_count = 0

        if mapping_data.has_header:
             # Si tiene header, los nombres mapeados deben existir en las columnas del DF
             if mapped_email_col not in actual_header_row:
                 raise HTTPException(status_code=400, detail=f"Mapped email column '{mapped_email_col}' not found in CSV header.")
             if mapped_name_col not in actual_header_row:
                 raise HTTPException(status_code=400, detail=f"Mapped name column '{mapped_name_col}' not found in CSV header.")
             # Contamos todas las filas EXCEPTO la cabecera
             target_count = total_rows # Pandas ya excluye el header del conteo de filas de datos
        else:
             # Si no tiene header, los nombres mapeados son "Columna X". Necesitamos el índice.
             try:
                 # Extraer el índice (Columna 1 -> 0, Columna 2 -> 1, ...)
                 email_col_index = int(mapped_email_col.split(' ')[-1]) - 1
                 name_col_index = int(mapped_name_col.split(' ')[-1]) - 1
                 num_columns = len(actual_header_row) # Pandas asigna índices numéricos como cabecera si no hay

                 if not (0 <= email_col_index < num_columns):
                      raise ValueError("Email column index out of bounds")
                 if not (0 <= name_col_index < num_columns):
                     raise ValueError("Name column index out of bounds")

             except (ValueError, IndexError):
                  raise HTTPException(status_code=400, detail="Invalid generic column name/index provided in mapping.")
             # Contamos TODAS las filas porque no hay cabecera que ignorar
             target_count = total_rows

        # Podríamos añadir validación de emails aquí si quisiéramos ser más estrictos

    except pd.errors.EmptyDataError:
         raise HTTPException(status_code=400, detail="CSV file is empty or could not be read.")
    except Exception as e:
        print(f"Error processing CSV for mapping/counting campaign {campaign_id}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Could not process CSV file: {e}")

    # --- Actualizar la configuración JSON ---
    campaign_config['mapping'] = {
        'email': mapped_email_col,
        'name': mapped_name_col,
        'has_header': mapping_data.has_header
    }
    campaign_config['target_count'] = target_count
    # Podríamos cambiar el status aquí si quisiéramos, ej. 'Ready'
    # campaign_config['status'] = 'Ready'
    campaign_config['status'] = 'Ready'

    try:
        with open(campaign_file_path, 'w') as f:
            json.dump(campaign_config, f, indent=4)
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Could not update campaign config with mapping: {e}")

    return campaign_config # Devuelve la configuración completa actualizada