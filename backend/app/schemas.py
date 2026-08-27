# --- Archivo: backend/app/schemas.py ---
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any

class ContactCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None

class Contact(BaseModel):
    id: str
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

class CampaignStats(BaseModel):
    campaign_id: str
    name: str
    total_donations: float
    donors_count: int

class DashboardMetrics(BaseModel):
    total_donations: float
    daily_trend: List[Dict[str, float]]  # ej.: [{"date": "2025-07-09", "amount": 250.0}, ...]

# Modelos para la búsqueda unificada
class MailchimpDetail(BaseModel):
    email: str
    found: bool
    tags: List[str]
    error: Optional[str] = None

class BrevoDetail(BaseModel):
    email: str
    found: bool
    details: Dict[str, Any]
    error: Optional[str] = None

class AirtableSummary(BaseModel):
    total: float
    count: int
    first_date: Optional[str]
    last_date: Optional[str] = None
    largest: float = 0.0

class SearchResponse(BaseModel):
    email_searched: str
    contact: Dict[str, Any]
    airtable_summary: AirtableSummary
    mailchimp: List[MailchimpDetail]
    brevo: List[BrevoDetail]

# Modelos para Templates de Email
class TemplateCreate(BaseModel):
    name: str
    content: str
    design_json: Optional[str] = None

class TemplateResponse(BaseModel):
    id: int
    name: str
    content: str
    design_json: Optional[str] = None
    created_at: Any # DateTime

class TemplateListResponse(BaseModel):
    id: int
    name: str
    created_at: Any # DateTime

# Ventajas de este esquema:
# - Validación automática de datos entrantes y salientes.
# - Documentación OpenAPI generada sin esfuerzo.
# - Mejora el autocompletado y reduce errores de tipado.
