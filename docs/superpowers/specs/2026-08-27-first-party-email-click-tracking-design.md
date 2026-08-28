# First-Party Email Click Tracking Design

**Date:** 2026-08-27

**Status:** Approved for implementation

## Objective

Track engagement from Gmail campaigns without routing donation links through a
third-party or shared redirect domain. Keep the visible destination under
`https://donations.animallove.cr`, avoid recipient PII in URLs, distinguish
confirmed browser interaction from unconfirmed landings, and expose the
result in the existing Email Campaigns workspace.

## Scope

This implementation includes:

- Per-campaign click-tracking opt-in.
- Per-recipient, per-link opaque tracking tokens.
- Direct donation URLs with campaign-level UTM parameters and the token in the
  URI fragment.
- A public, origin-restricted event ingestion endpoint.
- PostgreSQL/Supabase persistence for deliveries, links, events, suppressions,
  and unsubscribe tokens.
- Gmail API message ID persistence.
- RFC 8058 one-click unsubscribe headers and a visible unsubscribe flow.
- A WordPress plugin ZIP for `donations.animallove.cr`.
- Campaign-list engagement summaries and a detailed report.
- Correct use of “Sent” instead of “Delivered” for Gmail-accepted messages.

This implementation intentionally excludes:

- Open-tracking pixels.
- A redirect service for first-party donation links.
- Automatic writes of every event to Airtable.
- Automatic mutation of the production Supabase schema or WordPress site.
- Conversion attribution from a completed donation. The design preserves a
  first-party attribution token so conversion tracking can be added later.

## User Journey

1. An operator enables “Track donation clicks” while creating a campaign.
2. Before each Gmail send, the backend identifies eligible `http`/`https`
   anchors whose host is `donations.animallove.cr` and which have no existing
   fragment.
3. The backend creates one delivery record and one opaque token per eligible
   link, then emits an href shaped like:

   ```text
   https://donations.animallove.cr/a-source-of-strength-n/?utm_source=email&utm_medium=email&utm_campaign=Campaign_2026#alc=<opaque-token>
   ```

4. Gmail accepts the message and the backend stores the immutable Gmail API
   message ID and sender account against the delivery.
5. A recipient opens the destination directly. There is no redirect hop.
6. The WordPress plugin reads `alc` from the fragment, removes it from the
   visible address, and sends small first-party analytics events to the
   dashboard API.
7. The campaign table and report show sent messages, landing loads,
   human-likely clicks, suspected automated activity, click rate, top links,
   and recent engaged recipients.

## Link and Token Contract

- Tokens contain at least 192 bits of entropy and are generated with
  `secrets.token_urlsafe(24)`.
- Raw tokens are sent only in the email fragment and event request. PostgreSQL
  stores only `SHA-256(token)`.
- Tokens never contain an email address, Airtable record ID, campaign ID, or
  destination URL.
- The backend only rewrites anchors for configured allowlisted hosts.
- `mailto:`, `tel:`, unsubscribe links, relative links, non-HTTPS production
  links, and links with an existing fragment are not rewritten.
- Existing query parameters are preserved. `utm_source=email`,
  `utm_medium=email`, and `utm_campaign=<campaign id>` are added only when the
  corresponding key is absent.
- The reporting URL is normalized to scheme, hostname, port, and path. Query
  values and fragments are not copied into reporting responses.

## Event Contract

The plugin may emit these events:

- `landing_loaded`: JavaScript executed on a visible landing page.
- `human_interaction`: the page received a trusted pointer, touch, keyboard,
  or scroll interaction.
- `session_summary`: the page reports accumulated visible time before becoming
  hidden.

The request body is `text/plain` JSON so `navigator.sendBeacon()` remains a
simple cross-origin request:

```json
{
  "token": "opaque-token",
  "event_type": "human_interaction",
  "visitor_id": "browser-session-uuid",
  "engagement_ms": 4200,
  "viewport_width": 390
}
```

Server time is authoritative. Client time is not stored as the event time.
The endpoint returns HTTP 202 for both unknown and accepted tokens so it does
not provide a token-enumeration oracle. Invalid shape, disallowed origin, and
oversized payloads return a generic 4xx response.

`landing_loaded` is a raw landing signal. `human_interaction` is the primary
human-likely click signal. Known scanner/crawler user agents are recorded as
suspected automation. The report never calls every landing a human click.

## Persistence Model

### `email_campaign_deliveries`

One row per normalized recipient and campaign:

- `id UUID PRIMARY KEY`
- `campaign_id TEXT NOT NULL`
- `recipient_email TEXT NOT NULL`
- `recipient_email_normalized TEXT NOT NULL`
- `sender_account TEXT`
- `gmail_message_id TEXT`
- `status TEXT NOT NULL` (`prepared`, `sent`, `failed`)
- `prepared_at`, `sent_at`, `failed_at TIMESTAMPTZ`
- unique `(campaign_id, recipient_email_normalized)`

### `email_tracking_links`

One row per tracked anchor:

- `id UUID PRIMARY KEY`
- `delivery_id UUID REFERENCES email_campaign_deliveries(id)`
- `token_hash TEXT UNIQUE NOT NULL`
- `destination_origin TEXT NOT NULL`
- `destination_path TEXT NOT NULL`
- `link_position INTEGER NOT NULL`
- `created_at TIMESTAMPTZ`

### `email_tracking_events`

- `id UUID PRIMARY KEY`
- `tracking_link_id UUID REFERENCES email_tracking_links(id)`
- `event_type TEXT NOT NULL`
- `visitor_id TEXT NOT NULL`
- `engagement_ms INTEGER NOT NULL DEFAULT 0`
- `viewport_width INTEGER`
- `device_class TEXT`
- `user_agent TEXT`
- `ip_hash TEXT`
- `suspected_automation BOOLEAN NOT NULL DEFAULT FALSE`
- `occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- unique `(tracking_link_id, visitor_id, event_type)`

Duplicate events update `engagement_ms` to the larger observed value instead
of creating another row.

### `email_suppressions` and `email_unsubscribe_tokens`

The suppression table has a unique normalized email plus reason, source,
campaign, and timestamps. Unsubscribe tokens are opaque and stored as a hash.
The Gmail worker checks suppressions again immediately before sending.

## API

- `POST /api/v1/email-tracking/events` — public, origin restricted, returns
  HTTP 202 without recipient data.
- `POST /api/v1/email-tracking/unsubscribe/{token}` — public RFC 8058
  one-click endpoint.
- `GET /api/v1/email-tracking/unsubscribe/{token}` — public confirmation page;
  GET does not unsubscribe automatically.
- `GET /api/v1/sender/campaigns/{campaign_id}/report` — authenticated campaign
  report.
- `GET /api/v1/sender/campaigns` — authenticated list enriched with a single
  bulk performance query for the campaigns on the current page.

`POST /events` performs its own exact-origin validation and reflects only that
validated origin with `Vary: Origin`. The donation origin is not added to the
application's global credentialed CORS allowlist, and the public endpoint does
not grant credentialed or broad preflight access.

### Public-ingestion production gate

Production exposure requires a shared ingress/CDN/WAF rate limiter in front of
all processes, an explicit transaction-pool and database-connection budget,
and monitored alerts for request outcomes, latency, throttling, pool pressure,
and database errors. The operator must verify the rate limit across multiple
instances and load-test the documented connection budget in staging. A
process-local in-memory limiter is not distributed abuse protection and cannot
satisfy this gate.

## WordPress Plugin

The installable plugin is named **Animal Love Email Tracking** and lives in
`integrations/wordpress/animal-love-email-tracking/`.

Its admin settings contain:

- Enable tracker.
- Event endpoint URL.
- Optional privacy notice URL.
- Attribution retention in days, constrained to 1–90 and defaulting to 30.

The frontend script:

- Runs only when enabled and the endpoint is HTTPS.
- Reads and validates `alc` without logging it to the console.
- Generates a random visitor/session ID in `sessionStorage`.
- Stores the attribution token in a Secure, SameSite=Lax first-party cookie.
- Removes `alc` with `history.replaceState` while preserving other fragment
  parameters.
- Emits each event type at most once per page/session.
- Uses `navigator.sendBeacon()` with a `fetch(..., {keepalive: true})`
  fallback.
- Never delays rendering, navigation, or the donation form.

## Gmail and Unsubscribe Behavior

`GmailService.send_email()` returns a structured result containing `success`,
`message_id`, `thread_id`, and a safe error message. It accepts extra headers
so the worker can set:

```text
List-Unsubscribe: <https://PUBLIC_API/api/v1/email-tracking/unsubscribe/<token>>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The HTML body receives a visible unsubscribe footer when the campaign does
not already contain an unsubscribe URL. Test sends do not create tracking or
unsubscribe records and do not affect campaign metrics.

Every launched campaign email, including campaigns with donation click
tracking disabled, must perform the suppression check, create a unique
unsubscribe token, add the visible footer, and emit the RFC 8058 headers.
Donation click rewriting remains independently optional. When it is disabled,
the original donation URLs remain byte-for-byte unchanged by the tracking
service and no click-link records are created.

Campaign MIME is generated deterministically as `multipart/alternative` with
an explicit readable `text/plain` part followed by the `text/html` part. The
visible unsubscribe footer is inserted before the closing `</body>` (or
`</html>` when no body exists) rather than after the document.

## Rollout and Failure Rules

- Existing campaigns with no `click_tracking_enabled` field behave as
  disabled.
- New wizard drafts expose the option, initially disabled until deployment
  configuration is complete.
- All launched campaign sends fail closed before Gmail when suppression lookup,
  delivery-ledger persistence, or unsubscribe preparation fails. Disabling
  donation click tracking disables only UTM/fragment rewriting and click-link
  persistence; it never disables compliance preparation.
- Applying the SQL migration, configuring the public API URL/CORS origin, and
  installing the plugin are explicit deployment steps.
- `EMAIL_PUBLIC_API_BASE_URL` is a required HTTPS root origin for every
  launched campaign because unsubscribe compliance remains active when click
  tracking is disabled; path-prefixed values are rejected.
- Public ingestion remains disabled until shared rate limiting, transaction
  pooling/capacity, and monitoring alerts pass the operator checks in the
  deployment guide.
- No production database or WordPress mutation occurs as part of the local
  build.

## Acceptance Criteria

- An allowlisted donation link reaches the original page directly and gains
  UTM parameters plus `#alc=<token>`.
- Email addresses and internal IDs do not appear in the token or URL.
- Duplicate browser events do not inflate unique metrics.
- A human interaction produces a human-likely unique click in the campaign
  report.
- Gmail message IDs are stored for successful sends.
- The campaign table says “Sent”, not “Delivered”.
- RFC 8058 headers are present when unsubscribe is configured.
- RFC 8058 headers and the visible footer are present for every launched
  campaign email, whether donation click tracking is enabled or disabled.
- Every launched campaign message contains explicit plain-text and HTML MIME
  alternatives, with the plain-text part first.
- A one-click POST creates a suppression; a scanner GET does not.
- Suppressed recipients are not sent future campaign messages.
- The WordPress plugin passes JavaScript tests and PHP syntax validation and
  builds into an uploadable ZIP.
- Backend tests, frontend tests, frontend production build, and targeted
  security tests pass.
