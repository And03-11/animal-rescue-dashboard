# --- Archivo: backend/tests/test_contacts.py ---
import sys, os
# Asegurar que 'app' se resuelva
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import Contact
from app.services.airtable_service import AirtableService
from app.core.security import get_current_user  # 🔐 importante para override

# 🚀 Simula autenticación para todos los tests
app.dependency_overrides[get_current_user] = lambda: "test@example.com"

client = TestClient(app)

@pytest.fixture(autouse=True)
def override_airtable(monkeypatch):
    """Stubear métodos de AirtableService para contactos."""
    class FakeTable:
        def all(self):
            return [
                {"id": "rec1", "fields": {"Name": "Test User", "Email": "test@example.com", "Phone": "12345"}}
            ]
        def create(self, data):
            return {"id": "recNew", "fields": data}

    orig_init = AirtableService.__init__
    def fake_init(self):
        orig_init(self)
        self.donors_table = FakeTable()
    monkeypatch.setattr(AirtableService, "__init__", fake_init)
    yield
    monkeypatch.setattr(AirtableService, "__init__", orig_init)


def test_list_contacts_returns_array_and_cors():
    response = client.get(
        "/api/v1/contacts/",
        headers={"Origin": "http://localhost:5173"}
    )
    assert response.status_code == 200
    assert response.headers.get('access-control-allow-origin') == 'http://localhost:5173'
    data = response.json()
    assert isinstance(data, list)
    contact = Contact(**data[0])
    assert contact.id == 'rec1'
    assert contact.name == 'Test User'
    assert contact.email == 'test@example.com'


def test_create_contact_returns_created_and_cors():
    payload = {"name": "New User", "email": "new@example.com", "phone": "67890"}
    response = client.post(
        "/api/v1/contacts/",
        headers={"Origin": "http://localhost:3000"},
        json=payload
    )
    assert response.status_code == 201
    assert response.headers.get('access-control-allow-origin') == 'http://localhost:3000'
    data = response.json()
    contact = Contact(**data)
    assert contact.id == 'recNew'
    assert contact.name == payload['name']
    assert contact.email == payload['email']
    assert contact.phone == payload['phone']
