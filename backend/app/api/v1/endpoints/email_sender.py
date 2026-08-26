# --- Archivo: backend/app/api/v1/endpoints/email_sender.py ---
import csv
import io
import logging
import os
import time
import random
import json
import traceback
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import pandas as pd
from datetime import datetime
from typing import Annotated, List, Dict, Any, Optional, Union, Literal
import threading
import queue
from uuid import uuid4


from backend.app.services.airtable_service import AirtableCampaignQueryError, AirtableService
from backend.app.services.campaign_audiences import normalize_audiences, serialize_audiences
from backend.app.services.gmail_service import GmailService
from backend.app.services.credentials_manager import credentials_manager_instance
from backend.app.services.email_sender_service import get_email_sender_service
from backend.app.services.campaign_csv import read_csv_preview_rows, read_mapped_contacts
from backend.app.services.email_test_delivery import deliver_test_emails
from backend.app.services.campaign_storage import (
    CampaignFileStorage,
    CampaignMutationLockedError,
    InvalidCampaignIdError,
    summarize_campaign,
)


from fastapi import Depends, status
from backend.app.core.security import get_current_user

import shutil


logger = logging.getLogger(__name__)

def _update_campaign_status(campaign_id: str, new_status: str) -> Dict[str, Any]:
    """Read and atomically persist a campaign status through canonical storage."""
    storage = _get_campaign_storage()
    if not storage.campaign_exists(campaign_id):
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found.")
    try:
        config = storage.load_campaign(campaign_id)
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=500,
            detail="Could not read campaign configuration.",
        ) from error

    config["status"] = new_status
    config["last_updated"] = datetime.now().isoformat()
    try:
        storage.save_campaign(campaign_id, config)
    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail="Could not save updated campaign status.",
        ) from error
    return config




class CSVMappingPayload(BaseModel):
    email_column: str = Field(..., alias='email') # Nombre columna o índice genérico (ej. "Columna 1") para email
    name_column: str = Field(..., alias='name')   # Nombre columna o índice genérico para nombre
    has_header: bool # Indica si el CSV tiene encabezado (y si los nombres son reales o genéricos)
# --- FIN de la clase ---

router = APIRouter()


class AudienceBranchRequest(BaseModel):
    region: Literal["USA", "EUR"]
    is_bounced: bool


class AudiencePreviewRequest(BaseModel):
    audiences: list[AudienceBranchRequest] = Field(min_length=1, max_length=4)
    segment: Literal["standard", "dnr"] = "standard"


@router.post("/sender/audience-preview", response_model=Dict[str, Any])
def preview_audience(
    req: AudiencePreviewRequest,
    current_user: str = Depends(get_current_user),
):
    try:
        audiences = normalize_audiences(
            [audience.model_dump() for audience in req.audiences]
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    try:
        resolution = AirtableService().resolve_campaign_audiences(
            audiences, req.segment
        )
    except AirtableCampaignQueryError as error:
        raise HTTPException(
            status_code=502,
            detail="Unable to load Airtable audience. Try again.",
        ) from error

    return {
        "branches": [
            {
                "region": branch.region,
                "is_bounced": branch.is_bounced,
                "count": branch.count,
            }
            for branch in resolution.branches
        ],
        "total_unique": resolution.total_unique,
    }

CAMPAIGN_DATA_DIR = "campaign_data"
SENT_LOGS_DIR = "sent_logs"
TARGETS_DIR = "campaign_targets"
CREDENTIALS_BASE_DIR = "gmail_credentials"

os.makedirs(CAMPAIGN_DATA_DIR, exist_ok=True)
os.makedirs(SENT_LOGS_DIR, exist_ok=True)
os.makedirs(TARGETS_DIR, exist_ok=True)

def _get_campaign_storage() -> CampaignFileStorage:
    return CampaignFileStorage(
        CAMPAIGN_DATA_DIR,
        SENT_LOGS_DIR,
        TARGETS_DIR,
    )

def _validated_campaign_id(campaign_id: str) -> str:
    try:
        return _get_campaign_storage().validate_campaign_id(campaign_id)
    except InvalidCampaignIdError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid campaign ID.",
        ) from error


CampaignId = Annotated[str, Depends(_validated_campaign_id)]


_ACTIVE_CAMPAIGN_STATUSES = {"Launching", "Sending", "Paused"}
_TERMINAL_CAMPAIGN_STATUSES = {
    "Cancelled",
    "Completed",
    "Completed - No Contacts",
    "Completed - No Valid Contacts to Send",
}


def _sync_remote_campaign_status(campaign_id: str, status_value: str) -> None:
    try:
        get_email_sender_service().update_campaign(
            campaign_id, {"status": status_value}
        )
    except Exception as error:
        print(f"[{campaign_id}] Remote status sync warning: {error}")


def _refresh_airtable_campaign_contacts(
    campaign_id: str,
    config: Dict[str, Any],
    storage: CampaignFileStorage,
    *,
    owner_id: str,
) -> List[Dict[str, Any]]:
    """Resolve and atomically persist the Airtable audience under the launch lock."""
    branches = normalize_audiences(
        config.get("audiences") or None,
        legacy_region=config.get("region"),
        legacy_is_bounced=config.get("is_bounced"),
    )
    resolution = AirtableService().resolve_campaign_audiences(
        branches, config.get("segment") or "standard"
    )
    contact_data = list(resolution.contacts)
    updated_config = {
        **config,
        "audiences": serialize_audiences(branches),
        "target_count": resolution.total_unique,
        "contacts_fetched_at": datetime.now().isoformat(),
    }
    storage.commit_audience_update(
        campaign_id,
        updated_config,
        contact_data,
        owner_id=owner_id,
    )
    config.update(updated_config)
    return contact_data


def prepare_campaign_launch(
    campaign_id: str,
    *,
    refresh_airtable: bool = True,
    rollback_config: Optional[Dict[str, Any]] = None,
) -> str:
    """Reserve and transition a campaign before a background task is queued."""
    storage = _get_campaign_storage()
    if not storage.campaign_exists(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")

    owner_id = storage.acquire_launch_lock(campaign_id)
    if owner_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Campaign is already running or queued for launch",
        )

    try:
        config = storage.load_campaign(campaign_id)
        current_status = config.get("status", "Unknown")
        if current_status in _ACTIVE_CAMPAIGN_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Campaign cannot be launched from status '{current_status}'",
            )
        if current_status in _TERMINAL_CAMPAIGN_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Campaign is already {current_status}",
            )

        if refresh_airtable and config.get("source_type") == "airtable":
            try:
                contact_data = _refresh_airtable_campaign_contacts(
                    campaign_id,
                    config,
                    storage,
                    owner_id=owner_id,
                )
            except AirtableCampaignQueryError as error:
                raise HTTPException(
                    status_code=502,
                    detail="Unable to load Airtable audience. Try again.",
                ) from error
            except ValueError as error:
                raise HTTPException(status_code=422, detail=str(error)) from error
            if not contact_data:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Campaign has no eligible recipients. "
                        "Recalculate the audience before launching."
                    ),
                )

        if rollback_config is not None:
            rollback_config.clear()
            rollback_config.update(config)

        config["status"] = "Launching"
        config["launch_id"] = owner_id
        config["last_updated"] = datetime.now().isoformat()
        storage.save_campaign(campaign_id, config, serialize_unknown=True)
        return owner_id
    except Exception:
        storage.release_launch_lock(campaign_id, owner_id)
        raise


def recover_interrupted_campaigns() -> list[str]:
    return _get_campaign_storage().recover_interrupted_campaigns()


def _select_unique_pending_contacts(
    contact_data: List[Dict[str, Any]],
    sent_emails: set[str],
) -> List[Dict[str, Any]]:
    pending: List[Dict[str, Any]] = []
    queued: set[str] = set()
    normalized_sent = {email.strip().lower() for email in sent_emails}
    for contact in contact_data:
        email = contact.get("Email")
        if not isinstance(email, str) or not email.strip():
            continue
        normalized = email.strip().lower()
        if normalized in normalized_sent or normalized in queued:
            continue
        queued.add(normalized)
        pending.append({**contact, "Email": email.strip()})
    return pending


class CampaignRequest(BaseModel):
    source_type: Literal["airtable", "csv"]
    subject: str
    html_body: str
    campaign_name: str = Field(min_length=1)
    audiences: list[AudienceBranchRequest] | None = Field(
        default=None, min_length=1, max_length=4
    )
    region: str | None = None
    is_bounced: bool | None = None
    sender_config: str | list[str] = "all"
    scheduled_at: datetime | None = None
    segment: Literal["standard", "dnr"] = "standard"


class CampaignUpdateRequest(BaseModel):
    source_type: Literal["airtable", "csv"] | None = None
    mapping: CSVMappingPayload | None = None
    campaign_name: str | None = None
    subject: str | None = None
    html_body: str | None = None
    sender_config: str | list[str] | None = None
    scheduled_at: datetime | None = None
    audiences: list[AudienceBranchRequest] | None = Field(
        default=None, min_length=1, max_length=4
    )
    region: str | None = None
    is_bounced: bool | None = None
    segment: Literal["standard", "dnr"] | None = None


def _request_audiences(
    req: CampaignRequest | CampaignUpdateRequest,
):
    raw_audiences = (
        [audience.model_dump() for audience in req.audiences]
        if req.audiences is not None
        else None
    )
    return normalize_audiences(
        raw_audiences,
        legacy_region=req.region,
        legacy_is_bounced=req.is_bounced,
    )

# --- REEMPLAZA esta función completa ---
def _run_campaign_task_unlocked(campaign_id: str, launch_id: str):
    """
    Tarea en segundo plano: Lee la configuración, obtiene los contactos
    (de Airtable o CSV según source_type) y envía los emails.
    """
    storage = _get_campaign_storage()
    campaign_file_path = storage.campaign_path(campaign_id)
    target_csv_path = storage.target_path(campaign_id)
    sent_log_path = storage.sent_log_path(campaign_id)

    # --- 1. Cargar Configuración ---
    try:
        config = storage.load_campaign(campaign_id)
        print(f"[{campaign_id}] Loaded config: {config.get('subject')}, Source: {config.get('source_type')}")
    except FileNotFoundError:
        print(f"[{campaign_id}] ERROR: Campaign config file not found.")
        # Update Supabase to reflect the error
        try:
            service = get_email_sender_service()
            service.update_campaign(campaign_id, {'status': 'Error - Config Missing'})
        except Exception:
            pass
        return
    except Exception as e:
        print(f"[{campaign_id}] ERROR: Could not read campaign config: {e}")
        try:
            service = get_email_sender_service()
            service.update_campaign(campaign_id, {'status': 'Error - Config Invalid'})
        except Exception:
            pass
        return

    contact_data: List[Dict[str, Any]] = []
    source_type = config.get('source_type')

    # Airtable campaigns must refresh and persist their audience before sender
    # setup or any send-loop work. The wrapper already owns this launch lock.
    if source_type == 'airtable':
        print(f"[{campaign_id}] Refreshing contacts from Airtable...")
        try:
            contact_data = _refresh_airtable_campaign_contacts(
                campaign_id,
                config,
                storage,
                owner_id=launch_id,
            )
        except Exception as error:
            print(f"[{campaign_id}] ERROR: Failed to refresh Airtable contacts: {error}")
            config['status'] = 'Error - Airtable Fetch Failed'
            storage.save_campaign(campaign_id, config, serialize_unknown=True)
            _sync_remote_campaign_status(campaign_id, config['status'])
            return

        if not contact_data:
            config['status'] = 'Error - No Airtable Recipients'
            storage.save_campaign(campaign_id, config, serialize_unknown=True)
            _sync_remote_campaign_status(campaign_id, config['status'])
            return

    # --- Actualizar Estado a 'Sending' ---
    config['status'] = 'Sending'
    try:
        storage.save_campaign(campaign_id, config, serialize_unknown=True)
    except Exception as e:
        print(f"[{campaign_id}] WARNING: Could not update status to 'Sending': {e}")
        # Continuamos igualmente, pero el frontend no verá el cambio inmediato

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
            storage.save_campaign(campaign_id, config, serialize_unknown=True)
            service = get_email_sender_service()
            service.update_campaign(campaign_id, {'status': config['status']})
        except Exception as e_save: print(f"[{campaign_id}] WARNING: Could not save error status: {e_save}")
        return # Detiene la tarea

    print(f"[{campaign_id}] {len(gmail_services)} cuentas de Gmail listas para enviar.")
    # --- FIN: NUEVO BLOQUE ---

    if source_type == 'airtable':
        print(f"[{campaign_id}] Using freshly resolved Airtable contacts.")

    elif source_type == 'csv':
        print(f"[{campaign_id}] Processing contacts from CSV...")
        mapping = config.get('mapping')
        if not mapping or not mapping.get('email') or not mapping.get('name'):
            print(f"[{campaign_id}] ERROR: CSV mapping is missing or incomplete in config.")
            config['status'] = 'Error - Mapping Missing'
            try:
                storage.save_campaign(campaign_id, config, serialize_unknown=True)
                service = get_email_sender_service()
                service.update_campaign(campaign_id, {'status': config['status']})
            except Exception: pass
            return

        if not target_csv_path.exists():
             print(f"[{campaign_id}] ERROR: Target CSV file not found: {target_csv_path}")
             config['status'] = 'Error - CSV File Missing'
             try:
                 storage.save_campaign(campaign_id, config, serialize_unknown=True)
                 service = get_email_sender_service()
                 service.update_campaign(campaign_id, {'status': config['status']})
             except Exception: pass
             return

        try:
            contact_data = read_mapped_contacts(
                target_csv_path,
                mapping,
                campaign_id,
            )

        except Exception as e:
            print(f"[{campaign_id}] ERROR: Failed to process CSV file: {e}")
            traceback.print_exc()
            config['status'] = f'Error - CSV Processing Failed'
            try:
                storage.save_campaign(campaign_id, config, serialize_unknown=True)
                service = get_email_sender_service()
                service.update_campaign(campaign_id, {'status': config['status']})
            except Exception: pass
            return

    else:
        print(f"[{campaign_id}] ERROR: Unknown source_type '{source_type}'.")
        config['status'] = f'Error - Unknown Source'
        try:
            storage.save_campaign(campaign_id, config, serialize_unknown=True)
            service = get_email_sender_service()
            service.update_campaign(campaign_id, {'status': config['status']})
        except Exception: pass
        return

    # --- 3. Preparar Envío ---
    if not contact_data:
        print(f"[{campaign_id}] No contacts found or processed. Campaign finished.")
        config['status'] = 'Completed - No Contacts'
        try:
            storage.save_campaign(campaign_id, config, serialize_unknown=True)
            service = get_email_sender_service()
            service.update_campaign(campaign_id, {'status': config['status']})
        except Exception: pass
        return

    subject = config.get('subject', '(No Subject)')
    html_body_template = config.get('html_body', '<p>Error: Email body missing.</p>')


    # --- 4. Parallel Email Sending ---
    sent_emails = [] # List of already sent emails (lowercase)
    
    # Load already sent emails
    if sent_log_path.exists():
        try:
            sent_df = pd.read_csv(sent_log_path)
            if 'Email' in sent_df.columns:
                sent_emails = sent_df['Email'].dropna().astype(str).str.lower().tolist()
            print(f"[{campaign_id}] Resuming campaign, found {len(sent_emails)} emails already sent.")
        except pd.errors.EmptyDataError:
            sent_emails = []
        except Exception as e:
            print(f"[{campaign_id}] WARNING: Could not read sent log {sent_log_path}: {e}. Starting from scratch.")
            sent_emails = []

    sent_emails_set = {email.strip().lower() for email in sent_emails}
    contacts_to_send = _select_unique_pending_contacts(
        contact_data,
        sent_emails_set,
    )

    total_contacts_to_send = len(contacts_to_send)
    print(f"[{campaign_id}] Emails pending in this run: {total_contacts_to_send}")
    
    sent_count_this_run = 0
    failed_contacts = []

    if total_contacts_to_send == 0:
        print(f"[{campaign_id}] No new contacts to send. Finishing.")
    else:
        # Check if we have services
        if not gmail_services:
             print(f"[{campaign_id}] ERROR: No gmail services available for sending.")
             # Update status to error?
             return

        # Setup Concurrency
        contacts_queue = queue.Queue()
        for contact in contacts_to_send:
            contacts_queue.put(contact)
            
        # Shared state for threads
        log_lock = threading.Lock()
        stop_event = threading.Event()
        
        # Counters
        sent_count_lock = threading.Lock()
        failed_contacts_lock = threading.Lock()
        
        processed_count = 0
        processed_count_lock = threading.Lock()

        # Worker Function
        def email_worker(service: GmailService, worker_id: int):
            nonlocal sent_count_this_run, processed_count
            
            credential_name = os.path.basename(service.credentials_path)
            print(f"[{campaign_id}] Worker {worker_id} started using {credential_name}")
            
            while not contacts_queue.empty() and not stop_event.is_set():
                try:
                    # Retrieve contact
                    try:
                        contact = contacts_queue.get(timeout=1)
                    except queue.Empty:
                        break
                    
                    # Status Check (Reading file)
                    try:
                         current_config = storage.load_campaign(campaign_id)
                         current_status = current_config.get('status', 'Unknown')
                         
                         if current_status == "Paused":
                             contacts_queue.put(contact)
                             contacts_queue.task_done()
                             time.sleep(5) 
                             continue
                             
                         elif current_status == "Cancelled":
                             print(f"[{campaign_id}] CANCELLED detected by Worker {worker_id}.")
                             stop_event.set()
                             contacts_queue.task_done()
                             break
                             
                         elif current_status != "Sending":
                             print(f"[{campaign_id}] Unexpected status '{current_status}'. Stopping.")
                             stop_event.set()
                             contacts_queue.task_done()
                             break
                             
                    except Exception as status_error:
                        print(
                            f"[{campaign_id}] Could not verify campaign status; "
                            f"worker {worker_id} is stopping: {status_error}"
                        )
                        stop_event.set()
                        contacts_queue.task_done()
                        break

                    if stop_event.is_set():
                        contacts_queue.task_done()
                        break

                    # Processing
                    email = contact.get('Email')
                    name = contact.get('Name', 'Valued Supporter')
                    
                    with processed_count_lock:
                        processed_count += 1
                        current_processed = processed_count

                    print(f"[{campaign_id}] Worker {worker_id} processing {current_processed}/{total_contacts_to_send}: {email}")
                    
                    html_body_personalized = html_body_template.replace("{{name}}", name).replace("*|FNAME|*", name)
                    
                    success = False
                    try:
                        success = service.send_email(
                            to_email=email,
                            subject=subject,
                            html_body=html_body_personalized
                        )
                    except Exception as e_send:
                         print(f"[{campaign_id}] Worker {worker_id} Exception sending to {email}: {e_send}")

                    if success:
                        print(f"  -> Worker {worker_id}: SUCCESS {email}")
                        
                        delivery_logged = False
                        with log_lock:
                            try:
                                storage.append_sent_email(campaign_id, email)
                                sent_emails_set.add(email.strip().lower())
                                delivery_logged = True
                            except OSError as log_error:
                                print(
                                    f"[{campaign_id}] Sent delivery could not be "
                                    f"recorded; stopping campaign: {log_error}"
                                )
                                stop_event.set()

                        if delivery_logged:
                            with sent_count_lock:
                                sent_count_this_run += 1
                        else:
                            with failed_contacts_lock:
                                failed_contacts.append(
                                    {
                                        "email": email,
                                        "reason": "Sent but delivery ledger write failed",
                                        "account": credential_name,
                                    }
                                )
                        
                        # Short sleep per account to handle rate limits nicely
                        # With 18+ accounts, we slow this down significantly to keep global rate safe
                        # 12-25s sleep per account = ~2.5 - 5 emails/minute per account
                        # Total system speed with 18 accounts: ~60 emails/minute (approx 1/sec global)
                        time.sleep(random.uniform(12.0, 25.0)) 
                    else:
                        print(f"  -> Worker {worker_id}: FAILED {email}")
                        with failed_contacts_lock:
                            failed_contacts.append({"email": email, "reason": "Send failed", "account": credential_name})
                        time.sleep(random.uniform(30.0, 60.0))
                    
                    contacts_queue.task_done()
                    
                except Exception as e_worker:
                    print(f"[{campaign_id}] Worker {worker_id} crashed: {e_worker}")
                    traceback.print_exc()
        
        # Launch Threads
        threads = []
        for i, service in enumerate(gmail_services):
            t = threading.Thread(target=email_worker, args=(service, i+1))
            t.daemon = True
            t.start()
            threads.append(t)
            
        print(f"[{campaign_id}] Launched {len(threads)} worker threads.")
        
        for t in threads:
            t.join()

    # --- INICIO: REEMPLAZO de Actualización Final de Estado ---
    print(f"[{campaign_id}] Campaña finalizada.")
    final_sent_count = len(sent_emails_set) # Conteo final desde el conjunto actualizado
    print(f"  - Emails enviados en esta ejecución: {sent_count_this_run}")
    print(f"  - Total emails enviados (incluyendo anteriores): {final_sent_count}")
    print(f"  - Total contactos en lista original: {len(contact_data)}")
    print(f"  - Fallos registrados en esta ejecución: {len(failed_contacts)}")
    # Opcional: Guardar los fallos en un archivo de log separado
    # if failed_contacts:
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
        storage.save_campaign(campaign_id, config, serialize_unknown=True)
        print(f"[{campaign_id}] Estado final guardado en local como: {final_status}")
        
        # Sincronizar con Supabase DB
        service = get_email_sender_service()
        service.update_campaign(campaign_id, {
            'status': final_status,
            'completed_at': config['completedAt'],
            'sent_count_final': final_sent_count
        })
        print(f"[{campaign_id}] Estado final guardado en Supabase como: {final_status}")
    except Exception as e:
        print(f"[{campaign_id}] ADVERTENCIA: No se pudo guardar el estado final '{final_status}': {e}")
    # --- FIN: REEMPLAZO de Actualización Final de Estado ---

    # El comentario '# --- Fin función ---' sigue siendo válido después de este bloque.
    # --- 5. Finalizar y Actualizar Estado ---
    # (El estado ya se actualizó correctamente en el bloque anterior)
    print(f"[{campaign_id}] Campaign finished. Sent {sent_count_this_run} emails in this run. Total sent (cumulative): {final_sent_count}/{len(contact_data)}")


def run_campaign_task(campaign_id: str, launch_id: Optional[str] = None):
    """Run one reserved campaign execution and always release its launch lock."""
    storage = _get_campaign_storage()
    if launch_id is None:
        try:
            launch_id = prepare_campaign_launch(
                campaign_id, refresh_airtable=False
            )
        except Exception as error:
            _sync_remote_campaign_status(campaign_id, "Scheduled")
            detail = getattr(error, "detail", str(error))
            print(f"[{campaign_id}] Launch skipped: {detail}")
            return
    elif not storage.owns_launch_lock(campaign_id, launch_id):
        print(f"[{campaign_id}] Launch skipped: execution lock is not owned.")
        return

    try:
        with storage.launch_lock_heartbeat(campaign_id, launch_id):
            _run_campaign_task_unlocked(campaign_id, launch_id)
    except Exception as error:
        print(f"[{campaign_id}] Unexpected campaign failure: {error}")
        try:
            config = storage.load_campaign(campaign_id)
            config["status"] = "Interrupted"
            config["interrupted_at"] = datetime.now().isoformat()
            storage.save_campaign(campaign_id, config, serialize_unknown=True)
            _sync_remote_campaign_status(campaign_id, "Interrupted")
        except Exception as recovery_error:
            print(f"[{campaign_id}] Could not persist interrupted state: {recovery_error}")
    finally:
        storage.release_launch_lock(campaign_id, launch_id)


# --- Fin función ---

# --- Reemplaza la función create_campaign existente ---
@router.post("/sender/campaigns", status_code=201, response_model=Dict[str, Any])
def create_campaign(
    req: CampaignRequest,
    current_user: str = Depends(get_current_user),
):
    """Create local campaign state and publish it with compensation on failure."""
    del current_user
    storage = _get_campaign_storage()
    target_contacts_list: list[dict[str, Any]] = []
    total_contacts = 0
    campaign_config = req.model_dump(exclude={"audiences"})

    if req.source_type == "airtable":
        try:
            branches = _request_audiences(req)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        try:
            resolution = AirtableService().resolve_campaign_audiences(
                branches,
                req.segment,
            )
        except AirtableCampaignQueryError as error:
            raise HTTPException(
                status_code=502,
                detail="Unable to load Airtable audience. Try again.",
            ) from error
        if req.scheduled_at is not None and resolution.total_unique == 0:
            raise HTTPException(
                status_code=422,
                detail="Scheduled campaigns require at least one eligible recipient.",
            )
        target_contacts_list = list(resolution.contacts)
        total_contacts = resolution.total_unique
        campaign_config.update(
            {
                "audiences": serialize_audiences(branches),
                "region": branches[0].region if len(branches) == 1 else None,
                "is_bounced": (
                    branches[0].is_bounced if len(branches) == 1 else None
                ),
            }
        )

    initial_status = (
        "Scheduled"
        if req.source_type == "airtable" and req.scheduled_at is not None
        else "Draft"
    )
    created_at = datetime.now().isoformat()
    campaign_id: str | None = None
    for _attempt in range(5):
        candidate = (
            f"Campaign_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"
            f"_{uuid4().hex}"
        )
        candidate_config = {
            **campaign_config,
            "id": candidate,
            "status": initial_status,
            "createdAt": created_at,
            "target_count": total_contacts,
        }
        try:
            storage.create_campaign_exclusive(candidate, candidate_config)
        except FileExistsError:
            continue
        campaign_id = candidate
        campaign_config = candidate_config
        break

    if campaign_id is None:
        raise HTTPException(
            status_code=500,
            detail="Unable to allocate a campaign ID. Try again.",
        )

    target_rows = [
        {"Email": contact.get("Email")}
        for contact in target_contacts_list
        if contact.get("Email")
    ]
    target_bytes = pd.DataFrame(
        target_rows,
        columns=["Email"],
    ).to_csv(index=False).encode("utf-8")
    try:
        storage.save_uploaded_csv(campaign_id, target_bytes)
        get_email_sender_service().create_campaign(campaign_config)
    except Exception as error:
        logger.error(
            "Campaign publication failed for %s",
            campaign_id,
            exc_info=True,
        )
        storage.delete_created_campaign_artifacts(campaign_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Campaign publication failed. Please retry.",
        ) from error

    return campaign_config
@router.get("/sender/campaigns", response_model=List[Dict[str, Any]])
def list_campaigns(current_user: str = Depends(get_current_user)):
    """List canonical campaign summaries with progress."""
    del current_user
    return _get_campaign_storage().list_campaigns_with_progress(
        page_size=100_000,
    )["items"]
@router.get("/sender/campaigns/{campaign_id:path}/details")
def get_campaign_details(
    campaign_id: CampaignId,
    current_user: str = Depends(get_current_user),
):
    """Return one canonical campaign and its recipient delivery status."""
    del current_user
    storage = _get_campaign_storage()
    if not storage.campaign_exists(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        return storage.get_campaign_details(campaign_id)
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to read campaign details.",
        ) from error
@router.put("/sender/campaigns/{campaign_id:path}", response_model=Dict[str, Any])
def update_campaign(
    campaign_id: CampaignId,
    req: CampaignUpdateRequest,
    current_user: str = Depends(get_current_user),
):
    """Atomically update local campaign state, then publish or roll back."""
    del current_user
    storage = _get_campaign_storage()
    owner_id: str | None = None
    snapshot = None
    try:
        if not storage.campaign_exists(campaign_id):
            raise HTTPException(status_code=404, detail="Campaign not found")

        owner_id = storage.acquire_launch_lock(campaign_id)
        if owner_id is None:
            raise HTTPException(
                status_code=409,
                detail="Campaign is currently active or being updated.",
            )

        snapshot = storage.snapshot_campaign_state(campaign_id)
        config = storage.load_campaign(campaign_id)
        if (
            req.source_type is not None
            and req.source_type != config.get("source_type")
        ):
            raise HTTPException(
                status_code=422,
                detail="Campaign source cannot be changed after creation.",
            )

        request_fields = req.model_fields_set
        update_data = req.model_dump(
            exclude_unset=True,
            exclude={"audiences", "mapping", "source_type"},
        )
        for key, value in update_data.items():
            if value is not None or key == "scheduled_at":
                config[key] = (
                    value.isoformat() if key == "scheduled_at" and value else value
                )

        resolution = None
        audience_fields = {"audiences", "region", "is_bounced", "segment"}
        filters_changed = bool(audience_fields & request_fields)
        if config.get("source_type") == "airtable" and filters_changed:
            try:
                if req.audiences is not None:
                    branches = _request_audiences(req)
                elif {"region", "is_bounced"} & request_fields:
                    branches = normalize_audiences(
                        None,
                        legacy_region=config.get("region"),
                        legacy_is_bounced=config.get("is_bounced"),
                    )
                else:
                    branches = normalize_audiences(
                        config.get("audiences"),
                        legacy_region=config.get("region"),
                        legacy_is_bounced=config.get("is_bounced"),
                    )
            except ValueError as error:
                raise HTTPException(status_code=422, detail=str(error)) from error

            segment = config.get("segment") or "standard"
            try:
                resolution = AirtableService().resolve_campaign_audiences(
                    branches,
                    segment,
                )
            except AirtableCampaignQueryError as error:
                raise HTTPException(
                    status_code=502,
                    detail="Unable to load Airtable audience. Try again.",
                ) from error
            config.update(
                {
                    "audiences": serialize_audiences(branches),
                    "target_count": resolution.total_unique,
                    "region": branches[0].region if len(branches) == 1 else None,
                    "is_bounced": (
                        branches[0].is_bounced if len(branches) == 1 else None
                    ),
                    "segment": segment,
                }
            )

        mapping_changed = req.mapping is not None
        if config.get("source_type") == "csv" and mapping_changed:
            mapping = req.mapping.model_dump(by_alias=True)
            target_path = storage.target_path(campaign_id)
            if not target_path.exists():
                raise HTTPException(
                    status_code=422,
                    detail="Upload a CSV file before saving its mapping.",
                )
            try:
                contacts = read_mapped_contacts(
                    target_path,
                    mapping,
                    campaign_id,
                )
            except (OSError, UnicodeError, ValueError, KeyError) as error:
                raise HTTPException(
                    status_code=422,
                    detail="Invalid CSV mapping or recipient data.",
                ) from error
            config["mapping"] = mapping
            config["target_count"] = len(contacts)

        if (
            config.get("scheduled_at") is not None
            and not config.get("target_count")
            and (
                config.get("source_type") == "airtable"
                or mapping_changed
            )
        ):
            raise HTTPException(
                status_code=422,
                detail="Scheduled campaigns require at least one eligible recipient.",
            )

        config["last_updated"] = datetime.now().isoformat()
        if config.get("status") in {"Draft", "Scheduled", "Ready"}:
            if config.get("source_type") == "airtable":
                config["status"] = (
                    "Scheduled" if config.get("scheduled_at") else "Ready"
                )
            elif config.get("source_type") == "csv" and config.get("mapping"):
                config["status"] = (
                    "Scheduled" if config.get("scheduled_at") else "Ready"
                )

        if resolution is not None:
            storage.commit_audience_update(
                campaign_id,
                config,
                resolution.contacts,
                owner_id=owner_id,
            )
        else:
            storage.save_campaign(campaign_id, config, serialize_unknown=True)

        remote_fields = {
            "campaign_name",
            "subject",
            "html_body",
            "sender_config",
            "scheduled_at",
            "status",
            "region",
            "is_bounced",
            "segment",
            "audiences",
            "target_count",
        }
        if mapping_changed:
            remote_fields.update({"mapping", "csv_filename"})
        remote_payload = {
            key: value
            for key, value in config.items()
            if key in remote_fields
            and (
                config.get("source_type") == "airtable"
                or key not in {"region", "is_bounced", "segment", "audiences", "target_count"}
                or (mapping_changed and key == "target_count")
            )
        }
        try:
            get_email_sender_service().update_campaign(
                campaign_id,
                remote_payload,
            )
        except Exception as error:
            logger.error(
                "Campaign publication failed for %s; restoring local snapshot",
                campaign_id,
                exc_info=True,
            )
            storage.restore_campaign_snapshot(
                campaign_id,
                snapshot,
                owner_id=owner_id,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Campaign publication failed. Please retry.",
            ) from error

        return config
    except CampaignMutationLockedError as error:
        raise HTTPException(
            status_code=409,
            detail="Campaign is currently active or being updated.",
        ) from error
    except HTTPException:
        raise
    except Exception:
        logger.exception("Campaign update failed for %s", campaign_id)
        raise HTTPException(
            status_code=500,
            detail="Unable to update campaign. Try again.",
        )
    finally:
        if owner_id is not None:
            storage.release_launch_lock(campaign_id, owner_id)
@router.post("/sender/campaigns/{campaign_id:path}/launch")
def launch_campaign(
    campaign_id: CampaignId,
    background_tasks: BackgroundTasks,
    current_user: str = Depends(get_current_user)):
    """
    Lanza la tarea de envío para una campaña.
    """
    storage = _get_campaign_storage()
    rollback_config: Dict[str, Any] = {}
    launch_id = prepare_campaign_launch(
        campaign_id, rollback_config=rollback_config
    )
    try:
        background_tasks.add_task(run_campaign_task, campaign_id, launch_id)
    except Exception:
        try:
            storage.save_campaign(
                campaign_id, rollback_config, serialize_unknown=True
            )
        finally:
            storage.release_launch_lock(campaign_id, launch_id)
        raise
    return {
        "message": f"Campaign '{campaign_id}' has been queued for launch.",
        "status": "Launching",
    }



# --- Añade esta NUEVA función/endpoint al final del archivo ---
_ALLOWED_CSV_MIME_TYPES = {
    None,
    "",
    "text/csv",
    "application/vnd.ms-excel",
}


def _validate_csv_upload(
    filename: str | None,
    content_type: str | None,
    content: bytes,
) -> None:
    if (
        not filename
        or not filename.lower().endswith(".csv")
        or content_type not in _ALLOWED_CSV_MIME_TYPES
        or not content
        or b"\x00" in content
    ):
        raise HTTPException(status_code=422, detail="Upload a valid CSV file.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    try:
        first_row = next(csv.reader(io.StringIO(text)), None)
    except csv.Error as error:
        raise HTTPException(
            status_code=422,
            detail="Upload a valid CSV file.",
        ) from error
    if first_row is None or len(first_row) < 2:
        raise HTTPException(status_code=422, detail="Upload a valid CSV file.")


@router.post("/sender/campaigns/{campaign_id:path}/upload-csv", response_model=Dict[str, Any])
async def upload_campaign_csv(
    campaign_id: CampaignId,
    csv_file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    """Upload the initial CSV under the shared campaign mutation lock."""
    del current_user
    content = await csv_file.read()
    _validate_csv_upload(csv_file.filename, csv_file.content_type, content)

    storage = _get_campaign_storage()
    owner_id: str | None = None
    snapshot = None
    try:
        if not storage.campaign_exists(campaign_id):
            raise HTTPException(
                status_code=404,
                detail="Campaign configuration not found.",
            )
        owner_id = storage.acquire_launch_lock(campaign_id)
        if owner_id is None:
            raise HTTPException(
                status_code=409,
                detail="Campaign is currently active or being updated.",
            )
        snapshot = storage.snapshot_campaign_state(campaign_id)
        config = storage.load_campaign(campaign_id)
        if config.get("source_type") != "csv":
            raise HTTPException(
                status_code=400,
                detail="Campaign is not configured for CSV source.",
            )
        if config.get("mapping") or config.get("status") != "Draft":
            raise HTTPException(
                status_code=409,
                detail="CSV replacement is not allowed after mapping is saved.",
            )

        target_path = storage.save_uploaded_csv(campaign_id, content)
        config["csv_filename"] = csv_file.filename
        config["status"] = "Draft"
        config["last_updated"] = datetime.now().isoformat()
        try:
            storage.save_campaign(campaign_id, config, serialize_unknown=True)
        except Exception:
            storage.restore_campaign_snapshot(
                campaign_id,
                snapshot,
                owner_id=owner_id,
            )
            raise

        return {
            "message": (
                f"CSV file '{csv_file.filename}' uploaded successfully "
                f"for campaign {campaign_id}."
            ),
            "target_path": str(target_path),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("CSV upload failed for %s", campaign_id)
        raise HTTPException(
            status_code=500,
            detail="Unable to save the CSV file. Try again.",
        )
    finally:
        if owner_id is not None:
            storage.release_launch_lock(campaign_id, owner_id)
def _test_delivery_response(
    success_message: str,
    results: list[dict[str, str]],
):
    sent_count = sum(result["status"] == "Sent" for result in results)
    failed_count = len(results) - sent_count
    if sent_count == 0:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={
                "message": "No test emails were delivered",
                "results": results,
            },
        )
    if failed_count:
        return JSONResponse(
            status_code=status.HTTP_207_MULTI_STATUS,
            content={
                "message": "Some test emails failed",
                "results": results,
            },
        )
    return {"message": success_message, "results": results}


class TestEmailRequest(BaseModel):
    emails: List[str]
    subject: Optional[str] = None
    html_body: Optional[str] = None
    sender_config: Optional[Union[str, List[str]]] = None


# --- Añade esta NUEVA función/endpoint ---
@router.post("/sender/campaigns/{campaign_id:path}/send-test", response_model=Dict[str, Any])
def send_test_email(
    campaign_id: CampaignId,
    req: TestEmailRequest,
    current_user: str = Depends(get_current_user),
):
    """Send campaign test messages and report partial/full failure accurately."""
    del current_user
    storage = _get_campaign_storage()
    if not storage.campaign_exists(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        config = storage.load_campaign(campaign_id)
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to read campaign configuration.",
        ) from error

    subject = req.subject if req.subject is not None else config.get(
        "subject",
        "(No Subject)",
    )
    html_body = req.html_body if req.html_body is not None else config.get(
        "html_body",
        "<p>Error: Email body missing.</p>",
    )
    sender_config = (
        req.sender_config
        if req.sender_config is not None
        else config.get("sender_config", "all")
    )
    gmail_services = []
    if credentials_manager_instance:
        try:
            gmail_services = credentials_manager_instance.get_gmail_services(
                sender_config
            )
        except Exception:
            logger.exception("Unable to load test senders for %s", campaign_id)
    if not gmail_services:
        raise HTTPException(
            status_code=500,
            detail="No valid sender accounts found for this campaign configuration.",
        )

    results = deliver_test_emails(
        emails=req.emails,
        subject=subject,
        html_body=html_body,
        gmail_services=gmail_services,
        mode="campaign",
        campaign_id=campaign_id,
        sleep_between=time.sleep,
    )
    return _test_delivery_response("Test emails processed", results)
# --- Nuevo Modelo para Test Ad-hoc ---
class AdhocTestRequest(BaseModel):
    emails: List[str]
    subject: str
    html_body: str
    sender_config: Optional[Union[str, List[str]]] = 'all'


@router.post("/sender/send-test-adhoc", response_model=Dict[str, Any])
def send_test_email_adhoc(
    req: AdhocTestRequest,
    current_user: str = Depends(get_current_user),
):
    """Send ad-hoc test messages and report partial/full failure accurately."""
    del current_user
    gmail_services = []
    if credentials_manager_instance:
        try:
            gmail_services = credentials_manager_instance.get_gmail_services(
                req.sender_config
            )
        except Exception:
            logger.exception("Unable to load ad-hoc test senders")
    if not gmail_services:
        raise HTTPException(
            status_code=500,
            detail="No valid sender accounts found for this configuration.",
        )

    results = deliver_test_emails(
        emails=req.emails,
        subject=req.subject,
        html_body=req.html_body,
        gmail_services=gmail_services,
        mode="adhoc",
        sleep_between=time.sleep,
    )
    return _test_delivery_response("Ad-hoc test emails processed", results)
@router.get("/sender/campaigns/{campaign_id:path}/csv-preview", response_model=Dict[str, Any])
async def get_csv_preview(
    campaign_id: CampaignId,
    current_user: str = Depends(get_current_user),
):
    """Return a stable preview without exposing parser or filesystem details."""
    del current_user
    storage = _get_campaign_storage()
    target_path = storage.target_path(campaign_id)
    if not storage.campaign_exists(campaign_id) or not target_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Campaign or its CSV file not found.",
        )
    try:
        config = storage.load_campaign(campaign_id)
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to read campaign configuration.",
        ) from error
    if config.get("source_type") != "csv":
        raise HTTPException(
            status_code=400,
            detail="Campaign is not of type 'csv'.",
        )

    try:
        first_row, second_row, delimiter = read_csv_preview_rows(target_path)
    except (OSError, UnicodeError, csv.Error) as error:
        logger.info("CSV preview parsing failed for %s", campaign_id)
        raise HTTPException(
            status_code=422,
            detail="Unable to read CSV preview.",
        ) from error
    if first_row is None:
        raise HTTPException(status_code=400, detail="CSV file is empty.")

    has_header = False
    if second_row:
        has_header = all(
            not item.replace(".", "", 1).replace(",", "", 1).isdigit()
            for item in first_row
            if item
        )
    if has_header:
        columns = first_row
        preview_row = second_row or []
    else:
        columns = [f"Columna {index + 1}" for index in range(len(first_row))]
        preview_row = first_row
    preview_row = (preview_row + [""] * len(columns))[: len(columns)]
    return {
        "columns": columns,
        "has_header": has_header,
        "preview_row": preview_row,
        "delimiter_detected": delimiter,
    }
# --- Añade esta NUEVA función/endpoint AL FINAL del archivo ---
@router.post("/sender/campaigns/{campaign_id:path}/save-mapping", response_model=Dict[str, Any])
async def save_csv_mapping(
    campaign_id: CampaignId,
    mapping_data: CSVMappingPayload,
    current_user: str = Depends(get_current_user),
):
    """Validate and publish a new CSV campaign under one shared lock."""
    del current_user
    storage = _get_campaign_storage()
    owner_id: str | None = None
    snapshot = None
    try:
        if not storage.campaign_exists(campaign_id):
            raise HTTPException(
                status_code=404,
                detail="Campaign or its CSV file not found.",
            )
        owner_id = storage.acquire_launch_lock(campaign_id)
        if owner_id is None:
            raise HTTPException(
                status_code=409,
                detail="Campaign is currently active or being updated.",
            )
        snapshot = storage.snapshot_campaign_state(campaign_id)
        target_path = storage.target_path(campaign_id)
        if not target_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Campaign or its CSV file not found.",
            )

        config = storage.load_campaign(campaign_id)
        if config.get("source_type") != "csv":
            raise HTTPException(
                status_code=400,
                detail="Campaign is not of type 'csv'.",
            )
        if config.get("status") != "Draft" or config.get("mapping"):
            raise HTTPException(
                status_code=409,
                detail="Existing CSV campaigns must be updated with one PUT.",
            )

        mapping = mapping_data.model_dump(by_alias=True)
        try:
            contacts = read_mapped_contacts(
                target_path,
                mapping,
                campaign_id,
            )
        except (OSError, UnicodeError, ValueError, KeyError) as error:
            raise HTTPException(
                status_code=422,
                detail="Invalid CSV mapping or recipient data.",
            ) from error
        if config.get("scheduled_at") is not None and not contacts:
            raise HTTPException(
                status_code=422,
                detail="Scheduled campaigns require at least one eligible recipient.",
            )

        config["mapping"] = mapping
        config["target_count"] = len(contacts)
        config["status"] = (
            "Scheduled" if config.get("scheduled_at") else "Ready"
        )
        config["last_updated"] = datetime.now().isoformat()
        storage.save_campaign(campaign_id, config, serialize_unknown=True)

        try:
            get_email_sender_service().update_campaign(
                campaign_id,
                {
                    "mapping": mapping,
                    "target_count": len(contacts),
                    "status": config["status"],
                },
            )
        except Exception as error:
            logger.error(
                "CSV mapping publication failed for %s; restoring local snapshot",
                campaign_id,
                exc_info=True,
            )
            storage.restore_campaign_snapshot(
                campaign_id,
                snapshot,
                owner_id=owner_id,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Campaign publication failed. Please retry.",
            ) from error

        return config
    except HTTPException:
        raise
    except Exception:
        logger.exception("CSV mapping failed for %s", campaign_id)
        raise HTTPException(
            status_code=500,
            detail="Unable to save CSV mapping. Try again.",
        )
    finally:
        if owner_id is not None:
            storage.release_launch_lock(campaign_id, owner_id)
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



@router.delete("/sender/campaigns/{campaign_id:path}",
               status_code=status.HTTP_204_NO_CONTENT, # Devuelve 204 si éxito
               tags=["email"], # Mantener tag
               summary="Delete a specific campaign") # Descripción para Swagger/OpenAPI
def delete_campaign(
    campaign_id: CampaignId,
    current_user: str = Depends(get_current_user),
):
    """Delete canonical local campaign artifacts with legacy partial tolerance."""
    del current_user
    try:
        _get_campaign_storage().delete_campaign_files(campaign_id)
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign '{campaign_id}' not found.",
        ) from error
    return None
@router.post("/sender/campaigns/{campaign_id:path}/pause",
             response_model=Dict[str, Any],
             tags=["email"],
             summary="Pause a running campaign")
def pause_campaign(
    campaign_id: CampaignId,
    current_user: str = Depends(get_current_user)
):
    """
    Sets the campaign status to 'Paused'.
    The background task should check this status and temporarily stop sending.
    """
    storage = _get_campaign_storage()
    if not storage.campaign_exists(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    current_status = storage.load_campaign(campaign_id).get("status", "Unknown")
    if current_status not in {"Launching", "Sending"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Campaign cannot be paused from status '{current_status}'",
        )
    # Aquí podríamos añadir lógica para verificar que la campaña esté realmente 'Sending'
    print(f"[{campaign_id}] Solicitud de pausa recibida.")
    updated_config = _update_campaign_status(campaign_id, "Paused")
    return updated_config

@router.post("/sender/campaigns/{campaign_id:path}/resume",
             response_model=Dict[str, Any],
             tags=["email"],
             summary="Resume a paused campaign")
def resume_campaign(
    campaign_id: CampaignId,
    background_tasks: BackgroundTasks,
    current_user: str = Depends(get_current_user)
):
    """
    Sets the campaign status back to 'Sending' if it was 'Paused'.
    The background task should detect this change and resume sending.
    """
    # Aquí verificamos que venga de 'Paused' para evitar reanudar campañas completadas o en error.
    storage = _get_campaign_storage()
    current_status = 'Unknown'
    if storage.campaign_exists(campaign_id):
        try:
            config = storage.load_campaign(campaign_id)
            current_status = config.get('status', 'Unknown')
        except Exception:
            pass # Si no se puede leer, la función _update_campaign_status lanzará error

    if current_status != 'Paused':
         raise HTTPException(status_code=400, detail=f"Campaign cannot be resumed from status '{current_status}'. Must be 'Paused'.")

    print(f"[{campaign_id}] Solicitud de reanudación recibida.")
    # Vuelve al estado 'Sending' para que la tarea continúe
    launch_id = None
    can_restart_worker = config.get("source_type") in {"airtable", "csv"}
    if not storage.is_launch_locked(campaign_id) and can_restart_worker:
        launch_id = storage.acquire_launch_lock(campaign_id)
        if launch_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Campaign resume is already in progress",
            )

    try:
        updated_config = _update_campaign_status(campaign_id, "Sending")
        if launch_id is not None:
            background_tasks.add_task(run_campaign_task, campaign_id, launch_id)
    except Exception:
        if launch_id is not None:
            try:
                config = storage.load_campaign(campaign_id)
                config["status"] = "Paused"
                config["last_updated"] = datetime.now().isoformat()
                storage.save_campaign(
                    campaign_id, config, serialize_unknown=True
                )
            finally:
                storage.release_launch_lock(campaign_id, launch_id)
        raise
    return updated_config

@router.post("/sender/campaigns/{campaign_id:path}/cancel",
             status_code=status.HTTP_204_NO_CONTENT,
             tags=["email"],
             summary="Cancel and delete a campaign")
async def cancel_campaign( # Usamos async def por si delete_campaign se vuelve async
    campaign_id: CampaignId,
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