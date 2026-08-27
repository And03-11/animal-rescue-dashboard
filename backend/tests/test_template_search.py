"""Behavior tests for the authenticated template library search."""

import pytest
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import template_search
from backend.app.core.security import get_current_user
from backend.app.main import app


@pytest.fixture
def authenticated_client():
    previous_override = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: {"username": "test-admin"}
    with TestClient(app) as client:
        yield client
    if previous_override is None:
        app.dependency_overrides.pop(get_current_user, None)
    else:
        app.dependency_overrides[get_current_user] = previous_override


def test_empty_query_browses_library_without_openai(authenticated_client, monkeypatch):
    captured = {}

    async def fail_if_called(*_args, **_kwargs):
        pytest.fail("OpenAI helpers must not run while browsing the full library")

    async def fake_search(embedding, match_count):
        captured["embedding"] = embedding
        captured["match_count"] = match_count
        return [
            {
                "id": 7,
                "title": "Emergency care",
                "summary": "Urgent medical support",
                "file_url": "https://example.com/template",
                "tags": ["medical"],
                "conditions": [],
                "similarity": float("nan"),
            }
        ]

    monkeypatch.setattr(template_search, "_translate_to_english", fail_if_called)
    monkeypatch.setattr(template_search, "_create_embedding", fail_if_called)
    monkeypatch.setattr(template_search, "_search_supabase", fake_search)

    response = authenticated_client.post("/api/v1/template-search", json={"query": "   "})

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["results"][0]["similarity"] == 0.0
    assert captured["embedding"] == [0.0] * 1536
    assert captured["match_count"] == 100
