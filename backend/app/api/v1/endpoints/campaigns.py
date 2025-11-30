# backend/app/api/v1/endpoints/campaigns.py
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
from backend.app.core.security import get_current_user
from backend.app.services.data_service import DataService, get_data_service
from fastapi_cache.decorator import cache


class DonationDetail(BaseModel):
    id: str
    donorName: str
    donorEmail: str
    amount: float
    date: Union[datetime, str]

class PaginatedDonationsResponse(BaseModel):
    donations: List[DonationDetail]
    total_count: int

router = APIRouter()

@router.get("/sources", response_model=List[str])
@cache(expire=900)  # why: lista de fuentes cambia poco
def get_campaign_sources(
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    return data_service.get_unique_campaign_sources()

@router.get("", response_model=List[Dict[str, Any]])
@cache(expire=600)  # why: campañas cambian poco en corto plazo
def get_campaigns_by_source(
    source: str,
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    return data_service.get_campaigns_by_source(source=source)

@router.get("/source/{source_name}/stats")
@cache(expire=120)
def get_source_stats(
    source_name: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    return data_service.get_source_stats(source_name, start_date, end_date)

@router.get("/{campaign_id}/stats", response_model=Dict[str, Any])
def get_campaign_stats(
    campaign_id: str,
    form_title_id: Optional[List[str]] = Query(None),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    """why: permitir filtrar por subconjunto de form titles sin romper firma de servicio."""
    try:
        return data_service.get_campaign_stats(
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
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    """why: endpoint auxiliar para un solo form title."""
    try:
        # Ahora DataService tiene este método
        result = data_service.get_donations_for_form_title([form_title_id])
        # El servicio devuelve un dict con "donations" y "total_count", pero este endpoint espera una lista
        # Ajustamos para devolver la lista de donaciones
        return result.get("donations", [])
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener las donaciones: {e}")

@router.get("/{campaign_id}/donations", response_model=PaginatedDonationsResponse)
@cache(expire=60)
def get_campaign_donations_endpoint(
    campaign_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page_size: Optional[int] = Query(50, ge=1, le=100),
    offset: Optional[int] = Query(0, ge=0),
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user),
) -> PaginatedDonationsResponse:
    """
    Devuelve donaciones paginadas para una campaña, opcionalmente filtradas por fecha.
    """
    try:
        donations_result = data_service.get_campaign_donations(
            campaign_id=campaign_id,
            start_date=start_date,
            end_date=end_date,
            page_size=page_size,
            offset=offset
        )
        return donations_result
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener donaciones de campaña (paginado): {e}")

@router.get("/source/{source_name}/donations", response_model=PaginatedDonationsResponse)
@cache(expire=60)
def get_source_donations_endpoint(
    source_name: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page_size: Optional[int] = Query(50, ge=1, le=100),
    offset: Optional[int] = Query(0, ge=0),
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user),
) -> PaginatedDonationsResponse:
    """
    Devuelve donaciones paginadas para todas las campañas de un source, opcionalmente filtradas por fecha.
    """
    try:
        donations_result = data_service.get_source_donations(
            source_name=source_name,
            start_date=start_date,
            end_date=end_date,
            page_size=page_size,
            offset=offset
        )
        return donations_result
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener donaciones de source (paginado): {e}")