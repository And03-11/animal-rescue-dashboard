# --- Archivo: backend/app/api/v1/endpoints/users.py ---
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.core.security import get_password_hash, get_current_user
from app.db.database import get_db
from app.db.models import User
from typing import Optional
from pydantic import BaseModel


router = APIRouter()

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    is_admin: bool = False

@router.post("/users/register", status_code=201)
def register_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user_email: str = Depends(get_current_user)
):
    current_user = db.query(User).filter(User.email == current_user_email).first()
    if not current_user or not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden registrar usuarios.")

    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email ya está registrado.")

    new_user = User(
        email=user.email,
        hashed_password=get_password_hash(user.password),
        is_admin=user.is_admin
    )
    db.add(new_user)
    db.commit()
    return {"message": "Usuario registrado correctamente"}


@router.get("/users/list")
def list_users(
    db: Session = Depends(get_db),
    current_user_email: str = Depends(get_current_user)
):
    current_user = db.query(User).filter(User.email == current_user_email).first()
    if not current_user or not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    users = db.query(User).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "is_admin": u.is_admin
        }
        for u in users
    ]


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user_email: str = Depends(get_current_user)
):
    current_user = db.query(User).filter(User.email == current_user_email).first()
    if not current_user or not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    db.delete(user)
    db.commit()


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None

@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    update: UserUpdate,
    db: Session = Depends(get_db),
    current_user_email: str = Depends(get_current_user)
):
    current_user = db.query(User).filter(User.email == current_user_email).first()
    if not current_user or not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if update.email:
        user.email = update.email
    if update.password:
        user.hashed_password = get_password_hash(update.password)
    if update.is_admin is not None:
        user.is_admin = update.is_admin

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "is_admin": user.is_admin
    }
