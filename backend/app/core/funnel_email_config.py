"""Verified Brevo scope for the New Comers 2.0 transactional funnel."""

import os
from typing import List


# Confirmed from the Brevo folder structure (Stage 0 through Stage 13) and
# cross-checked against Airtable Email Engagement template IDs. Historical
# outliers such as "NC Stage #1" and "Stage_3" are intentionally excluded.
VERIFIED_NEW_COMER_TAGS = (
    "(Stage 0) Bridge A",
    "(Stage 1) We are in need",
    "(Stage 2) Bridge B",
    "(Stage 3) Yakir",
    "(Stage 4) Bridge C",
    "(Stage 5) No intakes once more",
    "(Stage 6) Bridge D",
    "(Stage 7) Astral",
    "(Stage 8) Bridge E",
    "(Stage 9) Facing shutdown one more time",
    "(Stage 10) Bridge F",
    "(Stage 11) Lucy",
    "(Stage 12) Bridge G",
    "(Stage 13) Massive floods",
)


def get_verified_new_comer_tags() -> List[str]:
    """Return the verified defaults, with an optional explicit env override."""
    configured = os.getenv("BREVO_FUNNEL_TAGS", "")
    if configured.strip():
        return sorted({tag.strip() for tag in configured.split(",") if tag.strip()})
    return list(VERIFIED_NEW_COMER_TAGS)
