# --- Archivo: backend/app/api/v1/endpoints/email_sender.py ---
import os
import time
import random
import json
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any

from app.services.airtable_service import AirtableService
from app.services.gmail_service import GmailService

from fastapi import Depends
from app.core.security import get_current_user

router = APIRouter()

CAMPAIGN_DATA_DIR = "campaign_data"
SENT_LOGS_DIR = "sent_logs"
TARGETS_DIR = "campaign_targets"
CREDENTIALS_BASE_DIR = "gmail_credentials"

os.makedirs(CAMPAIGN_DATA_DIR, exist_ok=True)
os.makedirs(SENT_LOGS_DIR, exist_ok=True)
os.makedirs(TARGETS_DIR, exist_ok=True)

class CampaignRequest(BaseModel):
    region: str
    is_bounced: bool
    subject: str
    html_body: str


def run_campaign_task(campaign_id: str):
    """
    Tarea en segundo plano: envía emails de una campaña.
    """
    # Se instancia localmente el servicio
    airtable_service = AirtableService()
    
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    try:
        with open(campaign_file_path, 'r') as f:
            config = json.load(f)
    except FileNotFoundError:
        print(f"Error: No se encontró config para {campaign_id}")
        return

    # ... resto de la lógica sin cambios, usando airtable_service localmente ...
    
    # Ejemplo de obtención de contactos desde Airtable:
    target_contacts_list = airtable_service.get_campaign_contacts(
        region=config.get('region'),
        is_bounced=config.get('is_bounced')
    )
    # El resto sigue igual...

@router.post("/sender/campaigns", status_code=201, response_model=Dict[str, Any])
def create_campaign(
    req: CampaignRequest,
    current_user: str = Depends(get_current_user)
    ):
    """
    Crea una campaña: obtiene contactos y genera archivo CSV.
    """
    # Instancio aquí para no ejecutarlo en import
    airtable_service = AirtableService()

    campaign_id = f"Campaign_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"
    target_contacts_list = airtable_service.get_campaign_contacts(
        region=req.region,
        is_bounced=req.is_bounced
    )
    total_contacts = len(target_contacts_list)
    target_list_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv")
    pd.DataFrame(target_contacts_list, columns=['Email']).to_csv(target_list_path, index=False)

    campaign_config = req.model_dump()
    campaign_config.update({
        'id': campaign_id,
        'status': 'Draft',
        'createdAt': datetime.now().isoformat(),
        'target_count': total_contacts
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
