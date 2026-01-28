# --- File: backend/app/api/v1/endpoints/scheduler.py ---
import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel

from backend.app.db.database import get_db
from backend.app.db.models import ScheduledCampaign, CampaignEmail, ScheduledSend
from backend.app.core.security import get_current_user

# --- Helper Functions for Colors ---
def get_category_color(category: Optional[str]) -> str:
    colors = {
        "Big Campaigns": "#6366f1",
        "NBC": "#f43f5e",
        "Unsubscribers": "#eab308",
        "Tagless": "#22c55e",
        "Influencers in Progress": "#8b5cf6",
        "Fundraising": "#ec4899",
        "Other": "#6b7280"
    }
    return colors.get(category, "#6b7280")

def get_service_color(service: str) -> str:
    colors = {
        "Automation": "#3b82f6",
        "Brevo": "#0ea5e9",
        "Mailchimp": "#f59e0b",
        "SalesHandy": "#10b981",
        "smartlead": "#8b5cf6",
        "GetResponse": "#ef4444",
        "Other": "#6b7280"
    }
    return colors.get(service, "#6b7280")

def get_service_text_color(service: str) -> str:
    return "#ffffff"

# --- Nivel 1: Campaña (Padre) ---
class ScheduledCampaignBase(BaseModel):
    title: str
    start_date: datetime
    end_date: datetime
    category: Optional[str] = None
    notes: Optional[str] = None
    segmentation_mode: Optional[str] = None

class ScheduledCampaignCreate(ScheduledCampaignBase):
    pass

class ScheduledCampaignUpdate(BaseModel):
    title: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    segmentation_mode: Optional[str] = None

class ScheduledCampaignResponse(ScheduledCampaignBase):
    id: int
    class Config: 
        orm_mode = True

# --- Nivel 2: Email (Contenido) ---
class CampaignEmailBase(BaseModel):
    title: str
    subject: Optional[str] = None
    button_name: Optional[str] = None
    link_donation: Optional[str] = None
    link_contact_us: Optional[str] = None
    custom_links: Optional[str] = None

class CampaignEmailCreate(CampaignEmailBase):
    campaign_id: int

class CampaignEmailUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    button_name: Optional[str] = None
    link_donation: Optional[str] = None
    link_contact_us: Optional[str] = None
    custom_links: Optional[str] = None

class CampaignEmailResponse(CampaignEmailBase):
    id: int
    campaign_id: int
    class Config: 
        orm_mode = True

# --- Nivel 3: Envío (Horario/Segmento) ---
class ScheduledSendBase(BaseModel):
    send_at: datetime
    service: str = "Other"
    custom_service: Optional[str] = None
    status: str = "pending"
    segment_tag: Optional[str] = None
    is_dnr: Optional[bool] = False
    dnr_date: Optional[datetime] = None

class ScheduledSendCreate(ScheduledSendBase):
    campaign_email_id: int

class ScheduledSendUpdate(BaseModel):
    send_at: Optional[datetime] = None
    service: Optional[str] = None
    custom_service: Optional[str] = None
    status: Optional[str] = None
    segment_tag: Optional[str] = None
    is_dnr: Optional[bool] = None
    dnr_date: Optional[datetime] = None

class ScheduledSendResponse(ScheduledSendBase):
    id: int
    campaign_email_id: int
    class Config: 
        orm_mode = True

# --- Evento del Calendario (Genérico) ---
class CalendarEvent(BaseModel):
    id: str
    title: str
    start: datetime
    end: Optional[datetime] = None
    backgroundColor: str
    borderColor: str
    textColor: str = "#ffffff"
    opacity: Optional[float] = None
    allDay: Optional[bool] = None 
    extendedProps: Dict[str, Any]

# --- Router ---
router = APIRouter(
    prefix="/scheduler",
    tags=["scheduler"],
    dependencies=[Depends(get_current_user)]
)

# --- Endpoints del Calendario (GET /events) ---
@router.get("/events", response_model=List[CalendarEvent])
def get_scheduled_events(
    start: datetime = Query(...), end: datetime = Query(...),
    db: Session = Depends(get_db)
):
    events: List[CalendarEvent] = []
    try:
        # 1. Obtener CAMPAÑAS (Nivel 1)
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
                allDay=True, 
                extendedProps={
                    "type": "campaign", "campaign_id": camp.id, "notes": camp.notes,
                    "category": camp.category, "title": camp.title,
                    "segmentation_mode": camp.segmentation_mode
                }
            ))
            
        # 2. Obtener ENVÍOS (Nivel 3)
        sends = db.query(ScheduledSend).options(
            joinedload(ScheduledSend.email).joinedload(CampaignEmail.campaign)
        ).filter(
            ScheduledSend.send_at >= start,
            ScheduledSend.send_at <= end
        ).all()
        for send in sends:
            service_color = get_service_color(send.service)
            text_color = get_service_text_color(send.service)
            parent_email_title = "Email (??)"
            parent_campaign_category = None
            parent_campaign_title = "Campaña (??)"
            parent_segmentation_mode = "bc"
            if send.email:
                parent_email_title = send.email.title
                if send.email.campaign:
                    parent_campaign_category = send.email.campaign.category
                    parent_campaign_title = send.email.campaign.title
                    parent_segmentation_mode = send.email.campaign.segmentation_mode
            campaign_border_color = get_category_color(parent_campaign_category)
            event_title = f"✉️ {parent_email_title}"
            if send.segment_tag:
                event_title += f" ({send.segment_tag})"
            events.append(CalendarEvent(
                id=f"send_{send.id}",
                title=event_title,
                start=send.send_at,
                end=None,
                backgroundColor=service_color,
                borderColor=campaign_border_color,
                textColor=text_color,
                opacity=0.6 if send.status == "sent" else 1.0,
                extendedProps={
                    "type": "send", "send_id": send.id,
                    "campaign_email_id": send.campaign_email_id,
                    "campaign_id": send.email.campaign_id if send.email else None,
                    "service": send.service, 
                    "custom_service": send.custom_service,
                    "status": send.status,
                    "segment_tag": send.segment_tag, "parent_title": parent_campaign_title,
                    "parent_category": parent_campaign_category,
                    "parent_segmentation_mode": parent_segmentation_mode,
                    "is_dnr": send.is_dnr, "dnr_date": send.dnr_date
                }
            ))
        return events
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error fetching events: {e}")

# --- CRUD de Campaña (Nivel 1) ---
@router.post("/events", response_model=ScheduledCampaignResponse, status_code=status.HTTP_201_CREATED)
def create_scheduled_campaign(campaign: ScheduledCampaignCreate, db: Session = Depends(get_db)):
    db_campaign = ScheduledCampaign(**campaign.model_dump())
    try:
        db.add(db_campaign)
        db.commit()
        db.refresh(db_campaign)
        return db_campaign
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear evento: {e}")

@router.put("/events/{event_id_str}", response_model=ScheduledCampaignResponse)
def update_scheduled_campaign(event_id_str: str, campaign_update: ScheduledCampaignUpdate, db: Session = Depends(get_db)):
    if not event_id_str.startswith("campaign_"):
        raise HTTPException(status_code=400, detail="Solo se permite mover/actualizar Campañas.")
    try:
        event_id = int(event_id_str.split("_")[1])
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    db_campaign = db.query(ScheduledCampaign).filter(ScheduledCampaign.id == event_id).first()
    if not db_campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")
    update_data = campaign_update.model_dump(exclude_unset=True) 
    for key, value in update_data.items():
        setattr(db_campaign, key, value)
    try:
        db.commit()
        db.refresh(db_campaign)
        return db_campaign
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar evento: {e}")

@router.delete("/events/{event_id_str}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scheduled_campaign(event_id_str: str, db: Session = Depends(get_db)):
    if not event_id_str.startswith("campaign_"):
        raise HTTPException(status_code=400, detail="Solo se permite eliminar Campañas.")
    try:
        event_id = int(event_id_str.split("_")[1])
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    db_campaign = db.query(ScheduledCampaign).filter(ScheduledCampaign.id == event_id).first()
    if not db_campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")
    try:
        db.delete(db_campaign)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar evento: {e}")

# --- CRUD para CampaignEmail (Nivel 2) ---
@router.get("/campaigns/{campaign_id}/emails", response_model=List[CampaignEmailResponse])
def get_campaign_emails(campaign_id: int, db: Session = Depends(get_db)):
    emails = db.query(CampaignEmail).filter(CampaignEmail.campaign_id == campaign_id).all()
    return emails

@router.post("/emails", response_model=CampaignEmailResponse, status_code=status.HTTP_201_CREATED)
def create_campaign_email(email: CampaignEmailCreate, db: Session = Depends(get_db)):
    db_campaign = db.query(ScheduledCampaign).filter(ScheduledCampaign.id == email.campaign_id).first()
    if not db_campaign:
        raise HTTPException(status_code=404, detail="Campaña padre no encontrada")
    db_email = CampaignEmail(**email.model_dump())
    try:
        db.add(db_email)
        db.commit()
        db.refresh(db_email)
        return db_email
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear email: {e}")

@router.put("/emails/{email_id}", response_model=CampaignEmailResponse)
def update_campaign_email(email_id: int, email_update: CampaignEmailUpdate, db: Session = Depends(get_db)):
    db_email = db.query(CampaignEmail).filter(CampaignEmail.id == email_id).first()
    if not db_email:
        raise HTTPException(status_code=404, detail="Email no encontrado")
    update_data = email_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_email, key, value)
    try:
        db.commit()
        db.refresh(db_email)
        return db_email
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar email: {e}")

@router.delete("/emails/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign_email(email_id: int, db: Session = Depends(get_db)):
    db_email = db.query(CampaignEmail).filter(CampaignEmail.id == email_id).first()
    if not db_email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email no encontrado")
    try:
        db.delete(db_email)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar email: {e}")

# --- CRUD para ScheduledSend (Nivel 3) ---
@router.get("/emails/{email_id}/sends", response_model=List[ScheduledSendResponse])
def get_email_sends(email_id: int, db: Session = Depends(get_db)):
    sends = db.query(ScheduledSend).filter(ScheduledSend.campaign_email_id == email_id).order_by(ScheduledSend.send_at.asc()).all()
    return sends

@router.post("/sends", response_model=ScheduledSendResponse, status_code=status.HTTP_201_CREATED)
def create_scheduled_send(send: ScheduledSendCreate, db: Session = Depends(get_db)):
    db_email = db.query(CampaignEmail).filter(CampaignEmail.id == send.campaign_email_id).first()
    if not db_email:
        raise HTTPException(status_code=404, detail="Email padre no encontrado")
    db_send = ScheduledSend(**send.model_dump())
    try:
        db.add(db_send)
        db.commit()
        db.refresh(db_send)
        return db_send
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear envío: {e}")

@router.put("/sends/{send_id}", response_model=ScheduledSendResponse)
def update_scheduled_send(send_id: int, send_update: ScheduledSendUpdate, db: Session = Depends(get_db)):
    db_send = db.query(ScheduledSend).filter(ScheduledSend.id == send_id).first()
    if not db_send:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    update_data = send_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_send, key, value)
    try:
        db.commit()
        db.refresh(db_send)
        return db_send
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar envío: {e}")

@router.delete("/sends/{send_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scheduled_send(send_id: int, db: Session = Depends(get_db)):
    db_send = db.query(ScheduledSend).filter(ScheduledSend.id == send_id).first()
    if not db_send:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    try:
        db.delete(db_send)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar envío: {e}")