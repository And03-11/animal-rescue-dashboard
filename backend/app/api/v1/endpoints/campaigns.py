# backend/app/api/v1/endpoints/campaigns.py

from fastapi import APIRouter, Depends, HTTPException
from app.services.airtable_service import AirtableService
from typing import List, Dict, Any

router = APIRouter()

@router.get("/sources", response_model=List[str])
def get_campaign_sources(
    airtable_service: AirtableService = Depends(AirtableService)
):
    """
    Endpoint to get a list of unique campaign sources.
    """
    return airtable_service.get_unique_campaign_sources()

@router.get("/", response_model=List[Dict])
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
    Obtiene estadísticas detalladas para una campaña específica, incluyendo
    el total de donaciones y un desglose por título de formulario.
    """
    try:
        # 'airtable_service' ahora es inyectado correctamente por FastAPI
        stats = airtable_service.get_campaign_stats(campaign_id)
        return stats
    except HTTPException as http_exc:
        # Ahora HTTPException está definido y puede ser usado
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado: {str(e)}")