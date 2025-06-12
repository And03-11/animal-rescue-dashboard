# backend/app/services/airtable_service.py
import os
import requests
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv()

class AirtableService:
    def __init__(self):
        self.api_key = os.getenv("AIRTABLE_API_KEY")
        self.base_id = os.getenv("AIRTABLE_BASE_ID")
        self.donations_table = os.getenv("AIRTABLE_DONATIONS_TABLE_NAME")
        self.donors_table = os.getenv("AIRTABLE_DONORS_TABLE_NAME")
        self.emails_table = os.getenv("AIRTABLE_EMAILS_TABLE_NAME")

        if not all([self.api_key, self.base_id, self.donations_table, self.donors_table, self.emails_table]):
            raise ValueError("Error: Faltan variables de entorno de Airtable (API_KEY, BASE_ID, y los 3 nombres de tabla).")
        
        self.base_url = f"https://api.airtable.com/v0/{self.base_id}"
        self.headers = {"Authorization": f"Bearer {self.api_key}"}

    def _get_all_records(self, table_name: str, params: Dict = None) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/{table_name}"
        all_records = []
        offset = None
        while True:
            request_params = params.copy() if params else {}
            if offset:
                request_params['offset'] = offset
            try:
                response = requests.get(url, headers=self.headers, params=request_params)
                response.raise_for_status()
                data = response.json()
                all_records.extend(data.get('records', []))
                offset = data.get('offset')
                if not offset:
                    break
            except requests.exceptions.RequestException as e:
                print(f"Error de conexión con Airtable: {e}")
                return []
        return all_records

    def get_records_by_ids(self, table_name: str, record_ids: List[str]) -> List[Dict[str, Any]]:
        if not record_ids:
            return []
        formula_parts = [f"RECORD_ID() = '{rec_id}'" for rec_id in record_ids]
        formula = f"OR({', '.join(formula_parts)})"
        return self._get_all_records(table_name, params={'filterByFormula': formula})

    def get_airtable_data_by_email(self, email: str) -> Dict[str, Any]:
        email_normalized = email.strip().lower()
        email_formula = f"LOWER({{Email}}) = '{email_normalized}'"
        email_records = self._get_all_records(self.emails_table, params={'filterByFormula': email_formula})
        
        if not email_records:
            return {"donor_info": None, "donations": []}

        donor_link = email_records[0]['fields'].get('Donor')
        if not donor_link or not isinstance(donor_link, list):
            return {"donor_info": None, "donations": []}
        
        donor_id = donor_link[0]
        
        donor_info_records = self._get_all_records(self.donors_table, params={'filterByFormula': f"RECORD_ID() = '{donor_id}'"})
        donor_info = donor_info_records[0]['fields'] if donor_info_records else None

        donation_records = []
        if donor_info and 'Donations' in donor_info:
            donation_ids = donor_info['Donations']
            donation_records = self.get_records_by_ids(self.donations_table, donation_ids)

        return {"donor_info": donor_info, "donations": donation_records}

    def get_emails_from_ids(self, email_ids: List[str]) -> List[str]:
        if not email_ids:
            return []
        formula_parts = [f"RECORD_ID() = '{email_id}'" for email_id in email_ids]
        formula = f"OR({', '.join(formula_parts)})"
        email_records = self._get_all_records(self.emails_table, params={'filterByFormula': formula})
        return [rec['fields'].get('Email', '') for rec in email_records if 'Email' in rec['fields']]

    def get_donations_for_today(self, table_name: Optional[str] = None) -> List[Dict[str, Any]]:
        target_table = table_name or self.donations_table
        today_str = date.today().isoformat()
        formula = f"DATETIME_FORMAT(SET_TIMEZONE({{Date}}, 'America/Costa_Rica'), 'YYYY-MM-DD') = '{today_str}'"
        return self._get_all_records(target_table, params={'filterByFormula': formula})

    def get_donations_for_month(self, year: int, month: int, table_name: Optional[str] = None) -> List[Dict[str, Any]]:
        target_table = table_name or self.donations_table
        first_day = date(year, month, 1)
        next_month_first_day = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        formula = f"AND(IS_AFTER({{Date}}, '{first_day.isoformat()}'), IS_BEFORE({{Date}}, '{next_month_first_day.isoformat()}'), OR(IS_SAME({{Date}}, '{first_day.isoformat()}', 'day'), TRUE()))"
        return self._get_all_records(target_table, params={'filterByFormula': formula})

    def get_campaign_contacts(self, region: str, is_bounced: bool) -> List[str]:
        bounced_check = "{Bounced Account}" if is_bounced else "NOT({Bounced Account})"
        # ¡Asegúrate de que los nombres {Region} y {Bounced Account} sean exactos!
        formula = f"AND({{Region}} = '{region}', {bounced_check})"
        
        print(f"Buscando contactos en Airtable con la fórmula: {formula}")
        contact_records = self._get_all_records(self.emails_table, params={'filterByFormula': formula})

        # Asume que la columna se llama 'Email'. ¡Ajústalo si es necesario!
        emails = [rec['fields'].get('Email') for rec in contact_records if rec['fields'].get('Email')]
        return emails

    def get_daily_donation_trend(self, days: int, table_name: Optional[str] = None) -> List[Dict[str, Any]]:
        target_table = table_name or self.donations_table
        costa_rica_tz = ZoneInfo("America/Costa_Rica")
        end_date = datetime.now(costa_rica_tz).date()
        start_date = end_date - timedelta(days=days - 1)
        
        daily_totals = { (start_date + timedelta(days=i)).isoformat(): 0 for i in range(days) }

        formula = f"IS_AFTER({{Date}}, '{start_date - timedelta(days=1)}')"
        all_donations = self._get_all_records(target_table, params={'filterByFormula': formula})

        for record in all_donations:
            fields = record.get('fields', {})
            donation_date_str = fields.get('Date')
            amount = fields.get('Amount', 0)
            
            if donation_date_str:
                utc_dt = datetime.fromisoformat(donation_date_str.replace('Z', '+00:00'))
                local_dt = utc_dt.astimezone(costa_rica_tz)
                donation_day = local_dt.date().isoformat()
                if donation_day in daily_totals:
                    daily_totals[donation_day] += amount
        
        chart_data = [{"date": day, "total": round(total, 2)} for day, total in daily_totals.items()]
        return chart_data