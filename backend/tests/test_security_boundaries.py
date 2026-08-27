"""Regression tests for routes that must never be publicly accessible."""

import pytest
from fastapi.testclient import TestClient

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


def test_share_link_debug_route_is_removed():
    response = client.get("/api/v1/analytics/debug/share-link-test")

    assert response.status_code == 404
