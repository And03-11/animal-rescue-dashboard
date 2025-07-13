# --- File: backend/app/api/v1/endpoints/auth_sqlite.py ---
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel # ✅ PASO 1: Importar BaseModel
from backend.app.db.database import get_db
from backend.app.db.models import User
from backend.app.core.security import verify_password, create_access_token
from datetime import timedelta

router = APIRouter()

# ✅ PASO 2: Convertir TokenResponse en un modelo de Pydantic
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/login", response_model=TokenResponse, tags=["auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={
            "sub": user.username, 
            "is_admin": user.is_admin
        },
        expires_delta=timedelta(minutes=30)
    )

    # ✅ PASO 3: Devolver la instancia del modelo Pydantic
    return TokenResponse(access_token=access_token)