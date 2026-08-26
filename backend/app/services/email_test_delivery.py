"""Shared delivery logic for campaign and ad-hoc test emails."""

import os
from collections.abc import Callable, Sequence
from typing import Literal, Protocol


class TestEmailSender(Protocol):
    credentials_path: str

    def send_email(self, *, to_email: str, subject: str, html_body: str) -> bool: ...


def deliver_test_emails(
    *,
    emails: Sequence[str],
    subject: str,
    html_body: str,
    gmail_services: Sequence[TestEmailSender],
    mode: Literal["campaign", "adhoc"],
    campaign_id: str | None = None,
    sleep_between: Callable[[float], None],
) -> list[dict[str, str]]:
    """Send personalized test messages using the existing round-robin behavior."""
    results: list[dict[str, str]] = []
    service_index = 0

    for email in emails:
        test_name = "Test User"
        personalized_body = html_body.replace("{{name}}", test_name).replace(
            "*|FNAME|*", test_name
        )

        current_service = gmail_services[service_index]
        credential_name = os.path.basename(current_service.credentials_path)
        service_index = (service_index + 1) % len(gmail_services)

        if mode == "campaign":
            print(f"[{campaign_id}] Sending TEST email to {email} via {credential_name}")
        else:
            print(f"[AdhocTest] Sending to {email} via {credential_name}")

        success = False
        try:
            success = current_service.send_email(
                to_email=email,
                subject=f"[TEST] {subject}",
                html_body=personalized_body,
            )
        except Exception as error:
            if mode == "campaign":
                print(f"Error sending test email to {email}: {error}")
            else:
                print(f"[AdhocTest] Error sending to {email}: {error}")

        results.append(
            {
                "email": email,
                "status": "Sent" if success else "Failed",
                "sender": credential_name,
            }
        )

        if len(emails) > 1:
            sleep_between(0.5)

    return results
