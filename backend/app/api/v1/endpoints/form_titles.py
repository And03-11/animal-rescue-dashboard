from fastapi import APIRouter, Depends
from backend.app.services.airtable_service import AirtableService
from typing import List, Dict, Optional
from backend.app.core.security import get_current_user

router = APIRouter()

@router.get("", response_model=List[Dict])
def get_form_titles(
    campaign_id: Optional[str] = None,
    airtable_service: AirtableService = Depends(AirtableService),
    current_user: str = Depends(get_current_user)

    
) -> List[Dict]:
    """
    Endpoint to get a list of form titles.
    If campaign_id is provided, it filters form titles by that campaign.
    """
    return airtable_service.get_form_titles(campaign_id=campaign_id)

@router.get("/donations")
def get_donations_by_form_title(
    form_title_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    airtable_service: AirtableService = Depends(AirtableService),
    current_user: str = Depends(get_current_user)

) -> Dict:
    """
    Endpoint to get donations filtered by a specific form title and date range.
    """
    donations = airtable_service.get_donations_for_form_title(
        form_title_id=form_title_id,
        start_date=start_date,
        end_date=end_date
    )
    
    total_amount = sum(d.get("amount", 0) for d in donations)
    
    return {
        "donations": donations,
        "totalAmount": round(total_amount, 2),
        "donationsCount": len(donations)
    }
