# --- File: backend/app/api/v1/endpoints/users.py ---
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr # EmailStr ya no es necesario para el usuario
from backend.app.db.database import get_db
from backend.app.db.models import User
from backend.app.core.security import get_password_hash, get_current_user

router = APIRouter()

# --- Schemas ---
class UserBase(BaseModel):
    # ✅ CAMBIO: de 'email' a 'username'
    username: str
    is_admin: bool = False

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: str | None = None
    password: str | None = None
    is_admin: bool | None = None

class UserInDB(UserBase):
    id: int

    class Config:
        orm_mode = True

# --- Endpoints ---
@router.post("/users/register", status_code=201)
def register_user(user: UserCreate, db: Session = Depends(get_db), current_username: str = Depends(get_current_user)):
    # ✅ CAMBIO: Verificamos los permisos del usuario actual por su username
    admin_user = db.query(User).filter(User.username == current_username).first()
    if not admin_user or not admin_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to register users")

    # ✅ CAMBIO: Verificamos si el nuevo usuario ya existe por username
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    new_user = User(
        username=user.username,
        hashed_password=get_password_hash(user.password),
        is_admin=user.is_admin
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User registered successfully"}

@router.get("/users/list", response_model=list[UserInDB])
def list_users(db: Session = Depends(get_db), current_username: str = Depends(get_current_user)):
    # ✅ CAMBIO: Verificamos los permisos
    current_user = db.query(User).filter(User.username == current_username).first()
    if not current_user or not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return db.query(User).all()

# El resto de endpoints (PUT, DELETE) ya usan el user_id, por lo que solo necesitan
# el cambio de autorización y el modelo de respuesta si aplica. Aquí te los dejo ya ajustados.

@router.put("/users/{user_id}", response_model=UserInDB)
def update_user(user_id: int, update: UserUpdate, db: Session = Depends(get_db), current_username: str = Depends(get_current_user)):
    admin_user = db.query(User).filter(User.username == current_username).first()
    if not admin_user or not admin_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if update.username:
        user.username = update.username
    if update.password:
        user.hashed_password = get_password_hash(update.password)
    if update.is_admin is not None:
        user.is_admin = update.is_admin
    
    db.commit()
    db.refresh(user)
    return user

@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), current_username: str = Depends(get_current_user)):
    admin_user = db.query(User).filter(User.username == current_username).first()
    if not admin_user or not admin_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.username == admin_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete your own user account")

    db.delete(user)
    db.commit()
    return