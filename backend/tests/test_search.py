# --- Archivo: backend/tests/test_search.py ---
import sys, os
# Añadir ruta al directorio 'backend' para resolver el paquete 'app'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
import backend.app.schemas as schemas
from backend.app.api.v1.endpoints.search import (
    get_data_service,
    get_mailchimp_service,
    get_brevo_service
)
from backend.app.services.mailchimp_service import MailchimpUnavailableError
from backend.app.core.security import get_current_user  # 🔐 para override auth

# 🔐 Override de autenticación en todos los tests
app.dependency_overrides[get_current_user] = lambda: "test@example.com"

# --- Stubs para dependencias ---
class DummyDataService:
    def get_donor_by_email(self, email: str):
        return {"donor": None, "donations": []}

class DummyMailchimpService:
    def get_contact_tags(self, email: str):
        return None

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


def test_search_finds_mailchimp_member_without_tags():
    class MC(DummyMailchimpService):
        def get_contact_tags(self, email):
            return []

    app.dependency_overrides[get_mailchimp_service] = lambda: MC()

    response = client.get("/api/v1/search/member-without-tags@example.com")

    assert response.status_code == 200
    mailchimp = response.json()["mailchimp"][0]
    assert mailchimp["found"] is True
    assert mailchimp["tags"] == []
    assert mailchimp["error"] is None


def test_search_reports_mailchimp_unavailable_separately():
    class DonorDataService(DummyDataService):
        def get_donor_by_email(self, email: str):
            return {
                "donor": {
                    "id": "donor-1",
                    "name": "Jane Donor",
                    "email": email,
                    "phone": None,
                    "emails": [email],
                },
                "donations": [],
            }

    class MC(DummyMailchimpService):
        def get_contact_tags(self, email):
            raise MailchimpUnavailableError("temporary outage")

    app.dependency_overrides[get_data_service] = lambda: DonorDataService()
    app.dependency_overrides[get_mailchimp_service] = lambda: MC()

    response = client.get("/api/v1/search/mailchimp-outage@example.com")

    assert response.status_code == 200
    mailchimp = response.json()["mailchimp"][0]
    assert mailchimp["found"] is False
    assert mailchimp["tags"] == []
    assert mailchimp["error"] == "Mailchimp is temporarily unavailable."


def test_search_includes_extended_donation_summary():
    class DonorDataService(DummyDataService):
        def get_donor_by_email(self, email: str):
            return {
                "donor": {
                    "id": "donor-1",
                    "name": "Jane Donor",
                    "email": email,
                    "phone": None,
                    "emails": [email],
                },
                "donations": [
                    {"amount": 25, "date": "2025-01-15T12:00:00Z"},
                    {"amount": 75.5, "date": "2025-06-20T12:00:00Z"},
                ],
            }

    app.dependency_overrides[get_data_service] = lambda: DonorDataService()

    response = client.get("/api/v1/search/jane@example.com")

    assert response.status_code == 200
    summary = response.json()["airtable_summary"]
    assert summary["total"] == 100.5
    assert summary["count"] == 2
    assert summary["first_date"].startswith("2025-01-15")
    assert summary["last_date"].startswith("2025-06-20")
    assert summary["largest"] == 75.5
