"""First-party tracking primitives for Gmail email campaigns.

The link rewriter deliberately keeps recipients on the real donation domain.
Raw bearer tokens only exist while building the email and when a landing page
submits an event; repositories receive SHA-256 digests only.
"""

from __future__ import annotations

import hashlib
import re
import secrets
from dataclasses import dataclass
from html import escape
from html.parser import HTMLParser
from typing import Protocol, Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import UUID, uuid4


_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_UNTRACKED_REL_VALUES = frozenset({"unsubscribe", "privacy-policy"})


def token_digest(token: str) -> str:
    """Return the persistence-safe digest for an opaque bearer token."""

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_reporting_url(url: str) -> tuple[str, str]:
    """Return an origin and path without query, fragment, or credentials."""

    parsed = urlsplit(url)
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URLs containing credentials are not trackable")
    if not parsed.scheme or not parsed.hostname:
        raise ValueError("A reporting URL requires an absolute origin")

    hostname = parsed.hostname.rstrip(".").lower()
    port = parsed.port
    port_suffix = "" if port is None else f":{port}"
    origin = f"{parsed.scheme.lower()}://{hostname}{port_suffix}"
    return origin, parsed.path or "/"


@dataclass(frozen=True)
class DeliveryRecord:
    id: UUID
    campaign_id: str
    recipient_email: str
    recipient_email_normalized: str
    status: str = "prepared"


@dataclass(frozen=True)
class StoredTrackingLink:
    id: UUID
    delivery_id: UUID
    token_hash: str
    destination_origin: str
    destination_path: str
    link_position: int


@dataclass(frozen=True)
class TrackingLink:
    id: UUID
    delivery_id: UUID
    token: str
    destination_origin: str
    destination_path: str
    link_position: int


@dataclass(frozen=True)
class PreparedTrackedEmail:
    delivery_id: UUID
    html_body: str
    links: tuple[TrackingLink, ...]
    unsubscribe_token: str


class EmailTrackingRepository(Protocol):
    def prepare_delivery(
        self,
        *,
        campaign_id: str,
        recipient_email: str,
        recipient_email_normalized: str,
    ) -> DeliveryRecord:
        """Create or return the pending delivery for one campaign recipient."""

    def replace_tracking_links(
        self, delivery_id: UUID, links: Sequence[StoredTrackingLink]
    ) -> None:
        """Atomically replace pending tracking links for one delivery."""

    def replace_unsubscribe_token(self, delivery_id: UUID, token_hash: str) -> None:
        """Atomically replace the unsubscribe token for one delivery."""


class InMemoryEmailTrackingRepository:
    """Behavioral repository used by unit tests and local domain checks."""

    def __init__(self) -> None:
        self._deliveries_by_id: dict[UUID, DeliveryRecord] = {}
        self._delivery_ids_by_key: dict[tuple[str, str], UUID] = {}
        self._links_by_id: dict[UUID, StoredTrackingLink] = {}
        self._link_id_by_token_hash: dict[str, UUID] = {}
        self._unsubscribe_hash_by_delivery: dict[UUID, str] = {}

    @property
    def delivery_count(self) -> int:
        return len(self._deliveries_by_id)

    def prepare_delivery(
        self,
        *,
        campaign_id: str,
        recipient_email: str,
        recipient_email_normalized: str,
    ) -> DeliveryRecord:
        key = (campaign_id, recipient_email_normalized)
        existing_id = self._delivery_ids_by_key.get(key)
        if existing_id is not None:
            return self._deliveries_by_id[existing_id]

        delivery = DeliveryRecord(
            id=uuid4(),
            campaign_id=campaign_id,
            recipient_email=recipient_email,
            recipient_email_normalized=recipient_email_normalized,
        )
        self._deliveries_by_id[delivery.id] = delivery
        self._delivery_ids_by_key[key] = delivery.id
        return delivery

    def replace_tracking_links(
        self, delivery_id: UUID, links: Sequence[StoredTrackingLink]
    ) -> None:
        if delivery_id not in self._deliveries_by_id:
            raise KeyError(f"Unknown delivery {delivery_id}")

        old_ids = [
            link_id
            for link_id, link in self._links_by_id.items()
            if link.delivery_id == delivery_id
        ]
        for link_id in old_ids:
            old_link = self._links_by_id.pop(link_id)
            self._link_id_by_token_hash.pop(old_link.token_hash, None)

        for link in links:
            if link.token_hash in self._link_id_by_token_hash:
                raise ValueError("Duplicate tracking token digest")
            self._links_by_id[link.id] = link
            self._link_id_by_token_hash[link.token_hash] = link.id

    def replace_unsubscribe_token(self, delivery_id: UUID, token_hash: str) -> None:
        if delivery_id not in self._deliveries_by_id:
            raise KeyError(f"Unknown delivery {delivery_id}")
        self._unsubscribe_hash_by_delivery[delivery_id] = token_hash

    def links_for_delivery(self, delivery_id: UUID) -> list[StoredTrackingLink]:
        return sorted(
            (
                link
                for link in self._links_by_id.values()
                if link.delivery_id == delivery_id
            ),
            key=lambda link: link.link_position,
        )

    def persisted_values(self) -> set[str]:
        return set(self._link_id_by_token_hash) | set(
            self._unsubscribe_hash_by_delivery.values()
        )


class _TrackingHTMLRewriter(HTMLParser):
    def __init__(self, rewrite_href) -> None:
        super().__init__(convert_charrefs=False)
        self._rewrite_href = rewrite_href
        self._parts: list[str] = []

    @property
    def html(self) -> str:
        return "".join(self._parts)

    @staticmethod
    def _render_start_tag(tag: str, attrs: list[tuple[str, str | None]], close: bool) -> str:
        rendered_attrs = "".join(
            f" {name}" if value is None else f' {name}="{escape(value, quote=True)}"'
            for name, value in attrs
        )
        suffix = " />" if close else ">"
        return f"<{tag}{rendered_attrs}{suffix}"

    def _rewrite_anchor_attrs(
        self, attrs: list[tuple[str, str | None]]
    ) -> list[tuple[str, str | None]]:
        attr_map = {name.lower(): value for name, value in attrs}
        rel_values = {
            value.lower()
            for value in (attr_map.get("rel") or "").split()
            if value
        }
        if "data-no-track" in attr_map or rel_values & _UNTRACKED_REL_VALUES:
            return attrs

        rewritten: list[tuple[str, str | None]] = []
        for name, value in attrs:
            if name.lower() == "href" and value is not None:
                value = self._rewrite_href(value)
            rewritten.append((name, value))
        return rewritten

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        rendered_attrs = self._rewrite_anchor_attrs(attrs) if tag.lower() == "a" else attrs
        self._parts.append(self._render_start_tag(tag, rendered_attrs, close=False))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        rendered_attrs = self._rewrite_anchor_attrs(attrs) if tag.lower() == "a" else attrs
        self._parts.append(self._render_start_tag(tag, rendered_attrs, close=True))

    def handle_endtag(self, tag: str) -> None:
        self._parts.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def handle_entityref(self, name: str) -> None:
        self._parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self._parts.append(f"&#{name};")

    def handle_comment(self, data: str) -> None:
        self._parts.append(f"<!--{data}-->")

    def handle_decl(self, decl: str) -> None:
        self._parts.append(f"<!{decl}>")

    def handle_pi(self, data: str) -> None:
        self._parts.append(f"<?{data}>")


class EmailTrackingService:
    def __init__(
        self,
        repository: EmailTrackingRepository,
        *,
        allowed_hosts: set[str] | frozenset[str],
    ) -> None:
        self.repository = repository
        self.allowed_hosts = frozenset(
            host.strip().rstrip(".").lower() for host in allowed_hosts if host.strip()
        )

    @staticmethod
    def _normalize_email(recipient_email: str) -> tuple[str, str]:
        original = recipient_email.strip()
        normalized = original.casefold()
        if not _EMAIL_PATTERN.fullmatch(normalized):
            raise ValueError("recipient_email must be a valid email address")
        return original, normalized

    def prepare_email(
        self, *, campaign_id: str, recipient_email: str, html_body: str
    ) -> PreparedTrackedEmail:
        campaign_id = campaign_id.strip()
        if not campaign_id:
            raise ValueError("campaign_id is required")
        original_email, normalized_email = self._normalize_email(recipient_email)
        if not isinstance(html_body, str):
            raise ValueError("html_body must be a string")

        delivery = self.repository.prepare_delivery(
            campaign_id=campaign_id,
            recipient_email=original_email,
            recipient_email_normalized=normalized_email,
        )
        prepared_links: list[TrackingLink] = []
        stored_links: list[StoredTrackingLink] = []

        def rewrite_href(href: str) -> str:
            try:
                parsed = urlsplit(href)
                if (
                    parsed.scheme.lower() != "https"
                    or parsed.hostname is None
                    or parsed.hostname.rstrip(".").lower() not in self.allowed_hosts
                    or parsed.fragment
                    or parsed.username is not None
                    or parsed.password is not None
                    or "unsubscribe" in (parsed.path or "").lower()
                ):
                    return href

                origin, destination_path = normalize_reporting_url(href)
                query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
                existing_query_keys = {key.casefold() for key, _value in query_pairs}
                for key, value in (
                    ("utm_source", "email"),
                    ("utm_medium", "email"),
                    ("utm_campaign", campaign_id),
                ):
                    if key not in existing_query_keys:
                        query_pairs.append((key, value))

                raw_token = secrets.token_urlsafe(24)
                link_id = uuid4()
                position = len(prepared_links)
                prepared_link = TrackingLink(
                    id=link_id,
                    delivery_id=delivery.id,
                    token=raw_token,
                    destination_origin=origin,
                    destination_path=destination_path,
                    link_position=position,
                )
                prepared_links.append(prepared_link)
                stored_links.append(
                    StoredTrackingLink(
                        id=link_id,
                        delivery_id=delivery.id,
                        token_hash=token_digest(raw_token),
                        destination_origin=origin,
                        destination_path=destination_path,
                        link_position=position,
                    )
                )
                return urlunsplit(
                    (
                        parsed.scheme,
                        parsed.netloc,
                        parsed.path,
                        urlencode(query_pairs, doseq=True),
                        f"alc={raw_token}",
                    )
                )
            except ValueError:
                return href

        parser = _TrackingHTMLRewriter(rewrite_href)
        parser.feed(html_body)
        parser.close()

        unsubscribe_token = secrets.token_urlsafe(24)
        self.repository.replace_tracking_links(delivery.id, stored_links)
        self.repository.replace_unsubscribe_token(
            delivery.id, token_digest(unsubscribe_token)
        )
        return PreparedTrackedEmail(
            delivery_id=delivery.id,
            html_body=parser.html,
            links=tuple(prepared_links),
            unsubscribe_token=unsubscribe_token,
        )
