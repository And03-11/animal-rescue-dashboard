from fastapi import APIRouter, Depends
from fastapi_cache.decorator import cache
from backend.app.services.data_service import DataService, get_data_service
from datetime import datetime, time, timedelta, date
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
from backend.app.core.security import get_current_user
from collections import defaultdict
import traceback # Para el manejo de errores
from fastapi import HTTPException # Para devolver errores HTTP

router = APIRouter()
COSTA_RICA_TZ = ZoneInfo("America/Costa_Rica")


@router.get("/metrics")
@cache(expire=180) # Mantenemos el caché
def get_dashboard_metrics(
    start_date: Optional[str] = None, # Recibe YYYY-MM-DD del frontend
    end_date: Optional[str] = None,   # Recibe YYYY-MM-DD del frontend
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    """
    Obtiene métricas del dashboard usando la tabla pre-calculada Daily Summaries.
    """
    try:
        now_in_tz = datetime.now(COSTA_RICA_TZ)
        today_date_obj = now_in_tz.date() # Objeto date
        today_str = today_date_obj.isoformat() # String 'YYYY-MM-DD'

        # --- LÓGICA NUEVA CON DAILY SUMMARIES ---
        # 1. Calcular fechas para MoM (Month over Month)
        # Mes actual
        start_current_month = today_date_obj.replace(day=1)
        
        # Mes anterior
        # Truco para obtener el mes anterior: primer día de este mes - 1 día = último día mes anterior
        last_day_prev_month = start_current_month - timedelta(days=1)
        start_prev_month = last_day_prev_month.replace(day=1)
        
        # Llamamos a la función del servicio con el rango ampliado
        daily_summaries = data_service.get_daily_summaries(
            start_date=start_prev_month,
            end_date=today_date_obj
        )

        # 2. Calcular métricas "Glance"
        amount_today = 0
        count_today = 0
        amount_this_month = 0
        count_this_month = 0
        
        amount_last_month_same_day = 0 # Acumulado mes anterior hasta el día equivalente
        
        current_month = today_date_obj.month
        current_year = today_date_obj.year
        
        prev_month = start_prev_month.month
        prev_year = start_prev_month.year
        
        # Día del mes actual (ej: 27)
        day_of_month_limit = today_date_obj.day 

        glance_trend = [] # Solo guardamos los últimos 30 días para la gráfica

        for summary in daily_summaries:
            summary_date_str = summary["date"]
            try:
                summary_date_obj = date.fromisoformat(summary_date_str)
            except ValueError:
                continue

            # --- Lógica de Acumulados ---
            
            # Mes Actual
            if summary_date_obj.year == current_year and summary_date_obj.month == current_month:
                amount_this_month += summary.get("total", 0)
                count_this_month += summary.get("count", 0)
                
                # Hoy
                if summary_date_str == today_str:
                    amount_today = summary.get("total", 0)
                    count_today = summary.get("count", 0)

            # Mes Anterior (Mismo rango de días)
            if summary_date_obj.year == prev_year and summary_date_obj.month == prev_month:
                if summary_date_obj.day <= day_of_month_limit:
                    amount_last_month_same_day += summary.get("total", 0)

            # --- Lógica para la Gráfica (Últimos 30 días) ---
            if summary_date_obj >= (today_date_obj - timedelta(days=30)):
                glance_trend.append(summary)

        # 3. Calcular Crecimiento MoM
        mom_growth = 0.0
        if amount_last_month_same_day > 0:
            mom_growth = ((amount_this_month - amount_last_month_same_day) / amount_last_month_same_day) * 100
        elif amount_this_month > 0:
            mom_growth = 100.0 # Crecimiento infinito si antes era 0
        else:
            mom_growth = 0.0

        glance_metrics = {
            "amountToday": round(amount_today, 2),
            "donationsCountToday": count_today,
            "amountThisMonth": round(amount_this_month, 2),
            "donationsCountThisMonth": count_this_month,
            "glanceTrend": glance_trend,
            "momGrowth": round(mom_growth, 1),
            "amountLastMonthSameDay": round(amount_last_month_same_day, 2)
        }

        # --- Cálculo de métricas filtradas (si se piden fechas) ---
        filtered_metrics = {}
        if start_date and end_date:
            try:
                s_date_obj = date.fromisoformat(start_date)
                e_date_obj = date.fromisoformat(end_date)

                # Obtener resúmenes para el rango específico
                summaries_in_range = data_service.get_daily_summaries(
                    start_date=s_date_obj,
                    end_date=e_date_obj
                )

                amount_in_range = sum(s.get("total", 0) for s in summaries_in_range)
                count_in_range = sum(s.get("count", 0) for s in summaries_in_range)
                
                # If start_date == end_date, fetch hourly trend for that day
                filtered_trend = []
                if s_date_obj == e_date_obj:
                    filtered_trend = data_service.get_hourly_trend(s_date_obj)
                else:
                    filtered_trend = summaries_in_range

                filtered_metrics = {
                    "amountInRange": round(amount_in_range, 2),
                    "donationsCount": count_in_range,
                    "dailyTrend": filtered_trend,
                }
            except ValueError:
                print(f"Error: Fechas inválidas recibidas para filtro - start: {start_date}, end: {end_date}")
                pass
            except Exception as e_filter:
                print(f"Error calculando métricas filtradas: {e_filter}")
                pass

        # Devolver la estructura combinada
        return {
            "glance": glance_metrics,
            "filtered": filtered_metrics
        }
    # Manejo de errores
    except Exception as e:
        print(f"Error crítico al generar las métricas del dashboard: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Could not process dashboard metrics")


@router.get("/top-donors")
# 15 mins de caché es perfecto.
@cache(expire=900)
def get_top_donors(
    limit: int = 10,
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    """
    Calcula y devuelve los mejores donadores históricos basados en el monto total donado.
    """
    try:
        # ✅ PASO CLAVE: Usar el DataService
        return data_service.get_top_donors(limit=limit)

    except Exception as e:
        print(f"Error crítico al generar el top de donadores: {e}")
        return {"error": "Could not process top donors", "details": str(e)}

@router.get("/sources")
@cache(expire=300) # 5 minutos de caché
def get_donation_sources(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    data_service: DataService = Depends(get_data_service),
    current_user: str = Depends(get_current_user)
):
    """
    Obtiene el desglose de donaciones por fuente (Big Campaigns, Facebook, etc.)
    Por defecto usa el mes actual si no se especifican fechas.
    """
    try:
        # Determinar fechas por defecto (Mes Actual)
        if not start_date or not end_date:
            now_in_tz = datetime.now(COSTA_RICA_TZ)
            today_date_obj = now_in_tz.date()
            start_date_obj = today_date_obj.replace(day=1)
            end_date_obj = today_date_obj
        else:
            try:
                start_date_obj = date.fromisoformat(start_date)
                end_date_obj = date.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # Llamar al servicio
        result = data_service.get_monthly_source_breakdown(start_date_obj, end_date_obj)
        return result

    except Exception as e:
        print(f"Error crítico al obtener fuentes de donación: {e}")
        raise HTTPException(status_code=500, detail="Could not process donation sources")