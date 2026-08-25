import json

import pytest
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import email_sender
from backend.app.core.security import get_current_user
from backend.app.main import app
from backend.app.services.airtable_service import AirtableCampaignQueryError
from backend.app.services.campaign_audiences import AudienceCount, AudienceResolution


client = TestClient(app)


class FakeEmailSenderService:
    def __init__(self):
        self.created: list[dict] = []
        self.updated: list[tuple[str, dict]] = []

    def create_campaign(self, config):
        self.created.append(config.copy())

    def update_campaign(self, campaign_id, updates):
        self.updated.append((campaign_id, updates.copy()))


class FakeAirtableService:
    resolution = AudienceResolution(
        contacts=(
            {"Email": "one@example.org", "Name": "One"},
            {"Email": "two@example.org", "Name": "Two"},
        ),
        branches=(
            AudienceCount(region="EUR", is_bounced=False, count=2),
        ),
    )

    def resolve_campaign_audiences(self, audiences, segment):
        self.received = (audiences, segment)
        return self.resolution

    def get_campaign_contacts(self, **_filters):
        return []


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
def write_environment(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    sent_logs = tmp_path / "sent_logs"
    targets = tmp_path / "campaign_targets"
    campaign_data.mkdir()
    sent_logs.mkdir()
    targets.mkdir()

    remote_service = FakeEmailSenderService()
    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "SENT_LOGS_DIR", str(sent_logs))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(targets))
    monkeypatch.setattr(email_sender, "AirtableService", FakeAirtableService)
    monkeypatch.setattr(email_sender, "get_email_sender_service", lambda: remote_service)
    return campaign_data, sent_logs, targets, remote_service


def test_create_csv_campaign_preserves_files_and_remote_sync(write_environment):
    campaign_data, _sent_logs, targets, remote_service = write_environment

    response = client.post(
        "/api/v1/sender/campaigns",
        json={
            "source_type": "csv",
            "subject": "Welcome",
            "html_body": "<p>Hello</p>",
            "campaign_name": "July campaign",
            "sender_config": "all",
            "segment": "standard",
        },
    )

    assert response.status_code == 201
    created = response.json()
    campaign_id = created["id"]
    assert campaign_id.startswith("Campaign_")
    assert created["status"] == "Draft"
    assert created["target_count"] == 0
    assert (campaign_data / f"{campaign_id}.json").exists()
    assert (targets / f"target_{campaign_id}.csv").exists()
    assert json.loads(
        (campaign_data / f"{campaign_id}.json").read_text(encoding="utf-8")
    ) == created
    assert remote_service.created[0]["id"] == campaign_id
    assert remote_service.created[0]["status"] == "Draft"


def test_update_campaign_preserves_status_transition_and_remote_payload(write_environment):
    campaign_data, _sent_logs, _targets, remote_service = write_environment
    campaign_id = "Campaign_update"
    config_path = campaign_data / f"{campaign_id}.json"
    config_path.write_text(
        json.dumps(
            {
                "id": campaign_id,
                "source_type": "csv",
                "campaign_name": "Original",
                "subject": "Old",
                "html_body": "<p>Old</p>",
                "sender_config": "all",
                "status": "Ready",
                "mapping": {"email": "Email", "name": "Name", "has_header": True},
            }
        ),
        encoding="utf-8",
    )

    response = client.put(
        f"/api/v1/sender/campaigns/{campaign_id}",
        json={"subject": "Updated", "scheduled_at": "2026-07-15T12:00:00"},
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["subject"] == "Updated"
    assert updated["scheduled_at"] == "2026-07-15T12:00:00"
    assert updated["status"] == "Scheduled"
    assert json.loads(config_path.read_text(encoding="utf-8"))["status"] == "Scheduled"
    assert remote_service.updated == [
        (
            campaign_id,
            {
                "campaign_name": "Original",
                "subject": "Updated",
                "html_body": "<p>Old</p>",
                "sender_config": "all",
                "scheduled_at": "2026-07-15T12:00:00",
                "status": "Scheduled",
            },
        )
    ]


def test_upload_csv_preserves_file_and_config_metadata(write_environment):
    campaign_data, _sent_logs, targets, _remote_service = write_environment
    campaign_id = "Campaign_upload"
    config_path = campaign_data / f"{campaign_id}.json"
    config_path.write_text(
        json.dumps({"id": campaign_id, "source_type": "csv", "status": "Draft"}),
        encoding="utf-8",
    )
    csv_contents = b"Email,Name\nana@example.com,Ana\n"

    response = client.post(
        f"/api/v1/sender/campaigns/{campaign_id}/upload-csv",
        files={"csv_file": ("contacts.csv", csv_contents, "text/csv")},
    )

    assert response.status_code == 200
    target_path = targets / f"target_{campaign_id}.csv"
    assert target_path.read_bytes() == csv_contents
    assert json.loads(config_path.read_text(encoding="utf-8"))["csv_filename"] == "contacts.csv"
    assert response.json() == {
        "message": f"CSV file 'contacts.csv' uploaded successfully for campaign {campaign_id}.",
        "target_path": str(target_path),
    }


def test_save_mapping_preserves_count_status_and_remote_sync(write_environment):
    campaign_data, _sent_logs, targets, remote_service = write_environment
    campaign_id = "Campaign_mapping"
    config_path = campaign_data / f"{campaign_id}.json"
    config_path.write_text(
        json.dumps({"id": campaign_id, "source_type": "csv", "status": "Draft"}),
        encoding="utf-8",
    )
    (targets / f"target_{campaign_id}.csv").write_text(
        "Email,Name\nana@example.com,Ana\nleo@example.com,Leo\n",
        encoding="utf-8-sig",
    )

    response = client.post(
        f"/api/v1/sender/campaigns/{campaign_id}/save-mapping",
        json={"email": "Email", "name": "Name", "has_header": True},
    )

    assert response.status_code == 200
    mapped = response.json()
    assert mapped["mapping"] == {
        "email": "Email",
        "name": "Name",
        "has_header": True,
    }
    assert mapped["target_count"] == 2
    assert mapped["status"] == "Ready"
    assert json.loads(config_path.read_text(encoding="utf-8")) == mapped
    assert remote_service.updated == [
        (
            campaign_id,
            {
                "mapping": mapped["mapping"],
                "target_count": 2,
                "status": "Ready",
            },
        )
    ]

def test_audience_preview_returns_branch_and_unique_counts(write_environment):
    response = client.post(
        "/api/v1/sender/audience-preview",
        json={
            "audiences": [{"region": "EUR", "is_bounced": False}],
            "segment": "standard",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "branches": [{"region": "EUR", "is_bounced": False, "count": 2}],
        "total_unique": 2,
    }

@pytest.mark.parametrize(
    "audiences",
    [
        [],
        [{"region": "USA", "is_bounced": False}] * 5,
        [
            {"region": "EUR", "is_bounced": False},
            {"region": "EUR", "is_bounced": False},
        ],
    ],
)
def test_audience_preview_rejects_invalid_or_duplicate_branches(
    write_environment, audiences
):
    response = client.post(
        "/api/v1/sender/audience-preview",
        json={"audiences": audiences},
    )
    assert response.status_code == 422


def test_audience_preview_maps_airtable_query_failure_to_502(
    write_environment, monkeypatch
):
    class FailingAirtableService(FakeAirtableService):
        def resolve_campaign_audiences(self, audiences, segment):
            raise AirtableCampaignQueryError("offline")

    monkeypatch.setattr(email_sender, "AirtableService", FailingAirtableService)
    response = client.post(
        "/api/v1/sender/audience-preview",
        json={"audiences": [{"region": "USA", "is_bounced": False}]},
    )
    assert response.status_code == 502
    assert response.json()["detail"] == "Unable to load Airtable audience. Try again."


def test_create_airtable_campaign_normalizes_audiences_and_keeps_csv_compatible(
    write_environment
):
    campaign_data, _sent_logs, targets, remote_service = write_environment
    airtable = client.post(
        "/api/v1/sender/campaigns",
        json={
            "source_type": "airtable",
            "subject": "Welcome",
            "html_body": "<p>Hello</p>",
            "campaign_name": "Combined",
            "audiences": [
                {"region": "EUR", "is_bounced": False},
                {"region": "USA", "is_bounced": True},
            ],
        },
    )
    assert airtable.status_code == 201
    created = airtable.json()
    assert created["audiences"] == [
        {"region": "USA", "is_bounced": True},
        {"region": "EUR", "is_bounced": False},
    ]
    assert created["region"] is None and created["is_bounced"] is None
    assert created["target_count"] == 2
    assert (targets / f"target_{created['id']}.csv").read_text(
        encoding="utf-8"
    ).splitlines() == ["Email", "one@example.org", "two@example.org"]
    assert json.loads((campaign_data / f"{created['id']}.json").read_text())["audiences"] == created["audiences"]
    assert remote_service.created[-1]["target_count"] == 2

    legacy = client.post(
        "/api/v1/sender/campaigns",
        json={
            "source_type": "airtable", "subject": "Legacy", "html_body": "x",
            "campaign_name": "Legacy", "region": "EUR", "is_bounced": False,
        },
    )
    assert legacy.status_code == 201
    assert legacy.json()["audiences"] == [{"region": "EUR", "is_bounced": False}]
    assert legacy.json()["region"] == "EUR"

    csv = client.post(
        "/api/v1/sender/campaigns",
        json={
            "source_type": "csv", "subject": "CSV", "html_body": "x",
            "campaign_name": "CSV",
        },
    )
    assert csv.status_code == 201


def test_scheduled_airtable_campaign_requires_targets_but_draft_does_not(
    write_environment, monkeypatch
):
    monkeypatch.setattr(
        FakeAirtableService, "resolution",
        AudienceResolution(
            contacts=(),
            branches=(AudienceCount(region="USA", is_bounced=False, count=0),),
        ),
    )
    payload = {
        "source_type": "airtable", "subject": "Empty", "html_body": "x",
        "campaign_name": "Empty", "audiences": [{"region": "USA", "is_bounced": False}],
    }
    scheduled = client.post(
        "/api/v1/sender/campaigns",
        json={**payload, "scheduled_at": "2026-07-15T12:00:00"},
    )
    draft = client.post("/api/v1/sender/campaigns", json=payload)
    assert scheduled.status_code == 422
    assert scheduled.json()["detail"] == "Scheduled campaigns require at least one eligible recipient."
    assert draft.status_code == 201 and draft.json()["target_count"] == 0


def test_update_campaign_replaces_normalized_audiences_and_targets(
    write_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, remote_service = write_environment
    campaign_id = "Campaign_audience_update"
    (campaign_data / f"{campaign_id}.json").write_text(json.dumps({
        "id": campaign_id, "source_type": "airtable", "campaign_name": "Original",
        "subject": "Old", "html_body": "x", "sender_config": "all", "status": "Draft",
        "region": "EUR", "is_bounced": False, "segment": "standard", "target_count": 99,
    }), encoding="utf-8")
    monkeypatch.setattr(
        FakeAirtableService, "resolution",
        AudienceResolution(
            contacts=({"Email": "fresh@example.org", "Name": "Fresh"},),
            branches=(AudienceCount(region="USA", is_bounced=True, count=1),),
        ),
    )
    response = client.put(
        f"/api/v1/sender/campaigns/{campaign_id}",
        json={"audiences": [{"region": "USA", "is_bounced": True}]},
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["audiences"] == [{"region": "USA", "is_bounced": True}]
    assert updated["region"] == "USA" and updated["is_bounced"] is True
    assert updated["target_count"] == 1
    assert (targets / f"target_{campaign_id}.csv").read_text(
        encoding="utf-8"
    ).splitlines() == ["Email", "fresh@example.org"]
    assert remote_service.updated[-1][1]["audiences"] == updated["audiences"]
    assert remote_service.updated[-1][1]["target_count"] == 1
    assert remote_service.updated[-1][1]["segment"] == "standard"
