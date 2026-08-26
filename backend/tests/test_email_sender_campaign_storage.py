import json
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import email_sender
from backend.app.core.security import get_current_user
from backend.app.main import app
from backend.app.services.campaign_storage import CampaignFileStorage


client = TestClient(app)


@pytest.fixture(autouse=True)
def authenticated_admin():
    previous_override = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: "admin@example.com"
    yield
    if previous_override is None:
        app.dependency_overrides.pop(get_current_user, None)
    else:
        app.dependency_overrides[get_current_user] = previous_override


@pytest.fixture
def campaign_directories(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    sent_logs = tmp_path / "sent_logs"
    targets = tmp_path / "campaign_targets"
    campaign_data.mkdir()
    sent_logs.mkdir()
    targets.mkdir()

    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "SENT_LOGS_DIR", str(sent_logs))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(targets))
    return campaign_data


def test_list_campaigns_exposes_audience_summary_without_html_body(campaign_directories):
    config = {
        "id": "Campaign_heavy",
        "createdAt": "2026-08-24T12:00:00",
        "campaign_name": "Heavy campaign",
        "subject": "A subject",
        "source_type": "csv",
        "region": "North",
        "is_bounced": False,
        "csv_filename": "contacts.csv",
        "status": "Ready",
        "scheduled_at": None,
        "sent_count_final": 0,
        "target_count": 12,
        "performance": {"open_rate": 42.6, "click_rate": 5.4},
        "audiences": [
            {"region": "USA", "is_bounced": False},
            {"region": "EUR", "is_bounced": True},
        ],
        "segment": "dnr",
        "html_body": "<p>" + ("x" * 10_000) + "</p>",
        "sender_config": ["sender@example.com"],
        "mapping": {"email": "Email"},
    }
    (campaign_directories / "Campaign_heavy.json").write_text(
        json.dumps(config), encoding="utf-8"
    )

    response = client.get("/api/v1/sender/campaigns")

    assert response.status_code == 200
    assert response.json()[0]["audiences"] == config["audiences"]
    assert response.json()[0]["segment"] == "dnr"
    assert "html_body" not in response.json()[0]
    assert response.json() == [
        {
            key: value
            for key, value in config.items()
            if key not in {"html_body", "sender_config", "mapping"}
        }
        | {"progress": {"sent": 0, "total": 12, "percentage": 0.0}}
    ]


INVALID_CAMPAIGN_IDS = (
    "Campaign_safe%2F..%2Fescape",
    "Campaign_safe%5C..%5Cescape",
    "Campaign_..",
    "C:%5Ccampaign_data%5CCampaign_safe",
)


CAMPAIGN_ROUTE_MATRIX = (
    ("get", "/api/v1/sender/campaigns/{campaign_id}/details", None),
    ("put", "/api/v1/sender/campaigns/{campaign_id}", {"subject": "No access"}),
    ("post", "/api/v1/sender/campaigns/{campaign_id}/launch", None),
    ("post_file", "/api/v1/sender/campaigns/{campaign_id}/upload-csv", None),
    ("post", "/api/v1/sender/campaigns/{campaign_id}/send-test", {"emails": ["test@example.org"]}),
    ("get", "/api/v1/sender/campaigns/{campaign_id}/csv-preview", None),
    ("post", "/api/v1/sender/campaigns/{campaign_id}/save-mapping", {"email": "Email", "name": "Name", "has_header": True}),
    ("delete", "/api/v1/sender/campaigns/{campaign_id}", None),
    ("post", "/api/v1/sender/campaigns/{campaign_id}/pause", None),
    ("post", "/api/v1/sender/campaigns/{campaign_id}/resume", None),
    ("post", "/api/v1/sender/campaigns/{campaign_id}/cancel", None),
)


@pytest.mark.parametrize("encoded_campaign_id", INVALID_CAMPAIGN_IDS)
@pytest.mark.parametrize("method,path_template,payload", CAMPAIGN_ROUTE_MATRIX)
def test_every_campaign_route_rejects_invalid_ids_before_path_access(
    campaign_directories,
    method,
    path_template,
    payload,
    encoded_campaign_id,
):
    path = path_template.format(campaign_id=encoded_campaign_id)
    if method == "post_file":
        response = client.post(
            path,
            files={"csv_file": ("contacts.csv", b"Email,Name\na@example.org,A\n", "text/csv")},
        )
    else:
        response = client.request(method, path, json=payload)

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid campaign ID."}


def make_storage(tmp_path, *, now, lease_seconds=30):
    return CampaignFileStorage(
        tmp_path / "campaign_data",
        tmp_path / "sent_logs",
        tmp_path / "campaign_targets",
        lock_lease_seconds=lease_seconds,
        now=lambda: now[0],
    )


def test_lock_file_contains_owner_and_lease_metadata(tmp_path):
    now = [datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)]
    storage = make_storage(tmp_path, now=now)

    assert storage.acquire_launch_lock("Campaign_lease", "owner-a") == "owner-a"

    payload = json.loads(storage.launch_lock_path("Campaign_lease").read_text(encoding="utf-8"))
    assert payload == {
        "owner_id": "owner-a",
        "acquired_at": "2026-08-25T12:00:00+00:00",
        "expires_at": "2026-08-25T12:00:30+00:00",
    }


def test_live_lock_is_not_reclaimed_and_expired_lock_is_reclaimed(tmp_path):
    now = [datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)]
    storage = make_storage(tmp_path, now=now, lease_seconds=10)
    assert storage.acquire_launch_lock("Campaign_reclaim", "owner-a") == "owner-a"

    now[0] += timedelta(seconds=9)
    assert storage.acquire_launch_lock("Campaign_reclaim", "owner-b") is None
    assert storage.owns_launch_lock("Campaign_reclaim", "owner-a")

    now[0] += timedelta(seconds=2)
    assert storage.acquire_launch_lock("Campaign_reclaim", "owner-b") == "owner-b"
    assert not storage.release_launch_lock("Campaign_reclaim", "owner-a")
    assert storage.owns_launch_lock("Campaign_reclaim", "owner-b")


def test_legacy_owner_only_lock_uses_mtime_for_expiry(tmp_path):
    now = [datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)]
    storage = make_storage(tmp_path, now=now, lease_seconds=10)
    lock_path = storage.launch_lock_path("Campaign_legacy_lock")
    lock_path.parent.mkdir(parents=True)
    lock_path.write_text(json.dumps({"owner_id": "legacy-owner"}), encoding="utf-8")
    stale_mtime = (now[0] - timedelta(seconds=11)).timestamp()
    os.utime(lock_path, (stale_mtime, stale_mtime))

    assert storage.acquire_launch_lock("Campaign_legacy_lock", "new-owner") == "new-owner"
    assert storage.owns_launch_lock("Campaign_legacy_lock", "new-owner")


def test_renewal_extends_lease_and_release_remains_owner_checked(tmp_path):
    now = [datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)]
    storage = make_storage(tmp_path, now=now, lease_seconds=10)
    assert storage.acquire_launch_lock("Campaign_renew", "owner-a") == "owner-a"

    now[0] += timedelta(seconds=8)
    assert storage.renew_launch_lock("Campaign_renew", "owner-a")
    now[0] += timedelta(seconds=5)

    assert storage.acquire_launch_lock("Campaign_renew", "owner-b") is None
    assert not storage.release_launch_lock("Campaign_renew", "owner-b")
    assert storage.release_launch_lock("Campaign_renew", "owner-a")


def test_restart_recovery_preserves_live_owner_and_recovers_only_stale_work(tmp_path):
    now = [datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)]
    storage = make_storage(tmp_path, now=now, lease_seconds=10)
    for campaign_id in ("Campaign_live", "Campaign_stale", "Campaign_crashed"):
        storage.save_campaign(campaign_id, {"id": campaign_id, "status": "Sending"})

    assert storage.acquire_launch_lock("Campaign_live", "live-owner") == "live-owner"
    assert storage.acquire_launch_lock("Campaign_stale", "stale-owner") == "stale-owner"
    now[0] += timedelta(seconds=11)
    assert storage.renew_launch_lock("Campaign_live", "live-owner")

    recovered = storage.recover_interrupted_campaigns()

    assert recovered == ["Campaign_crashed", "Campaign_stale"]
    assert storage.load_campaign("Campaign_live")["status"] == "Sending"
    assert storage.owns_launch_lock("Campaign_live", "live-owner")
    assert storage.load_campaign("Campaign_stale")["status"] == "Interrupted"
    assert not storage.is_launch_locked("Campaign_stale")
