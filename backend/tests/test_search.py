# --- Archivo: backend/tests/test_search.py ---
import sys, os
# Añadir ruta al directorio 'backend' para resolver el paquete 'app'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from fastapi.testclient import TestClient

from app.main import app
import app.schemas as schemas
from app.api.v1.endpoints.search import (
    get_data_service,
    get_mailchimp_service,
    get_brevo_service
)
from app.core.security import get_current_user  # 🔐 para override auth

# 🔐 Override de autenticación en todos los tests
app.dependency_overrides[get_current_user] = lambda: "test@example.com"

# --- Stubs para dependencias ---
class DummyDataService:
    def get_donor_by_email(self, email: str):
        return {"donor": None, "donations": []}

class DummyMailchimpService:
    def get_contact_tags(self, email: str):
        return []

class DummyBrevoService:
    def get_contact_details(self, email: str):
        return None

@pytest.fixture(autouse=True)
def override_dependencies():
    app.dependency_overrides[get_data_service] = lambda: DummyDataService()
    app.dependency_overrides[get_mailchimp_service] = lambda: DummyMailchimpService()
    app.dependency_overrides[get_brevo_service] = lambda: DummyBrevoService()
    yield
    del app.dependency_overrides[get_data_service]
    del app.dependency_overrides[get_mailchimp_service]
    del app.dependency_overrides[get_brevo_service]

client = TestClient(app)

# --- Tests ---

def test_search_not_found_returns_404():
    response = client.get(
        "/api/v1/search/notfound@example.com",
        headers={"Origin": "http://localhost:3000"}
    )
    assert response.status_code == 404
    assert response.json()["detail"].startswith("Contacto 'notfound@example.com'")
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"

def test_search_found_on_mailchimp_and_brevo():
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
    result = schemas.SearchResponse(**body)
    assert result.email_searched == "found@example.com"
    assert result.mailchimp and result.mailchimp[0].found is True
    assert result.brevo and result.brevo[0].found is True
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
