import hashlib
import hmac

import pytest

from backend.app.services.email_tracking import (
    EmailTrackingService,
    InMemoryEmailTrackingRepository,
)


@pytest.fixture
def repository():
    return InMemoryEmailTrackingRepository()


@pytest.fixture
def prepared(repository):
    service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
        ip_hash_key="test-ip-hash-key",
    )
    email = service.prepare_email(
        campaign_id="Campaign_events",
        recipient_email="person@example.org",
        html_body='<a href="https://donations.animallove.cr/help/">Help</a>',
    )
    return service, email


def test_unknown_token_is_not_persisted(prepared, repository):
    service, _email = prepared

    accepted = service.record_event(
        token="unknown-token-with-enough-entropy",
        event_type="landing_loaded",
        visitor_id="visitor-1234",
        user_agent="Mozilla/5.0",
        client_ip="192.0.2.20",
    )

    assert accepted is False
    assert repository.event_count == 0


def test_duplicate_session_summary_keeps_largest_engagement(prepared, repository):
    service, email = prepared
    token = email.links[0].token

    assert service.record_event(
        token=token,
        event_type="session_summary",
        visitor_id="visitor-1234",
        engagement_ms=1200,
        viewport_width=390,
        user_agent="Mozilla/5.0 (iPhone)",
        client_ip="192.0.2.20",
    )
    assert service.record_event(
        token=token,
        event_type="session_summary",
        visitor_id="visitor-1234",
        engagement_ms=4100,
        viewport_width=390,
        user_agent="Mozilla/5.0 (iPhone)",
        client_ip="192.0.2.20",
    )

    events = repository.events_for(email.links[0].id)
    assert len(events) == 1
    assert events[0].engagement_ms == 4100
    assert events[0].device_class == "mobile"
    assert events[0].user_agent == "Mozilla/5.0 (iPhone)"
    assert events[0].ip_hash == hmac.new(
        b"test-ip-hash-key", b"192.0.2.20", hashlib.sha256
    ).hexdigest()
    assert "192.0.2.20" not in repository.persisted_values()


def test_scanner_landing_is_flagged_but_trusted_interaction_is_human_likely(
    prepared, repository
):
    service, email = prepared
    token = email.links[0].token

    service.record_event(
        token=token,
        event_type="landing_loaded",
        visitor_id="visitor-5678",
        user_agent="Proofpoint URL Defense Scanner",
    )
    service.record_event(
        token=token,
        event_type="human_interaction",
        visitor_id="visitor-5678",
        user_agent="Proofpoint URL Defense Scanner",
    )

    landing, interaction = repository.events_for(email.links[0].id)
    assert landing.suspected_automation is True
    assert interaction.suspected_automation is False


@pytest.mark.parametrize(
    ("viewport_width", "expected"),
    [(None, "unknown"), (390, "mobile"), (900, "tablet"), (1440, "desktop")],
)
def test_device_class_comes_from_bounded_viewport(
    prepared, repository, viewport_width, expected
):
    service, email = prepared
    service.record_event(
        token=email.links[0].token,
        event_type="landing_loaded",
        visitor_id=f"visitor-{expected}",
        viewport_width=viewport_width,
    )
    assert repository.events_for(email.links[0].id)[0].device_class == expected


def test_user_agent_is_bounded_before_persistence(prepared, repository):
    service, email = prepared
    service.record_event(
        token=email.links[0].token,
        event_type="landing_loaded",
        visitor_id="visitor-long-agent",
        user_agent="x" * 700,
    )
    assert repository.events_for(email.links[0].id)[0].user_agent == "x" * 512


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"token": "short"}, "token"),
        ({"event_type": "opened"}, "event_type"),
        ({"visitor_id": "tiny"}, "visitor_id"),
        ({"engagement_ms": -1}, "engagement_ms"),
        ({"engagement_ms": 86_400_001}, "engagement_ms"),
        ({"viewport_width": -1}, "viewport_width"),
        ({"viewport_width": 20_001}, "viewport_width"),
    ],
)
def test_event_validation_rejects_unbounded_input(prepared, overrides, message):
    service, email = prepared
    payload = {
        "token": email.links[0].token,
        "event_type": "landing_loaded",
        "visitor_id": "visitor-valid",
        "engagement_ms": 0,
        "viewport_width": 390,
    }
    payload.update(overrides)

    with pytest.raises(ValueError, match=message):
        service.record_event(**payload)
