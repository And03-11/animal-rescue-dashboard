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
from typing import List, Dict, Any, Optional, Union

from backend.app.services.airtable_service import AirtableService
from backend.app.services.gmail_service import GmailService
from backend.app.services.credentials_manager import credentials_manager_instance


from fastapi import Depends, status
from backend.app.core.security import get_current_user

import shutil


def _update_campaign_status(campaign_id: str, new_status: str) -> Dict[str, Any]:
    """Lee el config de la campaña, actualiza el estado y guarda el archivo."""
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    if not os.path.exists(campaign_file_path):
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found.")

    try:
        with open(campaign_file_path, 'r') as f:
            config = json.load(f)
    except Exception as e:
        print(f"[{campaign_id}] Error leyendo config para actualizar estado: {e}")
        raise HTTPException(status_code=500, detail="Could not read campaign configuration.")

    # Validaciones opcionales (ej: no pausar si ya está completada)
    # current_status = config.get('status', 'Unknown')
    # if current_status in ['Completed', 'Cancelled']:
    #     raise HTTPException(status_code=400, detail=f"Campaign is already {current_status}.")

    config['status'] = new_status
    config['last_updated'] = datetime.now().isoformat() # Opcional: guardar cuándo se actualizó

    try:
        with open(campaign_file_path, 'w') as f:
            json.dump(config, f, indent=4)
        print(f"[{campaign_id}] Estado actualizado a: {new_status}")
        return config # Devuelve la configuración actualizada
    except Exception as e:
        print(f"[{campaign_id}] Error guardando config tras actualizar estado: {e}")
        # Revierte el cambio en memoria si falla el guardado? Opcional.
        raise HTTPException(status_code=500, detail="Could not save updated campaign status.")




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
    # --- AÑADE ESTA LÍNEA ---
    sender_config: Union[str, List[str]] = Field(default="all", description="Grupo ('all', 'normal', 'risky', etc.) o lista de IDs de cuenta (nombres de archivo json sin extensión).")


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

    # --- INICIO: NUEVO BLOQUE para cargar Servicios de Gmail ---
    sender_config = config.get('sender_config', 'all') # 'all' por defecto si no está
    print(f"[{campaign_id}] Configuración de remitente leída: {sender_config}")

    # Usa la instancia importada del CredentialsManager
    gmail_services: List[GmailService] = []
    if credentials_manager_instance: # Verifica si el manager se inicializó correctamente
        try:
            gmail_services = credentials_manager_instance.get_gmail_services(sender_config)
        except Exception as e_mgr:
            print(f"[{campaign_id}] ERROR: Excepción al llamar a get_gmail_services: {e_mgr}")
            traceback.print_exc() # Imprime el traceback completo
    else:
        print(f"[{campaign_id}] ERROR: CredentialsManager no está disponible.")


    if not gmail_services:
        print(f"[{campaign_id}] ERROR: No se pudieron cargar servicios de Gmail válidos. Abortando.")
        config['status'] = 'Error - No Senders Loaded'
        # Guardar estado de error...
        try:
            with open(campaign_file_path, 'w') as f: json.dump(config, f, indent=4)
        except Exception as e_save: print(f"[{campaign_id}] WARNING: Could not save error status: {e_save}")
        return # Detiene la tarea

    print(f"[{campaign_id}] {len(gmail_services)} cuentas de Gmail listas para enviar.")
    # --- FIN: NUEVO BLOQUE ---

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


    # --- 4. Iterar y Enviar Emails ---
    # --- INICIO: REEMPLAZO del Bucle de Envío con Rotación ---
    sent_emails = [] # Lista para llevar registro de emails ya enviados en esta campaña (en minúsculas)
    sent_log_path = os.path.join(SENT_LOGS_DIR, f"sent_{campaign_id}.csv") # Ruta al log

    # Cargar emails ya enviados si el log existe (para reanudar)
    if os.path.exists(sent_log_path):
        try:
            sent_df = pd.read_csv(sent_log_path)
            # Asegurarse que la columna 'Email' existe y manejar NaNs/vacíos
            if 'Email' in sent_df.columns:
                # Convertir a string, quitar nulos, convertir a minúsculas
                sent_emails = sent_df['Email'].dropna().astype(str).str.lower().tolist()
            print(f"[{campaign_id}] Reanudando campaña, encontrados {len(sent_emails)} emails ya enviados en el log.")
        except pd.errors.EmptyDataError:
            print(f"[{campaign_id}] El archivo de log {sent_log_path} está vacío.")
            sent_emails = []
        except Exception as e:
            print(f"[{campaign_id}] ADVERTENCIA: No se pudo leer el log de enviados {sent_log_path}: {e}. Empezando desde cero.")
            sent_emails = [] # Empezar de cero si hay error leyendo el log

    sent_count_this_run = 0
    service_index = 0 # Índice para rotar entre los servicios
    failed_contacts = [] # Opcional: para registrar fallos persistentes

    # Calcula cuántos emails realmente se intentarán enviar en esta ejecución
    emails_to_try = [c.get('Email').lower() for c in contact_data if c.get('Email') and isinstance(c.get('Email'), str) and c.get('Email').lower() not in sent_emails]
    total_contacts_to_send = len(emails_to_try)
    print(f"[{campaign_id}] Emails pendientes en esta ejecución: {total_contacts_to_send}")
    processed_count = 0

    # Crear conjunto de emails ya enviados para búsqueda rápida O(1)
    sent_emails_set = set(sent_emails)

    for contact in contact_data:
        email = contact.get('Email')
        name = contact.get('Name', 'Valued Supporter') # Usar nombre o genérico

        # Validar y normalizar email antes de comparar
        if not email or not isinstance(email, str):
            print(f"[{campaign_id}] ADVERTENCIA: Contacto sin email válido, saltando: {contact}")
            continue
        email_lower = email.lower()

        # Saltar si ya se envió (usando el conjunto para eficiencia)
        if email_lower in sent_emails_set:
            continue

        processed_count += 1
        print(f"[{campaign_id}] Procesando {processed_count}/{total_contacts_to_send}: {email}")

        # Dentro del bucle `for contact in contact_data:` en run_campaign_task

        # --- INICIO: NUEVO BLOQUE - Verificar Pausa/Cancelación ---
        while True: # Bucle para manejar la pausa
            try:
                # RE-LEER el estado actual del archivo ANTES de procesar cada contacto
                with open(campaign_file_path, 'r') as f_status:
                    current_config = json.load(f_status)
                current_status = current_config.get('status', 'Unknown')

                if current_status == "Paused":
                    print(f"[{campaign_id}] PAUSADO. Esperando 10 segundos para re-verificar...")
                    time.sleep(10) # Espera 10 segundos antes de volver a verificar
                    continue # Vuelve al inicio del while True para re-leer estado

                elif current_status == "Cancelled":
                    print(f"[{campaign_id}] CANCELADO detectado. Deteniendo tarea.")
                    # No actualizamos el estado aquí, el endpoint /cancel ya lo hizo
                    return # Termina la ejecución de la tarea

                elif current_status != "Sending":
                    # Si el estado es cualquier cosa que no sea Sending o Paused/Cancelled
                    # (ej. Error, Completed, Draft?), detenemos la tarea por seguridad.
                    print(f"[{campaign_id}] Estado inesperado '{current_status}' detectado. Deteniendo tarea.")
                    return # Termina la ejecución

                # Si llegamos aquí, el estado es "Sending", salimos del bucle while
                break # Sale del while True y continúa con el envío del email actual

            except FileNotFoundError:
                print(f"[{campaign_id}] ERROR CRÍTICO: Archivo de configuración desaparecido durante ejecución. Deteniendo.")
                return # Termina si el archivo ya no existe
            except Exception as e_read_status:
                print(f"[{campaign_id}] ADVERTENCIA: Error al leer estado durante ejecución: {e_read_status}. Reintentando en 10s...")
                time.sleep(10) # Espera si hay error leyendo y reintenta
        # --- FIN: NUEVO BLOQUE ---

        # La línea original que procesa el email sigue aquí:
        print(f"[{campaign_id}] Procesando {processed_count}/{total_contacts_to_send}: {email}")
        # ... (resto del código para personalizar y enviar el email) ...

# El final de la función run_campaign_task (actualizar a Completed, etc.) permanece igual

        # Personalización simple
        html_body_personalized = html_body_template.replace("{{name}}", name)

        # Seleccionar el servicio actual y avanzar el índice para la próxima vez
        current_service = gmail_services[service_index]
        # Obtenemos el nombre base del archivo json para identificar la cuenta
        current_credential_name = os.path.basename(current_service.credentials_path)
        service_index = (service_index + 1) % len(gmail_services) # Rotación circular

        print(f"  -> Usando cuenta: {current_credential_name}")
        success = False
        try:
            success = current_service.send_email(
                to_email=email,
                subject=subject,
                html_body=html_body_personalized
            )
        except Exception as e_send:
            print(f"  -> EXCEPCIÓN al enviar a {email} usando {current_credential_name}: {e_send}")
            # Considerar añadir traceback.print_exc() aquí para más detalle si es necesario

        if success:
            print(f"  -> ÉXITO enviando a {email}")
            sent_emails_set.add(email_lower) # Añadir al conjunto de enviados
            sent_count_this_run += 1
            # Guardar en log CADA VEZ que se envía uno (más seguro)
            try:
                # Escribimos el email original (no el lowercased) al log
                pd.DataFrame({'Email': [email]}).to_csv(
                    sent_log_path,
                    mode='a', # Añadir al archivo
                    header=not os.path.exists(sent_log_path), # Escribir header solo si no existe
                    index=False,
                    encoding='utf-8-sig' # Para compatibilidad con Excel
                )
            except Exception as e_log:
                print(f"[{campaign_id}] ADVERTENCIA: Fallo al escribir en log {sent_log_path}: {e_log}")

            # Pausa aleatoria corta después de éxito
            time.sleep(random.uniform(0.8, 2.5))
        else:
            print(f"  -> FALLO al enviar a {email} usando {current_credential_name}.")
            failed_contacts.append({"email": email, "reason": "Send failed", "account": current_credential_name})
            # Pausa aleatoria más larga después de fallo
            time.sleep(random.uniform(3.0, 6.0))

    # --- FIN: REEMPLAZO del Bucle de Envío ---

    # --- INICIO: REEMPLAZO de Actualización Final de Estado ---
    print(f"[{campaign_id}] Campaña finalizada.")
    final_sent_count = len(sent_emails_set) # Conteo final desde el conjunto actualizado
    print(f"  - Emails enviados en esta ejecución: {sent_count_this_run}")
    print(f"  - Total emails enviados (incluyendo anteriores): {final_sent_count}")
    print(f"  - Total contactos en lista original: {len(contact_data)}")
    print(f"  - Fallos registrados en esta ejecución: {len(failed_contacts)}")
    # Opcional: Guardar los fallos en un archivo de log separado
    # if failed_contacts:
    #     failure_log_path = os.path.join(SENT_LOGS_DIR, f"failed_{campaign_id}.json")
    #     try:
    #         with open(failure_log_path, 'w') as f_fail:
    #             json.dump(failed_contacts, f_fail, indent=4)
    #     except Exception as e_fail_log:
    #          print(f"[{campaign_id}] ADVERTENCIA: No se pudo guardar el log de fallos: {e_fail_log}")


    # Determinar estado final con lógica mejorada
    final_status = 'Unknown' # Estado inicial por si acaso
    if not contact_data:
        final_status = 'Completed - No Contacts'
    else:
        # Calcular total de contactos válidos (con email)
        valid_contacts_count = len([c for c in contact_data if c.get('Email') and isinstance(c.get('Email'), str)])
        if final_sent_count == valid_contacts_count:
            final_status = 'Completed'
        elif final_sent_count > 0: # Si se envió al menos uno, pero no todos
            final_status = 'Completed with Errors'
        elif failed_contacts: # Si no se envió ninguno pero hubo fallos registrados
            final_status = 'Error - Sending Failed'
        else: # Si no había contactos válidos para enviar desde el principio
            final_status = 'Completed - No Valid Contacts to Send'


    config['status'] = final_status
    config['completedAt'] = datetime.now().isoformat() # Guardar fecha/hora de finalización
    config['sent_count_final'] = final_sent_count # Guardar conteo final real

    try:
        with open(campaign_file_path, 'w') as f:
            json.dump(config, f, indent=4)
        print(f"[{campaign_id}] Estado final guardado como: {final_status}")
    except Exception as e:
        print(f"[{campaign_id}] ADVERTENCIA: No se pudo guardar el estado final '{final_status}': {e}")
    # --- FIN: REEMPLAZO de Actualización Final de Estado ---

    # El comentario '# --- Fin función ---' sigue siendo válido después de este bloque.
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




# --- Añadir al final de email_sender.py ---

# Asegúrate que estas importaciones estén al PRINCIPIO del archivo si no lo están ya
from backend.app.services.credentials_manager import CredentialsManager, get_credentials_manager
from fastapi import Depends, HTTPException # Probablemente ya estén
from backend.app.core.security import get_current_user # Probablemente ya esté
# from pydantic import BaseModel # Probablemente ya esté
# from typing import List, Dict # Probablemente ya estén

class CredentialsListResponse(BaseModel):
    groups: List[str]
    # Lista de diccionarios {"id": "nombre_archivo_sin_extension", "group": "nombre_carpeta"}
    accounts: List[Dict[str, str]]

@router.get("/sender/credentials", response_model=CredentialsListResponse, tags=["email"]) # Añade tags si quieres agrupar en Swagger
def list_sender_credentials(
    manager: CredentialsManager = Depends(get_credentials_manager), # Inyecta el manager
    current_user: str = Depends(get_current_user) # Protección de autenticación
):
    """Devuelve una lista de los grupos y cuentas de Gmail detectadas en el servidor."""
    if not manager:
        # Si el manager falló al inicializarse (capturado en credentials_manager.py)
        raise HTTPException(status_code=503, detail="Credentials Manager is not available.")
    try:
        groups = manager.list_groups()
        # Obtenemos solo id y grupo para el frontend, como definimos en el manager
        accounts = [{"id": acc["id"], "group": acc["group"]} for acc in manager.list_accounts()]
        return CredentialsListResponse(groups=groups, accounts=accounts)
    except Exception as e:
         print(f"Error en endpoint /sender/credentials: {e}")
         traceback.print_exc() # Imprime detalle del error en consola backend
         # Lanza un error HTTP para que el frontend sepa que algo falló
         raise HTTPException(status_code=500, detail=f"Could not retrieve sender credentials: {e}")



@router.delete("/sender/campaigns/{campaign_id}",
               status_code=status.HTTP_204_NO_CONTENT, # Devuelve 204 si éxito
               tags=["email"], # Mantener tag
               summary="Delete a specific campaign") # Descripción para Swagger/OpenAPI
def delete_campaign(
    campaign_id: str,
    current_user: str = Depends(get_current_user) # Protección
):
    """
    Deletes a campaign and its associated files (config, target list, sent log).
    """
    print(f"[{campaign_id}] Solicitud de eliminación recibida.")
    # Define las rutas de los archivos asociados
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    target_csv_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv")
    sent_log_path = os.path.join(SENT_LOGS_DIR, f"sent_{campaign_id}.csv")
    # Opcional: Si implementas log de fallos
    # failure_log_path = os.path.join(SENT_LOGS_DIR, f"failed_{campaign_id}.json")

    files_to_delete = [
        campaign_file_path,
        target_csv_path,
        sent_log_path,
        # failure_log_path # Añadir si existe
    ]

    deleted_count = 0
    errors = []

    # Verifica primero si el archivo de configuración principal existe
    if not os.path.exists(campaign_file_path):
        print(f"[{campaign_id}] Error: Archivo de configuración principal no encontrado. No se puede eliminar.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign '{campaign_id}' not found.")

    # Intenta eliminar cada archivo asociado
    for file_path in files_to_delete:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                print(f"  - Archivo eliminado: {os.path.basename(file_path)}")
                deleted_count += 1
            except OSError as e:
                error_msg = f"Error al eliminar {os.path.basename(file_path)}: {e}"
                print(f"  - {error_msg}")
                errors.append(error_msg)
        else:
             print(f"  - Archivo no encontrado (omitido): {os.path.basename(file_path)}")


    # Si hubo errores eliminando archivos secundarios, podrías decidir qué hacer.
    # Por ahora, consideramos éxito si al menos el archivo principal se intentó borrar (y existía).
    if errors:
        # Podrías lanzar un error 500 si la eliminación fue parcial y eso es crítico
        print(f"[{campaign_id}] Eliminación completada con {len(errors)} errores.")
        # raise HTTPException(status_code=500, detail=f"Campaign deleted but failed to remove some associated files: {'; '.join(errors)}")
        # O simplemente loguear y devolver 204 igualmente, ya que la campaña principal (config) se fue.

    print(f"[{campaign_id}] Eliminación completada. {deleted_count} archivos eliminados.")
    # No se devuelve contenido en una respuesta 204
    return None



@router.post("/sender/campaigns/{campaign_id}/pause",
             response_model=Dict[str, Any],
             tags=["email"],
             summary="Pause a running campaign")
def pause_campaign(
    campaign_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Sets the campaign status to 'Paused'.
    The background task should check this status and temporarily stop sending.
    """
    # Aquí podríamos añadir lógica para verificar que la campaña esté realmente 'Sending'
    print(f"[{campaign_id}] Solicitud de pausa recibida.")
    updated_config = _update_campaign_status(campaign_id, "Paused")
    return updated_config

@router.post("/sender/campaigns/{campaign_id}/resume",
             response_model=Dict[str, Any],
             tags=["email"],
             summary="Resume a paused campaign")
def resume_campaign(
    campaign_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Sets the campaign status back to 'Sending' if it was 'Paused'.
    The background task should detect this change and resume sending.
    """
    # Aquí verificamos que venga de 'Paused' para evitar reanudar campañas completadas o en error.
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    current_status = 'Unknown'
    if os.path.exists(campaign_file_path):
        try:
            with open(campaign_file_path, 'r') as f:
                config = json.load(f)
                current_status = config.get('status', 'Unknown')
        except Exception:
            pass # Si no se puede leer, la función _update_campaign_status lanzará error

    if current_status != 'Paused':
         raise HTTPException(status_code=400, detail=f"Campaign cannot be resumed from status '{current_status}'. Must be 'Paused'.")

    print(f"[{campaign_id}] Solicitud de reanudación recibida.")
    # Vuelve al estado 'Sending' para que la tarea continúe
    updated_config = _update_campaign_status(campaign_id, "Sending")
    return updated_config

@router.post("/sender/campaigns/{campaign_id}/cancel",
             status_code=status.HTTP_204_NO_CONTENT,
             tags=["email"],
             summary="Cancel and delete a campaign")
async def cancel_campaign( # Usamos async def por si delete_campaign se vuelve async
    campaign_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Sets the campaign status to 'Cancelled' (to signal the task to stop if running)
    and then deletes the campaign and its files.
    """
    print(f"[{campaign_id}] Solicitud de cancelación recibida.")
    try:
        # Primero, intenta marcarla como cancelada para detener la tarea si está activa
        _update_campaign_status(campaign_id, "Cancelled")
        print(f"[{campaign_id}] Marcada como Cancelled.")
    except HTTPException as e:
        # Si la campaña no existe (404), la función delete_campaign ya lo maneja.
        # Si hay otro error al marcar, lo informamos pero intentamos borrar igual.
        print(f"[{campaign_id}] Nota: No se pudo marcar como Cancelled (puede que ya no exista o error al guardar): {e.detail}")
        # No relanzamos la excepción aquí, procedemos a intentar borrar.

    # Ahora, llamamos a la función de eliminación que ya existe
    # NOTA: delete_campaign actualmente no es `async`, pero la llamamos con `await`
    # por si la refactorizamos en el futuro. Si no es async, simplemente se ejecutará.
    # Si delete_campaign lanza una excepción (ej: 404), se propagará desde aquí.
    try:
        # Reutilizamos la lógica de delete_campaign
        # Es importante que delete_campaign maneje el caso de archivos que no existen
        delete_campaign(campaign_id=campaign_id, current_user=current_user) # Pasar dependencias si es necesario
        print(f"[{campaign_id}] Proceso de eliminación iniciado/completado tras cancelación.")
        # El status 204 se devuelve automáticamente al no retornar nada
    except HTTPException as e:
         # Si delete_campaign falla (ej: 404 porque ya se borró mientras se marcaba),
         # podríamos querer ignorar el 404 aquí o relanzar otros errores.
         if e.status_code == 404:
             print(f"[{campaign_id}] Campaña ya no existía al intentar borrarla tras cancelación.")
             # Devolvemos 204 igualmente, el objetivo (que no exista) se cumple.
             return None
         else:
              print(f"[{campaign_id}] Error durante la eliminación post-cancelación: {e.detail}")
              raise e # Relanzar otros errores (ej: 500)

    return None # Necesario para el 204