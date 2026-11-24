import json

import pytest

from backend.app.services.airtable_service import AirtableCampaignQueryError, AirtableService
from backend.app.services.campaign_audiences import normalize_audiences


class DonationsTable:
    def __init__(self, records):
        self.records = records
        self.calls = []

    def all(self, **kwargs):
        self.calls.append(kwargs)
        return self.records


def make_service(records):
    service = AirtableService.__new__(AirtableService)
    service.donations_table = DonationsTable(records)
    return service


def test_context_is_per_donor_shared_by_all_their_emails_and_uses_active_dates():
    service = make_service([
        {"id": "first", "fields": {"Donor": ["jane"], "Date": "2026-10-01T12:00:00Z"}},
        {"id": "second", "fields": {"Donor": ["jane"], "Date": "2026-11-22T02:00:00Z"}},
        {"id": "third", "fields": {"Donor": ["jane"], "Date": "2026-11-20T12:00:00Z"}},
        {"id": "third", "fields": {"Donor": ["jane"], "Date": "2026-11-20T12:00:00Z"}},
        {"id": "other", "fields": {"Donor": ["not-selected"], "Date": "bad"}},
    ])
    contacts = [{"Email": email, "_donor_ids": json.dumps(["jane"])} for email in ["a@example.org", "b@example.org"]]
    enriched = service.enrich_donor_campaign_contacts(contacts)
    assert len(service.donations_table.calls) == 1
    assert service.donations_table.calls[0]["formula"] == "{Active Campaign} = 1"
    assert [r["_donation_count"] for r in enriched] == ["3", "3"]
    assert [r["_last_donation_at"] for r in enriched] == ["2026-11-21", "2026-11-21"]
    assert "_donation_count" not in contacts[0]


@pytest.mark.parametrize("ids", [[], ["one", "two"], "not-a-list"])
def test_ambiguous_or_missing_donor_link_blocks_context(ids):
    service = make_service([])
    with pytest.raises(ValueError, match="exactly one donor"):
        service.enrich_donor_campaign_contacts([{"Email": "a@example.org", "_donor_ids": json.dumps(ids)}])
    assert service.donations_table.calls == []


def test_no_active_donation_does_not_fall_back_to_a_historical_date():
    service = make_service([])
    with pytest.raises(ValueError, match="no dated donation"):
        service.enrich_donor_campaign_contacts([{"Email": "a@example.org", "_donor_ids": '["jane"]', "Last Donation": "2026-11-22"}])


def test_active_donation_lookup_failure_is_not_treated_as_empty():
    service = make_service([])
    def unavailable(**_kwargs):
        raise OSError("unavailable")
    service.donations_table.all = unavailable
    with pytest.raises(AirtableCampaignQueryError):
        service.enrich_donor_campaign_contacts([{"Email": "a@example.org", "_donor_ids": '["jane"]'}])


def test_duplicate_email_linked_to_different_donors_is_not_personalized_as_one_of_them():
    service = make_service([])
    service.emails_table = DonationsTable([
        {"fields": {"Email": "shared@example.org", "Donor": ["one"], "Region": "USA"}},
        {"fields": {"Email": "SHARED@example.org", "Donor": ["two"], "Region": "USA"}},
    ])
    resolved = service.resolve_campaign_audiences(
        normalize_audiences([{"region": "USA", "is_bounced": False}]), "dnr",
    )
    assert resolved.total_unique == 1
    assert json.loads(resolved.contacts[0]["_donor_ids"]) == ["one", "two"]
    with pytest.raises(ValueError, match="exactly one donor"):
        service.enrich_donor_campaign_contacts(list(resolved.contacts))
    assert service.donations_table.calls == []
