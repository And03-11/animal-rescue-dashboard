BEGIN;

-- The exception is explicitly opted into per campaign. Existing campaigns
-- continue to honor the persistent email_suppressions list by default.
ALTER TABLE email_sender_campaigns
    ADD COLUMN IF NOT EXISTS send_to_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE;

-- Deliberately do not modify email_suppressions or email_unsubscribe_tokens.
COMMIT;
