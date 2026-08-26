import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import email_sender
from backend.app.core.security import get_current_user
from backend.app.main import app


client = TestClient(app)


class FakeGmailService:
    def __init__(self, credential_name: str):
        self.credentials_path = str(Path("gmail_credentials") / credential_name)
        self.sent_messages: list[dict[str, str]] = []

    def send_email(self, *, to_email: str, subject: str, html_body: str) -> bool:
        self.sent_messages.append(
            {"to_email": to_email, "subject": subject, "html_body": html_body}
        )
        return True


class FakeCredentialsManager:
    def __init__(self, services: list[FakeGmailService]):
        self.services = services
        self.requested_sender_config = None

    def get_gmail_services(self, sender_config):
        self.requested_sender_config = sender_config
        return self.services


@pytest.fixture(autouse=True)
def authenticated_admin():
    previous_override = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: "admin@example.com"
    yield
    if previous_override is None:
        app.dependency_overrides.pop(get_current_user, None)
    else:
        app.dependency_overrides[get_current_user] = previous_override


def test_campaign_test_email_preserves_rotation_and_personalization(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    campaign_data.mkdir()
    campaign_id = "Campaign_test_delivery"
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps(
            {
                "id": campaign_id,
                "subject": "Saved subject",
                "html_body": "Hello {{name}} / *|FNAME|*",
                "sender_config": "all",
            }
        ),
        encoding="utf-8",
    )

    first_service = FakeGmailService("account-one.json")
    second_service = FakeGmailService("account-two.json")
    manager = FakeCredentialsManager([first_service, second_service])
    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "credentials_manager_instance", manager)
    monkeypatch.setattr(email_sender.time, "sleep", lambda _seconds: None)

    response = client.post(
        f"/api/v1/sender/campaigns/{campaign_id}/send-test",
        json={"emails": ["one@example.com", "two@example.com"]},
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Test emails processed",
        "results": [
            {"email": "one@example.com", "status": "Sent", "sender": "account-one.json"},
            {"email": "two@example.com", "status": "Sent", "sender": "account-two.json"},
        ],
    }
    assert first_service.sent_messages == [
        {
            "to_email": "one@example.com",
            "subject": "[TEST] Saved subject",
            "html_body": "Hello Test User / Test User",
        }
    ]
    assert second_service.sent_messages[0]["to_email"] == "two@example.com"
    assert manager.requested_sender_config == "all"


def test_adhoc_test_email_preserves_response_shape(tmp_path, monkeypatch):
    service = FakeGmailService("adhoc-account.json")
    manager = FakeCredentialsManager([service])
    monkeypatch.setattr(email_sender, "credentials_manager_instance", manager)
    monkeypatch.setattr(email_sender.time, "sleep", lambda _seconds: None)

    response = client.post(
        "/api/v1/sender/send-test-adhoc",
        json={
            "emails": ["test@example.com"],
            "subject": "Ad-hoc subject",
            "html_body": "Hi {{name}}",
            "sender_config": ["account-id"],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Ad-hoc test emails processed",
        "results": [
            {"email": "test@example.com", "status": "Sent", "sender": "adhoc-account.json"}
        ],
    }
    assert service.sent_messages[0] == {
        "to_email": "test@example.com",
        "subject": "[TEST] Ad-hoc subject",
        "html_body": "Hi Test User",
    }
    assert manager.requested_sender_config == ["account-id"]

class FailingGmailService(FakeGmailService):
    def __init__(self, credential_name: str, *, succeeds: bool):
        super().__init__(credential_name)
        self.succeeds = succeeds

    def send_email(self, *, to_email: str, subject: str, html_body: str) -> bool:
        super().send_email(to_email=to_email, subject=subject, html_body=html_body)
        return self.succeeds


def test_campaign_test_delivery_returns_502_when_every_address_fails(
    tmp_path,
    monkeypatch,
):
    campaign_data = tmp_path / "campaign_data"
    campaign_data.mkdir()
    campaign_id = "Campaign_test_all_failed"
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps(
            {
                "id": campaign_id,
                "subject": "Saved subject",
                "html_body": "Hello",
                "sender_config": "all",
            }
        ),
        encoding="utf-8",
    )
    manager = FakeCredentialsManager(
        [FailingGmailService("failed-account.json", succeeds=False)]
    )
    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "credentials_manager_instance", manager)
    monkeypatch.setattr(email_sender.time, "sleep", lambda _seconds: None)

    response = client.post(
        f"/api/v1/sender/campaigns/{campaign_id}/send-test",
        json={"emails": ["one@example.com", "two@example.com"]},
    )

    assert response.status_code == 502
    assert response.json()["message"] == "No test emails were delivered"
    assert [result["status"] for result in response.json()["results"]] == [
        "Failed",
        "Failed",
    ]


def test_adhoc_test_delivery_returns_207_for_partial_failure(
    monkeypatch,
):
    manager = FakeCredentialsManager(
        [
            FailingGmailService("sent-account.json", succeeds=True),
            FailingGmailService("failed-account.json", succeeds=False),
        ]
    )
    monkeypatch.setattr(email_sender, "credentials_manager_instance", manager)
    monkeypatch.setattr(email_sender.time, "sleep", lambda _seconds: None)

    response = client.post(
        "/api/v1/sender/send-test-adhoc",
        json={
            "emails": ["sent@example.com", "failed@example.com"],
            "subject": "Ad-hoc subject",
            "html_body": "Hi {{name}}",
            "sender_config": "all",
        },
    )

    assert response.status_code == 207
    assert response.json()["message"] == "Some test emails failed"
    assert [result["status"] for result in response.json()["results"]] == [
        "Sent",
        "Failed",
    ]
