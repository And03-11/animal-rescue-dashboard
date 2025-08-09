# --- Archivo: backend/app/api/v1/endpoints/campaigns.py (Corregido) ---

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backend.app.core.security import get_current_user
from backend.app.services.airtable_service import AirtableService, get_airtable_service
from fastapi_cache.decorator import cache


router = APIRouter()

# --- Modelos de respuesta (sin cambios) ---
class DonationDetail(BaseModel):
    id: str
    donorName: str
    donorEmail: str
    amount: float
    date: str

# --- Endpoints existentes (sin cambios) ---

@router.get("/sources", response_model=List[str])
#15 minutos de caché es ideal.
@cache(expire=900)
def get_campaign_sources(
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    """
    Endpoint to get a list of unique campaign sources.
    """
    return airtable_service.get_unique_campaign_sources()

@router.get("", response_model=List[Dict[str, Any]])
#10 mins de caché.
@cache(expire=600)
def get_campaigns_by_source(
    source: str,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    """
    Endpoint to get campaigns filtered by a specific source.
    """
    return airtable_service.get_campaigns(source=source)


@router.get("/source/{source_name}/stats")
@cache(expire=120)
def get_source_stats(
    source_name: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    """
    Obtiene estadísticas agregadas para una 'source' completa, con filtro de fecha.
    """
    return airtable_service.get_source_stats(source_name, start_date, end_date)


@router.get("/{campaign_id}/stats", response_model=Dict[str, Any])
def get_campaign_stats(
    campaign_id: str,
    # ✅ PASO 1: AÑADE EL NUEVO PARÁMETRO AQUÍ
    # Usamos Query(None) para indicar que es un parámetro de consulta opcional
    # que puede venir varias veces (y FastAPI lo agrupará en una lista).
    form_title_id: Optional[List[str]] = Query(None),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    """
    Obtiene estadísticas detalladas para una campaña específica,
    opcionalmente filtradas por títulos de formulario y fechas.
    """
    try:
        # ✅ PASO 2: PASA EL NUEVO PARÁMETRO A LA FUNCIÓN DEL SERVICIO
        return airtable_service.get_campaign_stats(
            campaign_id, 
            start_date, 
            end_date, 
            form_title_id
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado: {e}")

# --- Endpoint para detalles de donaciones (CORREGIDO) ---

@router.get(
    "/form-titles/{form_title_id}/donations",
    response_model=List[DonationDetail]
)
def get_donations_for_form_title(
    form_title_id: str,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    """
    Devuelve la lista de donaciones (con nombre y email de donante)
    para un Form Title dado.
    """
    try:
        # ✅ CORRECCIÓN: Se pasa el 'form_title_id' como una lista de un solo elemento.
        # Esto soluciona la discrepancia entre el tipo que recibe el endpoint (str)
        # y el que espera la función del servicio (List[str]).
        return airtable_service.get_donations_for_form_title([form_title_id])
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener las donaciones: {e}")