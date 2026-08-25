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
