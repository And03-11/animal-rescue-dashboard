"""Public, privacy-preserving email engagement ingestion endpoints."""

from __future__ import annotations

import json
import os

from fastapi import APIRouter, HTTPException, Request, status

from backend.app.services.email_tracking import get_email_tracking_service


router = APIRouter()
MAX_EVENT_BODY_BYTES = 4096


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
async def ingest_event(request: Request) -> dict[str, bool]:
    origin = (request.headers.get("origin") or "").rstrip("/")
    if not origin or origin not in _allowed_origins():
        raise HTTPException(status_code=403, detail="Event origin is not allowed.")

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
