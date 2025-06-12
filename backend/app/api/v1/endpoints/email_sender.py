# backend/app/api/v1/endpoints/email_sender.py
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

router = APIRouter()
airtable_service = AirtableService()

CAMPAIGN_DATA_DIR = "campaign_data"
SENT_LOGS_DIR = "sent_logs"
TARGETS_DIR = "campaign_targets"
CREDENTIALS_BASE_DIR = "gmail_credentials"

os.makedirs(CAMPAIGN_DATA_DIR, exist_ok=True)
os.makedirs(SENT_LOGS_DIR, exist_ok=True)
os.makedirs(TARGETS_DIR, exist_ok=True)

class CampaignRequest(BaseModel):
    region: str; is_bounced: bool; subject: str; html_body: str

def run_campaign_task(campaign_id: str):
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    try:
        with open(campaign_file_path, 'r') as f: config = json.load(f)
    except FileNotFoundError:
        print(f"Error: No se encontró config para {campaign_id}"); return

    config['status'] = 'Sending'
    with open(campaign_file_path, 'w') as f: json.dump(config, f, indent=4)
    
    target_list_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv")
    if not os.path.exists(target_list_path):
        print(f"Error: No se encontró el archivo de audiencia para {campaign_id}")
        config['status'] = 'Failed'; config['error_message'] = 'Target audience file not found.'
        with open(campaign_file_path, 'w') as f: json.dump(config, f, indent=4)
        return
        
    target_df = pd.read_csv(target_list_path)
    all_contacts = target_df['Email'].tolist()
    
    credentials_dir = os.path.join(CREDENTIALS_BASE_DIR, "BigPond" if config.get('is_bounced') else "Normal")
    credential_files = [os.path.join(credentials_dir, f) for f in os.listdir(credentials_dir) if f.endswith('.json')]
    if not credential_files:
        config['status'] = 'Failed'; config['error_message'] = 'No credential files found.'
        with open(campaign_file_path, 'w') as f: json.dump(config, f, indent=4)
        return

    sent_log_path = os.path.join(SENT_LOGS_DIR, f"sent_{campaign_id}.csv")
    sent_emails = set()
    if os.path.exists(sent_log_path):
        try:
            sent_df = pd.read_csv(sent_log_path)
            sent_emails = set(sent_df['Email'].str.lower())
        except pd.errors.EmptyDataError: sent_emails = set()
    
    contacts_to_send = [email for email in all_contacts if email.lower() not in sent_emails]
    if not contacts_to_send:
        print("No hay nuevos contactos para enviar en esta campaña."); config['status'] = 'Completed'
        with open(campaign_file_path, 'w') as f: json.dump(config, f, indent=4)
        return
        
    num_accounts = len(credential_files)
    contacts_split = [contacts_to_send[i::num_accounts] for i in range(num_accounts)]
    for i, account_creds_path in enumerate(credential_files):
        contacts_for_this_account = contacts_split[i]
        if not contacts_for_this_account: continue
        account_name = os.path.basename(account_creds_path)
        print(f"\n--- Procesando con la cuenta: {account_name} ---")
        try:
            gmail_service = GmailService(credentials_path=account_creds_path)
            for email in contacts_for_this_account:
                print(f"Enviando a: {email}...")
                success = gmail_service.send_email(to_email=email, subject=config['subject'], html_body=config['html_body'])
                if success:
                    newly_sent_df = pd.DataFrame([{'Email': email, 'CampaignID': campaign_id, 'Timestamp': datetime.now().isoformat()}])
                    header = not os.path.exists(sent_log_path)
                    newly_sent_df.to_csv(sent_log_path, mode='a', header=header, index=False)
                time.sleep(random.uniform(0.5, 1.0))
            if i < num_accounts - 1:
                delay = random.uniform(10, 25); print(f"--- Pausa de {delay:.1f} segundos ---"); time.sleep(delay)
        except Exception as e:
            print(f"ERROR CRÍTICO con la cuenta {account_name}: {e}."); continue
            
    config['status'] = 'Completed'
    with open(campaign_file_path, 'w') as f: json.dump(config, f, indent=4)
    print(f"--- CAMPAÑA {campaign_id} FINALIZADA ---")

@router.post("/sender/campaigns", status_code=201, response_model=Dict[str, Any])
def create_campaign(req: CampaignRequest):
    campaign_id = f"Campaign_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"
    target_contacts_list = airtable_service.get_campaign_contacts(region=req.region, is_bounced=req.is_bounced)
    total_contacts = len(target_contacts_list)
    target_list_path = os.path.join(TARGETS_DIR, f"target_{campaign_id}.csv")
    pd.DataFrame(target_contacts_list, columns=['Email']).to_csv(target_list_path, index=False)
    
    campaign_config = req.dict()
    campaign_config.update({'id': campaign_id, 'status': 'Draft', 'createdAt': datetime.now().isoformat(), 'target_count': total_contacts})
    file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    with open(file_path, 'w') as f:
        json.dump(campaign_config, f, indent=4) # <-- LÍNEA CORREGIDA
    return campaign_config

@router.get("/sender/campaigns", response_model=List[Dict[str, Any]])
def list_campaigns():
    campaigns = []
    for filename in sorted(os.listdir(CAMPAIGN_DATA_DIR), reverse=True):
        if not filename.endswith('.json'): continue
        file_path = os.path.join(CAMPAIGN_DATA_DIR, filename)
        try:
            with open(file_path, 'r') as f: campaign_data = json.load(f)
            total_contacts = campaign_data.get('target_count', 0)
            campaign_id = campaign_data.get('id')
            sent_log_path = os.path.join(SENT_LOGS_DIR, f"sent_{campaign_id}.csv")
            sent_count = 0
            if os.path.exists(sent_log_path):
                try: sent_count = len(pd.read_csv(sent_log_path))
                except pd.errors.EmptyDataError: sent_count = 0
            percentage = (sent_count / total_contacts * 100) if total_contacts > 0 else 0
            campaign_data['progress'] = {"sent": sent_count, "total": total_contacts, "percentage": round(percentage, 2)}
            campaigns.append(campaign_data)
        except Exception as e:
            print(f"ERROR al procesar archivo de campaña: '{filename}', Detalle: {e}"); continue
    return campaigns

@router.get("/sender/campaigns/{campaign_id}/details")
def get_campaign_details(campaign_id: str):
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    if not os.path.exists(campaign_file_path): raise HTTPException(status_code=404, detail="Campaign not found")
    with open(campaign_file_path, 'r') as f: campaign_details = json.load(f)
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
            if 'Email' in sent_df.columns: sent_emails = set(sent_df['Email'].str.lower())
        except pd.errors.EmptyDataError: sent_emails = set()
    contact_list_with_status = [{"email": email, "status": "Sent" if email.lower() in sent_emails else "Pending"} for email in target_contacts]
    return {"details": campaign_details, "contacts": contact_list_with_status}

@router.post("/sender/campaigns/{campaign_id}/launch")
def launch_campaign(campaign_id: str, background_tasks: BackgroundTasks):
    campaign_file_path = os.path.join(CAMPAIGN_DATA_DIR, f"{campaign_id}.json")
    if not os.path.exists(campaign_file_path): raise HTTPException(status_code=404, detail="Campaign not found")
    background_tasks.add_task(run_campaign_task, campaign_id)
    return {"message": f"Campaign '{campaign_id}' has been launched."}