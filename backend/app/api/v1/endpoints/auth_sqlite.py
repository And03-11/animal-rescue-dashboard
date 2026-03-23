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

class RegisterRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False

@router.post("/register", response_model=TokenResponse, tags=["auth"])
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.username == request.username).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        from backend.app.core.security import get_password_hash
        
        new_user = User(
            username=request.username,
            hashed_password=get_password_hash(request.password),
            is_admin=request.is_admin
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        access_token = create_access_token(
            data={"sub": new_user.username, "is_admin": new_user.is_admin},
            expires_delta=timedelta(minutes=30)
        )
        return TokenResponse(access_token=access_token)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"CRITICAL ERROR in register: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/login", response_model=TokenResponse, tags=["auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    try:
        # form_data.username will contain the username submitted by the client
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

        is_valid = False
        if user:
            print(f"DEBUG: User found in DB: {user.username}, ID: {user.id}", flush=True)
            try:
                is_valid = verify_password(form_data.password, user.hashed_password)
                print(f"DEBUG: Password check result: {is_valid}", flush=True)
            except Exception as e:
                print(f"DEBUG: Error verifying password: {e}", flush=True)
                traceback.print_exc()
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
            expires_delta=timedelta(minutes=60 * 24 * 7) # Increased to 7 days for convenience
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