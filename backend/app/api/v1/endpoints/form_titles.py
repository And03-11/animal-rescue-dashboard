# --- Archivo: backend/app/api/v1/endpoints/form_titles.py (Contenido completo y corregido) ---
from fastapi import APIRouter, Depends, Query
from fastapi_cache.decorator import cache
from backend.app.services.airtable_service import AirtableService, get_airtable_service
from typing import List, Dict, Optional
from backend.app.core.security import get_current_user

router = APIRouter()

@router.get("", response_model=List[Dict])
# Un caché de 10 minutos es seguro y muy eficiente.
@cache(expire=600)
def get_form_titles(
    campaign_id: Optional[str] = None,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
) -> List[Dict]:
    """
    Endpoint to get a list of form titles.
    If campaign_id is provided, it filters form titles by that campaign.
    """
    return airtable_service.get_form_titles(campaign_id=campaign_id)

@router.get("/donations")
def get_donations_by_form_title(
    # ✅ CAMBIO: Aceptamos una lista de IDs con `Query`
    form_title_id: List[str] = Query(..., alias="form_title_id"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
) -> Dict:
    """
    Endpoint to get donations filtered by a list of form titles and an optional date range.
    """
    # ✅ CAMBIO: Pasamos la lista directamente al servicio.
    donations = airtable_service.get_donations_for_form_title(
        form_title_ids=form_title_id,
        start_date=start_date,
        end_date=end_date
    )
    
    total_amount = sum(d.get("amount", 0) for d in donations)
    
    return {
        "donations": donations,
        "totalAmount": round(total_amount, 2),
        "donationsCount": len(donations)
    }