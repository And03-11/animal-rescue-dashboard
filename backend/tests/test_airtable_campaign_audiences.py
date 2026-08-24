"""Focused tests for composed Airtable campaign audience resolution."""

from __future__ import annotations

import pytest

from backend.app.services.campaign_audiences import normalize_audiences

try:
    from backend.app.services.airtable_service import (
        AirtableCampaignQueryError,
        AirtableService,
    )
except ImportError as exc:  # Strict RED: missing symbols fail as an assertion.
    _IMPORT_ERROR = exc
    AirtableCampaignQueryError = AirtableService = None  # type: ignore[assignment]
else:
    _IMPORT_ERROR = None


class CapturingTable:
    def __init__(self, records):
        self.records = records
        self.calls = []

    def all(self, **kwargs):
        self.calls.append(kwargs)
        return self.records


def test_campaign_audience_resolver_imports():
    assert _IMPORT_ERROR is None, (
        "campaign audience resolver could not be imported: "
        f"{_IMPORT_ERROR}"
    )


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience resolver is missing")
def test_resolves_two_branches_with_one_or_formula():
    table = CapturingTable([
        {"fields": {"Email": "usa@example.org", "Name": ["Una"], "Region": "USA", "Bounced Account": False}},
        {"fields": {"Email": "eur@example.org", "Name": ["Eva"], "Region": "EUR", "Bounced Account": True}},
    ])
    service = AirtableService.__new__(AirtableService)
    service.emails_table = table

    result = service.resolve_campaign_audiences(
        normalize_audiences([
            {"region": "USA", "is_bounced": False},
            {"region": "EUR", "is_bounced": True},
        ]),
        "standard",
    )

    formula = table.calls[0]["formula"]
    assert len(table.calls) == 1
    assert "OR(" in formula
    assert "{Region} = 'USA'" in formula
    assert "{Region} = 'EUR'" in formula
    assert result.total_unique == 2
    assert [branch.count for branch in result.branches] == [1, 1]


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience resolver is missing")
def test_standard_segment_excludes_current_campaign_marked_contacts():
    table = CapturingTable([])
    service = AirtableService.__new__(AirtableService)
    service.emails_table = table

    service.resolve_campaign_audiences(
        normalize_audiences([{"region": "USA", "is_bounced": False}]),
        "standard",
    )

    assert "NOT({Exclude From Current Campaign} = 1)" in table.calls[0]["formula"]


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience resolver is missing")
def test_dnr_segment_requires_current_campaign_marked_contacts():
    table = CapturingTable([])
    service = AirtableService.__new__(AirtableService)
    service.emails_table = table

    service.resolve_campaign_audiences(
        normalize_audiences([{"region": "USA", "is_bounced": False}]),
        "dnr",
    )

    assert "{Exclude From Current Campaign} = 1" in table.calls[0]["formula"]


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience resolver is missing")
def test_deduplicates_contacts_globally_after_counting_each_branch():
    table = CapturingTable([
        {"fields": {"Email": " One@example.org ", "Name": ["First"], "Region": "USA", "Bounced Account": False}},
        {"fields": {"Email": "one@EXAMPLE.org", "Name": ["Duplicate"], "Region": "EUR", "Bounced Account": True}},
    ])
    service = AirtableService.__new__(AirtableService)
    service.emails_table = table

    result = service.resolve_campaign_audiences(
        normalize_audiences([
            {"region": "USA", "is_bounced": False},
            {"region": "EUR", "is_bounced": True},
        ]),
        "standard",
    )

    assert [branch.count for branch in result.branches] == [1, 1]
    assert result.contacts == ({"Email": "One@example.org", "Name": "First"},)


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience resolver is missing")
def test_wraps_airtable_access_errors_without_treating_them_as_empty():
    class FailingTable:
        def all(self, **_kwargs):
            raise OSError("Airtable unavailable")

    service = AirtableService.__new__(AirtableService)
    service.emails_table = FailingTable()

    with pytest.raises(AirtableCampaignQueryError, match="Airtable unavailable"):
        service.resolve_campaign_audiences(
            normalize_audiences([{"region": "USA", "is_bounced": False}]),
            "standard",
        )


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience resolver is missing")
def test_legacy_adapter_normalizes_one_branch_and_returns_contacts():
    table = CapturingTable([
        {"fields": {"Email": "usa@example.org", "Name": ["Una"], "Region": "USA", "Bounced Account": False}},
    ])
    service = AirtableService.__new__(AirtableService)
    service.emails_table = table

    assert service.get_campaign_contacts("USA", False, "standard") == [
        {"Email": "usa@example.org", "Name": "Una"}
    ]
