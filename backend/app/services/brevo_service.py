# backend/app/services/brevo_service.py
import os
import requests
from typing import Dict, Any, Optional, List


class BrevoUnavailableError(RuntimeError):
    """Raised when Brevo cannot be reached or returns an API error."""

class BrevoService:
    def __init__(self):
        self.api_key = os.getenv("BREVO_API_KEY")
        if not self.api_key:
            raise ValueError("Error: Falta la variable de entorno BREVO_API_KEY.")
        
        self.base_url = "https://api.brevo.com/v3"
        self.headers = {"accept": "application/json", "api-key": self.api_key}
        self.timeout = 15
        
        # Al iniciar, cargamos todas las listas para tener un mapa de ID a Nombre
        self.list_map = self._get_all_lists_map()

    def _get_all_lists_map(self) -> Dict[int, str]:
        """ Obtiene todas las listas de contactos y devuelve un mapa de ID a Nombre. """
        url = f"{self.base_url}/contacts/lists?limit=50"
        try:
            response = requests.get(url, headers=self.headers, timeout=self.timeout)
            response.raise_for_status()
            lists = response.json().get('lists', [])
            return {lst['id']: lst['name'] for lst in lists}
        except Exception as e:
            print(f"Error al obtener listas de Brevo: {e}")
            return {}

    def get_contact_details(self, email: str) -> Optional[Dict[str, Any]]:
        url = f"{self.base_url}/contacts/{email}"
        try:
            response = requests.get(url, headers=self.headers, timeout=self.timeout)
            if response.status_code == 200:
                contact_data = response.json()
                # ¡Mejora! Reemplazamos los IDs de las listas por sus nombres
                list_ids = contact_data.get("listIds", [])
                list_names = [self.list_map.get(list_id, f"ID: {list_id}") for list_id in list_ids]
                contact_data["listNames"] = list_names
                return contact_data
            elif response.status_code == 404:
                return None
            else:
                response.raise_for_status()
                return None
        except requests.exceptions.RequestException as exc:
            raise BrevoUnavailableError("Brevo is temporarily unavailable.") from exc

    @staticmethod
    def _normalized(value: Any) -> str:
        return " ".join(str(value or "").strip().casefold().split())

    def _contact_name(self, contact: Dict[str, Any]) -> tuple[str, str]:
        attributes = contact.get("attributes") or {}
        normalized_attributes = {
            str(key).replace("_", "").casefold(): value
            for key, value in attributes.items()
        }
        first_name = normalized_attributes.get("firstname") or normalized_attributes.get("fname") or ""
        last_name = normalized_attributes.get("lastname") or normalized_attributes.get("lname") or ""
        return str(first_name).strip(), str(last_name).strip()

    def _search_attribute(self, attribute: str, value: str) -> List[Dict[str, Any]]:
        """Run one exact Brevo attribute query without masking platform failures."""
        response = requests.get(
            f"{self.base_url}/contacts",
            headers=self.headers,
            params={"limit": 50, "filter": f'equals({attribute},"{value}")'},
            timeout=self.timeout,
        )
        if response.status_code == 400:
            # Accounts use different names for their first/last-name attributes.
            return []
        response.raise_for_status()
        return response.json().get("contacts", [])

    def _campaign_labels(self, campaign_ids: List[int]) -> Dict[int, Dict[str, str]]:
        labels: Dict[int, Dict[str, str]] = {}
        for campaign_id in campaign_ids[:8]:
            try:
                response = requests.get(
                    f"{self.base_url}/emailCampaigns/{campaign_id}",
                    headers=self.headers,
                    timeout=self.timeout,
                )
                if response.status_code == 404:
                    continue
                response.raise_for_status()
                payload = response.json()
                labels[campaign_id] = {
                    "name": str(payload.get("name") or ""),
                    "subject": str(payload.get("subject") or ""),
                }
            except requests.exceptions.RequestException:
                # Campaign labels are supporting evidence; contact evidence remains usable.
                continue
        return labels

    def _recent_activity(self, contact: Dict[str, Any]) -> List[Dict[str, Any]]:
        statistics = contact.get("statistics") or {}
        event_names = {
            "messagesSent": "sent",
            "delivered": "delivered",
            "opened": "opened",
            "clicked": "clicked",
            "hardBounces": "hard_bounce",
            "softBounces": "soft_bounce",
            "unsubscriptions": "unsubscribed",
        }
        events: List[Dict[str, Any]] = []
        for raw_name, display_name in event_names.items():
            raw_events = statistics.get(raw_name) or []
            if isinstance(raw_events, dict):
                raw_events = [raw_events]
            for event in raw_events:
                if not isinstance(event, dict):
                    continue
                campaign_id = event.get("campaignId")
                events.append({
                    "type": display_name,
                    "timestamp": event.get("eventTime"),
                    "campaign_id": campaign_id,
                    "count": event.get("count"),
                })

        events.sort(key=lambda item: str(item.get("timestamp") or ""), reverse=True)
        campaign_ids = []
        for event in events:
            campaign_id = event.get("campaign_id")
            if isinstance(campaign_id, int) and campaign_id not in campaign_ids:
                campaign_ids.append(campaign_id)
        labels = self._campaign_labels(campaign_ids)
        for event in events:
            label = labels.get(event.get("campaign_id"), {})
            event["campaign_name"] = label.get("name")
            event["subject"] = label.get("subject")
        return events[:12]

    def search_contacts_by_name(
        self,
        first_name: str,
        last_name: str,
        limit: int = 6,
    ) -> List[Dict[str, Any]]:
        """Return Brevo candidates found by name, leaving the decision to the user."""
        first_name = first_name.strip()
        last_name = last_name.strip()
        if not first_name and not last_name:
            return []

        candidates: Dict[str, Dict[str, Any]] = {}
        attempted = False
        try:
            queries = []
            if first_name:
                queries.extend((key, first_name) for key in ("FIRST_NAME", "FIRSTNAME", "FNAME"))
            if last_name:
                queries.extend((key, last_name) for key in ("LAST_NAME", "LASTNAME", "LNAME"))

            for attribute, value in queries:
                attempted = True
                for contact in self._search_attribute(attribute, value):
                    identifier = str(contact.get("email") or contact.get("id") or "")
                    if identifier:
                        candidates[identifier] = contact
        except requests.exceptions.RequestException as exc:
            raise BrevoUnavailableError("Brevo is temporarily unavailable.") from exc

        if not attempted:
            return []

        expected_first = self._normalized(first_name)
        expected_last = self._normalized(last_name)
        ranked = []
        for candidate in candidates.values():
            candidate_first, candidate_last = self._contact_name(candidate)
            first_match = bool(expected_first and self._normalized(candidate_first) == expected_first)
            last_match = bool(expected_last and self._normalized(candidate_last) == expected_last)
            if not (first_match or last_match):
                continue
            matched_by = []
            if first_match:
                matched_by.append("first_name")
            if last_match:
                matched_by.append("last_name")
            ranked.append((len(matched_by), candidate, matched_by))

        ranked.sort(key=lambda row: (-row[0], self._normalized(row[1].get("email"))))
        results: List[Dict[str, Any]] = []
        for _, candidate, matched_by in ranked[:limit]:
            email = candidate.get("email")
            details = self.get_contact_details(email) if email else candidate
            details = details or candidate
            first, last = self._contact_name(details)
            results.append({
                "id": details.get("id"),
                "email": email,
                "first_name": first,
                "last_name": last,
                "matched_by": matched_by,
                "lists": details.get("listNames", []),
                "email_blacklisted": bool(details.get("emailBlacklisted")),
                "created_at": details.get("createdAt"),
                "modified_at": details.get("modifiedAt"),
                "recent_activity": self._recent_activity(details),
            })
        return results
        
brevo_service_instance = BrevoService()
def get_brevo_service():
    return brevo_service_instance
