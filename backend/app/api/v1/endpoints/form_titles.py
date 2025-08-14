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

class CustomReportData(BaseModel):
    donations: List[DonationDetail]
    totalAmount: float
    donationsCount: int

@router.post("/donations", response_model=CustomReportData)
def get_donations_for_form_titles_post(
    payload: FormTitlesDonationsRequest,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Agregador por múltiples form_title_ids para evitar URLs enormes."""
    try:
        donations = airtable_service.get_donations_for_form_title(
            form_title_ids=list(dict.fromkeys(payload.form_title_ids)),
            start_date=payload.start_date,
            end_date=payload.end_date,
        )
        total_amount = round(sum(float(d.get("amount", 0)) for d in donations), 2)
        return {
            "donations": donations,
            "totalAmount": total_amount,
            "donationsCount": len(donations),
        }
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener donaciones (POST): {e}")

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

@router.get("/donations")
def get_donations_by_form_title(
    form_title_id: List[str] = Query(..., alias="form_title_id"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
) -> Dict:
    """
    Donaciones filtradas por lista de form titles y opcionalmente por fecha.
    """
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
