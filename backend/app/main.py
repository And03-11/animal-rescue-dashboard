# --- File: backend/app/main.py (Corrected) ---
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ✅ CAMBIO: Se usan rutas de importación absolutas desde la raíz del proyecto.
from backend.app.api.v1.endpoints import (
    auth_sqlite,
    users,
    dashboard,
    contacts,
    campaigns,
    form_titles,
    email_sender,
    websockets  
)
from backend.app.api.v1.endpoints.search import router as search_router

app = FastAPI(
    title="Animal Rescue Dashboard API",
    version="1.0.0",
    description="API para gestionar donaciones y envíos de correo"
)

# --- Configuración CORS ---
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://a2a4b1a71477.ngrok-free.app",
    #"https://tu-dominio.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Registro de routers ---
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(contacts.router, prefix="/api/v1/contacts", tags=["contacts"])
app.include_router(campaigns.router, prefix="/api/v1/campaigns", tags=["campaigns"])
app.include_router(form_titles.router, prefix="/api/v1/form-titles", tags=["form-titles"])
app.include_router(email_sender.router, prefix="/api/v1/send-email", tags=["email"])
app.include_router(search_router, prefix="/api/v1", tags=["search"])
app.include_router(auth_sqlite.router, prefix="/api/v1", tags=["auth"]) # <-- AÑADIDO
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(websockets.router, prefix="/api/v1")