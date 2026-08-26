"""Targeted regressions for durable claims, fenced leases, and safe recovery."""

import asyncio
from datetime import datetime, timedelta, timezone
import json
import threading

import pytest
from fastapi import HTTPException

from backend.app.api.v1.endpoints import email_sender
from backend.app.core import scheduler_worker
from backend.app.services import email_sender_service
from backend.app.services.campaign_storage import CampaignFileStorage
from backend.app.services.email_sender_service import EmailSenderService


class _ClaimDatabase:
    def __init__(self):
        self.status = "Scheduled"
        self.connections = []

    def connect(self, *, fail_commit=False):
        connection = _ClaimConnection(self, fail_commit=fail_commit)
        self.connections.append(connection)
        return connection


class _ClaimCursor:
    def __init__(self, connection):
        self.connection = connection
        self.rowcount = 0
        self.query = ""

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, _params):
        self.query = query
        self.connection.last_query = query
        ready = self.connection.database.status == "Scheduled"
        self.rowcount = 1 if ready else 0
        self.connection.pending_claim = ready

    def fetchone(self):
        if not self.connection.pending_claim:
            return None
        return {"id": "Campaign_claim", "status": "Launching"}


class _ClaimConnection:
    def __init__(self, database, *, fail_commit=False):
        self.database = database
        self.fail_commit = fail_commit
        self.pending_claim = False
        self.commits = 0
        self.rollbacks = 0
        self.last_query = ""

    def cursor(self, **_kwargs):
        return _ClaimCursor(self)

    def commit(self):
        if self.fail_commit:
            raise RuntimeError("commit failed")
        self.commits += 1
        if self.pending_claim:
            self.database.status = "Launching"
            self.pending_claim = False

    def rollback(self):
        self.rollbacks += 1
        self.pending_claim = False

    def close(self):
        self.pending_claim = False


def _claim_service(database, *, fail_commit=False):
    service = object.__new__(EmailSenderService)
    service.db_url = "postgresql://unused"
    service._get_connection = lambda: database.connect(fail_commit=fail_commit)
    return service


def test_mark_campaign_launching_is_durable_and_only_one_connection_claims():
    database = _ClaimDatabase()
    first = _claim_service(database)
    second = _claim_service(database)

    results = [
        first.mark_campaign_launching("Campaign_claim"),
        second.mark_campaign_launching("Campaign_claim"),
    ]

    assert [result is not None for result in results] == [True, False]
    assert database.status == "Launching"
    assert sum(connection.commits for connection in database.connections) == 1
    assert "target_count > 0" in database.connections[0].last_query
    assert "mapping IS NOT NULL" in database.connections[0].last_query


def test_mark_campaign_launching_never_returns_success_when_commit_fails():
    database = _ClaimDatabase()
    service = _claim_service(database, fail_commit=True)

    with pytest.raises(RuntimeError, match="commit failed"):
        service.mark_campaign_launching("Campaign_claim")

    assert database.status == "Scheduled"
    assert database.connections[0].commits == 0
    assert database.connections[0].rollbacks == 1


def _storage(tmp_path, now):
    return CampaignFileStorage(
        tmp_path / "campaign_data",
        tmp_path / "sent_logs",
        tmp_path / "campaign_targets",
        lock_lease_seconds=1,
        now=lambda: now[0],
    )


def test_expired_owner_cannot_overwrite_reclaimer_during_renewal(tmp_path, monkeypatch):
    now = [datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)]
    stale = _storage(tmp_path, now)
    reclaimer = _storage(tmp_path, now)
    stale_lease = stale.acquire_launch_lock("Campaign_race", "owner-a")
    assert stale_lease is not None
    now[0] += timedelta(seconds=2)

    stale_read = threading.Event()
    continue_renewal = threading.Event()
    original_read = stale._read_lock_payload

    def delayed_read(lock_path):
        payload = original_read(lock_path)
        if threading.current_thread().name == "stale-renewal":
            stale_read.set()
            assert continue_renewal.wait(timeout=2)
        return payload

    monkeypatch.setattr(stale, "_read_lock_payload", delayed_read)
    results = {}
    renew_thread = threading.Thread(
        name="stale-renewal",
        target=lambda: results.setdefault(
            "renewed", stale.renew_launch_lock("Campaign_race", stale_lease)
        ),
    )
    renew_thread.start()
    assert stale_read.wait(timeout=2)

    acquire_thread = threading.Thread(
        name="new-acquirer",
        target=lambda: results.setdefault(
            "lease", reclaimer.acquire_launch_lock("Campaign_race", "owner-b")
        ),
    )
    acquire_thread.start()
    continue_renewal.set()
    renew_thread.join(timeout=2)
    acquire_thread.join(timeout=2)

    assert not renew_thread.is_alive() and not acquire_thread.is_alive()
    assert results["renewed"] is False
    assert results["lease"] is not None
    assert reclaimer.owns_launch_lock("Campaign_race", results["lease"])
    assert not stale.owns_launch_lock("Campaign_race", stale_lease)


def test_manual_csv_launch_rejects_missing_mapping_and_zero_recipients(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    targets = tmp_path / "campaign_targets"
    sent_logs = tmp_path / "sent_logs"
    campaign_data.mkdir()
    targets.mkdir()
    sent_logs.mkdir()
    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(targets))
    monkeypatch.setattr(email_sender, "SENT_LOGS_DIR", str(sent_logs))

    campaign_id = "Campaign_unready"
    config_path = campaign_data / f"{campaign_id}.json"
    config_path.write_text(
        json.dumps({
            "id": campaign_id,
            "source_type": "csv",
            "status": "Ready",
            "target_count": 2,
        }),
        encoding="utf-8",
    )
    (targets / f"target_{campaign_id}.csv").write_text(
        "Email,Name\ninvalid,A\n", encoding="utf-8"
    )

    with pytest.raises(HTTPException) as missing_mapping:
        email_sender.prepare_campaign_launch(campaign_id)
    assert missing_mapping.value.status_code == 422

    config = json.loads(config_path.read_text(encoding="utf-8"))
    config["mapping"] = {"email": "Email", "name": "Name", "has_header": True}
    config_path.write_text(json.dumps(config), encoding="utf-8")
    with pytest.raises(HTTPException) as zero_contacts:
        email_sender.prepare_campaign_launch(campaign_id)
    assert zero_contacts.value.status_code == 422
    assert json.loads(config_path.read_text(encoding="utf-8"))["status"] == "Ready"


def test_scheduler_does_not_claim_unready_csv_campaign(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    targets = tmp_path / "campaign_targets"
    sent_logs = tmp_path / "sent_logs"
    campaign_data.mkdir()
    targets.mkdir()
    sent_logs.mkdir()
    campaign_id = "Campaign_scheduler_unready"
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps({
            "id": campaign_id,
            "source_type": "csv",
            "status": "Scheduled",
            "scheduled_at": "2026-08-26T12:00:00",
            "target_count": 0,
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(targets))
    monkeypatch.setattr(email_sender, "SENT_LOGS_DIR", str(sent_logs))

    class Remote:
        def __init__(self):
            self.marked = []

        def get_pending_scheduled_campaigns(self):
            return [{"id": campaign_id}]

        def mark_campaign_launching(self, received_id):
            self.marked.append(received_id)
            return {"id": received_id}

        def update_campaign(self, *_args):
            raise AssertionError("unready campaign must not be updated")

    class Loop:
        def run_in_executor(self, *_args):
            raise AssertionError("unready campaign must not be queued")

    remote = Remote()
    monkeypatch.setattr(email_sender_service, "get_email_sender_service", lambda: remote)
    monkeypatch.setattr(scheduler_worker.os.path, "exists", lambda _path: True)
    monkeypatch.setattr(scheduler_worker.asyncio, "get_event_loop", lambda: Loop())

    asyncio.run(scheduler_worker.check_and_launch_scheduled_campaigns())

    assert remote.marked == []
    assert json.loads(
        (campaign_data / f"{campaign_id}.json").read_text(encoding="utf-8")
    )["status"] == "Scheduled"


def test_startup_recovery_synchronizes_interrupted_status_remotely(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    targets = tmp_path / "campaign_targets"
    sent_logs = tmp_path / "sent_logs"
    campaign_data.mkdir()
    targets.mkdir()
    sent_logs.mkdir()
    campaign_id = "Campaign_crashed"
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps({"id": campaign_id, "status": "Sending"}), encoding="utf-8"
    )
    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(targets))
    monkeypatch.setattr(email_sender, "SENT_LOGS_DIR", str(sent_logs))

    updates = []

    class Remote:
        def update_campaign(self, received_id, payload):
            updates.append((received_id, payload.copy()))

    monkeypatch.setattr(email_sender, "get_email_sender_service", lambda: Remote())

    recovered = email_sender.recover_interrupted_campaigns()

    assert recovered == [campaign_id]
    assert updates == [(campaign_id, {"status": "Interrupted"})]
    assert json.loads(
        (campaign_data / f"{campaign_id}.json").read_text(encoding="utf-8")
    )["status"] == "Interrupted"


def test_worker_stops_before_next_send_when_lease_is_stolen(tmp_path, monkeypatch):
    now = [datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)]
    storage = _storage(tmp_path, now)
    reclaimer = _storage(tmp_path, now)
    campaign_id = "Campaign_fenced_send"
    storage.save_campaign(
        campaign_id,
        {
            "id": campaign_id,
            "source_type": "csv",
            "status": "Launching",
            "target_count": 2,
            "mapping": {
                "email": "Email",
                "name": "Name",
                "has_header": True,
            },
            "sender_config": "all",
            "subject": "Subject",
            "html_body": "Hello {{name}}",
        },
    )
    storage.target_path(campaign_id).parent.mkdir(parents=True, exist_ok=True)
    storage.target_path(campaign_id).write_text(
        "Email,Name\nfirst@example.org,First\nsecond@example.org,Second\n",
        encoding="utf-8",
    )
    stale_lease = storage.acquire_launch_lock(campaign_id, "owner-a")
    assert stale_lease is not None

    first_send_started = threading.Event()
    finish_first_send = threading.Event()

    class BlockingGmail:
        credentials_path = "sender.json"

        def __init__(self):
            self.sent = []

        def send_email(self, *, to_email, subject, html_body):
            del subject, html_body
            self.sent.append(to_email)
            if len(self.sent) == 1:
                first_send_started.set()
                assert finish_first_send.wait(timeout=2)
            return True

    gmail = BlockingGmail()

    class Credentials:
        def get_gmail_services(self, _sender_config):
            return [gmail]

    class Remote:
        def update_campaign(self, *_args):
            pass

    monkeypatch.setattr(email_sender, "_get_campaign_storage", lambda: storage)
    monkeypatch.setattr(email_sender, "credentials_manager_instance", Credentials())
    monkeypatch.setattr(email_sender, "get_email_sender_service", lambda: Remote())
    monkeypatch.setattr(email_sender.time, "sleep", lambda _seconds: None)

    worker = threading.Thread(
        target=email_sender.run_campaign_task,
        args=(campaign_id, stale_lease),
    )
    worker.start()
    assert first_send_started.wait(timeout=2)

    now[0] += timedelta(seconds=2)
    new_lease = reclaimer.acquire_launch_lock(campaign_id, "owner-b")
    assert new_lease is not None
    finish_first_send.set()
    worker.join(timeout=3)

    assert not worker.is_alive()
    assert gmail.sent == ["first@example.org"]
    assert reclaimer.owns_launch_lock(campaign_id, new_lease)
    sent_log = storage.sent_log_path(campaign_id)
    assert not sent_log.exists() or "first@example.org" not in sent_log.read_text(
        encoding="utf-8-sig"
    )
    assert storage.load_campaign(campaign_id)["status"] == "Sending"


def test_scheduler_claim_failure_restores_local_state_and_releases_lease(
    tmp_path,
    monkeypatch,
):
    campaign_data = tmp_path / "campaign_data"
    targets = tmp_path / "campaign_targets"
    sent_logs = tmp_path / "sent_logs"
    campaign_data.mkdir()
    targets.mkdir()
    sent_logs.mkdir()
    campaign_id = "Campaign_claim_failure"
    config_path = campaign_data / f"{campaign_id}.json"
    config_path.write_text(
        json.dumps({
            "id": campaign_id,
            "source_type": "airtable",
            "status": "Scheduled",
            "target_count": 1,
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(targets))
    monkeypatch.setattr(email_sender, "SENT_LOGS_DIR", str(sent_logs))

    class Remote:
        def get_pending_scheduled_campaigns(self):
            return [{"id": campaign_id}]

        def mark_campaign_launching(self, _campaign_id):
            raise RuntimeError("database commit failed")

    monkeypatch.setattr(
        email_sender_service, "get_email_sender_service", lambda: Remote()
    )

    asyncio.run(scheduler_worker.check_and_launch_scheduled_campaigns())

    assert json.loads(config_path.read_text(encoding="utf-8"))["status"] == "Scheduled"
    assert not email_sender._get_campaign_storage().is_launch_locked(campaign_id)
