
# backend/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # <--- NUEVO IMPORT
from app.api.v1.endpoints import dashboard, contacts
from app.api.v1.endpoints import dashboard, contacts, email_sender, form_titles, campaigns # <-- Añadir

app = FastAPI(
    title="Dashboard Centro de Rescate API",
    description="La API que centraliza la información de donantes y campañas.",
    version="1.0.0"
)

# --- INICIO DE LA CONFIGURACIÓN DE CORS ---

# Lista de "orígenes" (nuestro frontend) que tienen permiso para hablar con nuestra API
origins = [
    "http://localhost:5173",  # La dirección donde corre nuestra app de React con Vite
    "http://localhost:5174",  # A veces Vite usa otro puerto, lo añadimos por si acaso
    "http://localhost:5175",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,       # Permite estos orígenes
    allow_credentials=True,
    allow_methods=["*"],         # Permite todos los métodos (GET, POST, etc.)
    allow_headers=["*"],         # Permite todas las cabeceras
)

# --- FIN DE LA CONFIGURACIÓN DE CORS ---


app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(contacts.router, prefix="/api/v1/contacts", tags=["Contacts"])
app.include_router(email_sender.router, prefix="/api/v1", tags=["Sender"])
app.include_router(form_titles.router, prefix="/api/v1/form-titles", tags=["form-titles"])
app.include_router(campaigns.router, prefix="/api/v1/campaigns", tags=["campaigns"])

@app.get("/")
def read_root():
    return {"mensaje": "Bienvenido a la API del Dashboard de Rescate Animal."}




