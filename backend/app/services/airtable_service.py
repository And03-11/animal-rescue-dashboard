import os
from dotenv import load_dotenv
from pyairtable import Api
from typing import List, Dict, Optional

load_dotenv()

AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
DONATIONS_TABLE_NAME = os.getenv("AIRTABLE_DONATIONS_TABLE_NAME", "Donations")

if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
    raise ValueError("AIRTABLE_API_KEY y AIRTABLE_BASE_ID deben estar definidos en el archivo .env")

DONATIONS_FIELDS = {"amount": "Amount", "date": "Date"}

class AirtableService:
    def __init__(self):
        self.api = Api(AIRTABLE_API_KEY)
        self.base = self.api.base(AIRTABLE_BASE_ID)
        self.donations_table = self.base.table(DONATIONS_TABLE_NAME)
        print("Servicio de Airtable inicializado correctamente.")

    def get_donations(self, start_utc: Optional[str] = None, end_utc: Optional[str] = None) -> List[Dict]:
        """
        Obtiene donaciones filtrando por un rango de fechas y horas en formato UTC.
        """
        try:
            formula_parts = []
            date_field = f"{{{DONATIONS_FIELDS['date']}}}"

            if start_utc:
                formula_parts.append(f"IS_AFTER({date_field}, DATETIME_PARSE('{start_utc}'))")
            if end_utc:
                formula_parts.append(f"IS_BEFORE({date_field}, DATETIME_PARSE('{end_utc}'))")

            formula = f"AND({', '.join(formula_parts)})" if formula_parts else ""
            
            all_donations = self.donations_table.all(formula=formula)
            
            return [
                {
                    "id": donation["id"],
                    "amount": donation.get("fields", {}).get(DONATIONS_FIELDS["amount"], 0),
                    "date": donation.get("fields", {}).get(DONATIONS_FIELDS["date"]),
                }
                for donation in all_donations
            ]
        except Exception as e:
            print(f"Error al obtener donaciones de Airtable: {e}")
            return []