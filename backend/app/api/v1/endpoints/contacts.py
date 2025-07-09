# backend/app/api/v1/endpoints/contacts.py
# VERSIÓN REFACTORIZADA CON INYECCIÓN DE DEPENDENCIAS Y MANEJO DE ERRORES ROBUSTO

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List
from datetime import datetime
import traceback

# Importamos las clases de los servicios
from app.services.airtable_service import AirtableService
from app.services.mailchimp_service import MailchimpService
from app.services.brevo_service import BrevoService

router = APIRouter()

# --- Sistema de Inyección de Dependencias ---
# Estas funciones permiten a FastAPI gestionar las instancias de los servicios.
# Es la mejor práctica para la mantenibilidad y las pruebas.
def get_airtable_service():
    return AirtableService()

def get_mailchimp_service():
    return MailchimpService()

def get_brevo_service():
    return BrevoService()


@router.get("/search/{email}", response_model=Dict[str, Any], tags=["Contacts"])
def search_unified_contact(
    email: str,
    airtable: AirtableService = Depends(get_airtable_service),
    mailchimp: MailchimpService = Depends(get_mailchimp_service),
    brevo: BrevoService = Depends(get_brevo_service)
) -> Dict[str, Any]:
    """
    Busca un contacto por email en Airtable, Mailchimp y Brevo para construir un perfil unificado.
    """
    all_donor_emails: List[str] = [email]
    donor_info: Dict[str, Any] = {}
    airtable_donations: List[Dict] = []
    
    # --- 1. Búsqueda en Airtable (con depuración) ---
    print("\n--- INICIANDO DEPURACIÓN EN EL ENDPOINT ---")
    try:
        airtable_result = airtable.get_airtable_data_by_email(email)
        
        # --- LÍNEAS DE DEPURACIÓN CRÍTICAS ---
        # Imprimimos la respuesta completa del servicio para inspeccionarla.
        import json
        print(">>> Respuesta COMPLETA recibida de AirtableService:")
        print(json.dumps(airtable_result, indent=2))
        print("------------------------------------------")
        # --- FIN DE LAS LÍNEAS DE DEPURACIÓN ---

        donor_info = airtable_result.get("donor_info", {})
        airtable_donations = airtable_result.get("donations", [])

        if donor_info:
            email_ids = donor_info.get('fields', {}).get('Emails', [])
            if email_ids:
                all_donor_emails = airtable.get_emails_from_ids(email_ids)
    except Exception as e:
        print(f"Error crítico al consultar Airtable: {e}")
        donor_info = {"error": f"Fallo la conexión con Airtable: {e}"}

    # --- El resto de la función sigue igual ---
    mailchimp_details = []
    try:
        for donor_email in all_donor_emails:
            tags = mailchimp.get_contact_tags(donor_email)
            mailchimp_details.append({"email": donor_email, "found": tags is not None, "tags": tags or []})
    except Exception as e:
        print(f"Error consultando Mailchimp: {e}")
        mailchimp_details = [{"error": f"Fallo la conexión con Mailchimp: {e}"}]

    brevo_details = []
    try:
        for donor_email in all_donor_emails:
            details = brevo.get_contact_details(donor_email)
            brevo_details.append({"email": donor_email, "found": details is not None, "details": details})
    except Exception as e:
        print(f"Error consultando Brevo: {e}")
        brevo_details = [{"error": f"Fallo la conexión con Brevo: {e}"}]

    found_in_airtable = donor_info and not donor_info.get("error")
    found_in_mailchimp = any(d.get('found', False) for d in mailchimp_details)
    found_in_brevo = any(d.get('found', False) for d in brevo_details)

    if not any([found_in_airtable, found_in_mailchimp, found_in_brevo]):
        raise HTTPException(status_code=404, detail=f"El contacto '{email}' no fue encontrado en ninguna plataforma.")

    donation_dates = []
    for d in airtable_donations:
        date_str = d.get('fields', {}).get('Date')
        if date_str:
            try:
                donation_dates.append(datetime.fromisoformat(date_str.replace('Z', '+00:00')))
            except ValueError:
                print(f"Formato de fecha inválido en donación {d.get('id')}: {date_str}")

    first_donation_date = min(donation_dates).isoformat() if donation_dates else None
    
    donation_summary = {
        "total_donated": sum(d.get('fields', {}).get('Amount', 0) for d in airtable_donations),
        "donation_count": len(airtable_donations),
        "first_donation_date": first_donation_date,
    }
    
    brevo_campaign = "None"
    first_found_brevo_profile = next((item.get('details') for item in brevo_details if item.get('found')), None)
    if first_found_brevo_profile and isinstance(first_found_brevo_profile.get("listNames"), list):
        list_names = first_found_brevo_profile["listNames"]
        if "Big Campaigns - Europe" in list_names: brevo_campaign = "Europe"
        elif "Big Campaigns - USA" in list_names: brevo_campaign = "USA"

    return {
        "email_searched": email,
        "contact_details": donor_info,
        "airtable_summary": donation_summary,
        "mailchimp_summary": {"email_count": len(all_donor_emails), "details": mailchimp_details},
        "brevo_summary": {"email_count": len(all_donor_emails), "details": brevo_details, "campaign": brevo_campaign}
    }