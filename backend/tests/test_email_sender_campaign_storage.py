import json

import pytest
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import email_sender
from backend.app.core.security import get_current_user
from backend.app.main import app


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
    return campaign_data, sent_logs, targets


def test_list_campaigns_preserves_progress_shape(campaign_directories):
    campaign_data, sent_logs, _targets = campaign_directories
    campaign_id = "Campaign_progress"
    config = {
        "id": campaign_id,
        "campaign_name": "Progress campaign",
        "status": "Sending",
        "target_count": 4,
    }
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps(config), encoding="utf-8"
    )
    (sent_logs / f"sent_{campaign_id}.csv").write_text(
        "Email\none@example.com\ntwo@example.com\n", encoding="utf-8"
    )

    response = client.get("/api/v1/sender/campaigns")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                **config,
                "progress": {"sent": 2, "total": 4, "percentage": 50.0},
            }
        ],
        "total": 1,
    }


def test_list_campaigns_returns_requested_page_with_total(campaign_directories):
    campaign_data, sent_logs, _targets = campaign_directories
    configs = [
        {
            "id": f"Campaign_00{index}",
            "createdAt": f"2026-08-0{index}T12:00:00",
            "campaign_name": f"Campaign {index}",
            "subject": f"Subject {index}",
            "source_type": "csv",
            "status": "Ready",
            "target_count": 4,
        }
        for index in range(1, 4)
    ]
    for config in configs:
        (campaign_data / f"{config['id']}.json").write_text(
            json.dumps(config), encoding="utf-8"
        )
    (sent_logs / "sent_Campaign_002.csv").write_text(
        "Email\none@example.com\ntwo@example.com\n", encoding="utf-8"
    )

    response = client.get("/api/v1/sender/campaigns?page_size=1&offset=1")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                **configs[1],
                "progress": {"sent": 2, "total": 4, "percentage": 50.0},
            }
        ],
        "total": 3,
    }



def test_list_campaigns_omits_heavy_fields_from_summaries(campaign_directories):
    campaign_data, _sent_logs, _targets = campaign_directories
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
        "html_body": "<p>" + ("x" * 10_000) + "</p>",
        "audiences": [
            {"region": "USA", "is_bounced": False},
            {"region": "EUR", "is_bounced": True},
        ],
        "segment": "dnr",
        "sender_config": ["sender@example.com"],
        "mapping": {"email": "Email"},
    }
    (campaign_data / "Campaign_heavy.json").write_text(
        json.dumps(config), encoding="utf-8"
    )

    response = client.get("/api/v1/sender/campaigns?page_size=15&offset=0")

    assert response.status_code == 200
    assert response.json()["items"][0]["audiences"] == config["audiences"]
    assert response.json()["items"][0]["segment"] == "dnr"
    assert "html_body" not in response.json()["items"][0]
    assert response.json() == {
        "items": [
            {
                key: value
                for key, value in config.items()
                if key not in {"html_body", "sender_config", "mapping"}
            }
            | {
                "progress": {"sent": 0, "total": 12, "percentage": 0.0},
            }
        ],
        "total": 1,
    }

def test_campaign_details_preserve_contact_statuses(campaign_directories):
    campaign_data, sent_logs, targets = campaign_directories
    campaign_id = "Campaign_details"
    config = {"id": campaign_id, "campaign_name": "Details", "status": "Sending"}
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps(config), encoding="utf-8"
    )
    (targets / f"target_{campaign_id}.csv").write_text(
        "Email\nOne@Example.com\ntwo@example.com\n", encoding="utf-8"
    )
    (sent_logs / f"sent_{campaign_id}.csv").write_text(
        "Email\none@example.com\n", encoding="utf-8"
    )

    response = client.get(f"/api/v1/sender/campaigns/{campaign_id}/details")

    assert response.status_code == 200
    assert response.json() == {
        "details": config,
        "contacts": [
            {"email": "One@Example.com", "status": "Sent"},
            {"email": "two@example.com", "status": "Pending"},
        ],
    }


def test_pause_and_resume_preserve_state_contract(campaign_directories):
    campaign_data, _sent_logs, _targets = campaign_directories
    campaign_id = "Campaign_state"
    config_path = campaign_data / f"{campaign_id}.json"
    config_path.write_text(
        json.dumps({"id": campaign_id, "status": "Sending"}), encoding="utf-8"
    )

    paused = client.post(f"/api/v1/sender/campaigns/{campaign_id}/pause")
    resumed = client.post(f"/api/v1/sender/campaigns/{campaign_id}/resume")

    assert paused.status_code == 200
    assert paused.json()["status"] == "Paused"
    assert isinstance(paused.json()["last_updated"], str)
    assert resumed.status_code == 200
    assert resumed.json()["status"] == "Sending"
    assert json.loads(config_path.read_text(encoding="utf-8"))["status"] == "Sending"


def test_resume_rejects_non_paused_campaign(campaign_directories):
    campaign_data, _sent_logs, _targets = campaign_directories
    campaign_id = "Campaign_ready"
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps({"id": campaign_id, "status": "Ready"}), encoding="utf-8"
    )

    response = client.post(f"/api/v1/sender/campaigns/{campaign_id}/resume")

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Campaign cannot be resumed from status 'Ready'. Must be 'Paused'."
    }
