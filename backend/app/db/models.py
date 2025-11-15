# --- File: backend/app/db/models.py (MODIFICADO) ---
from sqlalchemy import Column, DateTime, Integer, String, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)


class ScheduledCampaign(Base):
    """
    NIVEL 1: La Campaña "Padre".
    """
    __tablename__ = "scheduled_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, default="Nueva Campaña")
    start_date = Column(DateTime, nullable=False, index=True)
    end_date = Column(DateTime, nullable=False, index=True)
    category = Column(String, index=True, nullable=True) 
    notes = Column(Text, nullable=True)
    segmentation_mode = Column(String, nullable=True, default="bc") 

    emails = relationship(
        "CampaignEmail",
        back_populates="campaign",
        cascade="all, delete-orphan"
    )

class CampaignEmail(Base):
    """
    NIVEL 2: El "Email Conceptual" o Contenido.
    """
    __tablename__ = "campaign_emails"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, default="Nuevo Email")
    
    # --- ✅ CAMBIOS AQUÍ ---
    subject = Column(String, nullable=True)
    button_name = Column(String, nullable=True) # ✅ AÑADIDO
    # html_body = Column(Text, nullable=True) # ✅ ELIMINADO
    # --- FIN DE CAMBIOS ---
    
    link_donation = Column(String, nullable=True)
    link_contact_us = Column(String, nullable=True)
    custom_links = Column(Text, nullable=True) 
    
    campaign_id = Column(Integer, ForeignKey("scheduled_campaigns.id"), nullable=False, index=True)
    campaign = relationship("ScheduledCampaign", back_populates="emails")
    
    sends = relationship(
        "ScheduledSend",
        back_populates="email",
        cascade="all, delete-orphan"
    )

class ScheduledSend(Base):
    """
    NIVEL 3: El "Envío Programado"
    """
    __tablename__ = "scheduled_sends"

    id = Column(Integer, primary_key=True, index=True)
    send_at = Column(DateTime, nullable=False, index=True) 
    service = Column(String, nullable=False, default="Other", index=True) 
    status = Column(String, nullable=False, default="pending", index=True)
    segment_tag = Column(String, nullable=True, index=True) 

    campaign_email_id = Column(Integer, ForeignKey("campaign_emails.id"), nullable=False, index=True)
    email = relationship("CampaignEmail", back_populates="sends")