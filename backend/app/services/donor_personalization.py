"""Plain-text donor phrases inserted into otherwise unchanged email HTML."""

from datetime import date, datetime, timezone
from html import escape
import re
from typing import Annotated, Any, Mapping
from zoneinfo import ZoneInfo

from pydantic import AfterValidator, BaseModel, Field


DEFAULT_SINGULAR_PHRASE = "donation you made {{when}}"
DEFAULT_PLURAL_PHRASE = "{{count}} donations you’ve made over the past week"
COSTA_RICA_TZ = ZoneInfo("America/Costa_Rica")
DAY_TOKEN = re.compile(r"{{\s*day\s*}}", re.IGNORECASE)
PHRASE_TOKEN = re.compile(r"{{\s*([^{}]+?)\s*}}")
INNER_TOKEN = re.compile(r"{{\s*(when|count)\s*}}", re.IGNORECASE)


def validate_phrase(value: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 1000:
        raise ValueError("Donor phrases must contain between 1 and 1000 characters.")
    for token in PHRASE_TOKEN.findall(value):
        if token.strip().lower() not in {"when", "count"}:
            raise ValueError("Donor phrases support only {{when}} and {{count}}.")
    if "{{" in PHRASE_TOKEN.sub("", value) or "}}" in PHRASE_TOKEN.sub("", value):
        raise ValueError("Close each donor variable with two braces.")
    return value


DonorPhrase = Annotated[str, AfterValidator(validate_phrase)]


class DonorPhraseFields(BaseModel):
    donor_singular_phrase: DonorPhrase = DEFAULT_SINGULAR_PHRASE
    donor_plural_phrase: DonorPhrase = DEFAULT_PLURAL_PHRASE


def has_day_token(html: str) -> bool:
    return isinstance(html, str) and bool(DAY_TOKEN.search(html))


def validate_campaign_personalization(config: Mapping[str, Any]) -> None:
    html = config.get("html_body") or ""
    if not isinstance(html, str):
        return  # The existing worker handles malformed legacy HTML configurations.
    if INNER_TOKEN.search(html):
        raise ValueError("Put {{Day}} in the email HTML; configure {{when}} and {{count}} in the donor phrases.")
    if not has_day_token(html):
        return
    if config.get("source_type") != "airtable" or config.get("segment") != "dnr":
        raise ValueError("{{Day}} requires an Airtable Donors audience.")
    validate_phrase(config.get("donor_singular_phrase") or DEFAULT_SINGULAR_PHRASE)
    validate_phrase(config.get("donor_plural_phrase") or DEFAULT_PLURAL_PHRASE)


_SMALL = (
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
)
_TENS = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")


def number_in_words(value: int) -> str:
    if value < 0:
        raise ValueError("Donation numbers cannot be negative.")
    if value < 20:
        return _SMALL[value]
    if value < 100:
        tens, remainder = divmod(value, 10)
        return _TENS[tens] + (f"-{_SMALL[remainder]}" if remainder else "")
    if value < 1000:
        hundreds, remainder = divmod(value, 100)
        return f"{_SMALL[hundreds]} hundred" + (f" {number_in_words(remainder)}" if remainder else "")
    if value < 1_000_000:
        thousands, remainder = divmod(value, 1000)
        return f"{number_in_words(thousands)} thousand" + (f" {number_in_words(remainder)}" if remainder else "")
    return str(value)


def donation_local_date(value: str) -> date:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError, AttributeError) as error:
        raise ValueError("An active-campaign donation has no valid date.") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=COSTA_RICA_TZ)
    return parsed.astimezone(COSTA_RICA_TZ).date()


def format_donation_when(days_ago: int) -> str:
    if days_ago < 0:
        raise ValueError("An active-campaign donation is dated in the future.")
    if days_ago == 0:
        return "today"
    if days_ago == 1:
        return "yesterday"
    return f"{number_in_words(days_ago)} days ago"


def render_phrase(*, count: int, days_ago: int, singular: str, plural: str) -> str:
    if count < 1:
        raise ValueError("Donor personalization requires at least one active-campaign donation.")
    phrase = validate_phrase(singular if count == 1 else plural)
    values = {"when": format_donation_when(days_ago), "count": number_in_words(count)}
    return PHRASE_TOKEN.sub(lambda match: values[match.group(1).strip().lower()], phrase)


def donor_phrase_for_contact(
    contact: Mapping[str, Any], config: Mapping[str, Any], *, now: datetime | None = None,
) -> str:
    try:
        count = int(contact["_donation_count"])
        donated_on = donation_local_date(contact["_last_donation_at"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Donor personalization requires current campaign donation count and date.") from error
    today = (now or datetime.now(timezone.utc)).astimezone(COSTA_RICA_TZ).date()
    return render_phrase(
        count=count,
        days_ago=(today - donated_on).days,
        singular=config.get("donor_singular_phrase") or DEFAULT_SINGULAR_PHRASE,
        plural=config.get("donor_plural_phrase") or DEFAULT_PLURAL_PHRASE,
    )


def personalize_donor_html(html: str, contact: Mapping[str, Any], config: Mapping[str, Any]) -> str:
    if not has_day_token(html):
        return html
    phrase = escape(donor_phrase_for_contact(contact, config), quote=True)
    return DAY_TOKEN.sub(lambda _match: phrase, html)


def preview_donor_html(
    html: str, config: Mapping[str, Any], *, count: int = 1, days_ago: int = 3,
) -> str:
    if not has_day_token(html):
        return html
    phrase = render_phrase(
        count=count, days_ago=days_ago,
        singular=config.get("donor_singular_phrase") or DEFAULT_SINGULAR_PHRASE,
        plural=config.get("donor_plural_phrase") or DEFAULT_PLURAL_PHRASE,
    )
    return DAY_TOKEN.sub(lambda _match: escape(phrase, quote=True), html)
