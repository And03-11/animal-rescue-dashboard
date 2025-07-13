from fastapi import APIRouter, Depends
from backend.app.services.airtable_service import AirtableService
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
from backend.app.core.security import get_current_user

router = APIRouter()
COSTA_RICA_TZ = ZoneInfo("America/Costa_Rica")

def process_donations_for_trend(donations: List[Dict]) -> List[Dict[str, Any]]:
    daily_trend_data = {}
    for donation in donations:
        donation_date_str = donation.get("date")
        if not donation_date_str: continue
        try:
            utc_dt = datetime.fromisoformat(donation_date_str.replace('Z', '+00:00'))
            day_str = utc_dt.astimezone(COSTA_RICA_TZ).date().isoformat()
            daily_trend_data.setdefault(day_str, 0)
            daily_trend_data[day_str] += donation.get("amount", 0)
        except (ValueError, TypeError): continue
    return [{"date": day, "total": round(total, 2)} for day, total in sorted(daily_trend_data.items())]

@router.get("/metrics")
def get_dashboard_metrics(
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None,
    airtable_service: AirtableService = Depends(AirtableService),
    current_user: str = Depends(get_current_user)  # 🔐 protección con JWT

):
    try:
        now_in_tz = datetime.now(COSTA_RICA_TZ)
        
        # 1. Métricas fijas: "Hoy", "Este Mes" y tendencia de 30 días
        start_of_today = datetime.combine(now_in_tz.date(), time.min, tzinfo=COSTA_RICA_TZ)
        end_of_today = datetime.combine(now_in_tz.date(), time.max, tzinfo=COSTA_RICA_TZ)
        donations_today = airtable_service.get_donations(start_utc=start_of_today.isoformat(), end_utc=end_of_today.isoformat())
        amount_today = sum(d.get("amount", 0) for d in donations_today)

        start_of_month = now_in_tz.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        donations_this_month = airtable_service.get_donations(start_utc=start_of_month.isoformat(), end_utc=end_of_today.isoformat())
        amount_this_month = sum(d.get("amount", 0) for d in donations_this_month)
        
        start_30_days_ago = start_of_today - timedelta(days=30)
        donations_last_30_days = airtable_service.get_donations(start_utc=start_30_days_ago.isoformat(), end_utc=end_of_today.isoformat())
        glance_trend = process_donations_for_trend(donations_last_30_days)
        
        glance_metrics = {
            "amountToday": round(amount_today, 2),
            "amountThisMonth": round(amount_this_month, 2),
            "glanceTrend": glance_trend,
        }

        # 2. Métricas filtradas por rango
        filtered_metrics = {}
        if start_date and end_date:
            start_dt = datetime.fromisoformat(start_date).replace(tzinfo=COSTA_RICA_TZ)
            end_dt = datetime.combine(datetime.fromisoformat(end_date), time.max, tzinfo=COSTA_RICA_TZ)
            donations_in_range = airtable_service.get_donations(start_utc=start_dt.isoformat(), end_utc=end_dt.isoformat())
            filtered_trend = process_donations_for_trend(donations_in_range)
            amount_in_range = sum(item['total'] for item in filtered_trend)
            filtered_metrics = {
                "amountInRange": round(amount_in_range, 2),
                "donationsCount": len(donations_in_range),
                "dailyTrend": filtered_trend,
            }

        return {
            "glance": glance_metrics,
            "filtered": filtered_metrics
        }
    except Exception as e:
        print(f"Error crítico al generar las métricas del dashboard: {e}")
        return {"error": "Could not process dashboard metrics", "details": str(e)}