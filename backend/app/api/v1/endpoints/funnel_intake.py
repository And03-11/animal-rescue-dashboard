import asyncio
import logging
import re
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.app.core.security import get_current_user
from backend.app.services.airtable_service import (
    AirtableService,
    DONOR_STAGE_OPTIONS,
    get_airtable_service,
)
from backend.app.services.brevo_service import (
    BrevoService,
    BrevoUnavailableError,
    get_brevo_service,
)
from backend.app.services.mailchimp_service import (
    MailchimpService,
    MailchimpUnavailableError,
    get_mailchimp_service,
)


router = APIRouter()
logger = logging.getLogger(__name__)
RECORD_ID_PATTERN = re.compile(r"^rec[A-Za-z0-9]{14}$")


class FunnelReviewAction(BaseModel):
    action: Literal["approve", "potential_duplicate", "change_stage"]
    value: Optional[str] = None


def _validate_record_id(record_id: str) -> None:
    if not RECORD_ID_PATTERN.fullmatch(record_id):
        raise HTTPException(status_code=400, detail="Invalid donor record id.")


@router.get("/funnel-intake/options")
async def get_funnel_intake_options(
    current_user: str = Depends(get_current_user),
):
    return {"stage_options": list(DONOR_STAGE_OPTIONS)}


@router.get("/funnel-intake/pending")
async def list_pending_funnel_reviews(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    airtable: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user),
):
    try:
        records = await asyncio.to_thread(airtable.get_pending_funnel_reviews)
    except Exception as exc:
        logger.exception("Could not load the funnel review queue")
        raise HTTPException(status_code=502, detail="Could not load the review queue.") from exc

    return {
        "items": records[offset:offset + limit],
        "total": len(records),
        "limit": limit,
        "offset": offset,
    }


@router.get("/funnel-intake/{record_id}/evidence")
async def get_funnel_review_evidence(
    record_id: str,
    airtable: AirtableService = Depends(get_airtable_service),
    brevo: BrevoService = Depends(get_brevo_service),
    mailchimp: MailchimpService = Depends(get_mailchimp_service),
    current_user: str = Depends(get_current_user),
):
    _validate_record_id(record_id)
    try:
        donor = await asyncio.to_thread(airtable.get_funnel_review_donor, record_id)
    except Exception as exc:
        logger.exception("Could not load Airtable donor %s", record_id)
        raise HTTPException(status_code=404, detail="Donor record not found.") from exc

    first_name = str(donor.get("first_name") or "")
    last_name = str(donor.get("last_name") or "")
    emails = [str(email) for email in donor.get("emails", []) if email]

    async def fetch_brevo():
        try:
            matches = await asyncio.to_thread(
                brevo.search_contacts_by_name, first_name, last_name
            )
            return {"status": "ok", "matches": matches, "searched_by": ["name"]}
        except BrevoUnavailableError:
            return {
                "status": "unavailable",
                "matches": [],
                "searched_by": ["name"],
                "message": "Brevo did not respond. No absence was inferred.",
            }
        except Exception:
            logger.exception("Unexpected Brevo review search failure")
            return {
                "status": "unavailable",
                "matches": [],
                "searched_by": ["name"],
                "message": "Brevo search could not be completed.",
            }

    async def fetch_mailchimp():
        try:
            matches = await asyncio.to_thread(
                mailchimp.search_contacts, emails, first_name, last_name
            )
            return {
                "status": "ok",
                "matches": matches,
                "searched_by": ["email", "name"],
            }
        except MailchimpUnavailableError:
            return {
                "status": "unavailable",
                "matches": [],
                "searched_by": ["email", "name"],
                "message": "Mailchimp did not respond. No absence was inferred.",
            }
        except Exception:
            logger.exception("Unexpected Mailchimp review search failure")
            return {
                "status": "unavailable",
                "matches": [],
                "searched_by": ["email", "name"],
                "message": "Mailchimp search could not be completed.",
            }

    brevo_result, mailchimp_result = await asyncio.gather(fetch_brevo(), fetch_mailchimp())
    return {
        "donor": donor,
        "brevo": brevo_result,
        "mailchimp": mailchimp_result,
    }


@router.patch("/funnel-intake/{record_id}")
async def apply_funnel_review_action(
    record_id: str,
    payload: FunnelReviewAction,
    airtable: AirtableService = Depends(get_airtable_service),
    current_user: str = Depends(get_current_user),
):
    _validate_record_id(record_id)
    if payload.action == "change_stage" and not payload.value:
        raise HTTPException(status_code=422, detail="A stage is required.")

    try:
        updated = await asyncio.to_thread(
            airtable.update_funnel_review,
            record_id,
            payload.action,
            payload.value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Could not apply funnel review action to %s", record_id)
        raise HTTPException(status_code=502, detail="The Airtable update failed.") from exc

    logger.info(
        "Funnel review action applied user=%s record=%s action=%s value=%s",
        current_user,
        record_id,
        payload.action,
        payload.value,
    )
    return {"updated": updated, "action": payload.action, "value": payload.value}
