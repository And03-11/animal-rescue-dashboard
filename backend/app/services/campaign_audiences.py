"""Domain objects and normalization helpers for campaign audiences.

Audience selection is represented as an immutable, deterministic tuple of
branches.  Keeping this logic in one small module lets API, persistence, and
send-time code share the same validation and legacy fallback semantics.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Literal, Mapping


AudienceRegion = Literal["USA", "EUR"]
AudienceSegment = Literal["standard", "dnr"]


@dataclass(frozen=True, order=True)
class AudienceBranch:
    """A region and bounce-status filter for one campaign audience branch."""

    region: AudienceRegion
    is_bounced: bool


@dataclass(frozen=True)
class AudienceCount:
    """The number of contacts resolved for one audience branch."""

    region: AudienceRegion
    is_bounced: bool
    count: int


@dataclass(frozen=True)
class AudienceResolution:
    """Resolved contacts and their per-branch counts."""

    contacts: tuple[dict[str, str], ...]
    branches: tuple[AudienceCount, ...]

    @property
    def total_unique(self) -> int:
        return len(self.contacts)


def normalize_audiences(
    raw_audiences: Iterable[Mapping[str, Any]] | None,
    *,
    legacy_region: str | None = None,
    legacy_is_bounced: bool | None = None,
) -> tuple[AudienceBranch, ...]:
    """Validate and deterministically order audience branch definitions.

    New campaign payloads provide ``raw_audiences``.  For old rows that only
    have the legacy region and bounce fields, those two fields are synthesized
    as one branch when both are present.
    """

    if raw_audiences is None:
        source = []
        if legacy_region is not None and legacy_is_bounced is not None:
            source = [
                {"region": legacy_region, "is_bounced": legacy_is_bounced}
            ]
    else:
        source = list(raw_audiences)

    if not 1 <= len(source) <= 4:
        raise ValueError("Airtable campaigns require between 1 and 4 audience branches")

    branches: list[AudienceBranch] = []
    for item in source:
        region = item.get("region")
        if region not in {"USA", "EUR"}:
            raise ValueError(f"Unsupported audience region: {region}")

        is_bounced = item.get("is_bounced")
        if not isinstance(is_bounced, bool):
            raise ValueError("Audience is_bounced must be a boolean")

        branches.append(AudienceBranch(region=region, is_bounced=is_bounced))

    if len(set(branches)) != len(branches):
        raise ValueError("Audience branches must be unique")

    # Stable contract: USA before EUR, and valid (not bounced) before bounced.
    return tuple(sorted(branches, key=lambda item: (item.region != "USA", item.is_bounced)))


def serialize_audiences(branches: Iterable[AudienceBranch]) -> list[dict[str, Any]]:
    """Serialize normalized branches into deterministic JSON-like mappings."""

    return [
        {"region": branch.region, "is_bounced": branch.is_bounced}
        for branch in branches
    ]


def deduplicate_contacts(
    contacts: Iterable[Mapping[str, Any]],
) -> tuple[dict[str, str], ...]:
    """Drop blank emails and duplicate addresses while keeping first contacts.

    Address comparison trims outer whitespace and is case-insensitive.  The
    retained contact is copied so callers' input mappings are never mutated;
    its ``Email`` value is the first contact's trimmed spelling.
    """

    seen: set[str] = set()
    unique: list[dict[str, str]] = []
    for contact in contacts:
        email = contact.get("Email")
        if not isinstance(email, str):
            continue
        trimmed_email = email.strip()
        if not trimmed_email:
            continue

        normalized_email = trimmed_email.lower()
        if normalized_email in seen:
            continue
        seen.add(normalized_email)

        retained = {key: str(value) for key, value in contact.items()}
        retained["Email"] = trimmed_email
        unique.append(retained)

    return tuple(unique)
