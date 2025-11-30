# --- File: backend/app/api/v1/endpoints/users.py (Refactorizado) ---
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from fastapi_cache.decorator import cache

from backend.app.db.database import get_db
from backend.app.db.models import User
from backend.app.core.security import get_password_hash, get_current_user

router = APIRouter()

# --- Schemas (Modelos Pydantic) ---

# Schema para la respuesta pública, NUNCA incluye la contraseña.
class UserPublic(BaseModel):
    id: int
    username: str
    is_admin: bool

    class Config:
        orm_mode = True

class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False

class UserUpdate(BaseModel):
    username: str | None = None
    password: str | None = None
    is_admin: bool | None = None

# --- ✅ NUEVA DEPENDENCIA PARA LA AUTORIZACIÓN ---
def get_current_admin_user(
    db: Session = Depends(get_db),
    current_username: str = Depends(get_current_user)
) -> User:
    """
    Dependencia que verifica si el usuario actual es administrador.
    Si no lo es, lanza una excepción 403.
    Devuelve el objeto del usuario administrador.
    """
    admin_user = db.query(User).filter(User.username == current_username).first()
    if not admin_user or not admin_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted. Requires admin privileges."
        )
    return admin_user

# --- Endpoints ---

@router.post("/users/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    # ✅ Se usa la nueva dependencia para simplificar el código y asegurar que solo admins pueden registrar.
    admin_user: User = Depends(get_current_admin_user)
):
    """Crea un nuevo usuario. Solo accesible por administradores."""
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    new_user = User(
        username=user.username,
        hashed_password=get_password_hash(user.password),
        is_admin=user.is_admin
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # ✅ Clear cache after creating user
    from fastapi_cache import FastAPICache
    await FastAPICache.clear()
    
    # ✅ Se devuelve el objeto del usuario creado (sin contraseña).
    return new_user

@router.get("/users/list", response_model=List[UserPublic])
def list_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    """Lista todos los usuarios. Solo accesible por administradores."""
    return db.query(User).all()

@router.put("/users/{user_id}", response_model=UserPublic)
async def update_user(
    user_id: int,
    update_data: UserUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    """Actualiza un usuario. Solo accesible por administradores."""
    user_to_update = db.query(User).filter(User.id == user_id).first()
    if not user_to_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # ✅ Se añade validación de username duplicado al actualizar.
    if update_data.username and update_data.username != user_to_update.username:
        existing_user = db.query(User).filter(User.username == update_data.username).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already in use."
            )
        user_to_update.username = update_data.username

    if update_data.password:
        user_to_update.hashed_password = get_password_hash(update_data.password)
    
    if update_data.is_admin is not None:
        user_to_update.is_admin = update_data.is_admin
    
    db.commit()
    db.refresh(user_to_update)
    
    # ✅ Clear cache after updating user
    from fastapi_cache import FastAPICache
    await FastAPICache.clear()
    
    return user_to_update

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    """Elimina un usuario. Solo accesible por administradores."""
    user_to_delete = db.query(User).filter(User.id == user_id).first()
    if not user_to_delete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    if user_to_delete.id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own user account"
        )

    db.delete(user_to_delete)
    db.commit()
    
    # ✅ Clear cache after deleting user
    from fastapi_cache import FastAPICache
    await FastAPICache.clear()
    
    return None # Para el status 204, no se devuelve contenido.