# --- Archivo: backend/app/api/v1/endpoints/search.py ---
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from datetime import datetime
from app.core.security import get_current_user

from app.schemas import (
    SearchResponse, MailchimpDetail, BrevoDetail, AirtableSummary
)
from app.services.airtable_service import AirtableService
from app.services.mailchimp_service import MailchimpService
from app.services.brevo_service import BrevoService

router = APIRouter()

# Inyección de dependencias

def get_airtable_service():
    return AirtableService()

def get_mailchimp_service():
    return MailchimpService()

def get_brevo_service():
    return BrevoService()

@router.get("/search/{email}", response_model=SearchResponse, tags=["search"])
def search_unified_contact(
    email: str,
    airtable: AirtableService = Depends(get_airtable_service),
    mailchimp: MailchimpService = Depends(get_mailchimp_service),
    brevo: BrevoService = Depends(get_brevo_service),
    current_user: str = Depends(get_current_user)
) -> SearchResponse:
    """
    Busca un contacto por email en Airtable, Mailchimp y Brevo para construir un perfil unificado.
    """
    all_emails: List[str] = [email]
    donor_info: Dict[str, Any] = {}
    airtable_records: List[Dict[str, Any]] = []

    # --- 1. Búsqueda en Airtable ---
    try:
        result = airtable.get_airtable_data_by_email(email)
        donor_info = result.get("donor_info") or {}
        airtable_records = result.get("donations") or []

        linked_ids = donor_info.get('fields', {}).get('Emails', []) or []
        if linked_ids:
            all_emails = airtable.get_emails_from_ids(linked_ids)
    except Exception as e:
        donor_info = {"error": f"Error Airtable: {e}"}

    # --- 2. Búsqueda en Mailchimp ---
    mailchimp_details: List[Dict[str, Any]] = []
    try:
        for em in all_emails:
            tags = mailchimp.get_contact_tags(em)
            mailchimp_details.append({
                "email": em,
                "found": bool(tags),            # considered found only if tags list non-empty
                "tags": tags or []
            })
    except Exception as e:
        mailchimp_details = [{"error": f"Error Mailchimp: {e}"}]

    # --- 3. Búsqueda en Brevo ---
    brevo_details: List[Dict[str, Any]] = []
    try:
        for em in all_emails:
            details = brevo.get_contact_details(em)
            brevo_details.append({
                "email": em,
                "found": details is not None,
                "details": details or {}
            })
    except Exception as e:
        brevo_details = [{"error": f"Error Brevo: {e}"}]

    # Validar si al menos uno encontró contacto
    found_any = bool(donor_info and not donor_info.get("error")) \
                or any(d.get('found', False) for d in mailchimp_details) \
                or any(d.get('found', False) for d in brevo_details)
    if not found_any:
        raise HTTPException(
            status_code=404,
            detail=f"Contacto '{email}' no encontrado en ninguna plataforma."
        )

    # --- Resumen de donaciones de Airtable ---
    donation_dates: List[datetime] = []
    for d in airtable_records:
        ds = d.get('fields', {}).get('Date')
        if ds:
            try:
                donation_dates.append(datetime.fromisoformat(ds.replace('Z', '+00:00')))
            except ValueError:
                pass
    first_date = min(donation_dates).isoformat() if donation_dates else None
    summary = AirtableSummary(
        total=sum(d.get('fields', {}).get('Amount', 0) for d in airtable_records),
        count=len(airtable_records),
        first_date=first_date
    )

    return SearchResponse(
        email_searched=email,
        contact=donor_info,
        airtable_summary=summary,
        mailchimp=[MailchimpDetail(**d) for d in mailchimp_details],
        brevo=[BrevoDetail(**d) for d in brevo_details]
    )
