from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any, Optional
from pydantic import BaseModel
from backend.app.services.supabase_service import get_supabase_service, SupabaseService
from backend.app.core.security import get_current_user

router = APIRouter()

class SharedViewConfig(BaseModel):
    source_id: str
    campaign_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    form_titles: Optional[str] = None  # Comma-separated list from frontend

class SharedViewResponse(BaseModel):
    share_id: str
    url: str

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
    except Exception as e:
        print(f"Error creating shared link: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
