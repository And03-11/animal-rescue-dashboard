import json
import logging
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import email_sender
from backend.app.core.security import get_current_user
from backend.app.services import campaign_storage
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


def test_update_campaign_legacy_filters_override_stored_audiences(
    write_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, remote_service = write_environment
    campaign_id = "Campaign_legacy_audience_update"
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps(
            {
                "id": campaign_id,
                "source_type": "airtable",
                "campaign_name": "Original",
                "subject": "Old",
                "html_body": "x",
                "sender_config": "all",
                "status": "Draft",
                "audiences": [{"region": "EUR", "is_bounced": False}],
                "region": "EUR",
                "is_bounced": False,
                "segment": "standard",
                "target_count": 2,
            }
        ),
        encoding="utf-8",
    )
    (targets / f"target_{campaign_id}.csv").write_text(
        "Email\nold@example.org\n", encoding="utf-8"
    )

    class CapturingAirtableService(FakeAirtableService):
        received = []
        resolution = AudienceResolution(
            contacts=({"Email": "usa@example.org", "Name": "USA"},),
            branches=(AudienceCount(region="USA", is_bounced=True, count=1),),
        )

        def resolve_campaign_audiences(self, audiences, segment):
            self.received.append(
                ([(branch.region, branch.is_bounced) for branch in audiences], segment)
            )
            return self.resolution

    monkeypatch.setattr(
        email_sender, "AirtableService", CapturingAirtableService
    )
    response = client.put(
        f"/api/v1/sender/campaigns/{campaign_id}",
        json={"region": "USA", "is_bounced": True},
    )

    assert response.status_code == 200
    updated = response.json()
    assert CapturingAirtableService.received == [([("USA", True)], "standard")]
    assert updated["audiences"] == [{"region": "USA", "is_bounced": True}]
    assert updated["region"] == "USA"
    assert updated["is_bounced"] is True
    assert updated["target_count"] == 1
    assert (targets / f"target_{campaign_id}.csv").read_text(
        encoding="utf-8"
    ).splitlines() == ["Email", "usa@example.org"]
    assert remote_service.updated[-1][1]["audiences"] == updated["audiences"]
    assert remote_service.updated[-1][1]["target_count"] == 1


INVALID_EXPLICIT_AUDIENCES = [
    [],
    [{"region": "USA", "is_bounced": False}] * 5,
    [
        {"region": "USA", "is_bounced": True},
        {"region": "USA", "is_bounced": True},
    ],
]


@pytest.mark.parametrize("audiences", INVALID_EXPLICIT_AUDIENCES)
def test_create_rejects_invalid_explicit_audiences_without_legacy_fallback(
    write_environment, audiences
):
    response = client.post(
        "/api/v1/sender/campaigns",
        json={
            "source_type": "airtable",
            "subject": "Invalid",
            "html_body": "x",
            "campaign_name": "Invalid audiences",
            "audiences": audiences,
            "region": "EUR",
            "is_bounced": False,
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize("audiences", INVALID_EXPLICIT_AUDIENCES)
def test_update_rejects_invalid_explicit_audiences_without_legacy_fallback(
    write_environment, audiences
):
    campaign_data, _sent_logs, _targets, remote_service = write_environment
    campaign_id = "Campaign_invalid_audiences"
    config_path = campaign_data / f"{campaign_id}.json"
    original = {
        "id": campaign_id,
        "source_type": "airtable",
        "campaign_name": "Original",
        "subject": "Old",
        "html_body": "x",
        "sender_config": "all",
        "status": "Draft",
        "audiences": [{"region": "EUR", "is_bounced": False}],
        "region": "EUR",
        "is_bounced": False,
        "segment": "standard",
        "target_count": 2,
    }
    config_path.write_text(json.dumps(original), encoding="utf-8")

    response = client.put(
        f"/api/v1/sender/campaigns/{campaign_id}",
        json={
            "audiences": audiences,
            "region": "USA",
            "is_bounced": True,
        },
    )

    assert response.status_code == 422
    assert json.loads(config_path.read_text(encoding="utf-8")) == original
    assert remote_service.updated == []


@pytest.mark.parametrize(
    "target_fields",
    [{"target_count": 0}, {}],
    ids=["zero", "missing"],
)
def test_schedule_only_update_rejects_empty_airtable_campaign_without_resolving(
    write_environment, monkeypatch, target_fields
):
    campaign_data, _sent_logs, _targets, remote_service = write_environment
    campaign_id = "Campaign_schedule_empty"
    config_path = campaign_data / f"{campaign_id}.json"
    original = {
        "id": campaign_id,
        "source_type": "airtable",
        "campaign_name": "Empty",
        "subject": "Empty",
        "html_body": "x",
        "sender_config": "all",
        "status": "Draft",
        "audiences": [{"region": "USA", "is_bounced": False}],
        "region": "USA",
        "is_bounced": False,
        "segment": "standard",
        **target_fields,
    }
    config_path.write_text(json.dumps(original), encoding="utf-8")

    class UnexpectedResolver(FakeAirtableService):
        def resolve_campaign_audiences(self, audiences, segment):
            raise AssertionError("schedule-only updates must not resolve audiences")

    monkeypatch.setattr(email_sender, "AirtableService", UnexpectedResolver)
    response = client.put(
        f"/api/v1/sender/campaigns/{campaign_id}",
        json={"scheduled_at": "2026-07-15T12:00:00"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Scheduled campaigns require at least one eligible recipient."
    )
    assert json.loads(config_path.read_text(encoding="utf-8")) == original
    assert remote_service.updated == []


def test_update_campaign_rolls_back_targets_when_config_commit_fails(
    write_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, remote_service = write_environment
    campaign_id = "Campaign_atomic_failure"
    config_path = campaign_data / f"{campaign_id}.json"
    target_path = targets / f"target_{campaign_id}.csv"
    original = {
        "id": campaign_id,
        "source_type": "airtable",
        "campaign_name": "Original",
        "subject": "Old",
        "html_body": "x",
        "sender_config": "all",
        "status": "Draft",
        "audiences": [{"region": "EUR", "is_bounced": False}],
        "region": "EUR",
        "is_bounced": False,
        "segment": "standard",
        "target_count": 1,
    }
    config_path.write_text(json.dumps(original), encoding="utf-8")
    target_path.write_text("Email\nold@example.org\n", encoding="utf-8")

    class UpdatedAirtableService(FakeAirtableService):
        resolution = AudienceResolution(
            contacts=({"Email": "new@example.org", "Name": "New"},),
            branches=(AudienceCount(region="USA", is_bounced=True, count=1),),
        )

    monkeypatch.setattr(email_sender, "AirtableService", UpdatedAirtableService)
    real_replace = campaign_storage.os.replace

    def fail_config_commit(source, destination):
        if Path(destination) == config_path:
            raise OSError("simulated config commit failure")
        return real_replace(source, destination)

    monkeypatch.setattr(campaign_storage.os, "replace", fail_config_commit)
    response = client.put(
        f"/api/v1/sender/campaigns/{campaign_id}",
        json={"audiences": [{"region": "USA", "is_bounced": True}]},
    )

    assert response.status_code == 500
    assert json.loads(config_path.read_text(encoding="utf-8")) == original
    assert target_path.read_text(encoding="utf-8").splitlines() == [
        "Email",
        "old@example.org",
    ]
    assert remote_service.updated == []
    assert not email_sender._get_campaign_storage().is_launch_locked(campaign_id)


def test_update_campaign_does_not_mutate_while_campaign_lock_is_held(
    write_environment
):
    campaign_data, _sent_logs, targets, remote_service = write_environment
    campaign_id = "Campaign_locked_update"
    config_path = campaign_data / f"{campaign_id}.json"
    target_path = targets / f"target_{campaign_id}.csv"
    original = {
        "id": campaign_id,
        "source_type": "airtable",
        "campaign_name": "Original",
        "subject": "Old",
        "html_body": "x",
        "sender_config": "all",
        "status": "Draft",
        "audiences": [{"region": "EUR", "is_bounced": False}],
        "region": "EUR",
        "is_bounced": False,
        "segment": "standard",
        "target_count": 1,
    }
    config_path.write_text(json.dumps(original), encoding="utf-8")
    target_path.write_text("Email\nold@example.org\n", encoding="utf-8")
    storage = email_sender._get_campaign_storage()
    owner_id = storage.acquire_launch_lock(campaign_id, "existing-owner")
    assert owner_id == "existing-owner"

    try:
        response = client.put(
            f"/api/v1/sender/campaigns/{campaign_id}",
            json={"audiences": [{"region": "USA", "is_bounced": True}]},
        )

        assert response.status_code == 409
        assert storage.owns_launch_lock(campaign_id, "existing-owner")
        assert json.loads(config_path.read_text(encoding="utf-8")) == original
        assert target_path.read_text(encoding="utf-8").splitlines() == [
            "Email",
            "old@example.org",
        ]
        assert remote_service.updated == []
    finally:
        storage.release_launch_lock(campaign_id, "existing-owner")


def test_update_campaign_logs_unexpected_failure_and_returns_stable_500(
    write_environment, caplog
):
    campaign_data, _sent_logs, _targets, remote_service = write_environment
    campaign_id = "Campaign_broken_json"
    config_path = campaign_data / f"{campaign_id}.json"
    config_path.write_text('{"broken":', encoding="utf-8")

    with caplog.at_level(
        logging.ERROR,
        logger="backend.app.api.v1.endpoints.email_sender",
    ):
        response = client.put(
            f"/api/v1/sender/campaigns/{campaign_id}",
            json={"subject": "Updated"},
        )

    assert response.status_code == 500
    assert response.json() == {
        "detail": "Unable to update campaign. Try again."
    }
    assert remote_service.updated == []
    assert any(
        campaign_id in record.getMessage() and record.exc_info
        for record in caplog.records
    )


def test_plain_update_holds_shared_lock_before_read_when_interleaved(
    write_environment, monkeypatch
):
    campaign_data, sent_logs, targets, remote_service = write_environment
    campaign_id = "Campaign_interleaved_update"
    config_path = campaign_data / f"{campaign_id}.json"
    target_path = targets / f"target_{campaign_id}.csv"
    original = {
        "id": campaign_id,
        "source_type": "airtable",
        "campaign_name": "Original",
        "subject": "Old subject",
        "html_body": "x",
        "sender_config": "all",
        "status": "Draft",
        "audiences": [{"region": "EUR", "is_bounced": False}],
        "region": "EUR",
        "is_bounced": False,
        "segment": "standard",
        "target_count": 1,
    }
    config_path.write_text(json.dumps(original), encoding="utf-8")
    target_path.write_text("Email\nold@example.org\n", encoding="utf-8")

    plain_loaded = threading.Event()
    release_plain = threading.Event()

    class BlockingStorage(campaign_storage.CampaignFileStorage):
        def load_campaign(self, requested_campaign_id):
            config = super().load_campaign(requested_campaign_id)
            if threading.current_thread().name == "plain-update":
                plain_loaded.set()
                if not release_plain.wait(timeout=5):
                    raise AssertionError("plain update was not released")
            return config

    storage = BlockingStorage(campaign_data, sent_logs, targets)
    monkeypatch.setattr(email_sender, "_get_campaign_storage", lambda: storage)

    class UpdatedAirtableService(FakeAirtableService):
        resolution = AudienceResolution(
            contacts=({"Email": "new@example.org", "Name": "New"},),
            branches=(AudienceCount(region="USA", is_bounced=True, count=1),),
        )

    monkeypatch.setattr(email_sender, "AirtableService", UpdatedAirtableService)
    plain_result = {}

    def run_plain_update():
        try:
            plain_result["config"] = email_sender.update_campaign(
                campaign_id,
                email_sender.CampaignUpdateRequest(subject="New subject"),
                "admin@example.com",
            )
        except Exception as error:  # pragma: no cover - asserted below
            plain_result["error"] = error

    plain_thread = threading.Thread(target=run_plain_update, name="plain-update")
    plain_thread.start()
    assert plain_loaded.wait(timeout=5)

    try:
        with pytest.raises(email_sender.HTTPException) as locked:
            email_sender.update_campaign(
                campaign_id,
                email_sender.CampaignUpdateRequest(
                    audiences=[{"region": "USA", "is_bounced": True}]
                ),
                "admin@example.com",
            )
        assert locked.value.status_code == 409
    finally:
        release_plain.set()
        plain_thread.join(timeout=5)

    assert not plain_thread.is_alive()
    assert "error" not in plain_result
    assert plain_result["config"]["subject"] == "New subject"
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["subject"] == "New subject"
    assert stored["audiences"] == original["audiences"]
    assert target_path.read_text(encoding="utf-8").splitlines() == [
        "Email",
        "old@example.org",
    ]
    assert len(remote_service.updated) == 1


def test_update_campaign_releases_lock_when_target_backup_read_fails(
    write_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, remote_service = write_environment
    campaign_id = "Campaign_backup_read_failure"
    config_path = campaign_data / f"{campaign_id}.json"
    target_path = targets / f"target_{campaign_id}.csv"
    original = {
        "id": campaign_id,
        "source_type": "airtable",
        "status": "Draft",
        "audiences": [{"region": "EUR", "is_bounced": False}],
        "region": "EUR",
        "is_bounced": False,
        "segment": "standard",
        "target_count": 1,
    }
    config_path.write_text(json.dumps(original), encoding="utf-8")
    target_path.write_text("Email\nold@example.org\n", encoding="utf-8")
    real_read_bytes = Path.read_bytes

    def fail_target_backup(path):
        if path == target_path:
            raise OSError("simulated target backup read failure")
        return real_read_bytes(path)

    monkeypatch.setattr(Path, "read_bytes", fail_target_backup)
    response = client.put(
        f"/api/v1/sender/campaigns/{campaign_id}",
        json={"audiences": [{"region": "USA", "is_bounced": True}]},
    )

    assert response.status_code == 500
    assert not email_sender._get_campaign_storage().is_launch_locked(campaign_id)
    assert json.loads(config_path.read_text(encoding="utf-8")) == original
    assert target_path.read_text(encoding="utf-8").splitlines() == [
        "Email",
        "old@example.org",
    ]
    assert remote_service.updated == []


def test_update_campaign_releases_lock_when_target_directory_creation_fails(
    write_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, remote_service = write_environment
    campaign_id = "Campaign_directory_failure"
    config_path = campaign_data / f"{campaign_id}.json"
    original = {
        "id": campaign_id,
        "source_type": "airtable",
        "status": "Draft",
        "audiences": [{"region": "EUR", "is_bounced": False}],
        "region": "EUR",
        "is_bounced": False,
        "segment": "standard",
        "target_count": 1,
    }
    config_path.write_text(json.dumps(original), encoding="utf-8")
    real_mkdir = Path.mkdir

    def fail_target_directory(path, *args, **kwargs):
        if path == targets:
            raise OSError("simulated target directory creation failure")
        return real_mkdir(path, *args, **kwargs)

    monkeypatch.setattr(Path, "mkdir", fail_target_directory)
    response = client.put(
        f"/api/v1/sender/campaigns/{campaign_id}",
        json={"audiences": [{"region": "USA", "is_bounced": True}]},
    )

    assert response.status_code == 500
    assert not email_sender._get_campaign_storage().is_launch_locked(campaign_id)
    assert json.loads(config_path.read_text(encoding="utf-8")) == original
    assert remote_service.updated == []


def test_update_campaign_logs_cleanup_failure_and_releases_lock(
    write_environment, monkeypatch, caplog
):
    campaign_data, _sent_logs, targets, remote_service = write_environment
    campaign_id = "Campaign_cleanup_failure"
    config_path = campaign_data / f"{campaign_id}.json"
    target_path = targets / f"target_{campaign_id}.csv"
    config_path.write_text(
        json.dumps(
            {
                "id": campaign_id,
                "source_type": "airtable",
                "status": "Draft",
                "audiences": [{"region": "EUR", "is_bounced": False}],
                "region": "EUR",
                "is_bounced": False,
                "segment": "standard",
                "target_count": 1,
            }
        ),
        encoding="utf-8",
    )
    target_path.write_text("Email\nold@example.org\n", encoding="utf-8")
    real_unlink = Path.unlink

    def fail_temporary_cleanup(path, *args, **kwargs):
        if path.name.endswith(".tmp"):
            raise OSError("simulated temporary cleanup failure")
        return real_unlink(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", fail_temporary_cleanup)
    with caplog.at_level(
        logging.WARNING,
        logger="backend.app.services.campaign_storage",
    ):
        response = client.put(
            f"/api/v1/sender/campaigns/{campaign_id}",
            json={"audiences": [{"region": "USA", "is_bounced": True}]},
        )

    assert response.status_code == 200
    assert not email_sender._get_campaign_storage().is_launch_locked(campaign_id)
    assert response.json()["audiences"] == [
        {"region": "USA", "is_bounced": True}
    ]
    assert target_path.read_text(encoding="utf-8").splitlines() == [
        "Email",
        "one@example.org",
        "two@example.org",
    ]
    assert len(remote_service.updated) == 1
    assert any(
        campaign_id in record.getMessage()
        and "temporary" in record.getMessage().lower()
        for record in caplog.records
    )


@pytest.mark.parametrize(
    "campaign_id",
    [
        "../escaped",
        "..\\escaped",
        "Campaign_bad/child",
        "Campaign_bad\\child",
        "Campaign bad",
        "not-a-campaign",
    ],
)
def test_campaign_storage_rejects_invalid_ids_before_path_access(
    tmp_path, campaign_id
):
    storage = campaign_storage.CampaignFileStorage(
        tmp_path / "campaign_data",
        tmp_path / "sent_logs",
        tmp_path / "campaign_targets",
    )

    for path_method in (
        storage.campaign_path,
        storage.target_path,
        storage.sent_log_path,
        storage.launch_lock_path,
    ):
        with pytest.raises(ValueError, match="Invalid campaign ID"):
            path_method(campaign_id)


def test_campaign_storage_preserves_canonical_campaign_id_paths(tmp_path):
    campaign_data = tmp_path / "campaign_data"
    sent_logs = tmp_path / "sent_logs"
    targets = tmp_path / "campaign_targets"
    storage = campaign_storage.CampaignFileStorage(
        campaign_data, sent_logs, targets
    )
    campaign_id = "Campaign_2026-08-25_12-34-56_deadbeef"

    assert storage.campaign_path(campaign_id) == (
        campaign_data.resolve() / f"{campaign_id}.json"
    )
    assert storage.target_path(campaign_id) == (
        targets.resolve() / f"target_{campaign_id}.csv"
    )
    assert storage.sent_log_path(campaign_id) == (
        sent_logs.resolve() / f"sent_{campaign_id}.csv"
    )
    assert storage.launch_lock_path(campaign_id) == (
        campaign_data.resolve() / f"{campaign_id}.launch.lock"
    )


@pytest.mark.parametrize(
    "encoded_campaign_id",
    ["%2E%2E%5Cescaped", "%2E%2E%2Fescaped"],
)
def test_update_campaign_rejects_encoded_path_traversal(
    write_environment, encoded_campaign_id
):
    campaign_data, _sent_logs, _targets, remote_service = write_environment
    escaped_path = campaign_data.parent / "escaped.json"
    original = {
        "id": "escaped",
        "source_type": "csv",
        "status": "Draft",
        "subject": "Outside",
    }
    escaped_path.write_text(json.dumps(original), encoding="utf-8")

    response = client.put(
        f"/api/v1/sender/campaigns/{encoded_campaign_id}",
        json={"subject": "Compromised"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid campaign ID."}
    assert json.loads(escaped_path.read_text(encoding="utf-8")) == original
    assert remote_service.updated == []


def test_update_campaign_rejects_direct_invalid_id(write_environment):
    campaign_data, _sent_logs, _targets, remote_service = write_environment
    invalid_path = campaign_data / "Campaign bad.json"
    original = {
        "id": "Campaign bad",
        "source_type": "csv",
        "status": "Draft",
        "subject": "Original",
    }
    invalid_path.write_text(json.dumps(original), encoding="utf-8")

    response = client.put(
        "/api/v1/sender/campaigns/Campaign%20bad",
        json={"subject": "Compromised"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid campaign ID."}
    assert json.loads(invalid_path.read_text(encoding="utf-8")) == original
    assert remote_service.updated == []
