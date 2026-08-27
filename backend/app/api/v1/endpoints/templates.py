# --- File: backend/app/api/v1/endpoints/templates.py ---
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, load_only
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Optional
from pydantic import BaseModel

from backend.app.db.database import get_db
from backend.app.db.models import EmailTemplate
from backend.app.schemas import TemplateCreate, TemplateListResponse, TemplateResponse
from backend.app.services.gmail_service import GmailService
from backend.app.services.credentials_manager import credentials_manager_instance
from backend.app.core.security import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    design_json: Optional[str] = None


class SendTestRequest(BaseModel):
    emails: List[str]
    subject: str = "Test Email"


@router.get("/templates", response_model=List[TemplateListResponse])
def get_templates(db: Session = Depends(get_db)):
    """
    Retrieve all saved email templates.
    """
    try:
        return (
            db.query(EmailTemplate)
            .options(load_only(EmailTemplate.id, EmailTemplate.name, EmailTemplate.created_at))
            .order_by(EmailTemplate.created_at.desc())
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Template database is unavailable. Check the database connection and try again.",
        ) from exc


@router.get("/templates/{template_id}", response_model=TemplateResponse)
def get_template(template_id: int, db: Session = Depends(get_db)):
    """
    Retrieve a single template by ID.
    """
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/templates", response_model=TemplateResponse, status_code=201)
def create_template(template: TemplateCreate, db: Session = Depends(get_db)):
    """
    Create a new email template.
    """
    existing = db.query(EmailTemplate).filter(EmailTemplate.name == template.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Template with this name already exists")
    
    db_template = EmailTemplate(
        name=template.name,
        content=template.content,
        design_json=template.design_json,
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template


@router.put("/templates/{template_id}", response_model=TemplateResponse)
def update_template(template_id: int, template_update: TemplateUpdate, db: Session = Depends(get_db)):
    """
    Update an existing template.
    """
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if template_update.name is not None:
        # Check for name conflicts
        existing = db.query(EmailTemplate).filter(
            EmailTemplate.name == template_update.name,
            EmailTemplate.id != template_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Another template with this name already exists")
        template.name = template_update.name
    
    if template_update.content is not None:
        template.content = template_update.content

    if template_update.design_json is not None:
        template.design_json = template_update.design_json
    
    db.commit()
    db.refresh(template)
    return template


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    """
    Delete a template.
    """
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    db.delete(template)
    db.commit()
    return None


@router.post("/templates/{template_id}/send-test")
def send_test_email(template_id: int, request: SendTestRequest, db: Session = Depends(get_db)):
    """
    Send a test email using the template content.
    """
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if not request.emails:
        raise HTTPException(status_code=400, detail="At least one email address is required")
    
    # Use first available Gmail account
    all_accounts = credentials_manager_instance.list_accounts()
    if not all_accounts:
        raise HTTPException(status_code=500, detail="No Gmail accounts configured")
    
    # Use the full path to credentials file, not just the account ID
    credentials_path = all_accounts[0]['path']
    try:
        gmail_service = GmailService(credentials_path)
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to initialize Gmail service for account {all_accounts[0]['id']}: {str(e)}"
        )
    
    sent_count = 0
    errors = []
    
    for email in request.emails:
        try:
            # Personalize content for test
            test_name = "Test User"
            html_body_personalized = template.content.replace("{{name}}", test_name).replace("*|FNAME|*", test_name)

            if gmail_service.send_email(
                to_email=email,
                subject=request.subject,
                html_body=html_body_personalized
            ):
                sent_count += 1
            else:
                errors.append(f"{email}: Failed to send email (check server logs)")
        except Exception as e:
            errors.append(f"{email}: {str(e)}")
    
    result = {
        "message": f"Test email sent to {sent_count}/{len(request.emails)} recipients",
        "sent": sent_count,
        "total": len(request.emails)
    }
    
    if errors:
        result["errors"] = errors
    
    return result
