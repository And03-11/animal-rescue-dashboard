# --- Archivo: backend/app/api/v1/endpoints/auth.py ---
from fastapi import APIRouter, Depends, HTTPException, status, Form
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import timedelta

from app.core.security import create_access_token, verify_password, get_password_hash

router = APIRouter()

# Usuario simulado (puedes reemplazar con base de datos)
fake_user_db = {
    "admin@example.com": {
        "email": "admin@example.com",
        "hashed_password": "$2b$12$W9LnE3OU0hV/UbVfUzR7DuvBg3OUCPSzzBt16LDEjNmEETSCtOsrK"
    }
}

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/login", response_model=TokenResponse, tags=["auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user_input = form_data.username.strip()
    user = fake_user_db.get(user_input)
    if not user:
        print("❌ Usuario no encontrado:", repr(user_input))
        raise HTTPException(...)

    if form_data.password != "admin123":
        print("❌ Contraseña incorrecta")
        raise HTTPException(...)

    print("✅ Login exitoso")
    access_token = create_access_token(data={"sub": user["email"]}, expires_delta=timedelta(minutes=30))
    return TokenResponse(access_token=access_token)

