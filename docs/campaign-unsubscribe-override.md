# Campaign-only unsubscribe override

`send_to_unsubscribed` is an explicit per-campaign exception. Its default is
`false` for new and existing campaigns, for both Airtable and CSV audiences.

The campaign wizard exposes **Send to unsubscribed contacts (this campaign only)**
in Campaign setup. The review step and campaign list visibly flag enabled overrides.
Enabling it bypasses only suppressions whose reason is `unsubscribe`, for that
campaign only. Other suppression reasons remain blocked. It does
not re-subscribe contacts, delete `email_suppressions`, or disable unsubscribe
recording or headers. Existing accepted-delivery deduplication still applies.
Disabling it restores the original exclusion rule on subsequent executions.
Active campaigns remain locked against editing; pause and wait for `Paused` first.

Continuing to send after an unsubscribe request can increase spam complaints and
harm sender reputation. Gmail recommends honoring unsubscribe requests within
48 hours: https://support.google.com/mail/answer/14229414

## Deployment prerequisite (not performed by this change)

Back up the production database, then apply the idempotent migration
`backend/migrations/20261009_campaign_unsubscribe_override.sql` **before deploying
the new backend**. The schema bootstrap script
`python -m backend.app.scripts.create_email_sender_table` also adds this column
when needed. The new backend explicitly inserts the column, so do not deploy it
against an unmigrated database.

Deploy both backend and frontend. The migration does not modify unsubscribe
records and does not enable the exception on any campaign. Only enable it on
explicitly selected campaigns. Do not launch historical completed campaigns or
send a production canary without separate authorization.
