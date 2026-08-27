import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import email_tracking as email_tracking_api
from backend.app.services.email_tracking import (
    EmailTrackingService,
    InMemoryEmailTrackingRepository,
)


@pytest.fixture
def api_environment(monkeypatch):
    repository = InMemoryEmailTrackingRepository()
    service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
        ip_hash_key="test-ip-key",
    )
    prepared = service.prepare_email(
        campaign_id="Campaign_api",
        recipient_email="person@example.org",
        html_body='<a href="https://donations.animallove.cr/help/">Help</a>',
    )
    monkeypatch.setattr(
        email_tracking_api, "get_email_tracking_service", lambda: service
    )
    monkeypatch.setenv(
        "EMAIL_TRACKING_ALLOWED_ORIGINS", "https://donations.animallove.cr"
    )
    app = FastAPI()
    app.include_router(email_tracking_api.router, prefix="/api/v1/email-tracking")
    return TestClient(app), repository, prepared


def post_event(client, payload, *, origin="https://donations.animallove.cr"):
    return client.post(
        "/api/v1/email-tracking/events",
        content=json.dumps(payload),
        headers={
            "Content-Type": "text/plain;charset=UTF-8",
            "Origin": origin,
            "User-Agent": "Mozilla/5.0",
        },
    )


def test_valid_and_unknown_tokens_have_identical_public_responses(api_environment):
    client, repository, prepared = api_environment
    base_payload = {
        "event_type": "landing_loaded",
        "visitor_id": "visitor-api-1",
        "engagement_ms": 0,
        "viewport_width": 390,
    }

    valid_response = post_event(
        client, {**base_payload, "token": prepared.links[0].token}
    )
    unknown_response = post_event(
        client,
        {
            **base_payload,
            "visitor_id": "visitor-api-2",
            "token": "unknown-token-with-enough-entropy",
        },
    )

    assert valid_response.status_code == 202
    assert unknown_response.status_code == 202
    assert valid_response.json() == {"accepted": True}
    assert unknown_response.json() == valid_response.json()
    assert repository.event_count == 1
    assert "email" not in valid_response.text.casefold()
    assert "token" not in valid_response.text.casefold()


def test_disallowed_or_missing_origin_is_rejected(api_environment):
    client, _repository, prepared = api_environment
    payload = {
        "token": prepared.links[0].token,
        "event_type": "landing_loaded",
        "visitor_id": "visitor-api-3",
    }

    disallowed = post_event(client, payload, origin="https://attacker.example")
    missing = client.post(
        "/api/v1/email-tracking/events",
        content=json.dumps(payload),
        headers={"Content-Type": "text/plain"},
    )

    assert disallowed.status_code == 403
    assert missing.status_code == 403


@pytest.mark.parametrize(
    "content",
    [
        "not-json",
        json.dumps([]),
        json.dumps({"token": "missing-fields"}),
    ],
)
def test_malformed_payload_is_rejected_without_internal_details(
    api_environment, content
):
    client, _repository, _prepared = api_environment
    response = client.post(
        "/api/v1/email-tracking/events",
        content=content,
        headers={
            "Content-Type": "text/plain",
            "Origin": "https://donations.animallove.cr",
        },
    )

    assert response.status_code == 400
    assert "traceback" not in response.text.casefold()


def test_oversized_payload_is_rejected(api_environment):
    client, _repository, _prepared = api_environment
    response = client.post(
        "/api/v1/email-tracking/events",
        content="x" * 4097,
        headers={
            "Content-Type": "text/plain",
            "Origin": "https://donations.animallove.cr",
        },
    )
    assert response.status_code == 413
