# backend/app/api/v1/endpoints/form_titles.py
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi_cache.decorator import cache
from backend.app.services.airtable_service import AirtableService, get_airtable_service
from typing import List, Dict, Optional, Any
from backend.app.core.security import get_current_user
from pydantic import BaseModel, Field

# 🔧 FIX: sin prefix aquí; el prefix ya lo aporta main.py: "/api/v1/form-titles"
router = APIRouter(tags=["form-titles"])

class DonationDetail(BaseModel):
    id: str
    donorName: str
    donorEmail: str
    amount: float
    date: str

class FormTitlesDonationsRequest(BaseModel):
    form_title_ids: List[str] = Field(..., min_items=1)
    start_date: Optional[str] = None  # YYYY-MM-DD
    end_date: Optional[str] = None    # YYYY-MM-DD
    # PAGINACIÓN: Añadir parámetros opcionales al request POST
    page_size: Optional[int] = 50
    offset: Optional[int] = 0

class PaginatedDonationsResponse(BaseModel):
    donations: List[DonationDetail]
    total_count: int
    # totalAmount y donationsCount ya no son necesarios aquí, total_count es el clave.

class CustomReportData(BaseModel):
    donations: List[DonationDetail]
    totalAmount: float
    donationsCount: int

@router.post("/donations", response_model=PaginatedDonationsResponse) # Usar el nuevo response_model
def get_donations_for_form_titles_post(
    payload: FormTitlesDonationsRequest, # El payload ahora incluye page_size y offset
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Agregador paginado por múltiples form_title_ids."""
    try:
        # PAGINACIÓN: Pasar page_size y offset al servicio
        result = airtable_service.get_donations_for_form_title(
            form_title_ids=list(dict.fromkeys(payload.form_title_ids)),
            start_date=payload.start_date,
            end_date=payload.end_date,
            page_size=payload.page_size,
            offset=payload.offset
        )
        # PAGINACIÓN: Devolver directamente el resultado del servicio
        # (ya contiene 'donations' y 'total_count')
        return result
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        # Devolver estructura de error si falla
        raise HTTPException(status_code=500, detail=f"Error al obtener donaciones (POST paginado): {e}")

@router.get("", response_model=List[Dict])
@cache(expire=600)  # 10 min
def get_form_titles(
    campaign_id: Optional[str] = None,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
) -> List[Dict]:
    """
    Lista de form titles. Si 'campaign_id' viene, filtra por campaña.
    """
    return airtable_service.get_form_titles(campaign_id=campaign_id)

@router.get("/donations", response_model=PaginatedDonationsResponse) # Usar el nuevo response_model
def get_donations_by_form_title(
    form_title_id: List[str] = Query(..., alias="form_title_id"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    # PAGINACIÓN: Añadir parámetros de query page_size y offset
    page_size: Optional[int] = Query(50, ge=1, le=100), # Valor por defecto 50, mínimo 1, máximo 100
    offset: Optional[int] = Query(0, ge=0),            # Valor por defecto 0, mínimo 0
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
) -> Dict[str, Any]: # El tipo de retorno sigue siendo Dict para flexibilidad interna
    """Donaciones paginadas filtradas por lista de form titles y opcionalmente por fecha."""
    try:
        # PAGINACIÓN: Pasar page_size y offset al servicio
        result = airtable_service.get_donations_for_form_title(
            form_title_ids=form_title_id,
            start_date=start_date,
            end_date=end_date,
            page_size=page_size,
            offset=offset
        )
        # PAGINACIÓN: Devolver directamente el resultado del servicio
        return result
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener donaciones (GET paginado): {e}")
