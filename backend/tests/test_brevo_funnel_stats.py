from datetime import date

from backend.app.core.funnel_email_config import (
    VERIFIED_NEW_COMER_TAGS,
    get_verified_new_comer_tags,
)
from backend.app.scripts.sync_brevo_funnel_stats import iter_date_windows


def test_verified_new_comer_scope_contains_only_stage_zero_through_thirteen():
    assert len(VERIFIED_NEW_COMER_TAGS) == 14
    assert VERIFIED_NEW_COMER_TAGS[0].startswith("(Stage 0)")
    assert VERIFIED_NEW_COMER_TAGS[-1].startswith("(Stage 13)")
    assert "NC Stage #1" not in VERIFIED_NEW_COMER_TAGS
    assert "Stage_3" not in VERIFIED_NEW_COMER_TAGS


def test_verified_tags_can_be_explicitly_overridden(monkeypatch):
    monkeypatch.setenv("BREVO_FUNNEL_TAGS", "stage-b, stage-a, stage-b")
    assert get_verified_new_comer_tags() == ["stage-a", "stage-b"]


def test_ninety_day_backfill_is_split_into_brevo_safe_windows():
    windows = list(iter_date_windows(date(2026, 1, 1), date(2026, 3, 31)))

    assert windows == [
        (date(2026, 1, 1), date(2026, 1, 30)),
        (date(2026, 1, 31), date(2026, 3, 1)),
        (date(2026, 3, 2), date(2026, 3, 31)),
    ]
