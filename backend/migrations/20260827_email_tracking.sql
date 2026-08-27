BEGIN;

ALTER TABLE IF EXISTS email_sender_campaigns
    ADD COLUMN IF NOT EXISTS click_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS email_campaign_deliveries (
    id UUID PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    recipient_email_normalized TEXT NOT NULL,
    sender_account TEXT,
    gmail_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'prepared'
        CHECK (status IN ('prepared', 'sent', 'failed', 'suppressed')),
    prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    UNIQUE (campaign_id, recipient_email_normalized)
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_deliveries_campaign_status
    ON email_campaign_deliveries (campaign_id, status);

CREATE TABLE IF NOT EXISTS email_tracking_links (
    id UUID PRIMARY KEY,
    delivery_id UUID NOT NULL
        REFERENCES email_campaign_deliveries(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE
        CHECK (char_length(token_hash) = 64),
    destination_origin TEXT NOT NULL,
    destination_path TEXT NOT NULL,
    link_position INTEGER NOT NULL CHECK (link_position >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (delivery_id, link_position)
);

CREATE INDEX IF NOT EXISTS idx_email_tracking_links_delivery
    ON email_tracking_links (delivery_id);

CREATE TABLE IF NOT EXISTS email_tracking_events (
    id UUID PRIMARY KEY,
    tracking_link_id UUID NOT NULL
        REFERENCES email_tracking_links(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL
        CHECK (event_type IN ('landing_loaded', 'human_interaction', 'session_summary')),
    visitor_id TEXT NOT NULL CHECK (char_length(visitor_id) BETWEEN 8 AND 128),
    engagement_ms INTEGER NOT NULL DEFAULT 0
        CHECK (engagement_ms BETWEEN 0 AND 86400000),
    viewport_width INTEGER CHECK (viewport_width BETWEEN 0 AND 20000),
    device_class TEXT CHECK (device_class IN ('mobile', 'tablet', 'desktop', 'unknown')),
    user_agent TEXT,
    ip_hash TEXT,
    suspected_automation BOOLEAN NOT NULL DEFAULT FALSE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tracking_link_id, visitor_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_email_tracking_events_link_time
    ON email_tracking_events (tracking_link_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS email_suppressions (
    id UUID PRIMARY KEY,
    recipient_email TEXT NOT NULL,
    recipient_email_normalized TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    source TEXT NOT NULL,
    campaign_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_unsubscribe_tokens (
    id UUID PRIMARY KEY,
    delivery_id UUID NOT NULL UNIQUE
        REFERENCES email_campaign_deliveries(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE
        CHECK (char_length(token_hash) = 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

COMMIT;
