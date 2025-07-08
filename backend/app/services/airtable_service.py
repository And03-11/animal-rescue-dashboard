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
DONORS_FIELDS = {"name": "Name", "last_name": "Last Name", "emails_link": "Emails"}
EMAILS_FIELDS = {"email": "Email"}


class AirtableService:
    def __init__(self):
        self.api = Api(AIRTABLE_API_KEY)
        self.base = self.api.base(AIRTABLE_BASE_ID)
        self.donations_table = self.base.table(DONATIONS_TABLE_NAME)
        self.form_titles_table = self.base.table(FORM_TITLES_TABLE_NAME)
        self.campaigns_table = self.base.table(CAMPAIGNS_TABLE_NAME)
        self.donors_table = self.base.table(DONORS_TABLE_NAME)
        # ¡NUEVO! Se inicializa la tabla de Emails
        self.emails_table = self.base.table(EMAILS_TABLE_NAME)
        print("Servicio de Airtable inicializado correctamente.")

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

    def get_campaign_stats(self, campaign_id: str) -> Dict[str, Any]:
            """
            Función corregida y final para calcular las estadísticas de la campaña.
            """
            try:
                form_titles_in_campaign = self.get_form_titles(campaign_id=campaign_id)
                if not form_titles_in_campaign:
                    return {"campaign_total_amount": 0, "campaign_total_count": 0, "stats_by_form_title": []}

                all_stats = []
                grand_total_amount = 0
                grand_total_count = 0

                for form_title in form_titles_in_campaign:
                    form_title_id = form_title['id']
                    form_title_name = form_title.get('name', 'Unknown Title')
                    donations = self.get_donations_for_form_title(form_title_id=form_title_id)
                    donation_count = len(donations)
                    total_amount = sum(d.get('amount', 0) for d in donations)

                    if donation_count > 0:
                        all_stats.append({
                            'form_title_name': form_title_name,
                            'total_amount': total_amount,
                            'donation_count': donation_count
                        })
                    grand_total_amount += total_amount
                    grand_total_count += donation_count

                return {
                    "campaign_total_amount": grand_total_amount,
                    "campaign_total_count": grand_total_count,
                    "stats_by_form_title": sorted(all_stats, key=lambda x: x['total_amount'], reverse=True)
                }
            except Exception as e:
                print(f"Error inesperado calculando estadísticas de campaña: {e}")
                raise HTTPException(status_code=500, detail="Ocurrió un error inesperado al calcular las estadísticas.")