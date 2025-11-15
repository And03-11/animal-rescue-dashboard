# --- File: backend/app/db/models.py (Paso 1) ---
from sqlalchemy import Column, DateTime, Integer, String, Boolean, Text, ForeignKey # 👈 Importa ForeignKey
from sqlalchemy.orm import relationship # 👈 Importa relationship
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)

class ScheduledCampaign(Base):
    """
    Modelo para almacenar eventos del calendario de planificación de marketing.
    (La Campaña "Padre")
    """
    __tablename__ = "scheduled_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, default="Nueva Campaña")
    start_date = Column(DateTime, nullable=False, index=True)
    end_date = Column(DateTime, nullable=False, index=True)
    category = Column(String, index=True, nullable=True)
    notes = Column(Text, nullable=True)
    
    # --- ✅ NUEVA RELACIÓN ---
    # Esto le dice a SQLAlchemy que una Campaña puede tener muchos "emails"
    # y que si se borra la campaña, se borran sus emails en cascada.
    emails = relationship(
        "ScheduledEmail",
        back_populates="campaign",
        cascade="all, delete-orphan"
    )

# --- ✅ CLASE COMPLETAMENTE NUEVA ---
class ScheduledEmail(Base):
    """
    Modelo para los correos individuales DENTRO de una campaña.
    """
    __tablename__ = "scheduled_emails"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, default="Nuevo Email") # Ej: "Email 1: Bienvenida"
    
    send_at = Column(DateTime, nullable=False, index=True) # Hora y día exacto del envío
    
    # El servicio específico para ESTE email
    service = Column(String, nullable=False, default="Other", index=True) # "Mailchimp", "Brevo", "Automation"
    
    # ¡Aquí está tu seguimiento de estado!
    status = Column(String, nullable=False, default="pending", index=True) # "pending" o "sent"

    # Clave foránea para enlazar con la campaña padre
    campaign_id = Column(Integer, ForeignKey("scheduled_campaigns.id"), nullable=False, index=True)

    # --- ✅ NUEVA RELACIÓN ---
    # Enlace de vuelta a la campaña
    campaign = relationship("ScheduledCampaign", back_populates="emails")