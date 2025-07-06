from fastapi import APIRouter, Depends
from app.services.airtable_service import AirtableService
from typing import List, Dict

router = APIRouter()

@router.get("/sources")
def get_campaign_sources(airtable_service: AirtableService = Depends(AirtableService)) -> List[str]:
    """
    Endpoint to get a list of unique campaign sources.
    """
    return airtable_service.get_unique_campaign_sources()

@router.get("/")
def get_campaigns_by_source(source: str, airtable_service: AirtableService = Depends(AirtableService)) -> List[Dict]:
    """
    Endpoint to get campaigns filtered by a specific source.
    """
    return airtable_service.get_campaigns(source=source)
