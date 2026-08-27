# First-party email click tracking deployment

This runbook deploys click tracking for direct links to
`https://donations.animallove.cr`. It does not install an open pixel and does
not introduce a redirect between the email and the donation page.

The migration and plugin installation are manual production operations. The
repository build does not apply either one automatically.

## 1. Deployment order

Use this order so a tracking-enabled campaign cannot be sent before all of its
dependencies are ready:

1. Back up PostgreSQL/Supabase and confirm access to the WordPress admin.
2. Apply the idempotent SQL migration.
3. Configure the API environment and deploy the backend.
4. Install the WordPress plugin with the tracker still disabled.
5. Verify the public API and CORS boundary.
6. Enable the WordPress tracker.
7. Send a one-recipient internal canary.
8. Enable **Track donation clicks** only for campaigns that should be tracked.

Existing campaigns and new drafts default to tracking disabled.

## 2. Database migration

From the repository root, with `SUPABASE_DATABASE_URL` loaded into the current
PowerShell session, run:

```powershell
psql "$env:SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "backend/migrations/20260827_email_tracking.sql"
```

The migration runs in a transaction, can be reapplied safely, adds
`email_sender_campaigns.click_tracking_enabled` when that table exists, and
creates these tables:

- `email_campaign_deliveries`
- `email_tracking_links`
- `email_tracking_events`
- `email_suppressions`
- `email_unsubscribe_tokens`

Verify the schema without reading recipient data:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'email_campaign_deliveries',
    'email_tracking_links',
    'email_tracking_events',
    'email_suppressions',
    'email_unsubscribe_tokens'
  )
ORDER BY table_name;

SELECT column_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'email_sender_campaigns'
  AND column_name = 'click_tracking_enabled';
```

Expected: five tracking tables and a non-null boolean campaign column whose
default is `false`.

## 3. API configuration

Set these values in the production secret/environment manager before starting
the new backend:

```dotenv
EMAIL_PUBLIC_API_BASE_URL=https://YOUR-PUBLIC-DASHBOARD-API
EMAIL_TRACKING_ALLOWED_ORIGINS=https://donations.animallove.cr
EMAIL_TRACKING_ALLOWED_HOSTS=donations.animallove.cr
EMAIL_TRACKING_IP_HASH_KEY=REPLACE-WITH-A-LONG-RANDOM-SECRET
```

Keep the existing `SUPABASE_DATABASE_URL` and `CORS_ORIGINS` values. The
tracking origin is added to the normal CORS list automatically; do not replace
the dashboard's existing origins.

Configuration rules:

- `EMAIL_PUBLIC_API_BASE_URL` must be the externally reachable HTTPS API base,
  without `/api/v1` at the end. It is used in unsubscribe links embedded in
  email.
- `EMAIL_TRACKING_ALLOWED_ORIGINS` is a comma-separated exact-origin allowlist.
  Use no path and no trailing slash.
- `EMAIL_TRACKING_ALLOWED_HOSTS` is a comma-separated hostname allowlist for
  links that may be rewritten. Do not add shared shorteners or unrelated
  domains.
- `EMAIL_TRACKING_IP_HASH_KEY` must be generated randomly and stored as a
  secret. It is used for one-way, keyed IP hashing; never reuse an API key or
  database password.

Restart all backend workers after changing these variables. A long-running
worker caches the tracking service configuration.

### Public API smoke checks

Replace the example API host and run an unknown-token event from the allowed
origin. A generic `202 Accepted` is expected so tokens cannot be enumerated:

```powershell
$trackingBody = '{"token":"unknown-canary-token","event_type":"landing_loaded","visitor_id":"canary-browser-0001","engagement_ms":0,"viewport_width":1440}'
Invoke-WebRequest -Method Post -Uri "https://YOUR-PUBLIC-DASHBOARD-API/api/v1/email-tracking/events" -Headers @{ Origin = "https://donations.animallove.cr" } -ContentType "text/plain;charset=UTF-8" -Body $trackingBody
```

Repeat with `Origin = "https://example.org"`; the expected result is `403`.
Do not use a real recipient token for this boundary check.

## 4. Build and install the WordPress plugin

Build the uploadable artifact from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_wordpress_tracking_plugin.ps1
```

The result is `dist/animal-love-email-tracking.zip` and must contain one
top-level `animal-love-email-tracking/` directory.

In WordPress:

1. Open **Plugins > Add New > Upload Plugin**.
2. Upload `animal-love-email-tracking.zip` and activate it.
3. Open **Settings > Email Tracking**.
4. Enter
   `https://YOUR-PUBLIC-DASHBOARD-API/api/v1/email-tracking/events`.
5. Keep the default 30-day attribution retention unless the privacy policy
   requires a shorter window.
6. Add the privacy-notice URL used by Animal Love.
7. Save once with **Enable tracker** unchecked.
8. Complete the API smoke checks, then enable the tracker and save again.

The plugin reads only the opaque `alc` fragment, removes it from the visible
address, stores a Secure/SameSite=Lax first-party cookie, and sends small
events asynchronously. It does not block rendering or the donation form.

## 5. One-recipient canary

Create a campaign addressed only to an internal Animal Love test mailbox:

1. Select a donation page under `donations.animallove.cr`.
2. Enable **Track donation clicks** for this campaign.
3. Send the campaign to one controlled mailbox.
4. In Gmail, use **Show original** and confirm SPF, DKIM, and DMARC pass as they
   did before this release.
5. Confirm these headers exist:

   ```text
   List-Unsubscribe: <https://YOUR-PUBLIC-DASHBOARD-API/api/v1/email-tracking/unsubscribe/...>
   List-Unsubscribe-Post: List-Unsubscribe=One-Click
   ```

6. Inspect the donation link. It must still point directly to
   `https://donations.animallove.cr/...`, retain its existing parameters, add
   campaign UTMs, and end with `#alc=<opaque-token>`.
7. Confirm the URL contains no email address, Airtable record ID, campaign
   recipient data, or redirect hostname.
8. Open the link in a private browser. The donation page must render normally,
   the `alc` fragment should disappear from the visible address, and the event
   request should return `202`.
9. Scroll or interact with the page. The campaign report should first show a
   landing and then a **Human-likely** signal.
10. Confirm the campaign's stored delivery has a Gmail API message ID.

Test the unsubscribe flow only with the controlled mailbox. A normal GET must
show a confirmation page and must not suppress the address. Confirmation or a
valid RFC 8058 one-click POST must create the suppression. Verify that a later
canary skips that suppressed mailbox.

## 6. Metric interpretation

- **Sent**: Gmail accepted the API send. It does not prove inbox placement or
  reading.
- **Landing visits / Landing rate**: the donation-page script executed for a
  unique sent recipient. This is not automatically called a human click.
- **Human-likely clicks / Human click rate**: a unique recipient landing also
  produced trusted pointer, keyboard, touch, or scroll interaction.
- **Unconfirmed activity**: a landing occurred without the interaction signal.
- **Suspected automation**: activity matched scanner/crawler-like evidence and
  remains separate from human-likely reporting.
- **Open tracking: Off**: intentional. No tracking pixel is installed.

Rates use unique sent recipients as the denominator. Repeated events from one
recipient do not inflate the unique counts.

## 7. Gradual rollout and deliverability

- Start with internal canaries, then a small real campaign before increasing
  volume.
- Keep all tracked links on the existing first-party donation domain.
- Do not introduce a redirect or URL shortener.
- Keep the visible unsubscribe footer and RFC 8058 headers enabled.
- Monitor Gmail deferrals, bounces, spam complaints, and domain-authentication
  results separately from engagement metrics.
- Do not describe **Sent** as delivered and do not describe every landing as a
  human click.

This tracking design minimizes new deliverability risk, but it cannot replace
SPF/DKIM/DMARC alignment, list hygiene, consent, complaint handling, or gradual
volume management.

## 8. Safe disable and rollback

The fastest safe rollback does not drop data or uninstall the plugin:

1. Leave **Track donation clicks** disabled on new campaigns.
2. In WordPress **Settings > Email Tracking**, uncheck **Enable tracker**.
3. Keep the backend unsubscribe routes online for emails already sent; their
   `List-Unsubscribe` links must remain functional.
4. Existing donation links continue to open directly. With the plugin disabled,
   the unused `alc` fragment has no effect on page rendering.
5. Preserve the tracking tables while investigating. Dropping them would remove
   suppressions and could permit mail to recipients who unsubscribed.

If the plugin must be deactivated, its settings are retained. Re-enable only
after the event endpoint, CORS allowlist, and canary checks pass again.

## 9. Security and privacy checklist

- [ ] Production uses HTTPS for the API and donation site.
- [ ] Only `https://donations.animallove.cr` is allowed as an event origin and
      tracked destination host.
- [ ] `EMAIL_TRACKING_IP_HASH_KEY` is present only in the secret manager.
- [ ] Unknown tokens return a generic accepted response.
- [ ] Disallowed origins return `403`.
- [ ] No raw tracking or unsubscribe token is stored in PostgreSQL.
- [ ] No token, `.env`, OAuth credential, or Gmail token file is present in the
      WordPress ZIP.
- [ ] Recent-engagement UI masks recipient addresses.
- [ ] A scanner GET cannot unsubscribe a recipient.
- [ ] Suppressions are checked immediately before every real send.
