"""Tests for campaign audience normalization and contact de-duplication."""

from __future__ import annotations

import pytest

try:
    from backend.app.services.campaign_audiences import (
        AudienceBranch,
        AudienceCount,
        AudienceResolution,
        deduplicate_contacts,
        normalize_audiences,
        serialize_audiences,
    )
except ModuleNotFoundError as exc:  # Strict RED: report a missing module as a test failure.
    _IMPORT_ERROR = exc
    AudienceBranch = AudienceCount = AudienceResolution = None  # type: ignore[assignment]
    deduplicate_contacts = normalize_audiences = serialize_audiences = None  # type: ignore[assignment]
else:
    _IMPORT_ERROR = None


def test_campaign_audiences_module_imports() -> None:
    assert _IMPORT_ERROR is None, f"campaign audience module could not be imported: {_IMPORT_ERROR}"


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience module is missing")
def test_normalizes_arbitrary_unique_branch_subset():
    branches = normalize_audiences(
        [
            {"region": "EUR", "is_bounced": True},
            {"region": "USA", "is_bounced": False},
        ]
    )
    assert serialize_audiences(branches) == [
        {"region": "USA", "is_bounced": False},
        {"region": "EUR", "is_bounced": True},
    ]


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience module is missing")
def test_legacy_filter_becomes_one_branch():
    branches = normalize_audiences(None, legacy_region="EUR", legacy_is_bounced=False)
    assert serialize_audiences(branches) == [
        {"region": "EUR", "is_bounced": False}
    ]


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience module is missing")
def test_stored_empty_audiences_fall_back_to_valid_legacy_fields():
    branches = normalize_audiences(
        [], legacy_region="USA", legacy_is_bounced=True
    )

    assert serialize_audiences(branches) == [
        {"region": "USA", "is_bounced": True}
    ]


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience module is missing")
def test_rejects_duplicates_and_invalid_regions():
    with pytest.raises(ValueError, match="Audience branches must be unique"):
        normalize_audiences(
            [
                {"region": "USA", "is_bounced": False},
                {"region": "USA", "is_bounced": False},
            ]
        )
    with pytest.raises(ValueError, match="Unsupported audience region"):
        normalize_audiences([{"region": "LATAM", "is_bounced": False}])


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience module is missing")
def test_deduplicates_email_case_and_outer_whitespace():
    contacts = deduplicate_contacts(
        [
            {"Email": " One@example.org ", "Name": "One"},
            {"Email": "one@EXAMPLE.org", "Name": "Duplicate"},
            {"Email": "two@example.org", "Name": "Two"},
        ]
    )
    assert contacts == (
        {"Email": "One@example.org", "Name": "One"},
        {"Email": "two@example.org", "Name": "Two"},
    )


@pytest.mark.skipif(_IMPORT_ERROR is not None, reason="campaign audience module is missing")
def test_deduplication_stringifies_non_string_contact_metadata():
    contacts = deduplicate_contacts(
        [{"Email": "one@example.org", "AirtableId": 42, "Subscribed": True}]
    )
    assert contacts == (
        {"Email": "one@example.org", "AirtableId": "42", "Subscribed": "True"},
    )
