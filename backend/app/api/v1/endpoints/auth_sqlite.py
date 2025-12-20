# --- File: backend/app/api/v1/endpoints/auth_sqlite.py ---
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.app.db.database import get_db
from backend.app.db.models import User
from backend.app.core.security import verify_password, create_access_token
from datetime import timedelta
import traceback
import sys

router = APIRouter()

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/login", response_model=TokenResponse, tags=["auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    try:
        print(f"DEBUG: Login attempt for username: '{form_data.username}'", flush=True)
        
        # Debug: Print DB connection info
        try:
            db_url = str(db.get_bind().url)
            if ":" in db_url and "@" in db_url:
                safe_url = db_url.split("@")[-1]
            else:
                safe_url = db_url
            print(f"DEBUG: DB URL host: {safe_url}", flush=True)
        except Exception as e:
            print(f"DEBUG: Could not get DB URL: {e}", flush=True)

        user = db.query(User).filter(User.username == form_data.username).first()

        if user:
            print(f"DEBUG: User found in DB: {user.username}, ID: {user.id}", flush=True)
            try:
                is_valid = verify_password(form_data.password, user.hashed_password)
                print(f"DEBUG: Password check result: {is_valid}", flush=True)
                if not is_valid:
                     print(f"DEBUG: Password mismatch. Hash in DB starts with: {user.hashed_password[:5]}...", flush=True)
            except Exception as e:
                print(f"DEBUG: Error verifying password: {e}", flush=True)
                traceback.print_exc()
                is_valid = False
        else:
            print("DEBUG: User NOT found in DB", flush=True)

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
            },
            expires_delta=timedelta(minutes=30)
        )

        return TokenResponse(access_token=access_token)

    except HTTPException:
        raise
    except Exception as e:
        print(f"CRITICAL ERROR in login: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal Server Error: {str(e)}"
        )