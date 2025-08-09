from fastapi import APIRouter, Depends
from backend.app.services.airtable_service import AirtableService, get_airtable_service
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
from backend.app.core.security import get_current_user
from collections import defaultdict

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
            
            # Inicializa el día si no existe
            if day_str not in daily_trend_data:
                daily_trend_data[day_str] = {"total": 0, "count": 0}

            # Agrega el monto y aumenta el contador
            daily_trend_data[day_str]["total"] += donation.get("amount", 0)
            daily_trend_data[day_str]["count"] += 1
        except (ValueError, TypeError): 
            continue
    return [
        {"date": day, "total": round(data["total"], 2), "count": data["count"]}
        for day, data in sorted(daily_trend_data.items())
    ]

@router.get("/metrics")
def get_dashboard_metrics(
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    try:
        now_in_tz = datetime.now(COSTA_RICA_TZ)
        today_date = now_in_tz.date()
        
        # --- LÓGICA OPTIMIZADA ---
        # 1. Hacemos UNA SOLA LLAMADA para los últimos 30 días.
        start_of_today_dt = datetime.combine(today_date, time.min, tzinfo=COSTA_RICA_TZ)
        end_of_today_dt = datetime.combine(today_date, time.max, tzinfo=COSTA_RICA_TZ)
        start_30_days_ago_dt = start_of_today_dt - timedelta(days=30)
        
        # Esta es ahora nuestra única fuente de datos para las métricas "glance".
        donations_last_30_days = airtable_service.get_donations(
            start_utc=start_30_days_ago_dt.isoformat(), 
            end_utc=end_of_today_dt.isoformat()
        )

        # 2. Calculamos todas las métricas en Python a partir de esos datos.
        amount_today = 0
        count_today = 0
        amount_this_month = 0
        count_this_month = 0

        for d in donations_last_30_days:
            donation_dt_utc = datetime.fromisoformat(d.get("date").replace('Z', '+00:00'))
            donation_dt_local = donation_dt_utc.astimezone(COSTA_RICA_TZ)

            # Sumar al total del mes
            if donation_dt_local.year == today_date.year and donation_dt_local.month == today_date.month:
                amount_this_month += d.get("amount", 0)
                count_this_month += 1
            
            # Sumar al total de hoy
            if donation_dt_local.date() == today_date:
                amount_today += d.get("amount", 0)
                count_today += 1
        
        glance_trend = process_donations_for_trend(donations_last_30_days)
        
        glance_metrics = {
            "amountToday": round(amount_today, 2),
            "donationsCountToday": count_today,
            "amountThisMonth": round(amount_this_month, 2),
            "donationsCountThisMonth": count_this_month,
            "glanceTrend": glance_trend,
        }

        # --- El cálculo de métricas filtradas sigue igual ---
        filtered_metrics = {}
        if start_date and end_date:
            # ... (esta parte no cambia)
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
    


@router.get("/top-donors")
def get_top_donors(
    limit: int = 10,
    airtable_service: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user)
):
    """
    Calcula y devuelve los mejores donadores históricos basados en el monto total donado.
    """
    try:
        # ✅ PASO CLAVE: Usar la nueva función que sí trae la info del donante
        all_donations = airtable_service.get_donations_with_donor_info()
        
        # Usamos defaultdict para facilitar la agrupación
        donor_stats = defaultdict(lambda: {"totalAmount": 0, "donationsCount": 0, "name": ""})

        for donation in all_donations:
            email = donation.get("email")
            # Ignoramos donaciones sin un email asociado
            if not email:
                continue

            amount = donation.get("amount", 0)
            
            # Agrupa por email, sumando montos y contando donaciones
            donor_stats[email]["totalAmount"] += amount
            donor_stats[email]["donationsCount"] += 1
            # Se asegura de guardar el nombre del donante
            if not donor_stats[email]["name"] or donor_stats[email]["name"] == "Anonymous":
                 donor_stats[email]["name"] = donation.get("name", "Anonymous")

        # Convierte el diccionario a una lista de objetos
        top_donors_list = [
            {"email": email, **stats} for email, stats in donor_stats.items()
        ]

        # Ordena la lista de mayor a menor por el monto total
        sorted_donors = sorted(top_donors_list, key=lambda x: x["totalAmount"], reverse=True)
        
        # Devuelve el top N (el frontend espera este formato)
        return sorted_donors[:limit]

    except Exception as e:
        print(f"Error crítico al generar el top de donadores: {e}")
        return {"error": "Could not process top donors", "details": str(e)}