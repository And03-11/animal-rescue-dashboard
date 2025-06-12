# backend/app/api/v1/endpoints/contacts.py
# VERSIÓN FINAL CON BÚSQUEDA INTELIGENTE PARA MAILCHIMP Y BREVO

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from datetime import datetime

from app.services.airtable_service import AirtableService
from app.services.mailchimp_service import MailchimpService
from app.services.brevo_service import BrevoService

router = APIRouter()
airtable_service = AirtableService()
mailchimp_service = MailchimpService()
brevo_service = BrevoService()

@router.get("/search/{email}", response_model=Dict[str, Any])
def search_contact_by_email(email: str) -> Dict[str, Any]:
    # 1. Obtener datos de Airtable
    airtable_data = airtable_service.get_airtable_data_by_email(email)
    donor_info = airtable_data["donor_info"]
    airtable_donations = airtable_data["donations"]

    # 2. Obtener la lista completa de emails del donante desde Airtable
    all_donor_emails = [email] # Por defecto, la lista solo contiene el email buscado
    if donor_info and 'Emails' in donor_info:
        # Si encontramos al donante, obtenemos la lista completa de sus emails
        all_donor_emails = airtable_service.get_emails_from_ids(donor_info.get('Emails', []))
    
    # 3. Búsqueda detallada en Mailchimp (para cada email)
    mailchimp_details = []
    for donor_email in all_donor_emails:
        tags = mailchimp_service.get_contact_tags(donor_email)
        mailchimp_details.append({"email": donor_email, "found": tags is not None, "tags": tags or []})

    # 4. Búsqueda detallada en Brevo (para cada email)
    brevo_details = []
    for donor_email in all_donor_emails:
        details = brevo_service.get_contact_details(donor_email)
        brevo_details.append({"email": donor_email, "found": details is not None, "details": details})

    # 5. Comprobar si existe en alguna plataforma
    found_in_mailchimp = any(detail['found'] for detail in mailchimp_details)
    found_in_brevo = any(detail['found'] for detail in brevo_details)
    if not donor_info and not found_in_mailchimp and not found_in_brevo:
        raise HTTPException(status_code=404, detail=f"Contact '{email}' not found.")

    # 6. Procesar datos de resumen
    first_donation_date = None
    if airtable_donations:
        donation_dates = [datetime.fromisoformat(d['fields']['Date'].replace('Z', '+00:00')) for d in airtable_donations if 'Date' in d['fields']]
        if donation_dates: first_donation_date = min(donation_dates).isoformat()
    
    donation_summary = {
        "total_donated": sum(d['fields'].get('Amount', 0) for d in airtable_donations),
        "donation_count": len(airtable_donations),
        "first_donation_date": first_donation_date,
    }
    
    # Comprobar la pertenencia a listas "Big Campaign" en el primer perfil de Brevo que encontremos
    brevo_campaign = "None"
    first_found_brevo_profile = next((item['details'] for item in brevo_details if item['found']), None)
    if first_found_brevo_profile and "listNames" in first_found_brevo_profile:
        if "Big Campaigns - Europe" in first_found_brevo_profile["listNames"]: brevo_campaign = "Europe"
        elif "Big Campaigns - USA" in first_found_brevo_profile["listNames"]: brevo_campaign = "USA"

    # 7. Construir la respuesta final
    return {
        "email_searched": email,
        "contact_details": donor_info,
        "airtable_summary": donation_summary,
        "mailchimp_summary": {"email_count": len(all_donor_emails), "details": mailchimp_details},
        "brevo_summary": {"email_count": len(all_donor_emails), "details": brevo_details, "campaign": brevo_campaign}
    }