import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import email_tracking as email_tracking_api
from backend.app.services.email_tracking import (
    EmailTrackingService,
    InMemoryEmailTrackingRepository,
    append_unsubscribe_footer,
)


@pytest.fixture
def unsubscribe_environment():
    repository = InMemoryEmailTrackingRepository()
    service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )
    prepared = service.prepare_email(
        campaign_id="Campaign_unsubscribe",
        recipient_email="Person@Example.org",
        html_body='<a href="https://donations.animallove.cr/give/">Donate</a>',
    )
    return service, repository, prepared


def test_unsubscribe_token_is_hashed_and_suppression_is_normalized_idempotently(
    unsubscribe_environment,
):
    service, repository, prepared = unsubscribe_environment

    assert prepared.unsubscribe_token not in repository.persisted_values()
    assert service.is_suppressed("person@example.org") is False

    assert service.unsubscribe(prepared.unsubscribe_token) is None
    assert service.unsubscribe(prepared.unsubscribe_token) is None

    assert service.is_suppressed(" PERSON@example.org ") is True
    assert repository.suppression_count == 1
    assert prepared.unsubscribe_token not in repository.persisted_values()


def test_unknown_unsubscribe_token_is_indistinguishable_and_does_not_suppress(
    unsubscribe_environment,
):
    service, repository, _prepared = unsubscribe_environment

    assert service.unsubscribe("unknown-token-with-enough-entropy") is None

    assert repository.suppression_count == 0
    assert service.is_suppressed("person@example.org") is False


def test_prepare_unsubscribe_issues_a_hashed_token_without_rewriting_html():
    repository = InMemoryEmailTrackingRepository()
    service = EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )

    token = service.prepare_unsubscribe(
        campaign_id="Campaign_footer",
        recipient_email="person@example.org",
    )

    assert len(token) >= 16
    assert token not in repository.persisted_values()
    service.unsubscribe(token)
    assert service.is_suppressed("person@example.org") is True


def test_unsubscribe_footer_is_accessible_and_not_duplicated():
    url = "https://dashboard.animallove.cr/api/v1/email-tracking/unsubscribe/token"
    original = "<main><p>Thank you</p></main>"

    appended = append_unsubscribe_footer(original, url)
    repeated = append_unsubscribe_footer(appended, url)

    assert 'href="' + url + '"' in appended
    assert "Unsubscribe" in appended
    assert repeated == appended


@pytest.mark.parametrize(
    ("original", "closing_tag"),
    [
        ("<html><body><p>Thank you</p></body></html>", "</body>"),
        ("<html><body>First</body><body>Last</body></html>", "</body>"),
        ("<html><main><p>Thank you</p></main></html>", "</html>"),
        ("<html><BODY><p>Thank you</p></BODY></html>", "</body>"),
    ],
)
def test_unsubscribe_footer_is_inserted_before_the_last_document_closing_tag(
    original, closing_tag
):
    url = "https://dashboard.animallove.cr/api/v1/email-tracking/unsubscribe/token"

    appended = append_unsubscribe_footer(original, url)

    insertion_point = original.casefold().rfind(closing_tag)
    footer_start = appended.index('<footer role="contentinfo"')
    assert appended[:footer_start] == original[:insertion_point]
    assert appended[footer_start:].endswith(original[insertion_point:])


def test_unsubscribe_footer_appends_to_html_fragments_without_document_closing_tags():
    url = "https://dashboard.animallove.cr/api/v1/email-tracking/unsubscribe/token"
    original = "<main><p>Thank you</p></main>"

    appended = append_unsubscribe_footer(original, url)

    assert appended.startswith(original)
    assert appended.endswith("</footer>")


@pytest.mark.parametrize(
    "existing_url",
    [
        "https://dashboard.animallove.cr/unsubscribe/stale-token",
        "https://dashboard.animallove.cr/api/v1/email-tracking/unsubscribe/new-token",
    ],
)
def test_noncanonical_unsubscribe_link_does_not_suppress_generated_footer(
    existing_url,
):
    generated_url = (
        "https://dashboard.animallove.cr/api/v1/email-tracking/"
        "unsubscribe/new-token"
    )
    original = (
        f'<html><body><a href="{existing_url}" rel="unsubscribe" '
        'style="display:none">Manage preferences</a></body></html>'
    )

    appended = append_unsubscribe_footer(original, generated_url)

    assert appended != original
    assert '<footer role="contentinfo"' in appended
    assert f'href="{generated_url}" rel="unsubscribe"' in appended
    assert appended.count('<footer role="contentinfo"') == 1


def test_canonical_footer_markup_inside_comment_does_not_count_as_visible():
    generated_url = (
        "https://dashboard.animallove.cr/api/v1/email-tracking/"
        "unsubscribe/new-token"
    )
    canonical_footer = (
        '<footer role="contentinfo" style="margin-top:32px;padding-top:16px;'
        'border-top:1px solid #d7dedb;color:#66736e;font-size:12px;'
        'line-height:1.5;text-align:center">'
        'You are receiving this email from Animal Love Rescue Center. '
        f'<a href="{generated_url}" rel="unsubscribe" style="color:#267f73">'
        'Unsubscribe</a></footer>'
    )
    original = f"<html><body><!--{canonical_footer}--></body></html>"

    appended = append_unsubscribe_footer(original, generated_url)

    assert appended != original
    assert appended.endswith(f"-->{canonical_footer}</body></html>")


@pytest.mark.parametrize(
    "url",
    [
        "http://dashboard.animallove.cr/unsubscribe/token",
        "https://attacker@example.org/unsubscribe/token",
        "/relative/unsubscribe/token",
    ],
)
def test_unsubscribe_footer_rejects_unsafe_public_urls(url):
    with pytest.raises(ValueError):
        append_unsubscribe_footer("<p>Body</p>", url)


@pytest.fixture
def unsubscribe_api(monkeypatch, unsubscribe_environment):
    service, repository, prepared = unsubscribe_environment
    monkeypatch.setattr(
        email_tracking_api, "get_email_tracking_service", lambda: service
    )
    app = FastAPI()
    app.include_router(email_tracking_api.router, prefix="/api/v1/email-tracking")
    return TestClient(app), service, repository, prepared


def test_get_unsubscribe_returns_confirmation_without_mutating_state(
    unsubscribe_api,
):
    client, service, _repository, prepared = unsubscribe_api

    response = client.get(
        f"/api/v1/email-tracking/unsubscribe/{prepared.unsubscribe_token}"
    )

    assert response.status_code == 200
    assert "Confirm unsubscribe" in response.text
    assert "person@example.org" not in response.text.casefold()
    assert service.is_suppressed("person@example.org") is False


def test_one_click_post_accepts_rfc8058_body_and_hides_token_validity(
    unsubscribe_api,
):
    client, service, _repository, prepared = unsubscribe_api
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    valid = client.post(
        f"/api/v1/email-tracking/unsubscribe/{prepared.unsubscribe_token}",
        content="List-Unsubscribe=One-Click",
        headers=headers,
    )
    unknown = client.post(
        "/api/v1/email-tracking/unsubscribe/unknown-token-with-enough-entropy",
        content="List-Unsubscribe=One-Click",
        headers=headers,
    )

    assert valid.status_code == 200
    assert unknown.status_code == 200
    assert valid.json() == {"accepted": True}
    assert unknown.json() == valid.json()
    assert service.is_suppressed("person@example.org") is True
    assert "person@example.org" not in valid.text.casefold()


def test_confirmation_post_suppresses_without_exposing_recipient(unsubscribe_api):
    client, service, _repository, prepared = unsubscribe_api

    response = client.post(
        f"/api/v1/email-tracking/unsubscribe/{prepared.unsubscribe_token}/confirm"
    )

    assert response.status_code == 200
    assert "You have been unsubscribed" in response.text
    assert "person@example.org" not in response.text.casefold()
    assert service.is_suppressed("person@example.org") is True
