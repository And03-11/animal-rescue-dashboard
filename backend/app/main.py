# --- File: backend/app/main.py (Con Caching Activado) ---
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# ✅ 1. IMPORTA las herramientas necesarias para el caché y el 'lifespan'
from contextlib import asynccontextmanager
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend

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

# ✅ 2. DEFINE el 'lifespan' de la aplicación
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gestiona el ciclo de vida de la aplicación.
    El código antes del 'yield' se ejecuta al arrancar.
    El código después del 'yield' se ejecuta al apagar.
    """
    # Inicializa el caché usando una memoria interna simple.
    FastAPICache.init(InMemoryBackend(), prefix="fastapi-cache")
    print("Sistema de caché inicializado.")
    yield
    # Aquí se podrían añadir tareas de limpieza al apagar la app
    print("Sistema de caché detenido.")

# ✅ 3. PASA el 'lifespan' a la instancia de FastAPI
app = FastAPI(
    title="Animal Rescue Dashboard API",
    version="1.0.0",
    description="API para gestionar donaciones y envíos de correo",
    lifespan=lifespan
)

# --- Configuración CORS (sin cambios) ---
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

# --- Registro de routers (sin cambios) ---
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(contacts.router, prefix="/api/v1/contacts", tags=["contacts"])
app.include_router(campaigns.router, prefix="/api/v1/campaigns", tags=["campaigns"])
app.include_router(form_titles.router, prefix="/api/v1/form-titles", tags=["form-titles"])
app.include_router(email_sender.router, prefix="/api/v1/send-email", tags=["email"])
app.include_router(search_router, prefix="/api/v1", tags=["search"])
app.include_router(auth_sqlite.router, prefix="/api/v1", tags=["auth"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(websockets.router, prefix="/api/v1")