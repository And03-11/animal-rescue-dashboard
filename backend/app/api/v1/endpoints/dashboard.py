# backend/app/api/v1/endpoints/dashboard.py
from fastapi import APIRouter
from typing import Dict, Any
from app.services.airtable_service import AirtableService
import os
from datetime import datetime

router = APIRouter()
airtable_service = AirtableService()

def get_metrics_for_table(table_name: str) -> Dict[str, Any]:
    """Función auxiliar para obtener métricas de una tabla específica."""
    if not table_name:
        return {"total_today": 0, "total_month": 0, "daily_trend": []}
    
    # Obtenemos el mes y año actual para la consulta
    now = datetime.now()
    
    donations_today = airtable_service.get_donations_for_today(table_name=table_name)
    donations_month = airtable_service.get_donations_for_month(now.year, now.month, table_name=table_name)
    daily_trend = airtable_service.get_daily_donation_trend(days=15, table_name=table_name)

    total_today = sum(d['fields'].get('Amount', 0) for d in donations_today)
    total_month = sum(d['fields'].get('Amount', 0) for d in donations_month)

    return {
        "total_today": round(total_today, 2),
        "total_month": round(total_month, 2),
        "daily_trend": daily_trend
    }


@router.get("/metrics")
def get_dashboard_metrics() -> Dict[str, Any]:
    """
    Endpoint que devuelve las métricas para las TRES fuentes de donaciones.
    """
    main_donations_table = os.getenv("AIRTABLE_DONATIONS_TABLE_NAME")
    not_from_bc_donations_table = os.getenv("AIRTABLE_DONATIONS_BC_TABLE_NAME")
    influencer_donations_table = os.getenv("AIRTABLE_DONATIONS_INFLUENCER_TABLE_NAME")
    
    return {
        "mainDonations": get_metrics_for_table(main_donations_table),
        "notfrombcdonations": get_metrics_for_table(not_from_bc_donations_table), # Nombre corregido
        "influencerDonations": get_metrics_for_table(influencer_donations_table)
    }