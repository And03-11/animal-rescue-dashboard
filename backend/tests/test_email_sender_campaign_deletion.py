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


def create_campaign_files(directories, campaign_id: str):
    campaign_data, sent_logs, targets = directories
    config_path = campaign_data / f"{campaign_id}.json"
    target_path = targets / f"target_{campaign_id}.csv"
    sent_path = sent_logs / f"sent_{campaign_id}.csv"
    config_path.write_text(
        json.dumps({"id": campaign_id, "status": "Sending"}), encoding="utf-8"
    )
    target_path.write_text("Email\none@example.com\n", encoding="utf-8")
    sent_path.write_text("Email\none@example.com\n", encoding="utf-8")
    return config_path, target_path, sent_path


def test_delete_campaign_preserves_204_and_removes_all_files(campaign_directories):
    campaign_id = "Campaign_delete"
    paths = create_campaign_files(campaign_directories, campaign_id)

    response = client.delete(f"/api/v1/sender/campaigns/{campaign_id}")

    assert response.status_code == 204
    assert response.content == b""
    assert all(not path.exists() for path in paths)


def test_delete_missing_campaign_preserves_404(campaign_directories):
    campaign_id = "Campaign_missing"

    response = client.delete(f"/api/v1/sender/campaigns/{campaign_id}")

    assert response.status_code == 404
    assert response.json() == {"detail": f"Campaign '{campaign_id}' not found."}


def test_delete_preserves_partial_failure_tolerance(campaign_directories, monkeypatch):
    campaign_id = "Campaign_partial_delete"
    config_path, target_path, sent_path = create_campaign_files(
        campaign_directories, campaign_id
    )
    real_remove = email_sender.os.remove

    def fail_only_for_target(path):
        if str(path).endswith(f"target_{campaign_id}.csv"):
            raise PermissionError("target file is locked")
        real_remove(path)

    monkeypatch.setattr(email_sender.os, "remove", fail_only_for_target)

    response = client.delete(f"/api/v1/sender/campaigns/{campaign_id}")

    assert response.status_code == 204
    assert not config_path.exists()
    assert target_path.exists()
    assert not sent_path.exists()


def test_cancel_campaign_preserves_204_and_removes_all_files(campaign_directories):
    campaign_id = "Campaign_cancel"
    paths = create_campaign_files(campaign_directories, campaign_id)

    response = client.post(f"/api/v1/sender/campaigns/{campaign_id}/cancel")

    assert response.status_code == 204
    assert response.content == b""
    assert all(not path.exists() for path in paths)


def test_cancel_missing_campaign_remains_idempotent(campaign_directories):
    response = client.post("/api/v1/sender/campaigns/Campaign_missing/cancel")

    assert response.status_code == 204
    assert response.content == b""
