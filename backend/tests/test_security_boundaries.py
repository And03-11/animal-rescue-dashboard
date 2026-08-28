"""Regression tests for routes that must never be publicly accessible."""

import pytest
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import email_tracking as email_tracking_api
from backend.app.main import app
from backend.app.core.security import get_current_user


client = TestClient(app)


@pytest.fixture(autouse=True)
def use_real_auth_dependency():
    """Keep auth overrides from unrelated endpoint tests out of this module."""
    previous_override = app.dependency_overrides.pop(get_current_user, None)
    yield
    if previous_override is not None:
        app.dependency_overrides[get_current_user] = previous_override


def test_public_registration_route_is_removed():
    response = client.post(
        "/api/v1/register",
        json={"username": "attacker@example.com", "password": "password", "is_admin": True},
    )

    assert response.status_code == 404


def test_template_routes_require_authentication():
    response = client.get("/api/v1/templates")

    assert response.status_code == 401


def test_template_search_requires_authentication():
    response = client.post("/api/v1/template-search", json={"query": "urgent dog rescue"})

    assert response.status_code == 401


def test_funnel_stats_require_authentication():
    response = client.get("/api/v1/dashboard/funnel-stats")

    assert response.status_code == 401


def test_tracking_origin_is_not_granted_global_credentialed_cors():
    response = client.options(
        "/api/v1/templates",
        headers={
            "Origin": "https://donations.animallove.cr",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_tracking_event_response_never_allows_browser_credentials(monkeypatch):
    class AcceptingTrackingService:
        def record_event(self, **_event):
            return None

    monkeypatch.setenv(
        "EMAIL_TRACKING_ALLOWED_ORIGINS", "https://donations.animallove.cr"
    )
    monkeypatch.setattr(
        email_tracking_api,
        "get_email_tracking_service",
        lambda: AcceptingTrackingService(),
    )

    response = client.post(
        "/api/v1/email-tracking/events",
        json={
            "token": "unknown-token-with-enough-entropy",
            "event_type": "landing_loaded",
            "visitor_id": "visitor-cors-boundary",
        },
        headers={"Origin": "https://donations.animallove.cr"},
    )

    assert response.status_code == 202
    assert response.headers["access-control-allow-origin"] == (
        "https://donations.animallove.cr"
    )
    assert response.headers["vary"] == "Origin"
    assert "access-control-allow-credentials" not in response.headers


def test_share_link_debug_route_is_removed():
    response = client.get("/api/v1/analytics/debug/share-link-test")

    assert response.status_code == 404
