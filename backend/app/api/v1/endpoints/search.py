from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from datetime import datetime
import asyncio

from backend.app.core.security import get_current_user
from backend.app.schemas import (
    SearchResponse, MailchimpDetail, BrevoDetail, AirtableSummary
)
from backend.app.services.data_service import DataService, get_data_service
from backend.app.services.mailchimp_service import MailchimpService, get_mailchimp_service
from backend.app.services.brevo_service import BrevoService, get_brevo_service

router = APIRouter()


@router.get("/search/{email}", response_model=SearchResponse, tags=["search"])
async def search_unified_contact(
    email: str,
    data_service: DataService = Depends(get_data_service),
    mailchimp: MailchimpService = Depends(get_mailchimp_service),
    brevo: BrevoService = Depends(get_brevo_service),
    current_user: str = Depends(get_current_user)
) -> SearchResponse:
    """
    Searches for a contact by email across Supabase/Airtable, Mailchimp, and Brevo
    to build a unified profile.
    """
    all_emails: List[str] = [email]
    donor_info: Dict[str, Any] = {}
    donations_list: List[Dict[str, Any]] = []

    # --- 1. Search in Supabase (with Airtable fallback) ---
    try:
        result = data_service.get_donor_by_email(email)
        
        normalized_donor = result.get("donor")
        donations_list = result.get("donations", [])
        
        if normalized_donor:
            donor_info = {
                "id": normalized_donor["id"],
                "fields": {
                    "Name": normalized_donor["name"].split(" ")[0],
                    "Last Name": " ".join(normalized_donor["name"].split(" ")[1:]),
                    "Email": normalized_donor["email"],
                    "Phone": normalized_donor["phone"],
                    "Emails": normalized_donor["emails"]
                }
            }
            
            if normalized_donor.get("emails"):
                all_emails = normalized_donor["emails"]
                
    except Exception as e:
        print(f"Error in search_unified_contact (DataService): {e}")
        donor_info = {"error": f"Data Error: {e}"}

    # --- 2 & 3. Search in Mailchimp and Brevo (in parallel) ---
    async def fetch_mailchimp():
        mailchimp_details = []
        try:
            loop = asyncio.get_event_loop()
            for em in all_emails:
                tags = await loop.run_in_executor(None, mailchimp.get_contact_tags, em)
                mailchimp_details.append({
                    "email": em,
                    "found": bool(tags),
                    "tags": tags or []
                })
        except Exception as e:
            mailchimp_details = [{"error": f"Mailchimp Error: {e}"}]
        return mailchimp_details

    async def fetch_brevo():
        brevo_details = []
        try:
            loop = asyncio.get_event_loop()
            for em in all_emails:
                details = await loop.run_in_executor(None, brevo.get_contact_details, em)
                brevo_details.append({
                    "email": em,
                    "found": details is not None,
                    "details": details or {}
                })
        except Exception as e:
            brevo_details = [{"error": f"Brevo Error: {e}"}]
        return brevo_details

    # Execute both searches in parallel
    mailchimp_details, brevo_details = await asyncio.gather(
        fetch_mailchimp(),
        fetch_brevo()
    )

    # --- Validate if at least one platform found the contact ---
    found_any = (bool(donor_info and not donor_info.get("error"))
                 or any(d.get('found', False) for d in mailchimp_details)
                 or any(d.get('found', False) for d in brevo_details))
    if not found_any:
        raise HTTPException(
            status_code=404,
            detail=f"Contacto '{email}' no encontrado en ninguna plataforma."
        )

    # --- Donations Summary ---
    donation_dates: List[datetime] = []
    total_amount = 0.0
    
    for d in donations_list:
        amt = d.get("amount", 0)
        total_amount += amt
        
        ds = d.get("date")
        if ds:
            try:
                donation_dates.append(datetime.fromisoformat(ds.replace('Z', '+00:00')))
            except ValueError:
                pass
                
    first_date = min(donation_dates).isoformat() if donation_dates else None
    
    summary = AirtableSummary(
        total=total_amount,
        count=len(donations_list),
        first_date=first_date
    )

    return SearchResponse(
        email_searched=email,
        contact=donor_info,
        airtable_summary=summary,
        mailchimp=[MailchimpDetail(**d) for d in mailchimp_details],
        brevo=[BrevoDetail(**d) for d in brevo_details]
    )