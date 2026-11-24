BEGIN;

ALTER TABLE email_templates
    ADD COLUMN IF NOT EXISTS donor_singular_phrase TEXT NOT NULL DEFAULT 'donation you made {{when}}',
    ADD COLUMN IF NOT EXISTS donor_plural_phrase TEXT NOT NULL DEFAULT '{{count}} donations you’ve made over the past week';

ALTER TABLE email_sender_campaigns
    ADD COLUMN IF NOT EXISTS donor_singular_phrase TEXT NOT NULL DEFAULT 'donation you made {{when}}',
    ADD COLUMN IF NOT EXISTS donor_plural_phrase TEXT NOT NULL DEFAULT '{{count}} donations you’ve made over the past week';

COMMIT;
