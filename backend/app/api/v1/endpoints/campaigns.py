# backend/app/api/v1/endpoints/campaigns.py
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backend.app.core.security import get_current_user
from backend.app.services.airtable_service import AirtableService, get_airtable_service
from fastapi_cache.decorator import cache

router = APIRouter()

class DonationDetail(BaseModel):
    id: str
    donorName: str
    donorEmail: str
    amount: float
    date: str

@router.get("/sources", response_model=List[str])
@cache(expire=900)  # why: lista de fuentes cambia poco
def get_campaign_sources(
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    return airtable_service.get_unique_campaign_sources()

@router.get("", response_model=List[Dict[str, Any]])
@cache(expire=600)  # why: campañas cambian poco en corto plazo
def get_campaigns_by_source(
    source: str,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
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
    return airtable_service.get_source_stats(source_name, start_date, end_date)

@router.get("/{campaign_id}/stats", response_model=Dict[str, Any])
def get_campaign_stats(
    campaign_id: str,
    form_title_id: Optional[List[str]] = Query(None),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    """why: permitir filtrar por subconjunto de form titles sin romper firma de servicio."""
    try:
        return airtable_service.get_campaign_stats(
            campaign_id=campaign_id,
            start_date=start_date,
            end_date=end_date,
            form_title_ids=form_title_id,  # asegúrate de que el servicio acepte este kwarg
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado: {e}")

@router.get("/form-titles/{form_title_id}/donations", response_model=List[DonationDetail])
def get_donations_for_form_title(
    form_title_id: str,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    """why: endpoint auxiliar para un solo form title."""
    try:
        return airtable_service.get_donations_for_form_title([form_title_id])
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener las donaciones: {e}")

@router.get("/{campaign_id}/donations")
@cache(expire=60)  # why: consulta potencialmente costosa; refresco aceptable en 1min
def get_campaign_donations_endpoint(
    campaign_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Devuelve CustomReportData a nivel campaña.
    why: evita query strings gigantes cuando se seleccionan todos los títulos.
    """
    try:
        # Preferir método directo si existe
        donations = None
        if hasattr(airtable_service, "get_campaign_donations"):
            donations = airtable_service.get_campaign_donations(
                campaign_id=campaign_id,
                start_date=start_date,
                end_date=end_date,
            )
        else:
            # Fallback: derivar form_title_ids desde stats y reutilizar función existente
            stats = airtable_service.get_campaign_stats(
                campaign_id=campaign_id,
                start_date=start_date,
                end_date=end_date,
                form_title_ids=None,
            )
            titles = stats.get("stats_by_form_title", []) or []
            form_title_ids = [t.get("form_title_id") for t in titles if t.get("form_title_id")]
            if form_title_ids:
                donations = airtable_service.get_donations_for_form_title(
                    form_title_ids=form_title_ids,
                    start_date=start_date,
                    end_date=end_date,
                )
            else:
                donations = []

        total_amount = round(sum(float(d.get("amount", 0)) for d in donations), 2)
        return {
            "donations": donations,
            "totalAmount": total_amount,
            "donationsCount": len(donations),
        }
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener donaciones de campaña: {e}")
