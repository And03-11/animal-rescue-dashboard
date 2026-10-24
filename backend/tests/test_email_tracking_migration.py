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


def test_unsubscribe_override_migration_defaults_safe_without_mutating_bajas():
    path = MIGRATION_PATH.parent / "20261009_campaign_unsubscribe_override.sql"
    migration = path.read_text(encoding="utf-8")
    assert "ADD COLUMN IF NOT EXISTS send_to_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE" in migration
    assert "BEGIN;" in migration and "COMMIT;" in migration
    assert "DELETE FROM" not in migration
    assert "UPDATE email_suppressions" not in migration
    assert "DROP TABLE" not in migration
