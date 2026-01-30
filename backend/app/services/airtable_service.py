import os
from dotenv import load_dotenv
from fastapi import HTTPException
from pyairtable import Api
from typing import List, Dict, Optional, Any
from datetime import datetime, time, timedelta, date
from zoneinfo import ZoneInfo
from collections import defaultdict
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
DAILY_SUMMARIES_TABLE_NAME = os.getenv("AIRTABLE_DAILYSUMMARIES_TABLE_NAME", "Daily Summaries")

COSTA_RICA_TZ = ZoneInfo("America/Costa_Rica")


# --- Nombres de Campos ---
DONATIONS_FIELDS = {"amount": "Amount", "date": "Date", "form_title_link": "Form Title", "donor_link": "Donor"}
CAMPAIGNS_FIELDS = {"name": "Name", "source": "Source", "total_amount_rollup": "Total", "total_count_rollup": "Amount of donations"}
FORM_TITLES_FIELDS = {"name": "Name", "campaign_link": "Campaign", "donations_link": "Donations", "total_amount_rollup": "Total", "total_count_rollup": "Amount of donations"}
DONORS_FIELDS = {
    "name": "Name", 
    "last_name": "Last Name", 
    "emails_link": "Emails", 
    "donations_link": "Donations",
    "stage": "Stage",
    "funnel_stage": "Funnel Stage",
    "status": "Status"
}
EMAILS_FIELDS = {
    "email": "Email", 
    "donor": "Donor", 
    "not_sending": "Not Sending",
    "bounced_account": "Bounced Account",
    "region": "Region",
    "stage_from_donor": "Stage (from Donor)",
    "exclude_from_campaign": "Exclude From Current Campaign",
    "donor_name": "Name",
    "donor_last_name": "Last Name"
}
DAILY_SUMMARIES_FIELDS = {
    "date": "Date",
    "total_amount": "Total Amount Today",
    "count": "Donations Count Today"
}


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
        # --- INICIALIZAR NUEVA TABLA ---
        self.daily_summaries_table = self.base.table(DAILY_SUMMARIES_TABLE_NAME)

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
            
            # ✅ CORRECCIÓN: Añadimos 'createdTime' a la respuesta para cada campaña.
            # La librería pyairtable incluye este campo en el objeto 'rec' por defecto.
            return [
                {
                    "id": rec["id"], 
                    "name": rec.get("fields", {}).get(CAMPAIGNS_FIELDS["name"]),
                    "createdTime": rec.get("createdTime") # <-- AÑADIMOS ESTA LÍNEA
                } 
                for rec in records
            ]
        except Exception as e:
            print(f"Error getting campaigns for source {source}: {e}")
            return []

    def get_form_titles(self, campaign_id: Optional[str] = None) -> List[Dict]:
        try:
            # ✅ CAMBIO: Quitamos 'fields' para traer todos los datos, incluyendo 'createdTime'
            all_records = self.form_titles_table.all()
            
            if not campaign_id:
                # ✅ CAMBIO: Añadimos createdTime a la respuesta
                return [
                    {
                        "id": rec["id"],
                        "name": rec.get("fields", {}).get(FORM_TITLES_FIELDS["name"]),
                        "createdTime": rec.get("createdTime")
                    }
                    for rec in all_records
                ]
            
            filtered_records = []
            for rec in all_records:
                fields = rec.get("fields", {})
                linked_campaign_ids = fields.get(FORM_TITLES_FIELDS['campaign_link'], [])
                if linked_campaign_ids and campaign_id in linked_campaign_ids:
                    filtered_records.append(rec)
            
            # ✅ CAMBIO: Añadimos createdTime también aquí
            return [
                {
                    "id": rec["id"],
                    "name": rec.get("fields", {}).get(FORM_TITLES_FIELDS["name"]),
                    "createdTime": rec.get("createdTime")
                }
                for rec in filtered_records
            ]
        except Exception as e:
            print(f"¡ERROR en get_form_titles!: {e}")
            return []


         
    def get_donations_for_form_title(
        self,
        form_title_ids: List[str],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page_size: Optional[int] = 50, # PAGINACIÓN: Tamaño de página por defecto
        offset: Optional[int] = 0     # PAGINACIÓN: Offset inicial por defecto
    ) -> Dict[str, Any]: # PAGINACIÓN: Cambiar el tipo de retorno a un diccionario
        """
        Retrieves a paginated list of donations for given form titles,
        optionally filtered by date, and enriched with donor info.
        Returns a dictionary containing the list of donations for the page
        and the total count of donations matching the criteria.
        """
        try:
            if not form_title_ids:
                return {"donations": [], "total_count": 0} # PAGINACIÓN: Devolver estructura esperada

            # --- 1. Obtener TODOS los IDs de donaciones relevantes ---
            title_id_formulas = [f"RECORD_ID() = '{title_id}'" for title_id in form_title_ids]
            form_titles_records = self.form_titles_table.all(
                formula=f"OR({','.join(title_id_formulas)})",
                # Solo necesitamos el link a donaciones
                fields=[FORM_TITLES_FIELDS["donations_link"]]
            )

            if not form_titles_records:
                return {"donations": [], "total_count": 0}

            all_relevant_donation_ids = {
                donation_id
                for rec in form_titles_records
                for donation_id in rec.get("fields", {}).get(FORM_TITLES_FIELDS["donations_link"], [])
            }

            if not all_relevant_donation_ids:
                 return {"donations": [], "total_count": 0}

            # --- 2. Filtrar IDs por fecha (si aplica) y Ordenar ---
            id_formulas = [f"RECORD_ID() = '{id}'" for id in all_relevant_donation_ids]
            formula_parts = [f"OR({', '.join(id_formulas)})"]
            date_field = f"{{{DONATIONS_FIELDS['date']}}}"

            # Asegurar que el campo de fecha no esté vacío para el filtro y ordenamiento
            formula_parts.append(f"NOT({date_field} = BLANK())")

            if start_date:
                start_dt_local = datetime.combine(datetime.fromisoformat(start_date).date(), time.min, tzinfo=COSTA_RICA_TZ)
                formula_parts.append(f"IS_AFTER({date_field}, DATETIME_PARSE('{start_dt_local.isoformat()}'))")
            if end_date:
                end_date_obj = datetime.fromisoformat(end_date).date() + timedelta(days=1)
                end_dt_local = datetime.combine(end_date_obj, time.min, tzinfo=COSTA_RICA_TZ)
                formula_parts.append(f"IS_BEFORE({date_field}, DATETIME_PARSE('{end_dt_local.isoformat()}'))")

            final_formula = f"AND({', '.join(formula_parts)})"

            # Obtener solo IDs y Fechas, ordenados por fecha descendente
            donation_id_date_records = self.donations_table.all(
                formula=final_formula,
                fields=[DONATIONS_FIELDS["date"]], # Solo necesitamos la fecha para ordenar
                sort=[(f"-{DONATIONS_FIELDS['date']}")] # Ordenar descendente (más recientes primero)
            )

            # Extraer solo los IDs ordenados
            ordered_donation_ids = [rec['id'] for rec in donation_id_date_records]
            total_matching_donations = len(ordered_donation_ids) # PAGINACIÓN: Contar el total ANTES de paginar

            # --- 3. Aplicar Paginación (Slice de IDs) ---
            start_index = offset or 0
            end_index = start_index + (page_size or 50) # Usar default si no se provee
            ids_for_page = ordered_donation_ids[start_index:end_index]

            if not ids_for_page:
                 # Si no hay IDs para esta página (puede pasar si el offset es muy grande)
                 return {"donations": [], "total_count": total_matching_donations}

            # --- 4. Obtener Detalles Completos SOLO para los IDs de la página ---
            page_id_formulas = [f"RECORD_ID() = '{id}'" for id in ids_for_page]
            page_formula = f"OR({', '.join(page_id_formulas)})"
            fields_to_get_details = [DONATIONS_FIELDS["date"], DONATIONS_FIELDS["amount"], DONATIONS_FIELDS["donor_link"]]

            # Usamos get_all para asegurar el orden, aunque pyairtable debería respetarlo
            # con la fórmula OR(RECORD_ID()...). Si no, reordenaríamos después.
            page_donation_records = self.donations_table.all(formula=page_formula, fields=fields_to_get_details)

            # Mapear por ID para reordenar si es necesario (y para el enriquecimiento)
            page_donations_map = {rec['id']: rec for rec in page_donation_records}
            # Reordenar según el orden original de ids_for_page
            ordered_page_donation_records = [page_donations_map[id] for id in ids_for_page if id in page_donations_map]


            if not ordered_page_donation_records:
                return {"donations": [], "total_count": total_matching_donations}

            # --- 5. Enriquecer con Datos del Donante (lógica existente, aplicada a la página) ---
            donor_ids = {
                fields.get(DONATIONS_FIELDS["donor_link"], [None])[0]
                for rec in ordered_page_donation_records # Usar los records de la página
                if (fields := rec.get("fields")) and fields.get(DONATIONS_FIELDS["donor_link"])
            }
            # (El resto de la lógica de enriquecimiento con donor_info_map, email_map, etc., es igual)
            # ...
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

            email_id_formulas = [f"RECORD_ID() = '{id}'" for id in all_email_ids if id]
            email_records = self.emails_table.all(formula=f"OR({', '.join(email_id_formulas)})") if email_id_formulas else []
            email_map = {rec["id"]: rec.get("fields", {}).get(EMAILS_FIELDS["email"], "N/A") for rec in email_records}


            enriched_donations_page = []
            for d in ordered_page_donation_records: # Iterar sobre los records ordenados de la página
                fields = d.get("fields", {})
                donor_id = fields.get(DONATIONS_FIELDS["donor_link"], [None])[0]
                donor_info = donor_info_map.get(donor_id, {"name": "Unknown Donor", "email_id": None})
                donor_email = email_map.get(donor_info["email_id"], "N/A") if donor_info["email_id"] else "N/A"

                enriched_donations_page.append({
                    "id": d["id"],
                    "date": fields.get(DONATIONS_FIELDS["date"]),
                    "amount": fields.get(DONATIONS_FIELDS["amount"], 0),
                    "donorName": donor_info["name"],
                    "donorEmail": donor_email
                })

            # --- 6. Devolver Resultados Paginados ---
            return {
                "donations": enriched_donations_page,
                "total_count": total_matching_donations # PAGINACIÓN: Devolver el conteo total
            }

        except Exception as e:
            print(f"¡ERROR GRAVE en get_donations_for_form_title (paginado)!: {e}")
            traceback.print_exc()
            # Devolver error con la estructura esperada si es posible
            return {"donations": [], "total_count": 0, "error": str(e)}

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
        Estadísticas de campaña. Usa roll-ups si no hay filtro de fecha.
        Usa createdTime como start_date.
        """
        try:
            # --- Obtener Form Titles vinculados a la campaña ---
            # Pedimos campos básicos + rollups. createdTime viene por defecto.
            fields_to_get_base = [
                FORM_TITLES_FIELDS["name"],
                FORM_TITLES_FIELDS["campaign_link"],
            ]
            # Si no hay filtro de fecha, pedimos rollups. Si hay, pedimos link a donaciones.
            if not start_date and not end_date:
                 fields_to_get = fields_to_get_base + [
                     FORM_TITLES_FIELDS["total_amount_rollup"],
                     FORM_TITLES_FIELDS["total_count_rollup"],
                 ]
            else:
                 fields_to_get = fields_to_get_base + [FORM_TITLES_FIELDS["donations_link"]]

            all_title_records_raw = self.form_titles_table.all(fields=fields_to_get)

            # Filtrar por campaign_id
            form_titles_in_campaign_raw = [
                rec for rec in all_title_records_raw
                if campaign_id in rec.get("fields", {}).get(FORM_TITLES_FIELDS["campaign_link"], [])
            ]

            # Aplicar filtro opcional por form_title_ids
            if form_title_ids:
                target_ids = set(form_title_ids)
                form_titles_in_campaign_raw = [ft for ft in form_titles_in_campaign_raw if ft["id"] in target_ids]

            if not form_titles_in_campaign_raw:
                return {"campaign_total_amount": 0, "campaign_total_count": 0, "stats_by_form_title": []}

            # --- Procesar según si hay filtro de fecha o no ---
            stats_breakdown = []
            grand_total = 0.0
            grand_count = 0

            # OPTIMIZACIÓN: Rama SIN filtro de fecha (usa rollups y createdTime)
            if not start_date and not end_date:
                for ft_record in form_titles_in_campaign_raw:
                    fields = ft_record.get("fields", {})
                    amount = fields.get(FORM_TITLES_FIELDS["total_amount_rollup"], 0.0)
                    count = fields.get(FORM_TITLES_FIELDS["total_count_rollup"], 0)
                    creation_time = ft_record.get("createdTime") # Usar createdTime

                    if count > 0: # Incluir solo si hay donaciones según rollup
                        stats_breakdown.append({
                            "form_title_id": ft_record["id"],
                            "form_title_name": fields.get(FORM_TITLES_FIELDS["name"], ""),
                            "total_amount": float(amount),
                            "donation_count": count,
                            "start_date": creation_time # Campo renombrado
                        })
                        grand_total += float(amount)
                        grand_count += count

            # Rama CON filtro de fecha (calcula desde donaciones, pero usa createdTime)
            else:
                all_donation_ids = {
                    did
                    for ft in form_titles_in_campaign_raw
                    for did in ft.get("fields", {}).get(FORM_TITLES_FIELDS["donations_link"], [])
                }
                if not all_donation_ids: # Salir temprano si no hay donaciones vinculadas
                     return {"campaign_total_amount": 0, "campaign_total_count": 0, "stats_by_form_title": []}


                # Traer donaciones relevantes con fecha y monto
                id_formulas = [f"RECORD_ID()='{did}'" for did in all_donation_ids]
                donation_records = self.donations_table.all(
                    formula=f"OR({','.join(id_formulas)})",
                    fields=[DONATIONS_FIELDS["amount"], DONATIONS_FIELDS["date"]]
                )
                donations_map = {rec["id"]: rec["fields"] for rec in donation_records}

                s_date_obj = date.fromisoformat(start_date) if start_date else None
                e_date_obj = date.fromisoformat(end_date) if end_date else None

                for ft_record in form_titles_in_campaign_raw:
                    fields = ft_record.get("fields", {})
                    creation_time = ft_record.get("createdTime") # Usar createdTime
                    donation_ids_for_title = fields.get(FORM_TITLES_FIELDS["donations_link"], [])

                    donations_in_range = []
                    for did in donation_ids_for_title:
                        donation = donations_map.get(did)
                        if not donation: continue

                        donation_date_str = donation.get(DONATIONS_FIELDS["date"])
                        if not donation_date_str: continue

                        try:
                            donation_dt_aware = datetime.fromisoformat(donation_date_str.replace('Z', '+00:00'))
                            donation_date_obj = donation_dt_aware.astimezone(COSTA_RICA_TZ).date()

                            start_ok = not s_date_obj or donation_date_obj >= s_date_obj
                            end_ok = not e_date_obj or donation_date_obj <= e_date_obj

                            if start_ok and end_ok:
                                donations_in_range.append(donation)
                        except (ValueError, TypeError):
                            continue # Saltar fecha inválida

                    if donations_in_range: # Solo añadir si hay donaciones en el rango
                        total_amount = sum(d.get(DONATIONS_FIELDS["amount"], 0.0) for d in donations_in_range)
                        donation_count = len(donations_in_range)

                        stats_breakdown.append({
                            "form_title_id":   ft_record["id"],
                            "form_title_name": fields.get(FORM_TITLES_FIELDS["name"], ""),
                            "total_amount":    float(total_amount),
                            "donation_count":  donation_count,
                            "start_date":      creation_time # Campo renombrado
                        })
                        grand_total += float(total_amount)
                        grand_count += donation_count

            # Ordenar por fecha de creación
            stats_breakdown.sort(key=lambda x: x.get("start_date") or "9999", reverse=False)

            return {
                "campaign_total_amount": round(grand_total, 2),
                "campaign_total_count": grand_count,
                "stats_by_form_title": stats_breakdown
            }

        except Exception as e:
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Ocurrió un error al calcular las estadísticas de la campaña: {e}"
            )


    # OPTIMIZACIÓN: Modificamos get_source_stats para usar createdTime
    def get_source_stats(self, source: str, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Estadísticas agregadas para una 'source'. Usa roll-ups si no hay filtro de fecha.
        Usa createdTime como start_date.
        """
        try:
            # --- Obtener Campañas de la fuente ---
            campaign_formula = f"{{{CAMPAIGNS_FIELDS['source']}}} = '{source}'"
            fields_to_get = [CAMPAIGNS_FIELDS["name"]] # Base
            if not start_date and not end_date:
                 fields_to_get.extend([
                     CAMPAIGNS_FIELDS["total_amount_rollup"],
                     CAMPAIGNS_FIELDS["total_count_rollup"]
                 ])
            # createdTime viene por defecto si no especificamos fields, o podemos añadirlo explícitamente si es necesario

            campaign_records_raw = self.campaigns_table.all(formula=campaign_formula, fields=fields_to_get)

            if not campaign_records_raw:
                return {"source_total_amount": 0, "source_total_count": 0, "stats_by_campaign": []}

            # --- Procesar según si hay filtro de fecha o no ---
            stats_breakdown = []
            source_grand_total = 0.0
            source_grand_count = 0

            # OPTIMIZACIÓN: Rama SIN filtro de fecha (usa rollups y createdTime)
            if not start_date and not end_date:
                for camp_record in campaign_records_raw:
                    fields = camp_record.get("fields", {})
                    amount = fields.get(CAMPAIGNS_FIELDS["total_amount_rollup"], 0.0)
                    count = fields.get(CAMPAIGNS_FIELDS["total_count_rollup"], 0)
                    creation_time = camp_record.get("createdTime") # Usar createdTime

                    if count > 0: # Incluir solo si hay donaciones según rollup
                        stats_breakdown.append({
                            "campaign_id": camp_record["id"],
                            "campaign_name": fields.get(CAMPAIGNS_FIELDS["name"], ""),
                            "total_amount": float(amount),
                            "donation_count": count,
                            "start_date": creation_time # Campo renombrado
                        })
                        source_grand_total += float(amount)
                        source_grand_count += count

            # Rama CON filtro de fecha (llama a get_campaign_stats, que ya usa createdTime)
            else:
                 # Necesitamos los IDs para iterar, y AHORA TAMBIÉN EL NOMBRE para evitar N+1 calls
                 campaign_records_ids = self.campaigns_table.all(
                     formula=campaign_formula, 
                     fields=[CAMPAIGNS_FIELDS["name"]] # <-- Traemos el nombre aquí
                 )
                 campaign_map = {rec['id']: rec for rec in campaign_records_ids} # Mapeo ID -> Record

                 for campaign_id, camp_record in campaign_map.items():
                    # Llamamos a la versión ya modificada de get_campaign_stats
                    stats = self.get_campaign_stats(campaign_id, start_date, end_date)
                    
                    # YA NO hacemos una llamada extra por cada campaña. Usamos el dato que ya trajimos.
                    campaign_name = camp_record.get('fields', {}).get(CAMPAIGNS_FIELDS['name'], 'Unknown Campaign')


                    total_amount = stats.get("campaign_total_amount", 0.0)
                    donation_count = stats.get("campaign_total_count", 0)
                    creation_time = camp_record.get("createdTime") # Usar createdTime del record

                    if donation_count > 0: # Incluir solo si tiene donaciones en el rango
                        stats_breakdown.append({
                            "campaign_id": campaign_id,
                            "campaign_name": campaign_name,
                            "total_amount": float(total_amount),
                            "donation_count": donation_count,
                            "start_date": creation_time # Campo renombrado
                        })
                        source_grand_total += float(total_amount)
                        source_grand_count += donation_count

            # Ordenar por fecha de creación
            stats_breakdown.sort(key=lambda x: x.get("start_date") or "9999", reverse=False)

            return {
                "source_total_amount": round(source_grand_total, 2),
                "source_total_count": source_grand_count,
                "stats_by_campaign": stats_breakdown,
            }

        except Exception as e:
            print(f"Error grave en get_source_stats: {e}")
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail="Ocurrió un error al calcular las estadísticas de la fuente."
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

   

    def get_campaign_donations(
        self,
        campaign_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page_size: Optional[int] = 50, # PAGINACIÓN: Añadir params
        offset: Optional[int] = 0     # PAGINACIÓN: Añadir params
    ) -> Dict[str, Any]: # PAGINACIÓN: Cambiar tipo de retorno
        """Reúne los form_title_ids de la campaña y reutiliza get_donations_for_form_title (paginado)."""
        try:
            # (Obtener form_title_ids como antes)
            title_records = self.form_titles_table.all(
                fields=[FORM_TITLES_FIELDS["campaign_link"]] # Solo necesitamos el link
            )
            form_title_ids: List[str] = [
                 rec["id"] for rec in title_records
                 if campaign_id in rec.get("fields", {}).get(FORM_TITLES_FIELDS["campaign_link"], [])
             ]

            if not form_title_ids:
                return {"donations": [], "total_count": 0}

            # Reusar la lógica existente (ahora paginada)
            # PAGINACIÓN: Pasar page_size y offset
            return self.get_donations_for_form_title(
                form_title_ids=form_title_ids,
                start_date=start_date,
                end_date=end_date,
                page_size=page_size,
                offset=offset
            )
        except Exception as e:
            print(f"Error in get_campaign_donations (paginado): {e}")
            return {"donations": [], "total_count": 0, "error": str(e)}
    
    def get_source_donations(
        self,
        source_name: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page_size: Optional[int] = 50,
        offset: Optional[int] = 0
    ) -> Dict[str, Any]:
        """Get donations for all campaigns in a source (fallback to Airtable)."""
        try:
            # Get all campaigns for this source
            campaign_records = self.campaigns_table.all(fields=[CAMPAIGNS_FIELDS["source"]])
            campaign_ids = [
                rec["id"] for rec in campaign_records
                if rec.get("fields", {}).get(CAMPAIGNS_FIELDS["source"]) == source_name
            ]
            
            if not campaign_ids:
                return {"donations": [], "total_count": 0}
            
            # Get all form_title_ids for these campaigns
            title_records = self.form_titles_table.all(fields=[FORM_TITLES_FIELDS["campaign_link"]])
            form_title_ids: List[str] = []
            for rec in title_records:
                campaign_links = rec.get("fields", {}).get(FORM_TITLES_FIELDS["campaign_link"], [])
                if any(cid in campaign_links for cid in campaign_ids):
                    form_title_ids.append(rec["id"])
            
            if not form_title_ids:
                return {"donations": [], "total_count": 0}
            
            # Reuse existing pagination logic
            return self.get_donations_for_form_title(
                form_title_ids=form_title_ids,
                start_date=start_date,
                end_date=end_date,
                page_size=page_size,
                offset=offset
            )
        except Exception as e:
            print(f"Error in get_source_donations (Airtable fallback): {e}")
            return {"donations": [], "total_count": 0, "error": str(e)}

        

    # --- NUEVA FUNCIÓN ---
    def get_daily_summaries(self, start_date: Optional[date] = None, end_date: Optional[date] = None) -> List[Dict[str, Any]]:
        """
        Obtiene los registros de resumen diario desde Airtable, filtrados por un rango de fechas.
        """
        try:
            formula_parts = []
            # Accede a los nombres de campo usando el diccionario DAILY_SUMMARIES_FIELDS
            date_field = f"{{{DAILY_SUMMARIES_FIELDS['date']}}}"
            total_amount_field = DAILY_SUMMARIES_FIELDS['total_amount']
            count_field = DAILY_SUMMARIES_FIELDS['count']

            # Construir fórmula de filtro de fecha
            if start_date:
                start_str = start_date.isoformat()
                formula_parts.append(f"OR(IS_SAME({date_field}, DATETIME_PARSE('{start_str}', 'YYYY-MM-DD'), 'day'), IS_AFTER({date_field}, DATETIME_PARSE('{start_str}', 'YYYY-MM-DD')))")
            if end_date:
                end_str = end_date.isoformat()
                formula_parts.append(f"OR(IS_SAME({date_field}, DATETIME_PARSE('{end_str}', 'YYYY-MM-DD'), 'day'), IS_BEFORE({date_field}, DATETIME_PARSE('{end_str}', 'YYYY-MM-DD')))")

            formula = f"AND({', '.join(formula_parts)})" if formula_parts else None

            # Campos a obtener
            fields_to_get = [
                DAILY_SUMMARIES_FIELDS["date"],
                total_amount_field,
                count_field
            ]

            print(f"Consultando Daily Summaries con fórmula: {formula}") # Para depuración
            records = self.daily_summaries_table.all(formula=formula, fields=fields_to_get)

            # Mapear los resultados
            results = []
            for rec in records:
                fields = rec.get("fields", {})
                record_date_str = fields.get(DAILY_SUMMARIES_FIELDS["date"]) # Viene como 'YYYY-MM-DD'
                if record_date_str:
                    results.append({
                        "date": record_date_str, # String YYYY-MM-DD
                        "total": fields.get(total_amount_field, 0),
                        "count": fields.get(count_field, 0)
                    })

            results.sort(key=lambda x: x["date"]) # Ordenar por fecha
            print(f"Obtenidos {len(results)} registros de Daily Summaries.") # Para depuración
            return results

        except Exception as e:
            print(f"Error en get_daily_summaries: {e}")
            traceback.print_exc()
            return [] # fallback seguro
        

    def get_campaign_contacts(self, region: str, is_bounced: bool, segment: str = "standard") -> List[Dict[str, Any]]:
        """
        Obtiene contactos directamente de la tabla Emails, usando los campos de lookup.
        Optimizado para usar 'Name' y 'Last Name' (Lookups) directamente.
        
        Args:
            region: Región del donante (ej. 'USA', 'EUR').
            is_bounced: Si True, busca emails rebotados. Si False, no rebotados.
            segment: 'standard' (excluye marcados) o 'dnr' (solo marcados).
            
        Devuelve una lista de diccionarios con 'Email' y 'Name' del donante.
        """
        # Nombres de campos en la tabla Emails
        email_field = EMAILS_FIELDS.get("email", "Email")
        # Usamos los campos Lookup que ya existen en la tabla Emails
        donor_first_name_field = EMAILS_FIELDS.get("donor_name", "Name") 
        donor_last_name_field = EMAILS_FIELDS.get("donor_last_name", "Last Name")
        
        bounced_field = EMAILS_FIELDS.get("bounced_account", "Bounced Account")
        not_sending_field = EMAILS_FIELDS.get("not_sending", "Not Sending")
        region_field = EMAILS_FIELDS.get("region", "Region")
        stage_field = EMAILS_FIELDS.get("stage_from_donor", "Stage (from Donor)")
        exclude_field = EMAILS_FIELDS.get("exclude_from_campaign", "Exclude From Current Campaign")

        try:
            # --- Construir fórmula directamente para la tabla Emails ---
            formula_parts = [
                f"{{{region_field}}} = '{region}'",
                f"{{{stage_field}}} = 'Big Campaign'",
                f"NOT({{{not_sending_field}}} = 1)"  # Siempre excluir "Not Sending"
            ]
            
            # Condición de Bounced Account
            if is_bounced:
                formula_parts.append(f"{{{bounced_field}}} = 1")
                print("Buscando emails rebotados.")
            else:
                formula_parts.append(f"NOT({{{bounced_field}}} = 1)")
                print("Excluyendo emails rebotados.")
            
            # Lógica de Segmento (Exclude From Current Campaign)
            if segment == "dnr":
                # DNR: Solo los que TIENEN el check marcado
                formula_parts.append(f"{{{exclude_field}}} = 1")
                print("Segmento DNR seleccionado: Buscando donantes excluidos.")
            else:
                # Standard (default): Solo los que NO tienen el check marcado
                formula_parts.append(f"NOT({{{exclude_field}}} = 1)")
                print("Segmento Standard seleccionado: Excluyendo donantes marcados.")

            email_formula = f"AND({', '.join(formula_parts)})"
            print(f"Airtable formula for Emails: {email_formula}")

            # --- Consultar directamente la tabla Emails ---
            # Pedimos Email y Name (Lookup) - Last Name ya no es necesario
            email_records = self.emails_table.all(
                formula=email_formula, 
                fields=[email_field, donor_first_name_field]
            )

            # --- Preparar la lista final ---
            contact_list = []
            for rec in email_records:
                fields = rec.get('fields', {})
                email_address = fields.get(email_field)
                
                if email_address:
                    # Extraer First Name (Lookup -> Lista)
                    first_name_raw = fields.get(donor_first_name_field)
                    first_name = ""
                    if isinstance(first_name_raw, list) and first_name_raw:
                        first_name = str(first_name_raw[0]).strip()
                    elif isinstance(first_name_raw, str):
                        first_name = first_name_raw.strip()
                        
                    # Usar solo el First Name (o fallback)
                    final_name = first_name or "Valued Supporter"
                    
                    contact_list.append({
                        "Email": email_address,
                        "Name": final_name
                    })

            print(f"Found {len(contact_list)} emails matching all criteria.")
            return contact_list

        except Exception as e:
            print(f"Error getting campaign contacts from Airtable: {e}")
            traceback.print_exc()
            return []
    
    def get_monthly_source_breakdown(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Calcula el desglose de donaciones por fuente para un rango de fechas.
        Estrategia eficiente:
        1. Obtener Donaciones en el rango (con link a Form Title).
        2. Obtener TODOS los Form Titles (con link a Campaign).
        3. Obtener TODAS las Campañas (con Source).
        4. Mapear en memoria.
        """
        try:
            # 1. Obtener Donaciones en el rango
            date_field = f"{{{DONATIONS_FIELDS['date']}}}"
            start_str = start_date.isoformat()
            # Sumamos 1 día al end_date para incluirlo completo (Airtable a veces es tricky con tiempos)
            end_plus_one = end_date + timedelta(days=1)
            end_str = end_plus_one.isoformat()

            formula = f"AND(IS_AFTER({date_field}, DATETIME_PARSE('{start_str}', 'YYYY-MM-DD')), IS_BEFORE({date_field}, DATETIME_PARSE('{end_str}', 'YYYY-MM-DD')))"
            
            donations = self.donations_table.all(
                formula=formula,
                fields=[DONATIONS_FIELDS["amount"], DONATIONS_FIELDS["form_title_link"]]
            )

            print(f"DEBUG: Found {len(donations)} donations for date range {start_str} to {end_str}")

            if not donations:
                return {"total_amount": 0, "breakdown": []}

            # 2. Obtener TODOS los Form Titles (son pocos, cacheable en teoría, pero rápido de traer)
            form_titles = self.form_titles_table.all(
                fields=[FORM_TITLES_FIELDS["campaign_link"]]
            )
            print(f"DEBUG: Found {len(form_titles)} form titles")
            
            # Mapa: FormTitle ID -> Campaign ID
            ft_to_campaign = {}
            for ft in form_titles:
                campaign_links = ft.get("fields", {}).get(FORM_TITLES_FIELDS["campaign_link"], [])
                if campaign_links:
                    ft_to_campaign[ft["id"]] = campaign_links[0]

            print(f"DEBUG: Mapped {len(ft_to_campaign)} form titles to campaigns")

            # 3. Obtener TODAS las Campañas
            campaigns = self.campaigns_table.all(
                fields=[CAMPAIGNS_FIELDS["source"]]
            )
            print(f"DEBUG: Found {len(campaigns)} campaigns")
            
            # Mapa: Campaign ID -> Source
            campaign_to_source = {}
            for camp in campaigns:
                source = camp.get("fields", {}).get(CAMPAIGNS_FIELDS["source"])
                if source:
                    campaign_to_source[camp["id"]] = source

            print(f"DEBUG: Mapped {len(campaign_to_source)} campaigns to sources")

            # 4. Procesar donaciones y agrupar por fuente
            source_totals = defaultdict(float)
            total_amount = 0

            for donation in donations:
                fields = donation.get("fields", {})
                amount = fields.get(DONATIONS_FIELDS["amount"], 0)
                total_amount += amount

                ft_links = fields.get(DONATIONS_FIELDS["form_title_link"], [])
                
                source_name = "Others" # Default

                if ft_links:
                    ft_id = ft_links[0]
                    campaign_id = ft_to_campaign.get(ft_id)
                    if campaign_id:
                        found_source = campaign_to_source.get(campaign_id)
                        if found_source:
                            source_name = found_source
                
                # Mapeo de nombres de Airtable a nombres de display
                source_mapping = {
                    "Funnel": "New Comers",
                    "Big Campaign": "Big Campaigns"
                }
                source_name = source_mapping.get(source_name, source_name)
                
                # Normalizar nombres de fuentes si es necesario
                if source_name not in ["Big Campaigns", "Facebook", "New Comers"]:
                    source_name = "Others"

                source_totals[source_name] += amount

            # 5. Construir el breakdown con porcentajes
            breakdown = []
            for source, amount in source_totals.items():
                percentage = round((amount / total_amount * 100), 2) if total_amount > 0 else 0
                breakdown.append({
                    "name": source,
                    "value": round(amount, 2),
                    "percentage": percentage
                })

            return {
                "total_amount": round(total_amount, 2),
                "breakdown": breakdown
            }

        except Exception as e:
            print(f"Error en get_monthly_source_breakdown: {e}")
            traceback.print_exc()
            return {"total_amount": 0, "breakdown": []}



    def get_funnel_stats(self) -> Dict[str, Any]:
        """
        Calcula estadísticas del funnel y aprobaciones pendientes basado en filtros de Airtable.
        """
        try:
            records = self.donors_table.all()

            total_funnel = 0
            pending_approvals = 0
            stage_breakdown = defaultdict(int)

            for rec in records:
                fields = rec.get("fields", {})
                
                stage = fields.get("Stage")
                status = fields.get("Status")
                region = fields.get("Region")
                funnel_stage = fields.get("Funnel Stage")

                # 1. PENDING APPROVAL FILTER
                # Where Stage is Pending Approval AND Region is not empty 
                # AND Status is not Final Check AND Status is not Potential Duplicate
                if stage == "Pending Approval":
                     if region: # Check if not empty/None
                         if status != "Final Check" and status != "Potential Duplicate":
                             pending_approvals += 1

                # 2. FUNNEL FILTER
                # Where Stage is Funnel AND Status is not Unsubscribed
                if stage == "Funnel":
                    if status != "Unsubscribed":
                        # Add to total funnel count
                        total_funnel += 1
                        
                        # Breakdown by Funnel Stage
                        # If Funnel Stage is present, use it. Otherwise 'Unknown'.
                        if funnel_stage:
                            # Handle list if it comes as lookup (though usually string/list of strings)
                            val = str(funnel_stage)
                            if isinstance(funnel_stage, list) and len(funnel_stage) > 0:
                                val = str(funnel_stage[0])
                            
                            stage_breakdown[val] += 1
                        else:
                            # Optional: Track those without funnel stage?
                            # stage_breakdown["(No Funnel Stage)"] += 1
                            pass

            # Format Breakdown
            breakdown_list = [
                {"name": k, "count": v} for k, v in stage_breakdown.items()
            ]
            
            # Ordenar numéricamente (Natural Sort) para que Stage 10 vaya después de Stage 9, no después de Stage 1.
            def sort_stages(item):
                name = item["name"]
                import re
                # Buscar patrón "(Stage X)"
                match = re.search(r"\(Stage\s*(\d+)\)", name, re.IGNORECASE)
                if match:
                    # Retornar tupla: (orden numérico, nombre original)
                    return (int(match.group(1)), name)
                # Si no tiene patrón, ponlo al final ordenado alfabéticamente
                return (9999, name)

            breakdown_list.sort(key=sort_stages)

            return {
                "total_funnel": total_funnel,
                "pending_approvals": pending_approvals,
                "stage_breakdown": breakdown_list
            }

        except Exception as e:
            print(f"Error en get_funnel_stats: {e}")
            traceback.print_exc()
            return {
                "total_funnel": 0,
                "pending_approvals": 0,
                "stage_breakdown": []
            }

airtable_service_instance = AirtableService()

def get_airtable_service():
    return airtable_service_instance

    


    


