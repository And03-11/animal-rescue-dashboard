import os
from dotenv import load_dotenv
from fastapi import HTTPException
from pyairtable import Api
from typing import List, Dict, Optional, Any
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
import traceback

dotenv_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path=os.path.abspath(dotenv_path))

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


# --- Nombres de Campos ---
DONATIONS_FIELDS = {"amount": "Amount", "date": "Date", "form_title_link": "Form Title", "donor_link": "Donor"}
CAMPAIGNS_FIELDS = {"name": "Name", "source": "Source"}
FORM_TITLES_FIELDS = {"name": "Name", "campaign_link": "Campaign", "donations_link": "Donations"}
DONORS_FIELDS = {"name": "Name", "last_name": "Last Name", "emails_link": "Emails", "donations_link": "Donations"}
EMAILS_FIELDS = {"email": "Email"}


class AirtableService:
    def __init__(self):
        if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
            raise ValueError("AIRTABLE_API_KEY y AIRTABLE_BASE_ID deben estar definidos en el archivo .env")

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


         
    def get_donations_for_form_title(self, form_title_ids: List[str], start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict]:
        """
        Retrieves donations for a list of form titles and enriches them with donor name and email.
        """
        try:
            if not form_title_ids:
                return []
            
            title_id_formulas = [f"RECORD_ID() = '{title_id}'" for title_id in form_title_ids]
            form_titles_records = self.form_titles_table.all(formula=f"OR({','.join(title_id_formulas)})")
            
            if not form_titles_records:
                return []

            donation_ids = {
                donation_id
                for rec in form_titles_records
                for donation_id in rec.get("fields", {}).get(FORM_TITLES_FIELDS["donations_link"], [])
            }

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
            traceback.print_exc()
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
        
    def get_donations_with_donor_info(self) -> List[Dict]:
        """
        Obtiene todas las donaciones y las enriquece con el nombre y email del donante.
        Esta función es más completa que get_donations() y es ideal para reportes.
        """
        try:
            # 1. Obtener todas las donaciones con el enlace al donante
            donation_records = self.donations_table.all(
                fields=[DONATIONS_FIELDS["amount"], DONATIONS_FIELDS["donor_link"], DONATIONS_FIELDS["date"]]
            )

            if not donation_records:
                return []

            # 2. Mapear donaciones y recopilar IDs de donantes
            donor_ids = {
                rec["fields"][DONATIONS_FIELDS["donor_link"]][0]
                for rec in donation_records
                if DONATIONS_FIELDS["donor_link"] in rec.get("fields", {}) and rec["fields"][DONATIONS_FIELDS["donor_link"]]
            }

            if not donor_ids:
                return [
                    {**d.get("fields", {}), "name": "Anonymous", "email": None}
                    for d in donation_records
                ]

            # 3. Obtener los donantes y sus emails en bloque para eficiencia
            donor_map = {donor["id"]: donor["fields"] for donor in self.donors_table.all() if donor["id"] in donor_ids}
            email_ids = {
                email_id
                for donor in donor_map.values()
                for email_id in donor.get(DONORS_FIELDS["emails_link"], [])
            }
            email_map = {email["id"]: email["fields"] for email in self.emails_table.all() if email["id"] in email_ids}

            # 4. Unir toda la información
            enriched_donations = []
            for rec in donation_records:
                fields = rec.get("fields", {})
                donor_id_list = fields.get(DONATIONS_FIELDS["donor_link"], [])
                donor_id = donor_id_list[0] if donor_id_list else None
                
                donor_info = donor_map.get(donor_id, {})
                name = f"{donor_info.get(DONORS_FIELDS['name'], '')} {donor_info.get(DONORS_FIELDS['last_name'], '')}".strip() or "Anonymous"
                
                email_id_list = donor_info.get(DONORS_FIELDS['emails_link'], [])
                email_id = email_id_list[0] if email_id_list else None
                email_info = email_map.get(email_id, {})
                email = email_info.get(EMAILS_FIELDS['email'])

                enriched_donations.append({
                    "amount": fields.get(DONATIONS_FIELDS["amount"], 0),
                    "name": name,
                    "email": email,
                })
            return enriched_donations
        except Exception as e:
            print(f"Error en get_donations_with_donor_info: {e}")
            return []
        


        # En backend/app/services/airtable_service.py

    # En backend/app/services/airtable_service.py, reemplaza ÚNICAMENTE esta función:

    def get_campaign_stats(self, campaign_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None, form_title_ids: Optional[List[str]] = None) -> Dict[str, Any]:
            """
            Estadísticas de campaña, opcionalmente filtradas por form_title_ids.
            ✅ NUEVA VERSIÓN: Ahora incluye la fecha de la primera donación para cada Form Title.
            """
            try:
                # --- Paso 1: Obtener todos los form-titles de la campaña (sin cambios) ---
                title_records = self.form_titles_table.all(
                    fields=[
                        FORM_TITLES_FIELDS["name"],
                        FORM_TITLES_FIELDS["campaign_link"],
                        FORM_TITLES_FIELDS["donations_link"],
                    ]
                )
                form_titles = [
                    rec for rec in title_records 
                    if campaign_id in rec.get("fields", {}).get(FORM_TITLES_FIELDS["campaign_link"], [])
                ]

                if form_title_ids:
                    form_titles = [ft for ft in form_titles if ft["id"] in form_title_ids]

                if not form_titles:
                    return {"campaign_total_amount": 0, "campaign_total_count": 0, "stats_by_form_title": []}

                # --- Paso 2: Obtener TODAS las donaciones y agruparlas (lógica mejorada) ---
                all_donation_ids = {
                    did 
                    for ft in form_titles 
                    for did in ft.get("fields", {}).get(FORM_TITLES_FIELDS["donations_link"], [])
                }
                if not all_donation_ids:
                    return {"campaign_total_amount": 0, "campaign_total_count": 0, "stats_by_form_title": []}

                # Traemos las donaciones con su fecha y monto
                id_formulas = [f"RECORD_ID()='{did}'" for did in all_donation_ids]
                donation_records = self.donations_table.all(
                    formula=f"OR({','.join(id_formulas)})",
                    fields=[DONATIONS_FIELDS["amount"], DONATIONS_FIELDS["date"]]
                )
                
                # Mapeamos donaciones por su ID para acceso rápido
                donations_map = {
                    rec["id"]: rec["fields"] for rec in donation_records
                }

                # --- Paso 3: Calcular estadísticas y encontrar la fecha de la primera donación ---
                stats = []
                grand_total = 0
                grand_count = 0

                for ft in form_titles:
                    donation_ids_for_title = ft.get("fields", {}).get(FORM_TITLES_FIELDS["donations_link"], [])
                    
                    # Filtramos las donaciones relevantes para este form title
                    relevant_donations = [donations_map[did] for did in donation_ids_for_title if did in donations_map and donations_map[did].get(DONATIONS_FIELDS["date"])]

                    # Aplicamos el filtro de fecha del usuario (start_date/end_date)
                    donations_in_range = []
                    if relevant_donations:
                        for d in relevant_donations:
                            donation_dt = datetime.fromisoformat(d[DONATIONS_FIELDS["date"]].replace('Z', '+00:00')).astimezone(COSTA_RICA_TZ).date()
                            s_date = datetime.fromisoformat(start_date).date() if start_date else None
                            e_date = datetime.fromisoformat(end_date).date() if end_date else None
                            
                            if (not s_date or donation_dt >= s_date) and (not e_date or donation_dt <= e_date):
                                donations_in_range.append(d)

                    if not donations_in_range:
                        continue

                    total_amount = sum(d.get(DONATIONS_FIELDS["amount"], 0) for d in donations_in_range)
                    donation_count = len(donations_in_range)
                    
                    # ✅ LÓGICA CLAVE: Encontrar la fecha más antigua entre las donaciones relevantes
                    first_donation_date = min(d[DONATIONS_FIELDS["date"]] for d in relevant_donations)

                    stats.append({
                        "form_title_id":   ft["id"],
                        "form_title_name": ft.get("fields", {}).get(FORM_TITLES_FIELDS["name"], ""),
                        "total_amount":    total_amount,
                        "donation_count":  donation_count,
                        "date_sent": first_donation_date # Usamos el nuevo campo
                    })
                    grand_total += total_amount
                    grand_count += donation_count

                # Ordenar por la fecha de envío
                stats.sort(key=lambda x: x["date_sent"], reverse=False)
                
                return {
                    "campaign_total_amount": grand_total,
                    "campaign_total_count":  grand_count,
                    "stats_by_form_title":   stats
                }

            except Exception as e:
                traceback.print_exc()
                raise HTTPException(
                    status_code=500,
                    detail=f"Ocurrió un error al calcular las estadísticas de la campaña: {e}"
                )
        



    def autocomplete_email(self, query: str) -> List[str]:
        """
        Busca en Airtable los emails que comienzan con el texto de la consulta.
        Es case-insensitive y está limitado a 10 resultados para ser eficiente.
        """
        if not query:
            return []
        try:
            # Esta fórmula busca si la consulta (en minúsculas) se encuentra
            # al inicio del campo de email (también en minúsculas).
            formula = f"SEARCH(LOWER('{query}'), LOWER({{{EMAILS_FIELDS['email']}}})) = 1"
            
            records = self.emails_table.all(
                formula=formula,
                fields=[EMAILS_FIELDS["email"]],
                max_records=10
            )
            
            return [
                rec.get("fields", {}).get(EMAILS_FIELDS["email"]) 
                for rec in records 
                if "fields" in rec and rec.get("fields", {}).get(EMAILS_FIELDS["email"])
            ]
        except Exception as e:
            # Si hay un error con la fórmula o la conexión, no rompemos la app,
            # simplemente no devolvemos sugerencias.
            print(f"Error en autocomplete_email de Airtable: {e}")
            return []
        

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

    # --- ✅ AÑADE ESTA NUEVA FUNCIÓN ---
    def get_source_stats(self, source: str, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Calcula las estadísticas agregadas para una 'source' completa
        y las desglosa por campaña, aplicando un filtro de fecha opcional.
        """
        try:
            # 1. Encontrar todas las campañas para la 'source' dada.
            campaign_formula = f"{{{CAMPAIGNS_FIELDS['source']}}} = '{source}'"
            campaign_records = self.campaigns_table.all(formula=campaign_formula)
            campaign_ids = {rec['id'] for rec in campaign_records}

            if not campaign_ids:
                return {
                    "source_total_amount": 0,
                    "source_total_count": 0,
                    "stats_by_campaign": []
                }

            # 2. Obtener estadísticas para CADA campaña de forma concurrente (más eficiente en un futuro)
            # Por ahora, lo hacemos secuencialmente para simplicidad.
            stats_by_campaign = []
            source_grand_total = 0
            source_grand_count = 0

            for campaign_id in campaign_ids:
                # Reutilizamos la lógica de `get_campaign_stats` para cada campaña
                # Pasamos los filtros de fecha para que cada total sea correcto.
                stats = self.get_campaign_stats(campaign_id, start_date, end_date)
                
                campaign_name = next((c['fields'].get(CAMPAIGNS_FIELDS['name']) for c in campaign_records if c['id'] == campaign_id), 'Unknown Campaign')
                
                total_amount = stats.get("campaign_total_amount", 0)
                donation_count = stats.get("campaign_total_count", 0)

                # Solo incluimos campañas que tienen donaciones en el período seleccionado
                if donation_count > 0:
                    stats_by_campaign.append({
                        "campaign_id": campaign_id,
                        "campaign_name": campaign_name,
                        "total_amount": total_amount,
                        "donation_count": donation_count,
                    })
                
                source_grand_total += total_amount
                source_grand_count += donation_count

            # Ordenar por monto total descendente para el gráfico
            stats_by_campaign.sort(key=lambda x: x['total_amount'], reverse=True)
            
            return {
                "source_total_amount": round(source_grand_total, 2),
                "source_total_count": source_grand_count,
                "stats_by_campaign": stats_by_campaign,
            }

        except Exception as e:
            print(f"Error grave en get_source_stats: {e}")
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail="Ocurrió un error al calcular las estadísticas de la fuente."
            )
        

    def get_campaign_donations(
        self,
        campaign_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict]:
        """Reúne los form_title_ids de la campaña y reutiliza get_donations_for_form_title.
        Por qué: evita duplicar lógica de enriquecimiento (donorName, donorEmail)."""
        try:
            # Traer títulos con enlaces mínimos
            title_records = self.form_titles_table.all(
                fields=[
                    FORM_TITLES_FIELDS["campaign_link"],
                    FORM_TITLES_FIELDS["donations_link"],
                ]
            )

            form_title_ids: List[str] = []
            for rec in title_records:
                fields = rec.get("fields", {})
                if campaign_id in fields.get(FORM_TITLES_FIELDS["campaign_link"], []):
                    form_title_ids.append(rec["id"])

            if not form_title_ids:
                return []

            # Reusar la lógica existente (maneja fechas + enriquecimiento con donor)
            return self.get_donations_for_form_title(
                form_title_ids=form_title_ids,
                start_date=start_date,
                end_date=end_date,
            )
        except Exception as e:
            # Por qué: fallback silencioso para no tumbar la API en errores de terceros
            print(f"Error in get_campaign_donations: {e}")
            return []
        
airtable_service_instance = AirtableService()

def get_airtable_service():
    return airtable_service_instance

    


    
