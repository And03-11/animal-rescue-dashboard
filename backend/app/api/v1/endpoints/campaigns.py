# backend/app/api/v1/endpoints/campaigns.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

from app.services.airtable_service import AirtableService

router = APIRouter()

# ── Modelos de respuesta ──────────────────────────────────────────────────────

class DonationDetail(BaseModel):
    id: str
    donorName: str
    donorEmail: str
    amount: float
    date: str

# ── Endpoints existentes ──────────────────────────────────────────────────────

@router.get("/sources", response_model=List[str])
def get_campaign_sources(
    airtable_service: AirtableService = Depends(AirtableService)
):
    """
    Endpoint to get a list of unique campaign sources.
    """
    return airtable_service.get_unique_campaign_sources()

@router.get("/", response_model=List[Dict[str, Any]])
def get_campaigns_by_source(
    source: str,
    airtable_service: AirtableService = Depends(AirtableService)
):
    """
    Endpoint to get campaigns filtered by a specific source.
    """
    return airtable_service.get_campaigns(source=source)

@router.get("/{campaign_id}/stats", response_model=Dict[str, Any])
def get_campaign_stats(
    campaign_id: str,
    airtable_service: AirtableService = Depends(AirtableService)
):
    """
    Obtiene estadísticas detalladas para una campaña específica,
    incluyendo el total de donaciones y un desglose por título de formulario.
    """
    try:
        return airtable_service.get_campaign_stats(campaign_id)
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado: {e}")

# ── Nuevo endpoint para detalles de donaciones ────────────────────────────────

@router.get(
    "/form-titles/{form_title_id}/donations",
    response_model=List[DonationDetail]
)
def get_donations_for_form_title(
    form_title_id: str,
    airtable_service: AirtableService = Depends(AirtableService)
):
    """
    Devuelve la lista de donaciones (con nombre y email de donante)
    para un Form Title dado.
    """
    try:
        return airtable_service.get_donations_for_form_title(form_title_id)
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener las donaciones: {e}")
