# --- File: backend/app/api/v1/endpoints/scheduler.py (Paso 2) ---
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime

# Importaciones de la base de datos y modelos
from backend.app.db.database import get_db
from backend.app.db.models import ScheduledCampaign, ScheduledEmail, User
from backend.app.core.security import get_current_user 

from pydantic import BaseModel

# --- ✅ INICIO: Lógica de Colores ---
# Mapeo de Categorías (Campañas) a colores
def get_category_color(category: Optional[str]) -> str:
    category = (category or "other").lower()
    if "big campaigns" in category:
        return "#FF8F00" # Naranja
    if "nbc" in category:
        return "#D32F2F" # Rojo
    if "unsubscribers" in category:
        return "#C2185B" # Rosa
    if "tagless" in category:
        return "#7B1FA2" # Morado
    if "fundraising" in category:
        return "#303F9F" # Indigo
    return "#5D4037" # Café (para "Other", "Influencers", etc.)

# Mapeo de Servicios (Correos) a colores
def get_service_color(service: Optional[str]) -> str:
    service = (service or "other").lower()
    if "mailchimp" in service:
        return "#fbb254" # Amarillo Mailchimp
    if "brevo" in service:
        return "#0b996e" # Verde Brevo
    if "automation" in service:
        return "#6c5ce7" # Violeta (Automation)
    if "internal" in service:
        return "#38AECC" # Azul (Internal)
    return "#757575" # Gris (Other)
# --- ✅ FIN: Lógica de Colores ---


# --- Esquemas de Pydantic (Campaña) ---

class ScheduledCampaignBase(BaseModel):
    """Esquema base, compartido por creación y lectura."""
    title: str
    start_date: datetime
    end_date: datetime
    category: Optional[str] = None
    # source_service: Ya no está aquí
    notes: Optional[str] = None

class ScheduledCampaignCreate(ScheduledCampaignBase):
    """Esquema para crear un nuevo evento."""
    pass

class ScheduledCampaignUpdate(BaseModel):
    """Esquema para actualizar. Todos los campos son opcionales."""
    title: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    category: Optional[str] = None
    # source_service: Ya no está aquí
    notes: Optional[str] = None

# --- ✅ NUEVOS ESQUEMAS PARA CORREOS (Necesarios para el Modal) ---
class ScheduledEmailBase(BaseModel):
    title: str
    send_at: datetime
    service: str = "Other"
    status: str = "pending"

class ScheduledEmailCreate(ScheduledEmailBase):
    campaign_id: int

class ScheduledEmailUpdate(BaseModel):
    title: Optional[str] = None
    send_at: Optional[datetime] = None
    service: Optional[str] = None
    status: Optional[str] = None # Para marcar como 'sent'

class ScheduledEmailResponse(ScheduledEmailBase):
    id: int
    campaign_id: int
    class Config:
        orm_mode = True

# --- ✅ NUEVO ESQUEMA DE RESPUESTA PARA EL CALENDARIO ---
class CalendarEvent(BaseModel):
    """
    Un único evento para FullCalendar.
    Puede ser una Campaña o un Correo.
    """
    id: str # ID único (ej. "campaign_1" o "email_5")
    title: str
    start: datetime
    end: Optional[datetime] = None # Los correos no tienen 'end', solo 'start'
    backgroundColor: str
    borderColor: str
    textColor: str = "#ffffff"
    opacity: Optional[float] = None
    extendedProps: Dict[str, Any]


# --- Router ---
router = APIRouter(
    prefix="/scheduler",
    tags=["scheduler"],
    dependencies=[Depends(get_current_user)]
)

# --- Endpoints CRUD de Campañas (Actualizados) ---

@router.post("/events", response_model=CalendarEvent, status_code=status.HTTP_201_CREATED)
def create_scheduled_event(
    campaign: ScheduledCampaignCreate,
    db: Session = Depends(get_db)
):
    """
    Crea un nuevo evento de CAMPAÑA.
    (Se activa cuando el usuario arrastra en el calendario)
    """
    # Se quita 'source_service' de la lógica
    db_campaign = ScheduledCampaign(**campaign.model_dump())
    
    try:
        db.add(db_campaign)
        db.commit()
        db.refresh(db_campaign)
        
        # Devuelve el evento en el formato que espera FullCalendar
        color = get_category_color(db_campaign.category)
        return CalendarEvent(
            id=f"campaign_{db_campaign.id}",
            title=db_campaign.title,
            start=db_campaign.start_date,
            end=db_campaign.end_date,
            backgroundColor=color,
            borderColor=color,
            extendedProps={
                "type": "campaign",
                "campaign_id": db_campaign.id,
                "notes": db_campaign.notes,
                "category": db_campaign.category
            }
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear evento: {e}")

# --- ✅ ENDPOINT GET /events ACTUALIZADO ---
@router.get("/events", response_model=List[CalendarEvent])
def get_scheduled_events(
    start: datetime = Query(..., description="Fecha de inicio del rango (ISO 8601)"),
    end: datetime = Query(..., description="Fecha de fin del rango (ISO 8601)"),
    db: Session = Depends(get_db)
):
    """
    Obtiene TODOS los eventos (Campañas y Correos) dentro de un rango.
    """
    events: List[CalendarEvent] = []
    
    try:
        # 1. Obtener las CAMPAÑAS
        campaigns = db.query(ScheduledCampaign).filter(
            ScheduledCampaign.end_date >= start,
            ScheduledCampaign.start_date <= end
        ).all()
        
        for camp in campaigns:
            color = get_category_color(camp.category)
            events.append(CalendarEvent(
                id=f"campaign_{camp.id}",
                title=f"CAMPAÑA: {camp.title}",
                start=camp.start_date,
                end=camp.end_date,
                backgroundColor=color,
                borderColor=color,
                extendedProps={
                    "type": "campaign",
                    "campaign_id": camp.id,
                    "notes": camp.notes,
                    "category": camp.category
                }
            ))
            
        # 2. Obtener los CORREOS INDIVIDUALES
        emails = db.query(ScheduledEmail).filter(
            ScheduledEmail.send_at >= start,
            ScheduledEmail.send_at <= end
        ).all()
        
        for email in emails:
            color = get_service_color(email.service)
            events.append(CalendarEvent(
                id=f"email_{email.id}",
                title=f"✉️ {email.title} ({email.service})",
                start=email.send_at, # Los correos solo tienen 'start'
                end=None, # No tienen duración
                backgroundColor=color,
                borderColor=color,
                opacity=0.6 if email.status == "sent" else 1.0, # Opacidad si ya se envió
                extendedProps={
                    "type": "email",
                    "email_id": email.id,
                    "campaign_id": email.campaign_id, # ID del padre
                    "service": email.service,
                    "status": email.status
                }
            ))
            
        return events
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener eventos: {e}")


@router.put("/events/{event_id_str}", response_model=CalendarEvent)
def update_scheduled_event(
    event_id_str: str,
    campaign_update: ScheduledCampaignUpdate, # Solo actualizamos campañas por ahora
    db: Session = Depends(get_db)
):
    """
    Actualiza un evento de CAMPAÑA (drag-and-drop, resize o editar detalles).
    NOTA: Por ahora, solo soporta mover campañas, no correos individuales.
    """
    
    # Identificamos si es una campaña
    if not event_id_str.startswith("campaign_"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se permite mover/actualizar eventos de Campaña, no correos individuales."
        )
        
    try:
        event_id = int(event_id_str.split("_")[1])
    except (IndexError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID de evento inválido")

    db_campaign = db.query(ScheduledCampaign).filter(ScheduledCampaign.id == event_id).first()
    
    if not db_campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento de Campaña no encontrado")

    # Se quita 'source_service'
    update_data = campaign_update.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_campaign, key, value)
        
    try:
        db.commit()
        db.refresh(db_campaign)
        
        # Devuelve el evento actualizado
        color = get_category_color(db_campaign.category)
        return CalendarEvent(
            id=f"campaign_{db_campaign.id}",
            title=db_campaign.title,
            start=db_campaign.start_date,
            end=db_campaign.end_date,
            backgroundColor=color,
            borderColor=color,
            extendedProps={
                "type": "campaign",
                "campaign_id": db_campaign.id,
                "notes": db_campaign.notes,
                "category": db_campaign.category
            }
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar evento: {e}")

@router.delete("/events/{event_id_str}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scheduled_event(
    event_id_str: str,
    db: Session = Depends(get_db)
):
    """
    Elimina un evento de CAMPAÑA (y sus correos asociados, gracias al 'cascade').
    """
    if not event_id_str.startswith("campaign_"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se permite eliminar Campañas completas desde el calendario."
        )
        
    try:
        event_id = int(event_id_str.split("_")[1])
    except (IndexError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID de evento inválido")
        
    db_campaign = db.query(ScheduledCampaign).filter(ScheduledCampaign.id == event_id).first()
    
    if not db_campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento de Campaña no encontrado")
        
    try:
        db.delete(db_campaign)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar evento: {e}")


# --- ✅ INICIO: ENDPOINTS CRUD PARA CORREOS (Sin cambios respecto al plan anterior) ---
# (Estos son los que usará el MODAL)

@router.get("/emails", response_model=List[ScheduledEmailResponse])
def get_emails_for_campaign(
    campaign_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """
    Obtiene la lista de correos asociados a un ID de campaña específico.
    """
    try:
        emails = db.query(ScheduledEmail).filter(
            ScheduledEmail.campaign_id == campaign_id
        ).order_by(ScheduledEmail.send_at.asc()).all()
        return emails
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener correos: {e}")

@router.post("/emails", response_model=ScheduledEmailResponse, status_code=status.HTTP_201_CREATED)
def create_scheduled_email(
    email: ScheduledEmailCreate,
    db: Session = Depends(get_db)
):
    """
    Crea un nuevo correo individual y lo asocia a una campaña existente.
    """
    db_campaign = db.query(ScheduledCampaign).filter(ScheduledCampaign.id == email.campaign_id).first()
    if not db_campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaña padre no encontrada")
        
    db_email = ScheduledEmail(**email.model_dump())
    try:
        db.add(db_email)
        db.commit()
        db.refresh(db_email)
        return db_email
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear correo: {e}")

@router.put("/emails/{email_id}", response_model=ScheduledEmailResponse)
def update_scheduled_email(
    email_id: int,
    email_update: ScheduledEmailUpdate,
    db: Session = Depends(get_db)
):
    """
    Actualiza un correo individual (ej. para cambiar su estado a 'sent').
    """
    db_email = db.query(ScheduledEmail).filter(ScheduledEmail.id == email_id).first()
    if not db_email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Correo no encontrado")

    update_data = email_update.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_email, key, value)
        
    try:
        db.commit()
        db.refresh(db_email)
        return db_email
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar correo: {e}")

@router.delete("/emails/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scheduled_email(
    email_id: int,
    db: Session = Depends(get_db)
):
    """
    Elimina un correo individual.
    """
    db_email = db.query(ScheduledEmail).filter(ScheduledEmail.id == email_id).first()
    if not db_email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Correo no encontrado")
        
    try:
        db.delete(db_email)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar correo: {e}")