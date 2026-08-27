"""First-party tracking primitives for Gmail email campaigns.

The link rewriter deliberately keeps recipients on the real donation domain.
Raw bearer tokens only exist while building the email and when a landing page
submits an event; repositories receive SHA-256 digests only.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from html import escape
from html.parser import HTMLParser
from typing import Protocol, Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import UUID, uuid4

import psycopg2
from psycopg2.extras import RealDictCursor


_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_UNTRACKED_REL_VALUES = frozenset({"unsubscribe", "privacy-policy"})
_EVENT_TYPES = frozenset({"landing_loaded", "human_interaction", "session_summary"})
_AUTOMATION_USER_AGENT_PATTERN = re.compile(
    r"bot|crawler|spider|scanner|proofpoint|safelinks|barracuda|mimecast|urlscan",
    re.IGNORECASE,
)
_DEVELOPMENT_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


class _UnsubscribeLinkDetector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found = False

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.casefold() != "a":
            return
        attributes = {name.casefold(): value or "" for name, value in attrs}
        rel_values = {
            value.casefold() for value in attributes.get("rel", "").split()
        }
        href = attributes.get("href", "")
        try:
            path = urlsplit(href).path.casefold()
        except ValueError:
            path = href.casefold()
        if "unsubscribe" in path or "unsubscribe" in rel_values:
            self.found = True


def append_unsubscribe_footer(html_body: str, unsubscribe_url: str) -> str:
    """Append one fixed, accessible unsubscribe footer to an HTML message."""

    if not isinstance(html_body, str):
        raise ValueError("html_body must be a string")
    parsed = urlsplit(unsubscribe_url)
    if (
        parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or parsed.scheme.casefold() not in {"http", "https"}
        or (
            parsed.scheme.casefold() != "https"
            and parsed.hostname.casefold() not in _DEVELOPMENT_HOSTS
        )
    ):
        raise ValueError("unsubscribe_url must be an absolute safe HTTPS URL")

    detector = _UnsubscribeLinkDetector()
    detector.feed(html_body)
    detector.close()
    if detector.found:
        return html_body

    safe_url = escape(unsubscribe_url, quote=True)
    footer = (
        '<footer role="contentinfo" style="margin-top:32px;padding-top:16px;'
        'border-top:1px solid #d7dedb;color:#66736e;font-size:12px;'
        'line-height:1.5;text-align:center">'
        'You are receiving this email from Animal Love Rescue Center. '
        f'<a href="{safe_url}" rel="unsubscribe" style="color:#267f73">'
        'Unsubscribe</a></footer>'
    )
    return html_body + footer


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
    sender_account: str | None = None
    gmail_message_id: str | None = None
    failure_reason: str | None = None


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
    already_sent: bool = False


@dataclass(frozen=True)
class TrackingEvent:
    id: UUID
    tracking_link_id: UUID
    event_type: str
    visitor_id: str
    engagement_ms: int
    viewport_width: int | None
    device_class: str
    user_agent: str
    ip_hash: str | None
    suspected_automation: bool
    occurred_at: datetime


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

    def find_tracking_link_by_digest(
        self, digest: str
    ) -> StoredTrackingLink | None:
        """Resolve one token digest without exposing recipient data."""

    def upsert_event(self, event: TrackingEvent) -> TrackingEvent:
        """Insert or merge a unique link/visitor/event signal."""

    def mark_delivery_sent(
        self,
        delivery_id: UUID,
        *,
        sender_account: str,
        gmail_message_id: str | None,
    ) -> None:
        """Persist a successful Gmail handoff before the legacy resume ledger."""

    def mark_delivery_failed(
        self,
        delivery_id: UUID,
        *,
        sender_account: str,
        failure_reason: str,
    ) -> None:
        """Persist a failed Gmail handoff for campaign diagnostics."""

    def consume_unsubscribe_token(self, digest: str) -> bool:
        """Idempotently suppress the delivery recipient resolved by one digest."""

    def is_suppressed(self, recipient_email_normalized: str) -> bool:
        """Return whether a normalized recipient is on the local suppression list."""


class InMemoryEmailTrackingRepository:
    """Behavioral repository used by unit tests and local domain checks."""

    def __init__(self) -> None:
        self._deliveries_by_id: dict[UUID, DeliveryRecord] = {}
        self._delivery_ids_by_key: dict[tuple[str, str], UUID] = {}
        self._links_by_id: dict[UUID, StoredTrackingLink] = {}
        self._link_id_by_token_hash: dict[str, UUID] = {}
        self._unsubscribe_hash_by_delivery: dict[UUID, str] = {}
        self._events_by_key: dict[tuple[UUID, str, str], TrackingEvent] = {}
        self._used_unsubscribe_hashes: set[str] = set()
        self._suppressions: dict[str, tuple[str, str]] = {}

    @property
    def delivery_count(self) -> int:
        return len(self._deliveries_by_id)

    @property
    def event_count(self) -> int:
        return len(self._events_by_key)

    @property
    def suppression_count(self) -> int:
        return len(self._suppressions)

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

    def find_tracking_link_by_digest(
        self, digest: str
    ) -> StoredTrackingLink | None:
        link_id = self._link_id_by_token_hash.get(digest)
        return self._links_by_id.get(link_id) if link_id is not None else None

    def upsert_event(self, event: TrackingEvent) -> TrackingEvent:
        if event.tracking_link_id not in self._links_by_id:
            raise KeyError(f"Unknown tracking link {event.tracking_link_id}")
        key = (event.tracking_link_id, event.visitor_id, event.event_type)
        existing = self._events_by_key.get(key)
        if existing is None:
            self._events_by_key[key] = event
            return event

        merged = TrackingEvent(
            id=existing.id,
            tracking_link_id=existing.tracking_link_id,
            event_type=existing.event_type,
            visitor_id=existing.visitor_id,
            engagement_ms=max(existing.engagement_ms, event.engagement_ms),
            viewport_width=(
                event.viewport_width
                if event.viewport_width is not None
                else existing.viewport_width
            ),
            device_class=(
                event.device_class
                if event.device_class != "unknown"
                else existing.device_class
            ),
            user_agent=event.user_agent or existing.user_agent,
            ip_hash=event.ip_hash or existing.ip_hash,
            suspected_automation=(
                existing.suspected_automation and event.suspected_automation
            ),
            occurred_at=existing.occurred_at,
        )
        self._events_by_key[key] = merged
        return merged

    def mark_delivery_sent(
        self,
        delivery_id: UUID,
        *,
        sender_account: str,
        gmail_message_id: str | None,
    ) -> None:
        delivery = self._deliveries_by_id.get(delivery_id)
        if delivery is None:
            raise KeyError(f"Unknown delivery {delivery_id}")
        self._deliveries_by_id[delivery_id] = replace(
            delivery,
            status="sent",
            sender_account=sender_account,
            gmail_message_id=gmail_message_id,
            failure_reason=None,
        )

    def mark_delivery_failed(
        self,
        delivery_id: UUID,
        *,
        sender_account: str,
        failure_reason: str,
    ) -> None:
        delivery = self._deliveries_by_id.get(delivery_id)
        if delivery is None:
            raise KeyError(f"Unknown delivery {delivery_id}")
        self._deliveries_by_id[delivery_id] = replace(
            delivery,
            status="failed",
            sender_account=sender_account,
            gmail_message_id=None,
            failure_reason=failure_reason,
        )

    def consume_unsubscribe_token(self, digest: str) -> bool:
        delivery_id = next(
            (
                delivery_id
                for delivery_id, token_hash in self._unsubscribe_hash_by_delivery.items()
                if hmac.compare_digest(token_hash, digest)
            ),
            None,
        )
        if delivery_id is None:
            return False
        delivery = self._deliveries_by_id[delivery_id]
        self._suppressions.setdefault(
            delivery.recipient_email_normalized,
            (delivery.recipient_email, delivery.campaign_id),
        )
        self._used_unsubscribe_hashes.add(digest)
        return True

    def is_suppressed(self, recipient_email_normalized: str) -> bool:
        return recipient_email_normalized in self._suppressions

    def delivery_for(
        self, campaign_id: str, recipient_email: str
    ) -> DeliveryRecord | None:
        delivery_id = self._delivery_ids_by_key.get(
            (campaign_id, recipient_email.strip().casefold())
        )
        return self._deliveries_by_id.get(delivery_id) if delivery_id else None

    def links_for_delivery(self, delivery_id: UUID) -> list[StoredTrackingLink]:
        return sorted(
            (
                link
                for link in self._links_by_id.values()
                if link.delivery_id == delivery_id
            ),
            key=lambda link: link.link_position,
        )

    def events_for(self, tracking_link_id: UUID) -> list[TrackingEvent]:
        return [
            event
            for event in self._events_by_key.values()
            if event.tracking_link_id == tracking_link_id
        ]

    def persisted_values(self) -> set[str]:
        values = set(self._link_id_by_token_hash) | set(
            self._unsubscribe_hash_by_delivery.values()
        )
        for delivery in self._deliveries_by_id.values():
            values.update(
                {
                    delivery.campaign_id,
                    delivery.recipient_email,
                    delivery.recipient_email_normalized,
                }
            )
        for link in self._links_by_id.values():
            values.update(
                {
                    link.token_hash,
                    link.destination_origin,
                    link.destination_path,
                }
            )
        for event in self._events_by_key.values():
            values.update({event.visitor_id, event.user_agent, event.device_class})
            if event.ip_hash:
                values.add(event.ip_hash)
        for normalized_email, (recipient_email, campaign_id) in self._suppressions.items():
            values.update({normalized_email, recipient_email, campaign_id})
        return values


class PostgresEmailTrackingRepository:
    """PostgreSQL implementation backed by the email tracking migration."""

    def __init__(self, db_url: str) -> None:
        if not db_url:
            raise ValueError("SUPABASE_DATABASE_URL is required for email tracking")
        self.db_url = db_url

    def _connect(self):
        return psycopg2.connect(
            self.db_url,
            connect_timeout=int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "8")),
        )

    @staticmethod
    def _uuid(value) -> UUID:
        return value if isinstance(value, UUID) else UUID(str(value))

    def prepare_delivery(
        self,
        *,
        campaign_id: str,
        recipient_email: str,
        recipient_email_normalized: str,
    ) -> DeliveryRecord:
        connection = self._connect()
        try:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    INSERT INTO email_campaign_deliveries (
                        id, campaign_id, recipient_email,
                        recipient_email_normalized, status
                    ) VALUES (%s, %s, %s, %s, 'prepared')
                    ON CONFLICT (campaign_id, recipient_email_normalized)
                    DO UPDATE SET recipient_email = EXCLUDED.recipient_email
                    RETURNING id, campaign_id, recipient_email,
                              recipient_email_normalized, status
                    """,
                    (uuid4(), campaign_id, recipient_email, recipient_email_normalized),
                )
                row = cursor.fetchone()
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

        return DeliveryRecord(
            id=self._uuid(row["id"]),
            campaign_id=row["campaign_id"],
            recipient_email=row["recipient_email"],
            recipient_email_normalized=row["recipient_email_normalized"],
            status=row["status"],
        )

    def mark_delivery_sent(
        self,
        delivery_id: UUID,
        *,
        sender_account: str,
        gmail_message_id: str | None,
    ) -> None:
        connection = self._connect()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE email_campaign_deliveries
                    SET status = 'sent',
                        sender_account = %s,
                        gmail_message_id = %s,
                        sent_at = NOW(),
                        failed_at = NULL,
                        failure_reason = NULL
                    WHERE id = %s
                    """,
                    (sender_account, gmail_message_id, delivery_id),
                )
                if cursor.rowcount != 1:
                    raise KeyError(f"Unknown delivery {delivery_id}")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def mark_delivery_failed(
        self,
        delivery_id: UUID,
        *,
        sender_account: str,
        failure_reason: str,
    ) -> None:
        connection = self._connect()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE email_campaign_deliveries
                    SET status = 'failed',
                        sender_account = %s,
                        gmail_message_id = NULL,
                        failed_at = NOW(),
                        sent_at = NULL,
                        failure_reason = %s
                    WHERE id = %s
                    """,
                    (sender_account, failure_reason, delivery_id),
                )
                if cursor.rowcount != 1:
                    raise KeyError(f"Unknown delivery {delivery_id}")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def replace_tracking_links(
        self, delivery_id: UUID, links: Sequence[StoredTrackingLink]
    ) -> None:
        connection = self._connect()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM email_tracking_links WHERE delivery_id = %s",
                    (delivery_id,),
                )
                if links:
                    cursor.executemany(
                        """
                        INSERT INTO email_tracking_links (
                            id, delivery_id, token_hash, destination_origin,
                            destination_path, link_position
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        [
                            (
                                link.id,
                                link.delivery_id,
                                link.token_hash,
                                link.destination_origin,
                                link.destination_path,
                                link.link_position,
                            )
                            for link in links
                        ],
                    )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def replace_unsubscribe_token(self, delivery_id: UUID, token_hash: str) -> None:
        connection = self._connect()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO email_unsubscribe_tokens (
                        id, delivery_id, token_hash
                    ) VALUES (%s, %s, %s)
                    ON CONFLICT (delivery_id) DO UPDATE
                    SET token_hash = EXCLUDED.token_hash,
                        created_at = NOW(),
                        used_at = NULL
                    """,
                    (uuid4(), delivery_id, token_hash),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def consume_unsubscribe_token(self, digest: str) -> bool:
        connection = self._connect()
        try:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT d.recipient_email, d.recipient_email_normalized,
                           d.campaign_id
                    FROM email_unsubscribe_tokens AS token
                    JOIN email_campaign_deliveries AS d
                      ON d.id = token.delivery_id
                    WHERE token.token_hash = %s
                    FOR UPDATE OF token
                    """,
                    (digest,),
                )
                row = cursor.fetchone()
                if row is None:
                    connection.commit()
                    return False
                cursor.execute(
                    """
                    INSERT INTO email_suppressions (
                        id, recipient_email, recipient_email_normalized,
                        reason, source, campaign_id
                    ) VALUES (%s, %s, %s, 'unsubscribe', 'email_one_click', %s)
                    ON CONFLICT (recipient_email_normalized) DO UPDATE
                    SET reason = EXCLUDED.reason,
                        source = EXCLUDED.source,
                        campaign_id = EXCLUDED.campaign_id,
                        updated_at = NOW()
                    """,
                    (
                        uuid4(),
                        row["recipient_email"],
                        row["recipient_email_normalized"],
                        row["campaign_id"],
                    ),
                )
                cursor.execute(
                    """
                    UPDATE email_unsubscribe_tokens
                    SET used_at = COALESCE(used_at, NOW())
                    WHERE token_hash = %s
                    """,
                    (digest,),
                )
            connection.commit()
            return True
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def is_suppressed(self, recipient_email_normalized: str) -> bool:
        connection = self._connect()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT EXISTS (
                        SELECT 1 FROM email_suppressions
                        WHERE recipient_email_normalized = %s
                    )
                    """,
                    (recipient_email_normalized,),
                )
                row = cursor.fetchone()
        finally:
            connection.close()
        return bool(row and row[0])

    def find_tracking_link_by_digest(
        self, digest: str
    ) -> StoredTrackingLink | None:
        connection = self._connect()
        try:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT id, delivery_id, token_hash, destination_origin,
                           destination_path, link_position
                    FROM email_tracking_links
                    WHERE token_hash = %s
                    """,
                    (digest,),
                )
                row = cursor.fetchone()
        finally:
            connection.close()
        if row is None:
            return None
        return StoredTrackingLink(
            id=self._uuid(row["id"]),
            delivery_id=self._uuid(row["delivery_id"]),
            token_hash=row["token_hash"],
            destination_origin=row["destination_origin"],
            destination_path=row["destination_path"],
            link_position=int(row["link_position"]),
        )

    def upsert_event(self, event: TrackingEvent) -> TrackingEvent:
        connection = self._connect()
        try:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    INSERT INTO email_tracking_events (
                        id, tracking_link_id, event_type, visitor_id,
                        engagement_ms, viewport_width, device_class,
                        user_agent, ip_hash, suspected_automation, occurred_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (tracking_link_id, visitor_id, event_type)
                    DO UPDATE SET
                        engagement_ms = GREATEST(
                            email_tracking_events.engagement_ms,
                            EXCLUDED.engagement_ms
                        ),
                        viewport_width = COALESCE(
                            EXCLUDED.viewport_width,
                            email_tracking_events.viewport_width
                        ),
                        device_class = CASE
                            WHEN EXCLUDED.device_class = 'unknown'
                                THEN email_tracking_events.device_class
                            ELSE EXCLUDED.device_class
                        END,
                        user_agent = COALESCE(
                            NULLIF(EXCLUDED.user_agent, ''),
                            email_tracking_events.user_agent
                        ),
                        ip_hash = COALESCE(
                            EXCLUDED.ip_hash,
                            email_tracking_events.ip_hash
                        ),
                        suspected_automation = (
                            email_tracking_events.suspected_automation
                            AND EXCLUDED.suspected_automation
                        )
                    RETURNING id, tracking_link_id, event_type, visitor_id,
                              engagement_ms, viewport_width, device_class,
                              user_agent, ip_hash, suspected_automation,
                              occurred_at
                    """,
                    (
                        event.id,
                        event.tracking_link_id,
                        event.event_type,
                        event.visitor_id,
                        event.engagement_ms,
                        event.viewport_width,
                        event.device_class,
                        event.user_agent,
                        event.ip_hash,
                        event.suspected_automation,
                        event.occurred_at,
                    ),
                )
                row = cursor.fetchone()
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

        return TrackingEvent(
            id=self._uuid(row["id"]),
            tracking_link_id=self._uuid(row["tracking_link_id"]),
            event_type=row["event_type"],
            visitor_id=row["visitor_id"],
            engagement_ms=int(row["engagement_ms"]),
            viewport_width=row["viewport_width"],
            device_class=row["device_class"],
            user_agent=row["user_agent"] or "",
            ip_hash=row["ip_hash"],
            suspected_automation=bool(row["suspected_automation"]),
            occurred_at=row["occurred_at"],
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
        ip_hash_key: str | None = None,
    ) -> None:
        self.repository = repository
        self.allowed_hosts = frozenset(
            host.strip().rstrip(".").lower() for host in allowed_hosts if host.strip()
        )
        self.ip_hash_key = (ip_hash_key or "").encode("utf-8")

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
        if delivery.status == "sent":
            return PreparedTrackedEmail(
                delivery_id=delivery.id,
                html_body=html_body,
                links=(),
                unsubscribe_token="",
                already_sent=True,
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

        self.repository.replace_tracking_links(delivery.id, stored_links)
        unsubscribe_token = self._issue_unsubscribe_token(delivery.id)
        return PreparedTrackedEmail(
            delivery_id=delivery.id,
            html_body=parser.html,
            links=tuple(prepared_links),
            unsubscribe_token=unsubscribe_token,
        )

    def _issue_unsubscribe_token(self, delivery_id: UUID) -> str:
        unsubscribe_token = secrets.token_urlsafe(24)
        self.repository.replace_unsubscribe_token(
            delivery_id, token_digest(unsubscribe_token)
        )
        return unsubscribe_token

    def prepare_unsubscribe(self, *, campaign_id: str, recipient_email: str) -> str:
        campaign_id = campaign_id.strip()
        if not campaign_id:
            raise ValueError("campaign_id is required")
        original_email, normalized_email = self._normalize_email(recipient_email)
        delivery = self.repository.prepare_delivery(
            campaign_id=campaign_id,
            recipient_email=original_email,
            recipient_email_normalized=normalized_email,
        )
        return self._issue_unsubscribe_token(delivery.id)

    def unsubscribe(self, token: str) -> None:
        if not isinstance(token, str) or not 16 <= len(token) <= 512:
            return None
        self.repository.consume_unsubscribe_token(token_digest(token))
        return None

    def is_suppressed(self, recipient_email: str) -> bool:
        _original, normalized_email = self._normalize_email(recipient_email)
        return self.repository.is_suppressed(normalized_email)

    def mark_delivery_sent(
        self,
        delivery_id: UUID,
        *,
        sender_account: str,
        gmail_message_id: str | None,
    ) -> None:
        self.repository.mark_delivery_sent(
            delivery_id,
            sender_account=sender_account,
            gmail_message_id=gmail_message_id,
        )

    def mark_delivery_failed(
        self,
        delivery_id: UUID,
        *,
        sender_account: str,
        failure_reason: str,
    ) -> None:
        self.repository.mark_delivery_failed(
            delivery_id,
            sender_account=sender_account,
            failure_reason=(failure_reason or "Send failed")[:512],
        )

    @staticmethod
    def _device_class(viewport_width: int | None) -> str:
        if viewport_width is None:
            return "unknown"
        if viewport_width <= 767:
            return "mobile"
        if viewport_width <= 1024:
            return "tablet"
        return "desktop"

    def record_event(
        self,
        *,
        token: str,
        event_type: str,
        visitor_id: str,
        engagement_ms: int = 0,
        viewport_width: int | None = None,
        user_agent: str = "",
        client_ip: str | None = None,
    ) -> bool:
        if not isinstance(token, str) or not 16 <= len(token) <= 512:
            raise ValueError("token must contain between 16 and 512 characters")
        if event_type not in _EVENT_TYPES:
            raise ValueError("event_type is not supported")
        if not isinstance(visitor_id, str) or not 8 <= len(visitor_id) <= 128:
            raise ValueError("visitor_id must contain between 8 and 128 characters")
        if any(ord(character) < 32 for character in visitor_id):
            raise ValueError("visitor_id contains control characters")
        if (
            isinstance(engagement_ms, bool)
            or not isinstance(engagement_ms, int)
            or not 0 <= engagement_ms <= 86_400_000
        ):
            raise ValueError("engagement_ms must be between 0 and 86400000")
        if viewport_width is not None and (
            isinstance(viewport_width, bool)
            or not isinstance(viewport_width, int)
            or not 0 <= viewport_width <= 20_000
        ):
            raise ValueError("viewport_width must be between 0 and 20000")

        tracking_link = self.repository.find_tracking_link_by_digest(
            token_digest(token)
        )
        if tracking_link is None:
            return False

        bounded_user_agent = (user_agent or "")[:512]
        suspected_automation = bool(
            _AUTOMATION_USER_AGENT_PATTERN.search(bounded_user_agent)
        )
        if event_type == "human_interaction":
            suspected_automation = False

        ip_hash = None
        if client_ip and self.ip_hash_key:
            ip_hash = hmac.new(
                self.ip_hash_key,
                client_ip.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()

        self.repository.upsert_event(
            TrackingEvent(
                id=uuid4(),
                tracking_link_id=tracking_link.id,
                event_type=event_type,
                visitor_id=visitor_id,
                engagement_ms=engagement_ms,
                viewport_width=viewport_width,
                device_class=self._device_class(viewport_width),
                user_agent=bounded_user_agent,
                ip_hash=ip_hash,
                suspected_automation=suspected_automation,
                occurred_at=datetime.now(timezone.utc),
            )
        )
        return True


_email_tracking_service_instance: EmailTrackingService | None = None


def get_email_tracking_service() -> EmailTrackingService:
    global _email_tracking_service_instance
    if _email_tracking_service_instance is None:
        allowed_hosts = {
            host.strip()
            for host in os.getenv(
                "EMAIL_TRACKING_ALLOWED_HOSTS", "donations.animallove.cr"
            ).split(",")
            if host.strip()
        }
        repository = PostgresEmailTrackingRepository(
            os.getenv("SUPABASE_DATABASE_URL", "")
        )
        _email_tracking_service_instance = EmailTrackingService(
            repository,
            allowed_hosts=allowed_hosts,
            ip_hash_key=os.getenv("EMAIL_TRACKING_IP_HASH_KEY"),
        )
    return _email_tracking_service_instance
