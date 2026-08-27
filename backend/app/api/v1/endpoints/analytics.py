from copy import deepcopy

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from typing import Dict, Any, Optional
from pydantic import BaseModel
from backend.app.services.supabase_service import get_supabase_service, SupabaseService
from backend.app.services.data_service import DataService, get_data_service
from backend.app.core.security import get_current_user

router = APIRouter()

class SharedViewConfig(BaseModel):
    source_id: str
    source_name: Optional[str] = None
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    form_titles: Optional[str] = None  # Comma-separated list from frontend

class SharedViewResponse(BaseModel):
    share_id: str
    url: str


def _redact_shared_donations(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Keep donation facts public while removing direct donor identifiers."""
    redacted = deepcopy(payload)
    donations = redacted.get("donations")
    if not isinstance(donations, list):
        return redacted

    for donation in donations:
        if not isinstance(donation, dict):
            continue
        if "donorName" in donation:
            donation["donorName"] = "Anonymous donor"
        if "donorEmail" in donation:
            donation["donorEmail"] = ""
        if "donor_name" in donation:
            donation["donor_name"] = "Anonymous donor"
        if "donor_email" in donation:
            donation["donor_email"] = ""
    return redacted

@router.post("/share-link", response_model=SharedViewResponse)
async def create_shared_view(
    config: SharedViewConfig,
    current_user: str = Depends(get_current_user),
    service: SupabaseService = Depends(get_supabase_service)
):
    """
    Create a shareable link for the current analytics view.
    """
    try:
        # Convert Pydantic model to dict
        config_dict = config.dict()
        
        # Handle form_titles splitting if needed, or store as is
        if config_dict.get('form_titles'):
            config_dict['form_titles'] = config_dict['form_titles'].split(',')
            
        token = service.create_shared_view(config_dict, created_by=current_user)
        
        # Construct the full URL (assuming frontend is at root or we return relative)
        url = f"/shared/{token}"
        
        return {"share_id": token, "url": url}
    except Exception:
        raise HTTPException(
            status_code=500, detail="Unable to create shared link"
        ) from None


@router.delete("/share/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_shared_view(
    token: str,
    current_user: str = Depends(get_current_user),
    service: SupabaseService = Depends(get_supabase_service),
):
    """Revoke a shared view created by the authenticated user."""
    if not service.revoke_shared_view(token, revoked_by=current_user):
        raise HTTPException(status_code=404, detail="Shared view not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/share/{token}", response_model=Dict[str, Any])
async def get_shared_view(
    token: str,
    service: SupabaseService = Depends(get_supabase_service)
):
    """
    Get the configuration for a shared view token.
    Public endpoint (no auth required).
    """
    config = service.get_shared_view(token)
    
    if not config:
        raise HTTPException(status_code=404, detail="Shared view not found or expired")
        
    return config


# ============ PUBLIC ENDPOINTS FOR SHARED VIEW DATA ============

@router.get("/share/{token}/stats", response_model=Dict[str, Any])
async def get_shared_view_stats(
    token: str,
    service: SupabaseService = Depends(get_supabase_service),
    data_service: DataService = Depends(get_data_service)
):
    """
    Get stats for a shared view. Public endpoint (no auth required).
    """
    # First validate the token and get config
    config = service.get_shared_view(token)
    if not config:
        raise HTTPException(status_code=404, detail="Shared view not found or expired")
    
    try:
        # Extract filter params from config
        source_id = config.get('source_id')
        campaign_id = config.get('campaign_id')
        start_date = config.get('start_date')
        end_date = config.get('end_date')
        form_titles = config.get('form_titles')  # This is an array
        
        # Only filter by form_title if exactly ONE is specified
        form_title_ids = None
        if isinstance(form_titles, list) and len(form_titles) == 1:
            form_title_ids = form_titles
        
        # Call appropriate stats function based on config
        if campaign_id:
            return data_service.get_campaign_stats(
                campaign_id=campaign_id,
                start_date=start_date,
                end_date=end_date,
                form_title_ids=form_title_ids
            )
        else:
            return data_service.get_source_stats(
                source_name=source_id,
                start_date=start_date,
                end_date=end_date
            )
    except Exception:
        raise HTTPException(
            status_code=500, detail="Unable to fetch shared view stats"
        ) from None


@router.get("/share/{token}/donations", response_model=Dict[str, Any])
async def get_shared_view_donations(
    token: str,
    page_size: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: SupabaseService = Depends(get_supabase_service),
    data_service: DataService = Depends(get_data_service)
):
    """
    Get donations for a shared view. Public endpoint (no auth required).
    """
    # First validate the token and get config
    config = service.get_shared_view(token)
    if not config:
        raise HTTPException(status_code=404, detail="Shared view not found or expired")
    
    try:
        # Extract filter params from config
        source_id = config.get('source_id')
        campaign_id = config.get('campaign_id')
        start_date = config.get('start_date')
        end_date = config.get('end_date')
        form_titles = config.get('form_titles')  # This is an array
        
        # For single form title, use form title donations endpoint
        if isinstance(form_titles, list) and len(form_titles) == 1:
            result = data_service.get_donations_for_form_title(
                form_title_ids=form_titles,
                start_date=start_date,
                end_date=end_date,
                page_size=page_size,
                offset=offset
            )
        elif campaign_id:
            result = data_service.get_campaign_donations(
                campaign_id=campaign_id,
                start_date=start_date,
                end_date=end_date,
                page_size=page_size,
                offset=offset
            )
        else:
            result = data_service.get_source_donations(
                source=source_id,
                start_date=start_date,
                end_date=end_date,
                page_size=page_size,
                offset=offset
            )
        
        return _redact_shared_donations(result)
        
    except Exception:
        raise HTTPException(
            status_code=500, detail="Unable to fetch shared view donations"
        ) from None
