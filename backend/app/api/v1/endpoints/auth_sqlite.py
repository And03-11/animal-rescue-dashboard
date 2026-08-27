# --- File: backend/app/api/v1/endpoints/auth_sqlite.py ---
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.app.db.database import get_db
from backend.app.db.models import User
from backend.app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)

router = APIRouter()

_DUMMY_PASSWORD_HASH = get_password_hash("dummy-password-never-used")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/login", response_model=TokenResponse, tags=["auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.username == form_data.username).first()

        password_hash = user.hashed_password if user else _DUMMY_PASSWORD_HASH
        is_valid = verify_password(form_data.password, password_hash)

        if not user or not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        access_token = create_access_token(
            data={
                "sub": user.username,
                "is_admin": user.is_admin
            }
        )

        return TokenResponse(access_token=access_token)

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to complete login",
        ) from None
