# --- Archivo: backend/app/api/v1/endpoints/contacts.py ---
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from app.schemas import ContactCreate, Contact
from app.services.airtable_service import AirtableService, DONORS_FIELDS
from fastapi import Depends
from app.core.security import get_current_user

router = APIRouter()

@router.post("", response_model=Contact, status_code=status.HTTP_201_CREATED)
def create_contact(
    contact: ContactCreate,
    current_user: str = Depends(get_current_user)
    ):
    """
    Crea un nuevo contacto en Airtable (tabla Donors).
    """
    airtable = AirtableService()
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

@router.get("", response_model=List[Contact])
def list_contacts(current_user: str = Depends(get_current_user)):
    """
    Obtiene la lista de contactos (donors) desde Airtable y su email.
    """
    airtable = AirtableService()
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
        # Construir nombre completo
        first = fields.get(DONORS_FIELDS["name"], "")
        last = fields.get(DONORS_FIELDS["last_name"], "")
        name = f"{first} {last}".strip()
        # Intentar obtener email directo del campo 'Email'
        email = fields.get("Email")
        if not email:
            # Si no hay email directo, usar emails_link
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
