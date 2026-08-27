from pathlib import Path


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "20260827_email_tracking.sql"
)


def test_tracking_migration_adds_campaign_opt_in_column_for_existing_installations():
    migration = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "ALTER TABLE IF EXISTS email_sender_campaigns" in migration
    assert (
        "ADD COLUMN IF NOT EXISTS click_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE"
        in migration
    )
