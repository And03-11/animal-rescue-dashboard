"""Synchronize aggregated Brevo transactional stats for the New Comer Funnel.

The job intentionally stores one row per tag/day instead of copying individual
sent and delivered events. This keeps Supabase writes small while preserving
the denominators required for trustworthy email rates.
"""

import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values

from backend.app.core.funnel_email_config import get_verified_new_comer_tags

try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass


load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")
BREVO_BASE_URL = "https://api.brevo.com/v3"
SYNC_LOCK_ID = 742032
MAX_BACKFILL_DAYS = 90
MAX_REPORT_WINDOW_DAYS = 30


def iter_date_windows(
    start_date: date,
    end_date: date,
    window_days: int = MAX_REPORT_WINDOW_DAYS,
) -> Iterable[Tuple[date, date]]:
    """Yield inclusive date windows accepted by the Brevo report endpoint."""
    current = start_date
    while current <= end_date:
        window_end = min(current + timedelta(days=window_days - 1), end_date)
        yield current, window_end
        current = window_end + timedelta(days=1)


def ensure_schema(cursor, conn) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS brevo_funnel_daily_stats (
            stat_date DATE NOT NULL,
            campaign_tag TEXT NOT NULL,
            sent INTEGER NOT NULL DEFAULT 0,
            delivered INTEGER NOT NULL DEFAULT 0,
            opens INTEGER NOT NULL DEFAULT 0,
            unique_opens INTEGER NOT NULL DEFAULT 0,
            clicks INTEGER NOT NULL DEFAULT 0,
            unique_clicks INTEGER NOT NULL DEFAULT 0,
            soft_bounces INTEGER NOT NULL DEFAULT 0,
            hard_bounces INTEGER NOT NULL DEFAULT 0,
            blocked INTEGER NOT NULL DEFAULT 0,
            invalid INTEGER NOT NULL DEFAULT 0,
            spam_reports INTEGER NOT NULL DEFAULT 0,
            unsubscribed INTEGER NOT NULL DEFAULT 0,
            synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            PRIMARY KEY (stat_date, campaign_tag)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS brevo_funnel_tag_sync_state (
            campaign_tag TEXT PRIMARY KEY,
            last_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            last_success_at TIMESTAMP WITH TIME ZONE
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_brevo_funnel_stats_date "
        "ON brevo_funnel_daily_stats(stat_date)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_engagement_campaign_tag "
        "ON email_engagement(campaign_tag)"
    )
    conn.commit()


def get_funnel_tags(cursor) -> List[str]:
    """Return only explicitly approved Brevo transactional tags."""
    tags = get_verified_new_comer_tags()

    if not tags:
        return []

    # Rotate through a small number of tags per run. Unsynced or least recently
    # attempted tags go first, so a large backfill is spread across hours.
    max_tags = max(1, min(int(os.getenv("BREVO_MAX_TAGS_PER_RUN", "4")), 20))
    cursor.execute(
        """
        SELECT candidate.tag
        FROM UNNEST(%s::text[]) AS candidate(tag)
        LEFT JOIN brevo_funnel_tag_sync_state state
          ON state.campaign_tag = candidate.tag
        ORDER BY state.last_attempt_at NULLS FIRST, state.last_attempt_at, candidate.tag
        LIMIT %s
        """,
        (tags, max_tags),
    )
    return [row[0] for row in cursor.fetchall()]


def mark_tag_attempt(cursor, conn, campaign_tag: str, success: bool = False) -> None:
    cursor.execute(
        """
        INSERT INTO brevo_funnel_tag_sync_state (
            campaign_tag, last_attempt_at, last_success_at
        ) VALUES (%s, NOW(), CASE WHEN %s THEN NOW() ELSE NULL END)
        ON CONFLICT (campaign_tag) DO UPDATE SET
            last_attempt_at = NOW(),
            last_success_at = CASE
                WHEN %s THEN NOW()
                ELSE brevo_funnel_tag_sync_state.last_success_at
            END
        """,
        (campaign_tag, success, success),
    )
    conn.commit()


def fetch_daily_reports(
    session: requests.Session,
    campaign_tag: str,
    start_date: date,
    end_date: date,
) -> List[Dict]:
    response = session.get(
        f"{BREVO_BASE_URL}/smtp/statistics/reports",
        params={
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "tag": campaign_tag,
            "limit": MAX_REPORT_WINDOW_DAYS,
            "offset": 0,
            "sort": "asc",
        },
        timeout=(5, 20),
    )
    response.raise_for_status()
    return response.json().get("reports", [])


def upsert_reports(cursor, conn, campaign_tag: str, reports: List[Dict]) -> int:
    if not reports:
        return 0

    rows = [
        (
            report["date"],
            campaign_tag,
            int(report.get("requests") or 0),
            int(report.get("delivered") or 0),
            int(report.get("opens") or 0),
            int(report.get("uniqueOpens") or 0),
            int(report.get("clicks") or 0),
            int(report.get("uniqueClicks") or 0),
            int(report.get("softBounces") or 0),
            int(report.get("hardBounces") or 0),
            int(report.get("blocked") or 0),
            int(report.get("invalid") or 0),
            int(report.get("spamReports") or 0),
            int(report.get("unsubscribed") or 0),
        )
        for report in reports
        if report.get("date")
    ]
    if not rows:
        return 0

    execute_values(
        cursor,
        """
        INSERT INTO brevo_funnel_daily_stats (
            stat_date, campaign_tag, sent, delivered, opens, unique_opens,
            clicks, unique_clicks, soft_bounces, hard_bounces, blocked,
            invalid, spam_reports, unsubscribed
        ) VALUES %s
        ON CONFLICT (stat_date, campaign_tag) DO UPDATE SET
            sent = EXCLUDED.sent,
            delivered = EXCLUDED.delivered,
            opens = EXCLUDED.opens,
            unique_opens = EXCLUDED.unique_opens,
            clicks = EXCLUDED.clicks,
            unique_clicks = EXCLUDED.unique_clicks,
            soft_bounces = EXCLUDED.soft_bounces,
            hard_bounces = EXCLUDED.hard_bounces,
            blocked = EXCLUDED.blocked,
            invalid = EXCLUDED.invalid,
            spam_reports = EXCLUDED.spam_reports,
            unsubscribed = EXCLUDED.unsubscribed,
            synced_at = NOW()
        WHERE (
            brevo_funnel_daily_stats.sent,
            brevo_funnel_daily_stats.delivered,
            brevo_funnel_daily_stats.opens,
            brevo_funnel_daily_stats.unique_opens,
            brevo_funnel_daily_stats.clicks,
            brevo_funnel_daily_stats.unique_clicks,
            brevo_funnel_daily_stats.soft_bounces,
            brevo_funnel_daily_stats.hard_bounces,
            brevo_funnel_daily_stats.blocked,
            brevo_funnel_daily_stats.invalid,
            brevo_funnel_daily_stats.spam_reports,
            brevo_funnel_daily_stats.unsubscribed
        ) IS DISTINCT FROM (
            EXCLUDED.sent,
            EXCLUDED.delivered,
            EXCLUDED.opens,
            EXCLUDED.unique_opens,
            EXCLUDED.clicks,
            EXCLUDED.unique_clicks,
            EXCLUDED.soft_bounces,
            EXCLUDED.hard_bounces,
            EXCLUDED.blocked,
            EXCLUDED.invalid,
            EXCLUDED.spam_reports,
            EXCLUDED.unsubscribed
        )
        """,
        rows,
        page_size=30,
    )
    conn.commit()
    return len(rows)


def get_tag_start_date(cursor, campaign_tag: str, today: date) -> date:
    cursor.execute(
        "SELECT MAX(stat_date) FROM brevo_funnel_daily_stats WHERE campaign_tag = %s",
        (campaign_tag,),
    )
    last_date: Optional[date] = cursor.fetchone()[0]
    backfill_start = today - timedelta(days=MAX_BACKFILL_DAYS - 1)
    if last_date is None:
        return backfill_start
    return max(backfill_start, last_date - timedelta(days=1))


def run_brevo_funnel_stats_sync() -> None:
    """Run a low-impact incremental synchronization from Brevo to Supabase."""
    if not BREVO_API_KEY or not SUPABASE_DB_URL:
        print("[Brevo Stats] Skipped: BREVO_API_KEY or SUPABASE_DATABASE_URL is missing")
        return

    conn = None
    cursor = None
    lock_acquired = False
    try:
        conn = psycopg2.connect(
            SUPABASE_DB_URL,
            connect_timeout=10,
            application_name="brevo_funnel_stats_sync",
        )
        cursor = conn.cursor()
        cursor.execute("SET statement_timeout TO 30000")
        cursor.execute("SET lock_timeout TO 3000")
        cursor.execute("SET idle_in_transaction_session_timeout TO 30000")
        cursor.execute("SELECT pg_try_advisory_lock(%s)", (SYNC_LOCK_ID,))
        lock_acquired = bool(cursor.fetchone()[0])
        if not lock_acquired:
            print("[Brevo Stats] Another sync is active; skipping this run")
            return

        ensure_schema(cursor, conn)
        tags = get_funnel_tags(cursor)
        if not tags:
            print("[Brevo Stats] No New Comer Funnel tags were found; nothing to sync")
            return

        session = requests.Session()
        session.headers.update(
            {"accept": "application/json", "api-key": BREVO_API_KEY}
        )

        today = datetime.now(ZoneInfo("America/Guatemala")).date()
        rows_seen = 0
        for tag in tags:
            mark_tag_attempt(cursor, conn, tag)
            start_date = get_tag_start_date(cursor, tag, today)
            for window_start, window_end in iter_date_windows(start_date, today):
                reports = fetch_daily_reports(
                    session,
                    tag,
                    window_start,
                    window_end,
                )
                rows_seen += upsert_reports(cursor, conn, tag, reports)
            mark_tag_attempt(cursor, conn, tag, success=True)

        print(
            f"[Brevo Stats] Sync completed for {len(tags)} tag(s); "
            f"processed {rows_seen} aggregate day row(s)"
        )
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        print(f"[Brevo Stats] Brevo request failed with status {status}; retrying next hour")
    except Exception as exc:
        if conn:
            conn.rollback()
        print(f"[Brevo Stats] Sync failed safely: {exc}")
    finally:
        if cursor and lock_acquired:
            try:
                cursor.execute("SELECT pg_advisory_unlock(%s)", (SYNC_LOCK_ID,))
            except Exception:
                pass
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    run_brevo_funnel_stats_sync()
