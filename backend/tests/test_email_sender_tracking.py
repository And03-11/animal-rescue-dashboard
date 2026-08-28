import json
import logging
from pathlib import Path

import pandas as pd
import pytest

from backend.app.api.v1.endpoints import email_sender
from backend.app.services.email_tracking import (
    EmailTrackingService,
    InMemoryEmailTrackingRepository,
)
from backend.app.services.gmail_service import GmailSendResult


class _RemoteService:
    def __init__(self):
        self.updated = []

    def update_campaign(self, campaign_id, updates):
        self.updated.append((campaign_id, updates.copy()))


class _GmailService:
    credentials_path = "gmail_credentials/tracking-sender.json"

    def __init__(self, result=None):
        self.result = result or GmailSendResult(
            success=True,
            message_id="gmail-message-1",
            thread_id="gmail-thread-1",
        )
        self.sent = []

    def send_email(self, *, to_email, subject, html_body, extra_headers=None):
        self.sent.append(
            {
                "to_email": to_email,
                "subject": subject,
                "html_body": html_body,
                "extra_headers": dict(extra_headers or {}),
            }
        )
        return self.result


class _CredentialsManager:
    def __init__(self, gmail_service):
        self.gmail_service = gmail_service

    def get_gmail_services(self, _sender_config):
        return [self.gmail_service]


@pytest.fixture
def campaign_environment(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    sent_logs = tmp_path / "sent_logs"
    targets = tmp_path / "campaign_targets"
    campaign_data.mkdir()
    sent_logs.mkdir()
    targets.mkdir()

    gmail = _GmailService()
    remote = _RemoteService()
    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "SENT_LOGS_DIR", str(sent_logs))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(targets))
    monkeypatch.setattr(
        email_sender, "credentials_manager_instance", _CredentialsManager(gmail)
    )
    monkeypatch.setattr(email_sender, "get_email_sender_service", lambda: remote)
    monkeypatch.setattr(email_sender.time, "sleep", lambda _seconds: None)
    monkeypatch.setenv(
        "EMAIL_PUBLIC_API_BASE_URL", "https://dashboard.animallove.cr"
    )
    return campaign_data, sent_logs, targets, gmail, remote


def _write_csv_campaign(
    campaign_data: Path,
    targets: Path,
    campaign_id: str,
    *,
    click_tracking_enabled: bool,
):
    config = {
        "id": campaign_id,
        "source_type": "csv",
        "status": "Launching",
        "sender_config": "all",
        "subject": "Help {{name}}",
        "html_body": (
            '<p>Hello {{name}}</p><a href="https://donations.animallove.cr/give">'
            "Donate</a>"
        ),
        "mapping": {"email": "Email", "name": "Name", "has_header": True},
        "click_tracking_enabled": click_tracking_enabled,
        "target_count": 1,
    }
    config_path = campaign_data / f"{campaign_id}.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    (targets / f"target_{campaign_id}.csv").write_text(
        "Email,Name\ndonor@example.org,Ana\n", encoding="utf-8"
    )
    return config_path


def _run_locked_campaign(campaign_id):
    storage = email_sender._get_campaign_storage()
    launch_id = storage.acquire_launch_lock(campaign_id)
    assert launch_id
    email_sender.run_campaign_task(campaign_id, launch_id)


@pytest.mark.parametrize(
    "configured_url",
    [
        "https://api.animallove.cr/api",
        "https://api.animallove.cr/api/v1/",
    ],
)
def test_public_api_base_url_rejects_non_root_paths(monkeypatch, configured_url):
    monkeypatch.setenv("EMAIL_PUBLIC_API_BASE_URL", configured_url)

    with pytest.raises(ValueError, match="root origin"):
        email_sender._email_public_api_base_url()


def test_public_api_base_url_accepts_and_normalizes_root_path(monkeypatch):
    monkeypatch.setenv(
        "EMAIL_PUBLIC_API_BASE_URL",
        "https://api.animallove.cr/",
    )

    assert email_sender._email_public_api_base_url() == (
        "https://api.animallove.cr"
    )


def test_prepare_email_without_click_tracking_keeps_compliance_and_skips_links():
    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    original_html = (
        '<p>Hello</p><a href="https://donations.animallove.cr/give">Donate</a>'
    )

    prepared = tracking_service.prepare_email(
        campaign_id="Campaign_compliance-only",
        recipient_email="Person@Example.org",
        html_body=original_html,
        click_tracking_enabled=False,
    )

    assert prepared.html_body == original_html
    assert prepared.links == ()
    assert prepared.unsubscribe_token
    assert repository.links_for_delivery(prepared.delivery_id) == []
    delivery = repository.delivery_for(
        "Campaign_compliance-only", "person@example.org"
    )
    assert delivery is not None
    assert delivery.id == prepared.delivery_id
    assert delivery.status == "prepared"


def test_worker_adds_compliance_without_rewriting_links_when_tracking_is_disabled(
    campaign_environment, monkeypatch
):
    campaign_data, sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = "Campaign_tracking-disabled"
    _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=False,
    )

    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: tracking_service
    )

    _run_locked_campaign(campaign_id)

    assert len(gmail.sent) == 1
    sent_html = gmail.sent[0]["html_body"]
    assert "#alc=" not in sent_html
    assert "utm_campaign" not in sent_html
    assert "Hello Ana" in sent_html
    assert "Unsubscribe" in sent_html
    headers = gmail.sent[0]["extra_headers"]
    assert headers["List-Unsubscribe"].startswith(
        "<https://dashboard.animallove.cr/api/v1/email-tracking/unsubscribe/"
    )
    assert headers["List-Unsubscribe"].endswith(">")
    assert headers["List-Unsubscribe"][1:-1] in sent_html
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    delivery = repository.delivery_for(campaign_id, "donor@example.org")
    assert delivery is not None
    assert delivery.status == "sent"
    assert delivery.sender_account == "tracking-sender.json"
    assert repository.links_for_delivery(delivery.id) == []
    sent = pd.read_csv(sent_logs / f"sent_{campaign_id}.csv")
    assert sent["Email"].tolist() == ["donor@example.org"]


def test_worker_tracks_enabled_campaign_and_records_gmail_delivery(
    campaign_environment, monkeypatch
):
    campaign_data, sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = "Campaign_tracking-enabled"
    _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=True,
    )
    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: tracking_service
    )

    _run_locked_campaign(campaign_id)

    assert len(gmail.sent) == 1
    sent_html = gmail.sent[0]["html_body"]
    assert "#alc=" in sent_html
    assert "utm_campaign=Campaign_tracking-enabled" in sent_html
    assert "donor@example.org" not in sent_html
    assert "Unsubscribe" in sent_html
    headers = gmail.sent[0]["extra_headers"]
    assert headers["List-Unsubscribe"].startswith(
        "<https://dashboard.animallove.cr/api/v1/email-tracking/unsubscribe/"
    )
    assert headers["List-Unsubscribe"].endswith(">")
    unsubscribe_url = headers["List-Unsubscribe"][1:-1]
    assert unsubscribe_url in sent_html
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    delivery = repository.delivery_for(campaign_id, "donor@example.org")
    assert delivery is not None
    assert delivery.status == "sent"
    assert delivery.sender_account == "tracking-sender.json"
    assert delivery.gmail_message_id == "gmail-message-1"
    sent = pd.read_csv(sent_logs / f"sent_{campaign_id}.csv")
    assert sent["Email"].tolist() == ["donor@example.org"]


def test_worker_fails_closed_when_compliance_preparation_fails_without_tracking(
    campaign_environment, monkeypatch
):
    campaign_data, sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = "Campaign_tracking-prepare-failure"
    config_path = _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=False,
    )

    class _BrokenTrackingService:
        def is_suppressed(self, _recipient_email):
            return False

        def prepare_email(self, **kwargs):
            assert kwargs["click_tracking_enabled"] is False
            raise RuntimeError("tracking database unavailable")

    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: _BrokenTrackingService()
    )

    _run_locked_campaign(campaign_id)

    assert gmail.sent == []
    assert not (sent_logs / f"sent_{campaign_id}.csv").exists()
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["status"] == "Error - Sending Failed"


@pytest.mark.parametrize("click_tracking_enabled", [True, False])
def test_worker_records_failed_delivery_when_gmail_rejects_send(
    campaign_environment, monkeypatch, click_tracking_enabled
):
    campaign_data, sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = f"Campaign_tracking-gmail-failure-{click_tracking_enabled}"
    _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=click_tracking_enabled,
    )
    gmail.result = GmailSendResult(success=False, error="transport unavailable")
    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: tracking_service
    )

    _run_locked_campaign(campaign_id)

    assert len(gmail.sent) == 1
    assert not (sent_logs / f"sent_{campaign_id}.csv").exists()
    delivery = repository.delivery_for(campaign_id, "donor@example.org")
    assert delivery is not None
    assert delivery.status == "failed"
    assert delivery.sender_account == "tracking-sender.json"
    assert delivery.failure_reason == "transport unavailable"


def test_worker_does_not_log_raw_exception_from_gmail_service(
    campaign_environment, monkeypatch, caplog, capsys
):
    campaign_data, _sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = "Campaign_tracking-secret-gmail-exception"
    _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=False,
    )
    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: tracking_service
    )

    class SecretGmailError(RuntimeError):
        pass

    def raise_secret(**_kwargs):
        raise SecretGmailError("oauth-secret=never-log-this")

    monkeypatch.setattr(gmail, "send_email", raise_secret)

    with caplog.at_level(logging.WARNING):
        _run_locked_campaign(campaign_id)

    captured = capsys.readouterr()
    combined_output = f"{captured.out}\n{captured.err}\n{caplog.text}"
    assert "never-log-this" not in combined_output
    assert "SecretGmailError" in caplog.text
    delivery = repository.delivery_for(campaign_id, "donor@example.org")
    assert delivery is not None
    assert delivery.status == "failed"
    assert delivery.failure_reason == "Send failed"


def test_worker_does_not_resend_after_gmail_success_if_legacy_ledger_failed(
    campaign_environment, monkeypatch
):
    campaign_data, sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = "Campaign_tracking-ledger-recovery"
    config_path = _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=True,
    )
    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: tracking_service
    )
    original_append = email_sender.CampaignFileStorage.append_sent_email
    append_attempts = 0

    def fail_first_append(
        storage,
        received_campaign_id,
        recipient_email,
        *,
        gmail_message_id=None,
    ):
        nonlocal append_attempts
        append_attempts += 1
        if append_attempts == 1:
            raise OSError("disk unavailable")
        return original_append(
            storage,
            received_campaign_id,
            recipient_email,
            gmail_message_id=gmail_message_id,
        )

    monkeypatch.setattr(
        email_sender.CampaignFileStorage,
        "append_sent_email",
        fail_first_append,
    )

    _run_locked_campaign(campaign_id)

    assert len(gmail.sent) == 1
    assert not (sent_logs / f"sent_{campaign_id}.csv").exists()
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    stored["status"] = "Launching"
    config_path.write_text(json.dumps(stored), encoding="utf-8")

    _run_locked_campaign(campaign_id)

    assert len(gmail.sent) == 1
    sent = pd.read_csv(sent_logs / f"sent_{campaign_id}.csv")
    assert sent["Email"].tolist() == ["donor@example.org"]
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["status"] == "Completed"


def test_worker_durably_records_gmail_acceptance_before_delivery_state_write(
    campaign_environment, monkeypatch
):
    campaign_data, sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = "Campaign_tracking-post-accept-state-failure"
    config_path = _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=True,
    )
    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )

    def fail_delivery_state_write(*_args, **_kwargs):
        raise RuntimeError("database unavailable after Gmail acceptance")

    monkeypatch.setattr(
        tracking_service,
        "mark_delivery_sent",
        fail_delivery_state_write,
    )
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: tracking_service
    )

    _run_locked_campaign(campaign_id)

    assert len(gmail.sent) == 1
    ledger_path = sent_logs / f"sent_{campaign_id}.csv"
    ledger = pd.read_csv(ledger_path)
    assert ledger.to_dict("records") == [
        {
            "Email": "donor@example.org",
            "GmailMessageId": "gmail-message-1",
        }
    ]

    stored = json.loads(config_path.read_text(encoding="utf-8"))
    stored["status"] = "Launching"
    config_path.write_text(json.dumps(stored), encoding="utf-8")
    _run_locked_campaign(campaign_id)

    assert len(gmail.sent) == 1
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["status"] == "Completed"


def test_worker_skips_suppressed_recipient_without_tracking_or_gmail(
    campaign_environment, monkeypatch
):
    campaign_data, sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = "Campaign_tracking-suppressed"
    config_path = _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=False,
    )
    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    token = tracking_service.prepare_unsubscribe(
        campaign_id="Campaign_prior",
        recipient_email="DONOR@example.org",
    )
    tracking_service.unsubscribe(token)
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: tracking_service
    )

    _run_locked_campaign(campaign_id)

    assert gmail.sent == []
    assert not (sent_logs / f"sent_{campaign_id}.csv").exists()
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["status"] == "Completed"
    assert stored["sent_count_final"] == 0
    assert stored["suppressed_count_final"] == 1


def test_worker_completes_when_every_recipient_is_sent_or_suppressed(
    campaign_environment, monkeypatch
):
    campaign_data, sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = "Campaign_tracking-sent-and-suppressed"
    config_path = _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=False,
    )
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    stored["target_count"] = 2
    config_path.write_text(json.dumps(stored), encoding="utf-8")
    (targets / f"target_{campaign_id}.csv").write_text(
        "Email,Name\nsuppressed@example.org,Skip\nsent@example.org,Send\n",
        encoding="utf-8",
    )

    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    token = tracking_service.prepare_unsubscribe(
        campaign_id="Campaign_prior",
        recipient_email="suppressed@example.org",
    )
    tracking_service.unsubscribe(token)
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: tracking_service
    )

    _run_locked_campaign(campaign_id)

    assert [message["to_email"] for message in gmail.sent] == ["sent@example.org"]
    ledger = pd.read_csv(sent_logs / f"sent_{campaign_id}.csv")
    assert ledger["Email"].tolist() == ["sent@example.org"]
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["status"] == "Completed"
    assert stored["sent_count_final"] == 1
    assert stored["suppressed_count_final"] == 1


@pytest.mark.parametrize("click_tracking_enabled", [True, False])
def test_worker_fails_before_gmail_without_compliance_public_base_url(
    campaign_environment, monkeypatch, click_tracking_enabled
):
    campaign_data, sent_logs, targets, gmail, _remote = campaign_environment
    campaign_id = f"Campaign_tracking-no-public-base-{click_tracking_enabled}"
    config_path = _write_csv_campaign(
        campaign_data,
        targets,
        campaign_id,
        click_tracking_enabled=click_tracking_enabled,
    )
    repository = InMemoryEmailTrackingRepository()
    tracking_service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: tracking_service
    )
    monkeypatch.delenv("EMAIL_PUBLIC_API_BASE_URL", raising=False)

    _run_locked_campaign(campaign_id)

    assert gmail.sent == []
    assert not (sent_logs / f"sent_{campaign_id}.csv").exists()
    stored = json.loads(config_path.read_text(encoding="utf-8"))
    assert stored["status"] == "Error - Compliance Unavailable"
