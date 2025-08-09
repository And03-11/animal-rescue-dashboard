# --- Archivo: backend/app/api/v1/endpoints/contacts.py (Versión Corregida y Final) ---
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from backend.app.schemas import ContactCreate, Contact
from backend.app.services.airtable_service import AirtableService, get_airtable_service, DONORS_FIELDS
from fastapi import Depends
from backend.app.core.security import get_current_user
from fastapi_cache.decorator import cache

router = APIRouter()

# --- Endpoint POST (Sin cambios) ---
@router.post("", response_model=Contact, status_code=status.HTTP_201_CREATED)
def create_contact(
    contact: ContactCreate,
    airtable: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
    ):
    """
    Crea un nuevo contacto en Airtable (tabla Donors).
    """
    try:
        record = airtable.create_record(
            table_name="Contacts",
            data=contact.model_dump()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    return Contact(
        id=record.get("id"),
        **contact.model_dump()
    )

# --- Endpoint GET (Sin cambios) ---
@router.get("", response_model=List[Contact])
@cache(expire=120)
def list_contacts(
    # ✅ 2. Inyecta el servicio como dependencia
    airtable: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    """
    Obtiene la lista de contactos (donors) desde Airtable y su email.
    """
    try:
        records = airtable.donors_table.all()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    contacts: List[Contact] = []
    for rec in records:
        fields = rec.get("fields", {})
        first = fields.get(DONORS_FIELDS["name"], "")
        last = fields.get(DONORS_FIELDS["last_name"], "")
        name = f"{first} {last}".strip()
        email = fields.get("Email")
        if not email:
            email_ids = fields.get(DONORS_FIELDS["emails_link"], []) or []
            emails = airtable.get_emails_from_ids(email_ids)
            email = emails[0] if emails else None
        contacts.append(Contact(
            id=rec.get("id"),
            name=name,
            email=email,
            phone=None
        ))
    return contacts

# ✅ CORRECCIÓN COMPLETA: Este es el nuevo y correcto endpoint para autocompletado.
@router.get("/autocomplete", response_model=List[str])
def autocomplete_contact_email(
    q: str = "", 
    # ✅ 2. Usa el 'getter' correcto para la inyección de dependencias
    airtable: AirtableService = Depends(get_airtable_service),
    # ✅ 3. (IMPORTANTE) Se añade la protección de autenticación que faltaba
    current_user: str = Depends(get_current_user)
):
    """
    Provee sugerencias de email para autocompletar, consultando Airtable.
    """
    return airtable.autocomplete_email(q)