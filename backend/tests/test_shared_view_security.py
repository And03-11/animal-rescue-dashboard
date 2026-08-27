"""Security regression tests for public analytics share links."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.core.security import get_current_user
from backend.app.main import app
from backend.app.services.data_service import get_data_service
from backend.app.services.supabase_service import SupabaseService, get_supabase_service


client = TestClient(app)


class FakeSharedViewService:
    def __init__(self, config=None, revoke_result=True):
        self.config = config or {"source_id": "Test Source"}
        self.revoke_result = revoke_result
        self.revocation = None

    def get_shared_view(self, token):
        return self.config

    def revoke_shared_view(self, token, revoked_by):
        self.revocation = (token, revoked_by)
        return self.revoke_result


class FakeDataService:
    def get_source_donations(self, **kwargs):
        return {
            "donations": [
                {
                    "id": "donation-1",
                    "amount": 25,
                    "donorName": "Private Person",
                    "donorEmail": "private@example.org",
                }
            ],
            "total_count": 1,
        }


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    previous = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)


def test_public_shared_donations_redact_direct_identifiers():
    app.dependency_overrides[get_supabase_service] = lambda: FakeSharedViewService()
    app.dependency_overrides[get_data_service] = lambda: FakeDataService()

    response = client.get(f"/api/v1/analytics/share/{uuid4()}/donations")

    assert response.status_code == 200
    donation = response.json()["donations"][0]
    assert donation["donorName"] == "Anonymous donor"
    assert donation["donorEmail"] == ""
    assert donation["amount"] == 25


def test_revoke_shared_view_requires_authentication():
    response = client.delete(f"/api/v1/analytics/share/{uuid4()}")

    assert response.status_code == 401


def test_creator_can_revoke_shared_view():
    token = str(uuid4())
    service = FakeSharedViewService()
    app.dependency_overrides[get_current_user] = lambda: "owner@example.org"
    app.dependency_overrides[get_supabase_service] = lambda: service

    response = client.delete(f"/api/v1/analytics/share/{token}")

    assert response.status_code == 204
    assert service.revocation == (token, "owner@example.org")


@pytest.mark.parametrize(
    ("age", "expected"),
    [
        (timedelta(days=2), {"source_id": "Active"}),
        (timedelta(days=31), None),
    ],
)
def test_shared_view_ttl_is_enforced(monkeypatch, age, expected):
    service = SupabaseService.__new__(SupabaseService)
    service._execute_one = lambda query, params: {
        "configuration": {"source_id": "Active"},
        "is_active": True,
        "created_at": datetime.now(timezone.utc) - age,
    }
    monkeypatch.setenv("SHARED_VIEW_TTL_DAYS", "30")

    assert service.get_shared_view(str(uuid4())) == expected


def test_invalid_shared_view_token_never_reaches_database():
    service = SupabaseService.__new__(SupabaseService)
    service._execute_one = lambda query, params: pytest.fail("database was queried")

    assert service.get_shared_view("not-a-uuid") is None
    assert service.revoke_shared_view("not-a-uuid", "owner@example.org") is False
