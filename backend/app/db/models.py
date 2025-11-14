# --- File: backend/app/db/models.py ---
from sqlalchemy import Column, DateTime, Integer, String, Boolean, Text
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # ✅ CAMBIO: Reemplazamos 'email' por 'username'
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)

class ScheduledCampaign(Base):
    """
    Modelo para almacenar eventos del calendario de planificación de marketing.
    """
    __tablename__ = "scheduled_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    
    # --- Datos del Evento ---
    title = Column(String, nullable=False, default="Nueva Campaña") # Ej: "Secuencia de Verano"
    start_date = Column(DateTime, nullable=False, index=True)     # Fecha/hora de inicio
    end_date = Column(DateTime, nullable=False, index=True)       # Fecha/hora de fin
    
    # --- Categorización (Tus requisitos) ---
    category = Column(String, index=True, nullable=True) # Ej: "Big Campaigns", "NBC", "Unsubscribers"
    source_service = Column(String, default="Other")     # Ej: "Mailchimp", "Brevo", "Internal", "Other"
    
    # --- Detalles Adicionales ---
    notes = Column(Text, nullable=True)                  # Ej: "Secuencia de 5 emails. Email 1: Bienvenida..."
    
    # --- (Opcional) Enlace futuro al sistema interno ---
    # Lo dejamos comentado por ahora, pero listo para la Fase 2
    # internal_campaign_json_id = Column(String, nullable=True, index=True)