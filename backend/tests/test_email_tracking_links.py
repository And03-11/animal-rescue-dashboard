import re
from html import unescape
from urllib.parse import parse_qs, urlsplit

import pytest

from backend.app.services.email_tracking import (
    EmailTrackingService,
    InMemoryEmailTrackingRepository,
    normalize_reporting_url,
    token_digest,
)


@pytest.fixture
def repository():
    return InMemoryEmailTrackingRepository()


@pytest.fixture
def service(repository):
    return EmailTrackingService(
        repository,
        allowed_hosts={"donations.animallove.cr"},
    )


def extract_hrefs(html_body: str) -> list[str]:
    return [unescape(value) for value in re.findall(r'href="([^"]+)"', html_body)]


def test_prepare_email_rewrites_only_allowlisted_fragment_free_https_links(
    service, repository
):
    prepared = service.prepare_email(
        campaign_id="Campaign_august",
        recipient_email="Person@Example.org",
        html_body=(
            '<p><a href="https://donations.animallove.cr/help/?currency=usd">Donate</a></p>'
            '<a href="https://example.org/privacy">Privacy</a>'
            '<a href="mailto:hello@animallove.cr">Email us</a>'
            '<a href="/relative-path">Relative</a>'
            '<a href="http://donations.animallove.cr/insecure/">Insecure</a>'
            '<a href="https://donations.animallove.cr/help/#amounts">Amounts</a>'
            '<a href="https://donations.animallove.cr/unsubscribe/">Unsubscribe</a>'
        ),
    )

    hrefs = extract_hrefs(prepared.html_body)
    tracked = urlsplit(hrefs[0])
    query = parse_qs(tracked.query)

    assert tracked.scheme == "https"
    assert tracked.netloc == "donations.animallove.cr"
    assert tracked.path == "/help/"
    assert query == {
        "currency": ["usd"],
        "utm_source": ["email"],
        "utm_medium": ["email"],
        "utm_campaign": ["Campaign_august"],
    }
    assert tracked.fragment.startswith("alc=")
    assert hrefs[1:] == [
        "https://example.org/privacy",
        "mailto:hello@animallove.cr",
        "/relative-path",
        "http://donations.animallove.cr/insecure/",
        "https://donations.animallove.cr/help/#amounts",
        "https://donations.animallove.cr/unsubscribe/",
    ]
    assert "Person@Example.org" not in prepared.html_body
    assert "person@example.org" not in prepared.html_body

    stored_links = repository.links_for_delivery(prepared.delivery_id)
    assert len(stored_links) == 1
    assert stored_links[0].token_hash == token_digest(prepared.links[0].token)
    assert prepared.links[0].token not in repository.persisted_values()
    assert stored_links[0].destination_origin == "https://donations.animallove.cr"
    assert stored_links[0].destination_path == "/help/"


def test_prepare_email_preserves_existing_utm_values(service):
    prepared = service.prepare_email(
        campaign_id="Campaign_new",
        recipient_email="person@example.org",
        html_body=(
            '<a href="https://donations.animallove.cr/help/'
            '?utm_source=legacy&utm_medium=newsletter&utm_campaign=original">Donate</a>'
        ),
    )

    tracked = urlsplit(extract_hrefs(prepared.html_body)[0])
    assert parse_qs(tracked.query) == {
        "utm_source": ["legacy"],
        "utm_medium": ["newsletter"],
        "utm_campaign": ["original"],
    }


def test_duplicate_anchors_receive_independent_tokens_and_positions(service, repository):
    destination = "https://donations.animallove.cr/a-source-of-strength-n/"
    prepared = service.prepare_email(
        campaign_id="Campaign_two_links",
        recipient_email="person@example.org",
        html_body=(
            f'<a href="{destination}">Donate now</a>'
            f'<a href="{destination}"><img src="hero.jpg" alt="Donate"></a>'
        ),
    )

    tokens = [urlsplit(href).fragment.removeprefix("alc=") for href in extract_hrefs(prepared.html_body)]
    assert len(tokens) == 2
    assert tokens[0] != tokens[1]
    assert all(len(token) >= 32 for token in tokens)
    assert [link.link_position for link in prepared.links] == [0, 1]
    assert [link.link_position for link in repository.links_for_delivery(prepared.delivery_id)] == [0, 1]


def test_repreparing_unsent_delivery_replaces_old_token_digests(service, repository):
    first = service.prepare_email(
        campaign_id="Campaign_retry",
        recipient_email="person@example.org",
        html_body='<a href="https://donations.animallove.cr/first/">First</a>',
    )
    second = service.prepare_email(
        campaign_id="Campaign_retry",
        recipient_email="PERSON@example.org ",
        html_body='<a href="https://donations.animallove.cr/second/">Second</a>',
    )

    assert second.delivery_id == first.delivery_id
    assert repository.delivery_count == 1
    stored_links = repository.links_for_delivery(second.delivery_id)
    assert len(stored_links) == 1
    assert stored_links[0].destination_path == "/second/"
    assert token_digest(first.links[0].token) not in repository.persisted_values()


def test_normalize_reporting_url_drops_query_fragment_and_credentials():
    assert normalize_reporting_url(
        "https://donations.animallove.cr:443/help/?recipient=private#section"
    ) == ("https://donations.animallove.cr:443", "/help/")

    with pytest.raises(ValueError, match="credentials"):
        normalize_reporting_url("https://user:secret@donations.animallove.cr/help/")


@pytest.mark.parametrize(
    ("campaign_id", "recipient_email", "message"),
    [
        ("", "person@example.org", "campaign_id"),
        ("Campaign_valid", "", "recipient_email"),
        ("Campaign_valid", "not-an-email", "recipient_email"),
    ],
)
def test_prepare_email_rejects_missing_or_invalid_identifiers(
    service, campaign_id, recipient_email, message
):
    with pytest.raises(ValueError, match=message):
        service.prepare_email(
            campaign_id=campaign_id,
            recipient_email=recipient_email,
            html_body="<p>Body</p>",
        )
