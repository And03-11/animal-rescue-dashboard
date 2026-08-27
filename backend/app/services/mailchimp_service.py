import hashlib
import os
from typing import Any, Dict, List, Optional

import requests


class MailchimpUnavailableError(RuntimeError):
    """Raised when Mailchimp cannot be reached or returns an API error."""


class MailchimpService:
    """Encapsulates read operations against the Mailchimp API."""

    def __init__(self):
        self.api_key = os.getenv("MAILCHIMP_API_KEY")
        self.list_id = os.getenv("MAILCHIMP_LIST_ID")
        self.dc = os.getenv("MAILCHIMP_DC")

        if not all([self.api_key, self.list_id, self.dc]):
            raise ValueError("Missing Mailchimp environment variables.")

        self.api_url = f"https://{self.dc}.api.mailchimp.com/3.0"
        self.timeout = 15

    def _request_json(
        self,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        not_found_is_none: bool = False,
    ) -> Optional[Dict[str, Any]]:
        for attempt in range(3):
            try:
                response = requests.get(
                    f"{self.api_url}{path}",
                    auth=("anystring", self.api_key),
                    params=params,
                    timeout=self.timeout,
                )
                if response.status_code == 404 and not_found_is_none:
                    return None
                response.raise_for_status()
                return response.json()
            except requests.exceptions.RequestException as exc:
                if attempt == 2:
                    raise MailchimpUnavailableError(
                        "Mailchimp is temporarily unavailable."
                    ) from exc
        raise MailchimpUnavailableError("Mailchimp is temporarily unavailable.")

    def get_contact_tags(self, email: str) -> Optional[List[str]]:
        """
        Return a member's tag names.

        An empty list means the member exists without tags. ``None`` is
        reserved for a confirmed 404. Connectivity and API errors raise
        ``MailchimpUnavailableError`` so callers do not report false absences.
        """
        email_normalized = email.strip().lower()
        email_hash = hashlib.md5(email_normalized.encode("utf-8")).hexdigest()
        member_url = f"{self.api_url}/lists/{self.list_id}/members/{email_hash}/tags"

        for attempt in range(3):
            try:
                response = requests.get(member_url, auth=("anystring", self.api_key), timeout=self.timeout)

                if response.status_code == 200:
                    data = response.json()
                    return [tag["name"] for tag in data.get("tags", [])]

                if response.status_code == 404:
                    return None

                response.raise_for_status()
            except requests.exceptions.RequestException as exc:
                if attempt == 2:
                    raise MailchimpUnavailableError(
                        "Mailchimp is temporarily unavailable."
                    ) from exc

        raise MailchimpUnavailableError("Mailchimp is temporarily unavailable.")

    @staticmethod
    def _normalized(value: Any) -> str:
        return " ".join(str(value or "").strip().casefold().split())

    def _member_hash(self, email: str) -> str:
        return hashlib.md5(email.strip().lower().encode("utf-8")).hexdigest()

    def _member_details(self, email: str) -> Optional[Dict[str, Any]]:
        return self._request_json(
            f"/lists/{self.list_id}/members/{self._member_hash(email)}",
            not_found_is_none=True,
        )

    def _member_activity(self, email: str) -> List[Dict[str, Any]]:
        payload = self._request_json(
            f"/lists/{self.list_id}/members/{self._member_hash(email)}/activity",
            not_found_is_none=True,
        )
        if not payload:
            return []
        events = payload.get("activity") or []
        return [
            {
                "type": event.get("action"),
                "timestamp": event.get("timestamp"),
                "campaign_id": event.get("campaign_id"),
                "campaign_name": event.get("campaign_title"),
                "subject": event.get("title"),
                "url": event.get("url"),
            }
            for event in events[:12]
            if isinstance(event, dict)
        ]

    def _search_members(self, query: str, count: int = 10) -> List[Dict[str, Any]]:
        if not query.strip():
            return []
        payload = self._request_json(
            "/search-members",
            params={"query": query.strip(), "list_id": self.list_id, "count": count},
        ) or {}
        members: List[Dict[str, Any]] = []
        for group_name in ("exact_matches", "full_search"):
            group = payload.get(group_name) or {}
            members.extend(group.get("members") or [])
        return members

    def search_contacts(
        self,
        emails: List[str],
        first_name: str,
        last_name: str,
        limit: int = 8,
    ) -> List[Dict[str, Any]]:
        """Search Mailchimp by exact email and by name, returning review evidence."""
        candidates: Dict[str, Dict[str, Any]] = {}

        def add_candidate(member: Dict[str, Any], reason: str) -> None:
            email = str(member.get("email_address") or "").strip().lower()
            if not email:
                return
            stored = candidates.setdefault(email, {"member": member, "matched_by": []})
            stored["member"] = {**stored["member"], **member}
            if reason not in stored["matched_by"]:
                stored["matched_by"].append(reason)

        for email in {value.strip().lower() for value in emails if value.strip()}:
            details = self._member_details(email)
            if details:
                add_candidate(details, "email")

        full_name = " ".join(value for value in (first_name.strip(), last_name.strip()) if value)
        if full_name:
            for member in self._search_members(full_name, count=max(limit * 2, 10)):
                merge_fields = member.get("merge_fields") or {}
                candidate_first = merge_fields.get("FNAME") or merge_fields.get("FIRSTNAME") or ""
                candidate_last = merge_fields.get("LNAME") or merge_fields.get("LASTNAME") or ""
                first_match = bool(
                    first_name.strip()
                    and self._normalized(candidate_first) == self._normalized(first_name)
                )
                last_match = bool(
                    last_name.strip()
                    and self._normalized(candidate_last) == self._normalized(last_name)
                )
                if first_match or last_match:
                    add_candidate(member, "name")

        ranked = sorted(
            candidates.values(),
            key=lambda item: (
                -len(item["matched_by"]),
                self._normalized(item["member"].get("email_address")),
            ),
        )
        results: List[Dict[str, Any]] = []
        for candidate in ranked[:limit]:
            member = candidate["member"]
            email = str(member.get("email_address") or "")
            details = self._member_details(email) or member
            merge_fields = details.get("merge_fields") or {}
            results.append({
                "id": details.get("id"),
                "email": email,
                "first_name": merge_fields.get("FNAME") or merge_fields.get("FIRSTNAME") or "",
                "last_name": merge_fields.get("LNAME") or merge_fields.get("LASTNAME") or "",
                "status": details.get("status"),
                "matched_by": candidate["matched_by"],
                "tags": self.get_contact_tags(email) or [],
                "list_name": details.get("list_name"),
                "last_changed": details.get("last_changed"),
                "member_rating": details.get("member_rating"),
                "recent_activity": self._member_activity(email),
            })
        return results


mailchimp_service_instance = MailchimpService()


def get_mailchimp_service():
    return mailchimp_service_instance
