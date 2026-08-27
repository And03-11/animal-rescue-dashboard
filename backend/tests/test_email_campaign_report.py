from backend.app.services.email_tracking import (
    EmailTrackingService,
    InMemoryEmailTrackingRepository,
)


def _seed_report():
    repository = InMemoryEmailTrackingRepository()
    service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
        ip_hash_key="report-test-key",
    )
    first = service.prepare_email(
        campaign_id="Campaign_report",
        recipient_email="person@example.org",
        html_body=(
            '<a href="https://donations.animallove.cr/give/?amount=25">Give</a>'
            '<a href="https://donations.animallove.cr/story/">Story</a>'
        ),
    )
    second = service.prepare_email(
        campaign_id="Campaign_report",
        recipient_email="b@example.org",
        html_body='<a href="https://donations.animallove.cr/give/">Give</a>',
    )
    service.mark_delivery_sent(
        first.delivery_id,
        sender_account="sender-1.json",
        gmail_message_id="gmail-1",
    )
    service.mark_delivery_sent(
        second.delivery_id,
        sender_account="sender-2.json",
        gmail_message_id="gmail-2",
    )

    service.record_event(
        token=first.links[0].token,
        event_type="landing_loaded",
        visitor_id="visitor-human-1",
        viewport_width=390,
        user_agent="Mozilla/5.0",
    )
    service.record_event(
        token=first.links[0].token,
        event_type="landing_loaded",
        visitor_id="visitor-human-1",
        engagement_ms=1500,
        viewport_width=390,
        user_agent="Mozilla/5.0",
    )
    service.record_event(
        token=first.links[0].token,
        event_type="human_interaction",
        visitor_id="visitor-human-1",
        engagement_ms=2500,
        viewport_width=390,
        user_agent="Mozilla/5.0",
    )
    service.record_event(
        token=first.links[1].token,
        event_type="landing_loaded",
        visitor_id="visitor-story-1",
        viewport_width=1280,
        user_agent="Mozilla/5.0",
    )
    service.record_event(
        token=second.links[0].token,
        event_type="landing_loaded",
        visitor_id="visitor-scanner-1",
        viewport_width=1280,
        user_agent="Proofpoint URL Defense Scanner",
    )
    return service


def test_campaign_report_counts_unique_deliveries_without_inflating_retries():
    report = _seed_report().campaign_report("Campaign_report")

    assert report["summary"] == {
        "sent": 2,
        "landing_visits": 2,
        "human_likely_clicks": 1,
        "unconfirmed_activity": 1,
        "suspected_automation": 1,
        "landing_rate": 100.0,
        "human_click_rate": 50.0,
    }


def test_campaign_report_normalizes_and_orders_top_destination_paths():
    report = _seed_report().campaign_report("Campaign_report")

    assert report["top_links"] == [
        {
            "destination_origin": "https://donations.animallove.cr",
            "destination_path": "/give/",
            "landing_visits": 2,
            "human_likely_clicks": 1,
        },
        {
            "destination_origin": "https://donations.animallove.cr",
            "destination_path": "/story/",
            "landing_visits": 1,
            "human_likely_clicks": 0,
        },
    ]


def test_campaign_report_masks_recipients_and_labels_activity_conservatively():
    report = _seed_report().campaign_report("Campaign_report")
    recent = report["recent_engagement"]

    assert recent
    assert {item["recipient"] for item in recent} == {
        "p***@example.org",
        "b***@example.org",
    }
    assert all("email" not in item for item in recent)
    assert any(
        item["classification"] == "human_likely"
        and item["event_type"] == "human_interaction"
        for item in recent
    )
    assert any(item["classification"] == "suspected_automation" for item in recent)
    assert any(item["classification"] == "unconfirmed" for item in recent)


def test_empty_campaign_report_uses_zero_counts_and_null_rates():
    repository = InMemoryEmailTrackingRepository()
    service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )

    report = service.campaign_report("Campaign_empty")

    assert report == {
        "summary": {
            "sent": 0,
            "landing_visits": 0,
            "human_likely_clicks": 0,
            "unconfirmed_activity": 0,
            "suspected_automation": 0,
            "landing_rate": None,
            "human_click_rate": None,
        },
        "top_links": [],
        "recent_engagement": [],
    }


def test_bulk_campaign_summaries_returns_only_requested_campaigns():
    service = _seed_report()

    summaries = service.campaign_summaries(
        ["Campaign_report", "Campaign_empty", "Campaign_report"]
    )

    assert summaries["Campaign_report"]["human_click_rate"] == 50.0
    assert summaries["Campaign_empty"]["sent"] == 0
    assert set(summaries) == {"Campaign_report", "Campaign_empty"}


def test_authenticated_report_route_returns_tracking_aggregation(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    sent_logs = tmp_path / "sent_logs"
    targets = tmp_path / "campaign_targets"
    campaign_data.mkdir()
    sent_logs.mkdir()
    targets.mkdir()
    (campaign_data / "Campaign_report.json").write_text(
        json.dumps({"id": "Campaign_report", "status": "Completed"}),
        encoding="utf-8",
    )
    service = _seed_report()
    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "SENT_LOGS_DIR", str(sent_logs))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(targets))
    monkeypatch.setattr(email_sender, "get_email_tracking_service", lambda: service)
    app = FastAPI()
    app.dependency_overrides[get_current_user] = lambda: "admin@example.org"
    app.include_router(email_sender.router, prefix="/api/v1")
    client = TestClient(app)

    response = client.get("/api/v1/sender/campaigns/Campaign_report/report")

    assert response.status_code == 200
    assert response.json()["summary"]["human_likely_clicks"] == 1
    assert response.json()["recent_engagement"]


def test_paginated_campaign_list_uses_one_bulk_summary_call(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    sent_logs = tmp_path / "sent_logs"
    targets = tmp_path / "campaign_targets"
    campaign_data.mkdir()
    sent_logs.mkdir()
    targets.mkdir()
    for campaign_id in ("Campaign_one", "Campaign_two"):
        (campaign_data / f"{campaign_id}.json").write_text(
            json.dumps(
                {
                    "id": campaign_id,
                    "createdAt": "2026-08-27T12:00:00",
                    "source_type": "csv",
                    "status": "Completed",
                    "target_count": 2,
                }
            ),
            encoding="utf-8",
        )
    calls = []

    class _BulkService:
        def campaign_summaries(self, campaign_ids):
            calls.append(list(campaign_ids))
            return {
                campaign_id: {
                    "sent": 2,
                    "landing_visits": 1,
                    "human_likely_clicks": 1,
                    "unconfirmed_activity": 0,
                    "suspected_automation": 0,
                    "landing_rate": 50.0,
                    "human_click_rate": 50.0,
                }
                for campaign_id in campaign_ids
            }

    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "SENT_LOGS_DIR", str(sent_logs))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(targets))
    monkeypatch.setattr(
        email_sender, "get_email_tracking_service", lambda: _BulkService()
    )

    page = email_sender.list_campaigns(
        page_size=15,
        offset=0,
        current_user="admin@example.org",
    )

    assert len(calls) == 1
    assert set(calls[0]) == {"Campaign_one", "Campaign_two"}
    assert all(item["performance"]["human_click_rate"] == 50.0 for item in page["items"])
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import email_sender
from backend.app.core.security import get_current_user
