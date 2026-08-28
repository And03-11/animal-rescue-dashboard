"""Public, privacy-preserving email engagement ingestion endpoints."""

from __future__ import annotations

import json
import os
from urllib.parse import parse_qs, quote

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse

from backend.app.services.email_tracking import get_email_tracking_service


router = APIRouter()
MAX_EVENT_BODY_BYTES = 4096
MAX_UNSUBSCRIBE_BODY_BYTES = 1024
TRACKING_EVENT_PATH = "/api/v1/email-tracking/events"


class TrackingEventCorsIsolationMiddleware:
    """Keep the public tracking endpoint outside credentialed dashboard CORS."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("path") != TRACKING_EVENT_PATH:
            await self.app(scope, receive, send)
            return

        async def send_without_credentials(message):
            if message["type"] == "http.response.start":
                message = {
                    **message,
                    "headers": [
                        (name, value)
                        for name, value in message.get("headers", [])
                        if name.lower() != b"access-control-allow-credentials"
                    ],
                }
            await send(message)

        await self.app(scope, receive, send_without_credentials)


def _allowed_origins() -> frozenset[str]:
    return frozenset(
        origin.strip().rstrip("/")
        for origin in os.getenv(
            "EMAIL_TRACKING_ALLOWED_ORIGINS",
            "https://donations.animallove.cr",
        ).split(",")
        if origin.strip()
    )


@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
async def ingest_event(request: Request, response: Response) -> dict[str, bool]:
    origin = request.headers.get("origin") or ""
    if not origin or origin not in _allowed_origins():
        raise HTTPException(status_code=403, detail="Event origin is not allowed.")

    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Vary"] = "Origin"

    body = await request.body()
    if len(body) > MAX_EVENT_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Event payload is too large.")

    try:
        payload = json.loads(body.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("payload must be an object")
        token = payload["token"]
        event_type = payload["event_type"]
        visitor_id = payload["visitor_id"]
        engagement_ms = payload.get("engagement_ms", 0)
        viewport_width = payload.get("viewport_width")
        get_email_tracking_service().record_event(
            token=token,
            event_type=event_type,
            visitor_id=visitor_id,
            engagement_ms=engagement_ms,
            viewport_width=viewport_width,
            user_agent=request.headers.get("user-agent", ""),
            client_ip=request.client.host if request.client else None,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid event payload.") from None

    return {"accepted": True}


def _html_response(content: str) -> HTMLResponse:
    return HTMLResponse(
        content=content,
        headers={
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
        },
    )


@router.get("/unsubscribe/{token}", response_class=HTMLResponse)
def show_unsubscribe_confirmation(token: str) -> HTMLResponse:
    safe_token = quote(token, safe="")
    return _html_response(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Confirm unsubscribe</title>"
        "<main style=\"max-width:560px;margin:64px auto;padding:24px;"
        "font:16px/1.5 system-ui;color:#17221e\">"
        "<h1>Confirm unsubscribe</h1>"
        "<p>Stop receiving fundraising email from Animal Love Rescue Center.</p>"
        f"<form method=\"post\" action=\"/api/v1/email-tracking/unsubscribe/{safe_token}/confirm\">"
        "<button type=\"submit\" style=\"padding:12px 18px\">Confirm unsubscribe</button>"
        "</form></main></html>"
    )


@router.post("/unsubscribe/{token}")
async def one_click_unsubscribe(token: str, request: Request) -> dict[str, bool]:
    body = await request.body()
    if len(body) > MAX_UNSUBSCRIBE_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request payload is too large.")
    try:
        payload = parse_qs(body.decode("utf-8"), keep_blank_values=True)
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Invalid unsubscribe request.") from None
    if payload.get("List-Unsubscribe") != ["One-Click"]:
        raise HTTPException(status_code=400, detail="Invalid unsubscribe request.")
    get_email_tracking_service().unsubscribe(token)
    return {"accepted": True}


@router.post("/unsubscribe/{token}/confirm", response_class=HTMLResponse)
def confirm_unsubscribe(token: str) -> HTMLResponse:
    get_email_tracking_service().unsubscribe(token)
    return _html_response(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Unsubscribed</title>"
        "<main style=\"max-width:560px;margin:64px auto;padding:24px;"
        "font:16px/1.5 system-ui;color:#17221e\">"
        "<h1>You have been unsubscribed</h1>"
        "<p>Your request has been processed.</p></main></html>"
    )
