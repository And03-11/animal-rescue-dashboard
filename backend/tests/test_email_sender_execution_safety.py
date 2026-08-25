"""Regression tests for campaign launch idempotency and restart recovery."""

import json

import pytest
from fastapi import HTTPException

from backend.app.api.v1.endpoints import email_sender
from backend.app.services.airtable_service import AirtableCampaignQueryError
from backend.app.services.campaign_audiences import AudienceCount, AudienceResolution


class CapturingBackgroundTasks:
    def __init__(self):
        self.tasks = []

    def add_task(self, function, *args, **kwargs):
        self.tasks.append((function, args, kwargs))


class RecordingRemoteService:
    def __init__(self):
        self.updated = []

    def update_campaign(self, campaign_id, updates):
        self.updated.append((campaign_id, updates.copy()))


class RecordingGmailService:
    credentials_path = "test-sender.json"

    def __init__(self, events):
        self.events = events
        self.sent = []

    def send_email(self, *, to_email, subject, html_body):
        self.events.append(("send", to_email))
        self.sent.append(to_email)
        return True


class FakeCredentialsManager:
    def __init__(self, gmail_service):
        self.gmail_service = gmail_service

    def get_gmail_services(self, _sender_config):
        return [self.gmail_service]


def make_airtable_service(outcomes, events):
    class SequencedAirtableService:
        received = []
        remaining = list(outcomes)

        def resolve_campaign_audiences(self, audiences, segment):
            branches = [
                (audience.region, audience.is_bounced) for audience in audiences
            ]
            self.received.append((branches, segment))
            events.append(("resolve", branches, segment))
            outcome = self.remaining.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        def get_campaign_contacts(self, *, region, is_bounced, segment):
            events.append(("legacy-get", region, is_bounced, segment))
            return [{"Email": "legacy-path@example.org", "Name": "Legacy path"}]

    return SequencedAirtableService


def write_airtable_campaign(campaign_data, campaign_id, **overrides):
    config = {
        "id": campaign_id,
        "source_type": "airtable",
        "audiences": [{"region": "USA", "is_bounced": False}],
        "segment": "standard",
        "target_count": 1,
        "status": "Ready",
        "subject": "Subject",
        "html_body": "Hello {{name}}",
    }
    config.update(overrides)
    path = campaign_data / f"{campaign_id}.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    return path


@pytest.fixture
def execution_environment(campaign_directories, monkeypatch):
    events = []
    gmail = RecordingGmailService(events)
    remote = RecordingRemoteService()
    monkeypatch.setattr(
        email_sender, "credentials_manager_instance", FakeCredentialsManager(gmail)
    )
    monkeypatch.setattr(email_sender, "get_email_sender_service", lambda: remote)
    monkeypatch.setattr(email_sender.time, "sleep", lambda _seconds: None)
    return (*campaign_directories, events, gmail, remote)


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


def test_manual_launch_refreshes_stored_zero_and_queues_fresh_nonzero_audience(
    execution_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, events, _gmail, _remote = execution_environment
    campaign_id = "Campaign_fresh_launch"
    config_path = write_airtable_campaign(
        campaign_data,
        campaign_id,
        audiences=[
            {"region": "EUR", "is_bounced": True},
            {"region": "USA", "is_bounced": False},
        ],
        segment="dnr",
        target_count=0,
    )
    target_path = targets / f"target_{campaign_id}.csv"
    target_path.write_text("Email\nstale@example.org\n", encoding="utf-8")
    resolution = AudienceResolution(
        contacts=(
            {"Email": "first@example.org", "Name": "First"},
            {"Email": "second@example.org", "Name": "Second"},
        ),
        branches=(
            AudienceCount(region="USA", is_bounced=False, count=1),
            AudienceCount(region="EUR", is_bounced=True, count=1),
        ),
    )
    airtable = make_airtable_service([resolution], events)
    monkeypatch.setattr(email_sender, "AirtableService", airtable)
    tasks = CapturingBackgroundTasks()

    response = email_sender.launch_campaign(
        campaign_id, background_tasks=tasks, current_user="admin@example.org"
    )

    assert response["status"] == "Launching"
    assert airtable.received == [([("USA", False), ("EUR", True)], "dnr")]
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["audiences"] == [
        {"region": "USA", "is_bounced": False},
        {"region": "EUR", "is_bounced": True},
    ]
    assert stored["target_count"] == 2
    assert stored["contacts_fetched_at"]
    assert target_path.read_text(encoding="utf-8").splitlines() == [
        "Email",
        "first@example.org",
        "second@example.org",
    ]
    assert len(tasks.tasks) == 1
    _function, args, _kwargs = tasks.tasks[0]
    assert email_sender._get_campaign_storage().release_launch_lock(
        campaign_id, args[1]
    )


def test_manual_launch_refreshes_stored_nonzero_and_rejects_fresh_zero_audience(
    execution_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, events, gmail, _remote = execution_environment
    campaign_id = "Campaign_empty_launch"
    config_path = write_airtable_campaign(
        campaign_data,
        campaign_id,
        audiences=[{"region": "EUR", "is_bounced": False}],
        target_count=8,
    )
    target_path = targets / f"target_{campaign_id}.csv"
    target_path.write_text("Email\nstale@example.org\n", encoding="utf-8")
    resolution = AudienceResolution(
        contacts=(),
        branches=(AudienceCount(region="EUR", is_bounced=False, count=0),),
    )
    airtable = make_airtable_service([resolution], events)
    monkeypatch.setattr(email_sender, "AirtableService", airtable)
    tasks = CapturingBackgroundTasks()

    with pytest.raises(HTTPException) as error:
        email_sender.launch_campaign(
            campaign_id, background_tasks=tasks, current_user="admin@example.org"
        )

    assert error.value.status_code == 422
    assert error.value.detail == (
        "Campaign has no eligible recipients. "
        "Recalculate the audience before launching."
    )
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["status"] == "Ready"
    assert stored["target_count"] == 0
    assert stored["contacts_fetched_at"]
    assert target_path.read_text(encoding="utf-8").splitlines() == ["Email"]
    assert tasks.tasks == []
    assert gmail.sent == []
    assert not email_sender._get_campaign_storage().is_launch_locked(campaign_id)


def test_worker_refreshes_multiple_audiences_and_rewrites_targets_before_send(
    execution_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, events, gmail, _remote = execution_environment
    campaign_id = "Campaign_worker_multi"
    config_path = write_airtable_campaign(
        campaign_data,
        campaign_id,
        audiences=[
            {"region": "EUR", "is_bounced": True},
            {"region": "USA", "is_bounced": False},
        ],
        segment="dnr",
        target_count=99,
        status="Launching",
    )
    target_path = targets / f"target_{campaign_id}.csv"
    target_path.write_text(
        "Email\nstale@example.org\nSTALE@example.org\n", encoding="utf-8"
    )
    resolution = AudienceResolution(
        contacts=(
            {"Email": "first@example.org", "Name": "First"},
            {"Email": "second@example.org", "Name": "Second"},
        ),
        branches=(
            AudienceCount(region="USA", is_bounced=False, count=1),
            AudienceCount(region="EUR", is_bounced=True, count=1),
        ),
    )
    airtable = make_airtable_service([resolution], events)
    monkeypatch.setattr(email_sender, "AirtableService", airtable)
    storage = email_sender._get_campaign_storage()
    launch_id = storage.acquire_launch_lock(campaign_id)
    assert launch_id

    email_sender.run_campaign_task(campaign_id, launch_id)

    assert airtable.received == [([("USA", False), ("EUR", True)], "dnr")]
    assert events[0] == ("resolve", [("USA", False), ("EUR", True)], "dnr")
    assert [entry[0] for entry in events[1:]] == ["send", "send"]
    assert gmail.sent == ["first@example.org", "second@example.org"]
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["audiences"] == [
        {"region": "USA", "is_bounced": False},
        {"region": "EUR", "is_bounced": True},
    ]
    assert stored["target_count"] == 2
    assert stored["contacts_fetched_at"]
    assert target_path.read_text(encoding="utf-8").splitlines() == [
        "Email",
        "first@example.org",
        "second@example.org",
    ]
    assert not storage.is_launch_locked(campaign_id)


def test_worker_synthesizes_one_legacy_audience_branch(
    execution_environment, monkeypatch
):
    campaign_data, sent_logs, _targets, events, gmail, _remote = execution_environment
    campaign_id = "Campaign_worker_legacy"
    config_path = write_airtable_campaign(
        campaign_data,
        campaign_id,
        audiences=[],
        region="EUR",
        is_bounced=True,
        status="Launching",
    )
    (sent_logs / f"sent_{campaign_id}.csv").write_text(
        "Email\nlegacy@example.org\n", encoding="utf-8"
    )
    resolution = AudienceResolution(
        contacts=({"Email": "legacy@example.org", "Name": "Legacy"},),
        branches=(AudienceCount(region="EUR", is_bounced=True, count=1),),
    )
    airtable = make_airtable_service([resolution], events)
    monkeypatch.setattr(email_sender, "AirtableService", airtable)
    storage = email_sender._get_campaign_storage()
    launch_id = storage.acquire_launch_lock(campaign_id)
    assert launch_id

    email_sender.run_campaign_task(campaign_id, launch_id)

    assert airtable.received == [([("EUR", True)], "standard")]
    assert json.loads(config_path.read_text(encoding="utf-8"))["audiences"] == [
        {"region": "EUR", "is_bounced": True}
    ]
    assert gmail.sent == []


def test_scheduled_worker_marks_fresh_empty_audience_before_send_loop(
    execution_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, events, gmail, remote = execution_environment
    campaign_id = "Campaign_scheduled_empty"
    config_path = write_airtable_campaign(
        campaign_data, campaign_id, target_count=4, status="Scheduled"
    )
    target_path = targets / f"target_{campaign_id}.csv"
    target_path.write_text("Email\nstale@example.org\n", encoding="utf-8")
    resolution = AudienceResolution(
        contacts=(),
        branches=(AudienceCount(region="USA", is_bounced=False, count=0),),
    )
    airtable = make_airtable_service([resolution], events)
    monkeypatch.setattr(email_sender, "AirtableService", airtable)

    email_sender.run_campaign_task(campaign_id)

    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["status"] == "Error - No Airtable Recipients"
    assert stored["target_count"] == 0
    assert stored["contacts_fetched_at"]
    assert target_path.read_text(encoding="utf-8").splitlines() == ["Email"]
    assert gmail.sent == []
    assert airtable.received == [([("USA", False)], "standard")]
    assert remote.updated[-1] == (
        campaign_id,
        {"status": "Error - No Airtable Recipients"},
    )
    assert not email_sender._get_campaign_storage().is_launch_locked(campaign_id)


def test_worker_resolver_failure_sets_error_without_send_or_target_rewrite(
    execution_environment, monkeypatch
):
    campaign_data, _sent_logs, targets, events, gmail, remote = execution_environment
    campaign_id = "Campaign_refresh_failure"
    config_path = write_airtable_campaign(
        campaign_data,
        campaign_id,
        audiences=[{"region": "USA", "is_bounced": True}],
        segment="dnr",
        target_count=3,
        status="Scheduled",
    )
    target_path = targets / f"target_{campaign_id}.csv"
    target_path.write_text("Email\nstale@example.org\n", encoding="utf-8")
    airtable = make_airtable_service(
        [AirtableCampaignQueryError("resolver unavailable")], events
    )
    monkeypatch.setattr(email_sender, "AirtableService", airtable)

    email_sender.run_campaign_task(campaign_id)

    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["status"] == "Error - Airtable Fetch Failed"
    assert stored["target_count"] == 3
    assert "contacts_fetched_at" not in stored
    assert target_path.read_text(encoding="utf-8").splitlines() == [
        "Email",
        "stale@example.org",
    ]
    assert gmail.sent == []
    assert [event[0] for event in events] == ["resolve"]
    assert remote.updated[-1] == (
        campaign_id,
        {"status": "Error - Airtable Fetch Failed"},
    )
    assert not email_sender._get_campaign_storage().is_launch_locked(campaign_id)
