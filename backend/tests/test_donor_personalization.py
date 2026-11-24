from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from backend.app.services.donor_personalization import (
    DonorPhraseFields, donation_local_date, donor_phrase_for_contact,
    format_donation_when, number_in_words, personalize_donor_html,
    preview_donor_html, validate_campaign_personalization,
)


@pytest.mark.parametrize("days,expected", [(0, "today"), (1, "yesterday"), (3, "three days ago"), (21, "twenty-one days ago")])
def test_when_uses_readable_calendar_days(days, expected):
    assert format_donation_when(days) == expected


def test_single_donation_uses_send_date_in_costa_rica():
    contact = {"_donation_count": "1", "_last_donation_at": "2026-11-20T02:00:00Z"}
    # UTC has reached Nov 23, while Costa Rica is still on Nov 22.
    now = datetime(2026, 11, 23, 2, tzinfo=timezone.utc)
    assert donation_local_date(contact["_last_donation_at"]).isoformat() == "2026-11-19"
    assert donor_phrase_for_contact(contact, {}, now=now) == "donation you made three days ago"


def test_plural_counts_all_campaign_donations_including_older_than_week():
    contact = {"_donation_count": "5", "_last_donation_at": "2026-11-10"}
    assert donor_phrase_for_contact(contact, {}, now=datetime(2026, 11, 23, 12, tzinfo=timezone.utc)) == (
        "five donations you’ve made over the past week"
    )


def test_custom_phrases_allow_both_values_and_preserve_wording():
    result = donor_phrase_for_contact(
        {"_donation_count": "2", "_last_donation_at": "2026-11-22"},
        {"donor_plural_phrase": "{{count}} gifts, most recently {{when}}"},
        now=datetime(2026, 11, 23, 12, tzinfo=timezone.utc),
    )
    assert result == "two gifts, most recently yesterday"


def test_preview_escapes_phrase_and_preserves_other_html_exactly():
    html = '<table style="width:600px"><tr><td><b>{{Day}}</b> / {{day}}</td></tr></table>'
    config = {"donor_singular_phrase": "gift <three> & love {{when}}"}
    assert preview_donor_html(html, config) == (
        '<table style="width:600px"><tr><td><b>gift &lt;three&gt; &amp; love three days ago</b>'
        ' / gift &lt;three&gt; &amp; love three days ago</td></tr></table>'
    )


def test_html_without_day_does_not_require_donor_data():
    assert personalize_donor_html('<p>{{name}}</p>', {}, {}) == '<p>{{name}}</p>'


@pytest.mark.parametrize("contact", [{}, {"_donation_count": "0", "_last_donation_at": "2026-11-22"},
    {"_donation_count": "1", "_last_donation_at": "bad-date"}])
def test_missing_or_invalid_donation_data_blocks_personalization(contact):
    with pytest.raises(ValueError):
        donor_phrase_for_contact(contact, {})


def test_future_donation_is_not_rendered_as_negative_days():
    with pytest.raises(ValueError, match="future"):
        donor_phrase_for_contact({"_donation_count": "1", "_last_donation_at": "2026-11-24"}, {},
            now=datetime(2026, 11, 23, 12, tzinfo=timezone.utc))


@pytest.mark.parametrize("phrase", ["", "  ", "{{Day}}", "{{unknown}}", "{{when}", "x" * 1001])
def test_phrase_configuration_rejects_invalid_variables(phrase):
    with pytest.raises(ValidationError):
        DonorPhraseFields(donor_singular_phrase=phrase)


@pytest.mark.parametrize("source,segment", [("csv", "dnr"), ("airtable", "standard")])
def test_day_requires_airtable_donors(source, segment):
    with pytest.raises(ValueError, match="Donors"):
        validate_campaign_personalization({"source_type": source, "segment": segment, "html_body": "{{Day}}"})


def test_inner_tokens_belong_in_phrase_configuration():
    with pytest.raises(ValueError, match="configure"):
        validate_campaign_personalization({"source_type": "airtable", "segment": "dnr", "html_body": "{{count}}"})


def test_large_numbers_are_readable():
    assert number_in_words(135) == "one hundred thirty-five"
    assert number_in_words(1010) == "one thousand ten"
