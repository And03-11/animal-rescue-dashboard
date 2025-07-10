# --- Archivo: backend/tests/test_search.py ---
import sys, os
# Añadir ruta al directorio 'backend' para resolver el paquete 'app'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from fastapi.testclient import TestClient

from app.main import app
import app.schemas as schemas
from app.api.v1.endpoints.search import (
    get_airtable_service,
    get_mailchimp_service,
    get_brevo_service
)

# --- Stubs para dependencias ---
class DummyAirtableService:
    def get_airtable_data_by_email(self, email: str):
        # Simula que no se encuentra el contacto en Airtable
        return {"donor_info": None, "donations": []}
    def get_emails_from_ids(self, ids):
        return []

class DummyMailchimpService:
    def get_contact_tags(self, email: str):
        return []  # simula sin tags (no encontrado)

class DummyBrevoService:
    def get_contact_details(self, email: str):
        return None  # simula no encontrado

@pytest.fixture(autouse=True)
def override_dependencies():
    """Sustituye las dependencias reales por stubs antes de cada test."""
    # Override de dependencias en FastAPI
    app.dependency_overrides[get_airtable_service] = lambda: DummyAirtableService()
    app.dependency_overrides[get_mailchimp_service] = lambda: DummyMailchimpService()
    app.dependency_overrides[get_brevo_service] = lambda: DummyBrevoService()
    yield
    # Limpiar overrides tras cada test
    app.dependency_overrides.clear()

client = TestClient(app)

# --- Tests ---

def test_search_not_found_returns_404():
    """
    Si ninguna plataforma encuentra el contacto, devuelve 404.
    """
    response = client.get(
        "/api/v1/search/notfound@example.com",
        headers={"Origin": "http://localhost:3000"}
    )
    assert response.status_code == 404
    assert response.json()["detail"].startswith("Contacto 'notfound@example.com'")
    # CORS header presente
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_search_found_on_mailchimp_and_brevo():
    """
    Si Mailchimp o Brevo encuentran el contacto, devuelve SearchResponse con datos.
    """
    # Ajustar servicios para simular encontrado
    class MC(DummyMailchimpService):
        def get_contact_tags(self, email): return ['tagA']
    class BR(DummyBrevoService):
        def get_contact_details(self, email): return {'email': email}

    app.dependency_overrides[get_mailchimp_service] = lambda: MC()
    app.dependency_overrides[get_brevo_service] = lambda: BR()

    response = client.get(
        "/api/v1/search/found@example.com",
        headers={"Origin": "http://localhost:5173"}
    )
    assert response.status_code == 200
    body = response.json()
    # Validar esquema usando Pydantic
    result = schemas.SearchResponse(**body)
    assert result.email_searched == "found@example.com"
    # MailchimpDetail y BrevoDetail deben marcar 'found'
    assert result.mailchimp and result.mailchimp[0].found is True
    assert result.brevo and result.brevo[0].found is True
    # CORS
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
