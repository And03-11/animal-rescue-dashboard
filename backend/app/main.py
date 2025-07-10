# --- Archivo: backend/app/main.py ---
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # ◀ Importamos el middleware CORS
from app.api.v1.endpoints.search import router as search_router


# Importar routers
from app.api.v1.endpoints import (
    dashboard,
    contacts,
    campaigns,
    form_titles,
    email_sender
)

app = FastAPI(
    title="Animal Rescue Dashboard API",
    version="1.0.0",
    description="API para gestionar donaciones y envíos de correo"
)

# --- Configuración CORS ---
# Ventaja: Permite que el frontend (otro dominio/puerto) consuma la API sin bloqueos del navegador
origins = [
    "http://localhost:3000",  # CRA / React dev
    "http://localhost:5173",
    # "https://tu-dominio.com"  # Dominio en producción
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,        # Orígenes permitidos
    allow_credentials=True,       # Permite envío de cookies/credenciales
    allow_methods=["*"],        # Métodos HTTP permitidos (GET, POST, ...)
    allow_headers=["*"],        # Cabeceras permitidas (Content-Type, Authorization...)
)

# --- Registro de routers ---
# Ventaja: Mantiene organización modular y rutas versionadas
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(contacts.router, prefix="/api/v1/contacts", tags=["contacts"])
app.include_router(campaigns.router, prefix="/api/v1/campaigns", tags=["campaigns"])
app.include_router(form_titles.router, prefix="/api/v1/form-titles", tags=["form-titles"])
app.include_router(email_sender.router, prefix="/api/v1/send-email", tags=["email"])
app.include_router(search_router, prefix="/api/v1", tags=["search"])

# Nota: Con esta configuración, tu frontend en localhost:3000 puede hacer peticiones
#       a este backend sin problemas de CORS.
