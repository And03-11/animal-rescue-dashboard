import os
from dotenv import load_dotenv
from fastapi import HTTPException
from pyairtable import Api
from typing import List, Dict, Optional, Any
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
import traceback

load_dotenv()

# --- Variables de Entorno ---
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
DONATIONS_TABLE_NAME = os.getenv("AIRTABLE_DONATIONS_TABLE_NAME", "Donations")
FORM_TITLES_TABLE_NAME = os.getenv("AIRTABLE_FORMTITLES_TABLE_NAME", "Form Titles")
CAMPAIGNS_TABLE_NAME = os.getenv("AIRTABLE_CAMPAIGNS_TABLE_NAME", "Campaigns")
DONORS_TABLE_NAME = os.getenv("AIRTABLE_DONORS_TABLE_NAME", "Donors")
# ¡NUEVO! Se añade la tabla de Emails
EMAILS_TABLE_NAME = os.getenv("AIRTABLE_EMAILS_TABLE_NAME", "Emails")

COSTA_RICA_TZ = ZoneInfo("America/Costa_Rica")

if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
    raise ValueError("AIRTABLE_API_KEY y AIRTABLE_BASE_ID deben estar definidos en el archivo .env")

# --- Nombres de Campos ---
DONATIONS_FIELDS = {"amount": "Amount", "date": "Date", "form_title_link": "Form Title", "donor_link": "Donor"}
CAMPAIGNS_FIELDS = {"name": "Name", "source": "Source"}
FORM_TITLES_FIELDS = {"name": "Name", "campaign_link": "Campaign", "donations_link": "Donations"}
DONORS_FIELDS = {"name": "Name", "last_name": "Last Name", "emails_link": "Emails", "donations_link": "Donations"}
EMAILS_FIELDS = {"email": "Email"}


class AirtableService:
    def __init__(self):
        # Validar credenciales en la inicialización
        if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
            raise ValueError("AIRTABLE_API_KEY y AIRTABLE_BASE_ID deben estar definidos en el archivo .env")
        self.api = Api(AIRTABLE_API_KEY)
        self.base = self.api.base(AIRTABLE_BASE_ID)
        # inicializar tablas
        self.donations_table = self.base.table(DONATIONS_TABLE_NAME)
        self.form_titles_table = self.base.table(FORM_TITLES_TABLE_NAME)
        self.campaigns_table = self.base.table(CAMPAIGNS_TABLE_NAME)
        self.donors_table = self.base.table(DONORS_TABLE_NAME)
        self.emails_table = self.base.table(EMAILS_TABLE_NAME)

        print("Servicio de Airtable inicializado correctamente.")

    def create_record(self, table_name: str, data: dict) -> dict:
        return self.donors_table.create(data)

    # Reemplaza el método get_airtable_data_by_email en airtable_service.py con este

    def get_airtable_data_by_email(self, email: str) -> Dict[str, Any]:
        """
        VERSIÓN FINAL Y CORREGIDA
        Busca la información completa de un donante y sus donaciones a partir de su email.
        """
        # Paso 1 y 2: Encontrar el donante (esto ya funciona)
        email_formula = f"{{{EMAILS_FIELDS['email']}}} = '{email}'"
        email_records = self.emails_table.all(formula=email_formula, max_records=1)
        if not email_records:
            return {"donor_info": None, "donations": []}
        email_id = email_records[0]['id']

        all_donors = self.donors_table.all(formula=f"NOT({{{DONORS_FIELDS['emails_link']}}} = '')")
        donor_record = None
        for donor in all_donors:
            if email_id in donor.get("fields", {}).get(DONORS_FIELDS["emails_link"], []):
                donor_record = donor
                break
        if not donor_record:
            return {"donor_info": None, "donations": []}

        # --- INICIO DE LA CORRECCIÓN CLAVE ---
        # Paso 3: Obtener las donaciones usando el nombre de campo correcto.
        
        donation_records = []
        # Usamos la nueva clave 'donations_link' que apunta al campo "Donations".
        donation_ids = donor_record.get('fields', {}).get(DONORS_FIELDS['donations_link'])

        if donation_ids:
            id_formulas = [f"RECORD_ID() = '{id}'" for id in donation_ids]
            donations_formula = f"OR({', '.join(id_formulas)})"
            
            donation_records = self.donations_table.all(
                formula=donations_formula,
                fields=[
                    DONATIONS_FIELDS["amount"],
                    DONATIONS_FIELDS["date"],
                    DONATIONS_FIELDS["form_title_link"]
                ]
            )
        # --- FIN DE LA CORRECCIÓN CLAVE ---

        return {
            "donor_info": donor_record,
            "donations": donation_records
        }

    def get_emails_from_ids(self, email_ids: List[str]) -> List[str]:
        """
        Convierte una lista de IDs de email en una lista de direcciones de email.
        """
        if not email_ids:
            return []
        
        id_formulas = [f"RECORD_ID() = '{id}'" for id in email_ids]
        formula = f"OR({', '.join(id_formulas)})"
        
        email_records = self.emails_table.all(formula=formula, fields=[EMAILS_FIELDS["email"]])
        
        return [rec.get("fields", {}).get(EMAILS_FIELDS["email"]) for rec in email_records if "fields" in rec]

    def get_unique_campaign_sources(self) -> List[str]:
        try:
            records = self.campaigns_table.all(fields=[CAMPAIGNS_FIELDS["source"]])
            sources = set(rec.get("fields", {}).get(CAMPAIGNS_FIELDS["source"]) for rec in records)
            return sorted([s for s in sources if s])
        except Exception as e:
            print(f"Error getting campaign sources: {e}")
            return []

    def get_campaigns(self, source: str) -> List[Dict]:
        try:
            formula = f"{{{CAMPAIGNS_FIELDS['source']}}} = '{source}'"
            records = self.campaigns_table.all(formula=formula, fields=[CAMPAIGNS_FIELDS["name"]])
            return [{"id": rec["id"], "name": rec.get("fields", {}).get(CAMPAIGNS_FIELDS["name"])} for rec in records]
        except Exception as e:
            print(f"Error getting campaigns for source {source}: {e}")
            return []

    def get_form_titles(self, campaign_id: Optional[str] = None) -> List[Dict]:
        try:
            all_records = self.form_titles_table.all(fields=[FORM_TITLES_FIELDS["name"], FORM_TITLES_FIELDS["campaign_link"]])
            if not campaign_id:
                return [{"id": rec["id"], "name": rec.get("fields", {}).get(FORM_TITLES_FIELDS["name"])} for rec in all_records]
            
            filtered_records = []
            for rec in all_records:
                fields = rec.get("fields", {})
                linked_campaign_ids = fields.get(FORM_TITLES_FIELDS['campaign_link'], [])
                if linked_campaign_ids and campaign_id in linked_campaign_ids:
                    filtered_records.append(rec)
            
            return [{"id": rec["id"], "name": rec.get("fields", {}).get(FORM_TITLES_FIELDS["name"])} for rec in filtered_records]
        except Exception as e:
            print(f"¡ERROR en get_form_titles!: {e}")
            return []


         
    def get_donations_for_form_title(self, form_title_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict]:
        """
        Retrieves donations for a form title and enriches them with donor name and email.
        """
        try:
            form_title_record = self.form_titles_table.get(form_title_id)
            if not form_title_record or "fields" not in form_title_record: return []
            donation_ids = form_title_record.get("fields", {}).get(FORM_TITLES_FIELDS["donations_link"], [])
            if not donation_ids: return []

            id_formulas = [f"RECORD_ID() = '{id}'" for id in donation_ids]
            formula_parts = [f"OR({', '.join(id_formulas)})"]
            date_field = f"{{{DONATIONS_FIELDS['date']}}}"

            if start_date:
                start_dt_local = datetime.combine(datetime.fromisoformat(start_date).date(), time.min, tzinfo=COSTA_RICA_TZ)
                formula_parts.append(f"IS_AFTER({date_field}, DATETIME_PARSE('{start_dt_local.isoformat()}'))")
            if end_date:
                end_dt_local = datetime.combine(datetime.fromisoformat(end_date).date(), time.max, tzinfo=COSTA_RICA_TZ)
                formula_parts.append(f"IS_BEFORE({date_field}, DATETIME_PARSE('{end_dt_local.isoformat()}'))")
            
            final_formula = f"AND({', '.join(formula_parts)})"

            fields_to_get = [DONATIONS_FIELDS["date"], DONATIONS_FIELDS["amount"], DONATIONS_FIELDS["donor_link"]]
            donation_records = self.donations_table.all(formula=final_formula, fields=fields_to_get)

            if not donation_records: return []

            # Obtener Donantes y sus Emails enlazados
            donor_ids = {fields.get(DONATIONS_FIELDS["donor_link"], [None])[0] for rec in donation_records if (fields := rec.get("fields")) and fields.get(DONATIONS_FIELDS["donor_link"])}
            donor_id_formulas = [f"RECORD_ID() = '{id}'" for id in donor_ids if id]
            donor_records = self.donors_table.all(formula=f"OR({', '.join(donor_id_formulas)})") if donor_id_formulas else []

            donor_info_map = {}
            all_email_ids = set()
            for rec in donor_records:
                fields = rec.get("fields", {})
                name = f"{fields.get(DONORS_FIELDS['name'], '')} {fields.get(DONORS_FIELDS['last_name'], '')}".strip()
                email_ids = fields.get(DONORS_FIELDS['emails_link'], [])
                donor_info_map[rec["id"]] = {"name": name, "email_id": email_ids[0] if email_ids else None}
                if email_ids:
                    all_email_ids.add(email_ids[0])

            # Obtener los emails
            email_id_formulas = [f"RECORD_ID() = '{id}'" for id in all_email_ids if id]
            email_records = self.emails_table.all(formula=f"OR({', '.join(email_id_formulas)})") if email_id_formulas else []
            email_map = {rec["id"]: rec.get("fields", {}).get(EMAILS_FIELDS["email"], "N/A") for rec in email_records}

            # Unir todo
            enriched_donations = []
            for d in donation_records:
                fields = d.get("fields", {})
                donor_id = fields.get(DONATIONS_FIELDS["donor_link"], [None])[0]
                donor_info = donor_info_map.get(donor_id, {"name": "Unknown Donor", "email_id": None})
                donor_email = email_map.get(donor_info["email_id"], "N/A") if donor_info["email_id"] else "N/A"
                
                enriched_donations.append({
                    "id": d["id"],
                    "date": fields.get(DONATIONS_FIELDS["date"]),
                    "amount": fields.get(DONATIONS_FIELDS["amount"], 0),
                    "donorName": donor_info["name"],
                    "donorEmail": donor_email
                })

            return sorted(enriched_donations, key=lambda x: x.get('date', ''), reverse=True)
        except Exception as e:
            print(f"¡ERROR GRAVE en get_donations_for_form_title!: {e}")
            return []

    def get_donations(self, start_utc: Optional[str] = None, end_utc: Optional[str] = None) -> List[Dict]:
        try:
            formula_parts = []
            if start_utc:
                formula_parts.append(f"IS_AFTER({{Date}}, DATETIME_PARSE('{start_utc}'))")
            if end_utc:
                formula_parts.append(f"IS_BEFORE({{Date}}, DATETIME_PARSE('{end_utc}'))")
            formula = f"AND({', '.join(formula_parts)})" if formula_parts else None

            records = self.donations_table.all(formula=formula, fields=[DONATIONS_FIELDS["date"], DONATIONS_FIELDS["amount"]])
            return [
                {
                    "id": rec["id"],
                    "date": rec["fields"].get(DONATIONS_FIELDS["date"]),
                    "amount": rec["fields"].get(DONATIONS_FIELDS["amount"], 0),
                }
                for rec in records
            ]
        except Exception as e:
            print(f"Error en get_donations: {e}")
            return []  # fallback seguro
        


        # En backend/app/services/airtable_service.py

    # En backend/app/services/airtable_service.py, reemplaza el método existente

    # En backend/app/services/airtable_service.py, reemplaza ÚNICAMENTE esta función:

    # En backend/app/services/airtable_service.py, reemplaza ÚNICAMENTE esta función:

    def get_campaign_stats(self, campaign_id: str) -> Dict[str, Any]:
        """
        Estadísticas de campaña, ordenadas por fecha de creación de cada Form Title
        (más nuevos arriba).
        """
        try:
            # — Paso 1: traer todos los form-titles con enlaces y createdTime —
            title_records = self.form_titles_table.all(
                fields=[
                    FORM_TITLES_FIELDS["name"],
                    FORM_TITLES_FIELDS["campaign_link"],
                    FORM_TITLES_FIELDS["donations_link"],
                ]
            )

            # — Paso 2: filtrar solo los de esta campaña y guardar createdTime —
            form_titles = []
            for rec in title_records:
                f = rec.get("fields", {})
                if campaign_id in f.get(FORM_TITLES_FIELDS["campaign_link"], []):
                    form_titles.append({
                        "id": rec["id"],
                        "name": f.get(FORM_TITLES_FIELDS["name"], ""),
                        "donation_ids": f.get(FORM_TITLES_FIELDS["donations_link"], []),
                        "createdTime": rec.get("createdTime")  # ISO string
                    })

            if not form_titles:
                return {
                    "campaign_total_amount": 0,
                    "campaign_total_count":  0,
                    "stats_by_form_title":   []
                }

            # — Paso 3: unificar donation IDs y traer donaciones —
            all_donation_ids = {did for ft in form_titles for did in ft["donation_ids"]}
            if not all_donation_ids:
                return {
                    "campaign_total_amount": 0,
                    "campaign_total_count":  0,
                    "stats_by_form_title":   []
                }
            formula_donations = "OR(" + ",".join(f"RECORD_ID()='{did}'" for did in all_donation_ids) + ")"
            donation_records = self.donations_table.all(
                formula=formula_donations,
                fields=[DONATIONS_FIELDS["amount"], DONATIONS_FIELDS["donor_link"]]
            )

            # — Paso 4: traer donantes en bloque —
            donor_ids = {
                rec.get("fields", {}).get(DONATIONS_FIELDS["donor_link"], [None])[0]
                for rec in donation_records
            } - {None}
            donor_records = []
            if donor_ids:
                formula_donors = "OR(" + ",".join(f"RECORD_ID()='{did}'" for did in donor_ids) + ")"
                donor_records = self.donors_table.all(
                    formula=formula_donors,
                    fields=[DONORS_FIELDS["name"], DONORS_FIELDS["last_name"], DONORS_FIELDS["emails_link"]]
                )

            # — Paso 5: traer emails en bloque —
            email_ids = {
                eid for dr in donor_records for eid in dr.get("fields", {}).get(DONORS_FIELDS["emails_link"], [])
            }
            email_records = []
            if email_ids:
                formula_emails = "OR(" + ",".join(f"RECORD_ID()='{eid}'" for eid in email_ids) + ")"
                email_records = self.emails_table.all(
                    formula=formula_emails,
                    fields=[EMAILS_FIELDS["email"]]
                )

            # — Paso 6: construir map de montos por donation ID —
            donations_map = {
                rec["id"]: rec["fields"].get(DONATIONS_FIELDS["amount"], 0)
                for rec in donation_records
            }

            # — Paso 7: armar lista de stats incluyendo form_title_id —
            stats = []
            grand_total = 0
            grand_count = 0
            for ft in form_titles:
                tot = sum(donations_map.get(did, 0) for did in ft["donation_ids"])
                cnt = sum(1 for did in ft["donation_ids"] if did in donations_map)
                if cnt > 0:
                    stats.append({
                        "form_title_id":   ft["id"],
                        "form_title_name": ft["name"],
                        "total_amount":    tot,
                        "donation_count":  cnt
                    })
                grand_total += tot
                grand_count += cnt

            # — Paso 8: ordenar POR createdTime (más recientes primero) —
            ft_map = {ft["id"]: ft for ft in form_titles}
            stats.sort(
                key=lambda x: ft_map[x["form_title_id"]]["createdTime"],
                reverse=False
            )

            return {
                "campaign_total_amount": grand_total,
                "campaign_total_count":  grand_count,
                "stats_by_form_title":   stats
            }

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail="Ocurrió un error al calcular las estadísticas de la campaña."
            )
        


    def get_dashboard_data(self) -> Dict[str, Any]:
        """
        Devuelve métricas de donaciones: total y tendencia diaria.
        """
        # Llama al método existente que obtiene todas las donaciones
        donations = self.get_donations()
        total = sum(d.get("amount", 0) for d in donations)
        # Agrupar montos por fecha
        trend: Dict[str, float] = {}
        for d in donations:
            date = d.get("date")
            amt = d.get("amount", 0)
            if date:
                trend[date] = trend.get(date, 0) + amt

        # Formatear daily_trend como lista
        daily_trend = [{"date": dt, "amount": trend[dt]} for dt in sorted(trend)]
        return {"total_donations": total, "daily_trend": daily_trend}


    
