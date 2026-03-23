from fastapi import APIRouter, Depends
from fastapi_cache.decorator import cache
from backend.app.services.data_service import DataService, get_data_service
from datetime import datetime, time, timedelta, date
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
from backend.app.core.security import get_current_user
from collections import defaultdict
import traceback
from fastapi import HTTPException

router = APIRouter()
COSTA_RICA_TZ = ZoneInfo("America/Costa_Rica")

@router.get("/metrics")
@cache(expire=180)
def get_dashboard_metrics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    try:
        now_in_tz = datetime.now(COSTA_RICA_TZ)
        today_date_obj = now_in_tz.date()
        today_str = today_date_obj.isoformat()

        start_current_month = today_date_obj.replace(day=1)
        last_day_prev_month = start_current_month - timedelta(days=1)
        start_prev_month = last_day_prev_month.replace(day=1)
        
        daily_summaries = data_service.get_daily_summaries(
            start_date=start_prev_month,
            end_date=today_date_obj
        )

        amount_today = 0
        count_today = 0
        amount_this_month = 0
        count_this_month = 0
        amount_last_month_same_day = 0
        
        current_month = today_date_obj.month
        current_year = today_date_obj.year
        prev_month = start_prev_month.month
        prev_year = start_prev_month.year
        day_of_month_limit = today_date_obj.day 

        glance_trend = []

        for summary in daily_summaries:
            summary_date_str = summary["date"]
            try:
                summary_date_obj = date.fromisoformat(summary_date_str)
            except ValueError:
                continue

            if summary_date_obj.year == current_year and summary_date_obj.month == current_month:
                amount_this_month += summary.get("total", 0)
                count_this_month += summary.get("count", 0)
                if summary_date_str == today_str:
                    amount_today = summary.get("total", 0)
                    count_today = summary.get("count", 0)

            if summary_date_obj.year == prev_year and summary_date_obj.month == prev_month:
                if summary_date_obj.day <= day_of_month_limit:
                    amount_last_month_same_day += summary.get("total", 0)

            if summary_date_obj >= (today_date_obj - timedelta(days=30)):
                glance_trend.append(summary)

        mom_growth = 0.0
        if amount_last_month_same_day > 0:
            mom_growth = ((amount_this_month - amount_last_month_same_day) / amount_last_month_same_day) * 100
        elif amount_this_month > 0:
            mom_growth = 100.0
        
        glance_metrics = {
            "amountToday": round(amount_today, 2),
            "donationsCountToday": count_today,
            "amountThisMonth": round(amount_this_month, 2),
            "donationsCountThisMonth": count_this_month,
            "glanceTrend": glance_trend,
            "momGrowth": round(mom_growth, 1),
            "amountLastMonthSameDay": round(amount_last_month_same_day, 2)
        }

        filtered_metrics = {}
        if start_date and end_date:
            try:
                s_date_obj = date.fromisoformat(start_date)
                e_date_obj = date.fromisoformat(end_date)
                summaries_in_range = data_service.get_daily_summaries(start_date=s_date_obj, end_date=e_date_obj)
                amount_in_range = sum(s.get("total", 0) for s in summaries_in_range)
                count_in_range = sum(s.get("count", 0) for s in summaries_in_range)
                
                filtered_trend = data_service.get_hourly_trend(s_date_obj) if s_date_obj == e_date_obj else summaries_in_range

                filtered_metrics = {
                    "amountInRange": round(amount_in_range, 2),
                    "donationsCount": count_in_range,
                    "dailyTrend": filtered_trend,
                }
            except Exception as e_filter:
                print(f"Error filtering metrics: {e_filter}")

        return {"glance": glance_metrics, "filtered": filtered_metrics}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Could not process dashboard metrics")

@router.get("/top-donors")
@cache(expire=900)
def get_top_donors(
    limit: int = 10,
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    try:
        return data_service.get_top_donors(limit=limit)
    except Exception as e:
        return {"error": "Could not process top donors", "details": str(e)}

@router.get("/sources")
@cache(expire=300)
def get_donation_sources(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    try:
        if not start_date or not end_date:
            today = datetime.now(COSTA_RICA_TZ).date()
            start_date_obj, end_date_obj = today.replace(day=1), today
        else:
            start_date_obj, end_date_obj = date.fromisoformat(start_date), date.fromisoformat(end_date)
        return data_service.get_monthly_source_breakdown(start_date_obj, end_date_obj)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Could not process donation sources")

@router.get("/funnel-stats")
def get_funnel_stats(data_service: DataService = Depends(get_data_service)):
    try:
        return data_service.get_funnel_stats()
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Could not process funnel stats")