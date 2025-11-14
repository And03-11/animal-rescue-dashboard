# --- File: backend/app/api/v1/endpoints/scheduler.py ---
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

# Importaciones de la base de datos y modelos
from backend.app.db.database import get_db
from backend.app.db.models import ScheduledCampaign, User # Importamos User para la dependencia de admin
from backend.app.core.security import get_current_user # Para proteger los endpoints

# Importamos Pydantic para los esquemas de datos (validación)
from pydantic import BaseModel

# --- Esquemas de Pydantic ---
# Estos esquemas validan los datos que entran y salen de la API.

class ScheduledCampaignBase(BaseModel):
    """Esquema base, compartido por creación y lectura."""
    title: str
    start_date: datetime
    end_date: datetime
    category: Optional[str] = None
    source_service: Optional[str] = "Other"
    notes: Optional[str] = None
    # internal_campaign_json_id: Optional[str] = None # Para Fase 2

class ScheduledCampaignCreate(ScheduledCampaignBase):
    """Esquema para crear un nuevo evento."""
    pass # No necesita campos adicionales por ahora

class ScheduledCampaignUpdate(BaseModel):
    """Esquema para actualizar. Todos los campos son opcionales."""
    title: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    category: Optional[str] = None
    source_service: Optional[str] = None
    notes: Optional[str] = None

class ScheduledCampaignResponse(ScheduledCampaignBase):
    """Esquema para devolver un evento al frontend (incluye el ID)."""
    id: int

    class Config:
        orm_mode = True # Permite a Pydantic leer desde el modelo de SQLAlchemy

# --- Router ---
router = APIRouter(
    prefix="/scheduler", # Prefijo para todos los endpoints en este archivo
    tags=["scheduler"],  # Agrupa en la documentación de la API
    dependencies=[Depends(get_current_user)] # ¡Protege todos los endpoints!
)

# --- Endpoints CRUD ---

@router.post("/events", response_model=ScheduledCampaignResponse, status_code=status.HTTP_201_CREATED)
def create_scheduled_event(
    campaign: ScheduledCampaignCreate,
    db: Session = Depends(get_db)
):
    """
    Crea un nuevo evento de campaña en el calendario.
    """
    db_campaign = ScheduledCampaign(**campaign.model_dump())
    
    try:
        db.add(db_campaign)
        db.commit()
        db.refresh(db_campaign)
        return db_campaign
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear evento: {e}")

@router.get("/events", response_model=List[ScheduledCampaignResponse])
def get_scheduled_events(
    start: datetime = Query(..., description="Fecha de inicio del rango (ISO 8601)"),
    end: datetime = Query(..., description="Fecha de fin del rango (ISO 8601)"),
    db: Session = Depends(get_db)
):
    """
    Obtiene todos los eventos del calendario que caen dentro de un rango de fechas.
    FullCalendar envía automáticamente los parámetros 'start' y 'end'.
    
    Filtramos eventos que:
    - Terminan DESPUÉS de que el rango inicia Y
    - Comienzan ANTES de que el rango termine
    """
    try:
        events = db.query(ScheduledCampaign).filter(
            ScheduledCampaign.end_date >= start,
            ScheduledCampaign.start_date <= end
        ).all()
        return events
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener eventos: {e}")

@router.put("/events/{event_id}", response_model=ScheduledCampaignResponse)
def update_scheduled_event(
    event_id: int,
    campaign_update: ScheduledCampaignUpdate,
    db: Session = Depends(get_db)
):
    """
    Actualiza un evento (para drag-and-drop, resize o editar detalles).
    """
    db_campaign = db.query(ScheduledCampaign).filter(ScheduledCampaign.id == event_id).first()
    
    if not db_campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado")

    # Obtenemos los datos del update, excluyendo los que no se enviaron (None)
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

@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scheduled_event(
    event_id: int,
    db: Session = Depends(get_db)
):
    """
    Elimina un evento del calendario.
    """
    db_campaign = db.query(ScheduledCampaign).filter(ScheduledCampaign.id == event_id).first()
    
    if not db_campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado")
        
    try:
        db.delete(db_campaign)
        db.commit()
        return None # Respuesta 204 No Content
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar evento: {e}")