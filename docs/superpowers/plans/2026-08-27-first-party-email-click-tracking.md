# First-Party Email Click Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-conscious, first-party click and unsubscribe tracking to Gmail campaigns and expose trustworthy engagement metrics in the existing campaign workspace.

**Architecture:** The Gmail worker rewrites only allowlisted donation anchors with campaign UTMs and a hashed opaque token carried in the URI fragment. A small WordPress plugin records landing, interaction, and session signals through a public origin-restricted FastAPI endpoint; PostgreSQL stores deliveries, links, events, and suppressions, while the authenticated campaign API supplies summaries and reports.

**Tech Stack:** Python 3.13, FastAPI, Pydantic, psycopg2/PostgreSQL, pytest, Gmail API, React 19, TypeScript 5.8, Material UI 7, Node 22 test runner, WordPress/PHP, browser Beacon API.

**Spec:** `docs/superpowers/specs/2026-08-27-first-party-email-click-tracking-design.md`

## Global Constraints

- Keep donation traffic on `https://donations.animallove.cr`; do not add a redirect hop.
- Never put email addresses, Airtable IDs, campaign IDs, or destination URLs inside tracking tokens.
- Store only SHA-256 token digests in PostgreSQL.
- Do not implement open-tracking pixels.
- Do not write raw click traffic to Airtable.
- Existing campaigns default to tracking disabled.
- Do not apply the production SQL migration or install the WordPress plugin automatically.
- Public event responses must not reveal whether a token exists or identify a recipient.
- Gmail-accepted messages are labeled “Sent”, never “Delivered”.

---

### Task 1: Tracking domain model, link rewriting, and SQL schema

**Files:**
- Create: `backend/app/services/email_tracking.py`
- Create: `backend/migrations/20260827_email_tracking.sql`
- Create: `backend/tests/test_email_tracking_links.py`

**Interfaces:**
- Produces: `TrackingLink`, `PreparedTrackedEmail`, `EmailTrackingRepository`, `EmailTrackingService.prepare_email(campaign_id, recipient_email, html_body) -> PreparedTrackedEmail`.
- Produces: `normalize_reporting_url(url) -> tuple[str, str]` and `token_digest(token) -> str`.
- Consumes later: Gmail worker uses `PreparedTrackedEmail.html_body`, `.delivery_id`, `.links`, and `.unsubscribe_token`.

- [ ] **Step 1: Write failing tests for eligibility, URL preservation, and PII-free tokens**

  Add tests with literal expected URLs. Cover one HTTPS donation link, existing query parameters, non-allowlisted links, `mailto:`, an existing fragment, duplicate anchors, and an email address that must not appear in the resulting HTML/token.

  ```python
  def test_prepare_email_rewrites_only_allowlisted_fragment_free_links(repository):
      service = EmailTrackingService(repository, allowed_hosts={"donations.animallove.cr"})
      prepared = service.prepare_email(
          campaign_id="Campaign_august",
          recipient_email="person@example.org",
          html_body=(
              '<a href="https://donations.animallove.cr/help/?currency=usd">Donate</a>'
              '<a href="https://example.org/privacy">Privacy</a>'
          ),
      )
      assert "utm_source=email" in prepared.html_body
      assert "utm_medium=email" in prepared.html_body
      assert "utm_campaign=Campaign_august" in prepared.html_body
      assert "#alc=" in prepared.html_body
      assert "person@example.org" not in prepared.html_body
      assert 'href="https://example.org/privacy"' in prepared.html_body
  ```

- [ ] **Step 2: Run the new tests and verify RED**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_tracking_links.py -q`

  Expected: FAIL because `backend.app.services.email_tracking` does not exist.

- [ ] **Step 3: Implement the parser and in-memory repository contract**

  Use `html.parser.HTMLParser`, `urllib.parse`, `secrets.token_urlsafe(24)`, and `hashlib.sha256`. The production-facing repository is a protocol; tests use a concrete in-memory repository that enforces the same uniqueness and event-upsert behavior.

  Start with the real digest helper used by both the in-memory and PostgreSQL
  repositories:

  ```python
  def token_digest(token: str) -> str:
      return hashlib.sha256(token.encode("utf-8")).hexdigest()
  ```

  `PreparedTrackedEmail` is an immutable dataclass with `delivery_id`,
  `html_body`, `links`, and `unsubscribe_token`; `prepare_email` returns that
  dataclass after the repository has persisted the delivery and token digests.

- [ ] **Step 4: Add the idempotent PostgreSQL schema**

  Create the five tables and indexes described in the spec. Add check constraints for statuses/event types, cascade links/events with a delivery, and unique constraints for delivery and event deduplication. Do not run the migration against production.

- [ ] **Step 5: Run tests and verify GREEN**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_tracking_links.py -q`

  Expected: PASS.

- [ ] **Step 6: Commit the domain and schema**

  ```powershell
  git add backend/app/services/email_tracking.py backend/migrations/20260827_email_tracking.sql backend/tests/test_email_tracking_links.py
  git commit -m "feat: add first-party email tracking domain"
  ```

### Task 2: PostgreSQL repository and public event ingestion

**Files:**
- Modify: `backend/app/services/email_tracking.py`
- Create: `backend/app/api/v1/endpoints/email_tracking.py`
- Modify: `backend/app/main.py`
- Modify: `.env.example`
- Create: `backend/tests/test_email_tracking_events.py`
- Create: `backend/tests/test_email_tracking_api.py`

**Interfaces:**
- Consumes: Task 1 repository/service contracts.
- Produces: `PostgresEmailTrackingRepository`, `get_email_tracking_service()`, `record_event(payload, request_metadata)`, and `POST /api/v1/email-tracking/events`.
- Produces later: campaign report queries and sender persistence use the same repository.

- [ ] **Step 1: Write failing service tests for event validation and deduplication**

  Cover unknown tokens, repeated landing events, a later larger `engagement_ms`, human interaction overriding scanner classification, viewport bounds, visitor ID bounds, and normalized device classes.

  ```python
  def test_duplicate_session_summary_keeps_largest_engagement(repository, prepared):
      service = EmailTrackingService(repository, allowed_hosts={"donations.animallove.cr"})
      service.record_event(prepared.links[0].token, "session_summary", "visitor-1", 1200)
      service.record_event(prepared.links[0].token, "session_summary", "visitor-1", 4100)
      events = repository.events_for(prepared.links[0].id)
      assert len(events) == 1
      assert events[0].engagement_ms == 4100
  ```

- [ ] **Step 2: Run service tests and verify RED**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_tracking_events.py -q`

  Expected: FAIL because event recording is missing.

- [ ] **Step 3: Implement event validation, automation hints, and PostgreSQL queries**

  Limit the user agent to 512 characters, hash the canonical client IP with an environment-provided HMAC key, and detect a conservative list of scanner/crawler tokens. Use `INSERT ... ON CONFLICT ... DO UPDATE SET engagement_ms = GREATEST(...)`.

- [ ] **Step 4: Write failing API tests**

  Exercise the real FastAPI router with an in-memory service dependency. Verify allowed origin + valid text JSON returns 202, unknown token also returns the same 202 body, disallowed origin returns 403, malformed/oversized bodies return 400/413, and the response never contains email/token status.

- [ ] **Step 5: Run API tests and verify RED**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_tracking_api.py -q`

  Expected: FAIL because the router is not registered.

- [ ] **Step 6: Implement and register the public router**

  Parse at most 4 KiB from `Request.body()`. Validate `Origin` against `EMAIL_TRACKING_ALLOWED_ORIGINS`, defaulting to `https://donations.animallove.cr`. Return `{"accepted": true}` for valid and unknown tokens. Add the WordPress origin to CORS even when general `CORS_ORIGINS` is configured.

- [ ] **Step 7: Run API and security tests and verify GREEN**

  Run:

  ```powershell
  backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_tracking_events.py backend/tests/test_email_tracking_api.py backend/tests/test_security_boundaries.py -q
  ```

  Expected: PASS.

- [ ] **Step 8: Commit the event API**

  ```powershell
  git add backend/app/services/email_tracking.py backend/app/api/v1/endpoints/email_tracking.py backend/app/main.py .env.example backend/tests/test_email_tracking_events.py backend/tests/test_email_tracking_api.py
  git commit -m "feat: ingest first-party email engagement"
  ```

### Task 3: Gmail send results and campaign-worker integration

**Files:**
- Modify: `backend/app/services/gmail_service.py`
- Modify: `backend/app/api/v1/endpoints/email_sender.py`
- Modify: `backend/app/services/campaign_storage.py`
- Modify: `backend/tests/test_email_sender_execution_safety.py`
- Create: `backend/tests/test_gmail_send_result.py`
- Create: `backend/tests/test_email_sender_tracking.py`

**Interfaces:**
- Consumes: `EmailTrackingService.prepare_email`, `mark_delivery_sent`, and `mark_delivery_failed`.
- Produces: `GmailSendResult(success, message_id, thread_id, error)` and campaign summaries enriched with tracking performance.

- [ ] **Step 1: Write a failing Gmail result test**

  Supply a fake Gmail API response containing `id` and `threadId`. Decode the submitted MIME message and verify additional headers are preserved.

  ```python
  result = service.send_email(
      "person@example.org",
      "Help today",
      "<p>Body</p>",
      extra_headers={
          "List-Unsubscribe": "<https://api.example.org/unsubscribe/token>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
  )
  assert result.success is True
  assert result.message_id == "gmail-message-1"
  ```

- [ ] **Step 2: Run the Gmail test and verify RED**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_gmail_send_result.py -q`

  Expected: FAIL because Gmail currently returns only `bool`.

- [ ] **Step 3: Implement the structured Gmail result**

  Keep `GmailSendResult.__bool__()` for compatibility. Do not log raw recipient errors containing credentials or response bodies.

- [ ] **Step 4: Write failing worker integration tests**

  Cover tracking disabled, tracking enabled with one eligible link, preparation failure before Gmail, successful Gmail ID persistence, failed Gmail status persistence, test-send exclusion, and a retry that does not double-send a recipient already in the delivery ledger.

- [ ] **Step 5: Run worker tests and verify RED**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_sender_tracking.py backend/tests/test_email_sender_execution_safety.py -q`

  Expected: new tracking cases FAIL while existing safety cases remain green.

- [ ] **Step 6: Integrate tracking in the worker**

  Prepare tracking after name personalization and immediately before Gmail. Use the original HTML when `click_tracking_enabled` is absent/false. On successful Gmail acceptance, store the Gmail message ID before appending the legacy sent ledger. Stop the campaign if a sent delivery cannot be persisted.

- [ ] **Step 7: Bulk-enrich paginated campaign summaries**

  After `CampaignFileStorage.list_campaigns_with_progress`, issue one repository query for all IDs on the page and merge `landing_rate`, `human_click_rate`, and counts under `performance`. Do not write derived statistics to campaign JSON files.

- [ ] **Step 8: Run worker/storage tests and verify GREEN**

  Run:

  ```powershell
  backend\venv\Scripts\python.exe -m pytest backend/tests/test_gmail_send_result.py backend/tests/test_email_sender_tracking.py backend/tests/test_email_sender_execution_safety.py backend/tests/test_email_sender_campaign_storage.py -q
  ```

  Expected: PASS.

- [ ] **Step 9: Commit Gmail and worker integration**

  ```powershell
  git add backend/app/services/gmail_service.py backend/app/api/v1/endpoints/email_sender.py backend/app/services/campaign_storage.py backend/tests/test_gmail_send_result.py backend/tests/test_email_sender_tracking.py backend/tests/test_email_sender_execution_safety.py
  git commit -m "feat: track Gmail campaign deliveries"
  ```

### Task 4: Campaign opt-in and accurate “Sent” presentation

**Files:**
- Modify: `backend/app/api/v1/endpoints/email_sender.py`
- Modify: `backend/app/services/email_sender_service.py`
- Modify: `backend/app/scripts/create_email_sender_table.py`
- Modify: `backend/tests/test_email_sender_campaign_writes.py`
- Modify: `frontend/src/features/email-sender/types.ts`
- Modify: `frontend/src/features/email-sender/campaignWizardState.ts`
- Modify: `frontend/src/features/email-sender/CampaignSetupStep.tsx`
- Modify: `frontend/src/features/email-sender/ContentReviewStep.tsx`
- Modify: `frontend/src/features/email-sender/campaignPresentation.ts`
- Modify: `frontend/src/features/email-sender/CampaignTableWorkspace.tsx`
- Modify: `frontend/tests/campaignWizardState.test.ts`
- Modify: `frontend/tests/campaignPresentation.test.ts`

**Interfaces:**
- Produces: `click_tracking_enabled: boolean` in request, stored campaign, wizard draft, and details.
- Produces: presentation property `sent`, replacing the misleading internal name `delivered`.

- [ ] **Step 1: Add failing backend persistence tests**

  Verify create/update accept only booleans, persist explicit true/false, and treat a missing legacy value as false.

- [ ] **Step 2: Run backend write tests and verify RED**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_sender_campaign_writes.py -q`

- [ ] **Step 3: Implement backend field persistence**

  Add a Boolean Pydantic field defaulting false, include it in JSON and remote persistence, and extend the table-creation script with `ADD COLUMN IF NOT EXISTS click_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE`.

- [ ] **Step 4: Add failing frontend state and presentation tests**

  Verify new drafts default false, hydration preserves true, payload includes the flag, the table presentation exposes `sent`, and no returned object contains the property `delivered`.

- [ ] **Step 5: Run frontend tests and verify RED**

  Run from `frontend`:

  ```powershell
  node --test tests/campaignWizardState.test.ts tests/campaignPresentation.test.ts
  ```

- [ ] **Step 6: Implement the wizard control and copy changes**

  Add an accessible switch labeled “Track donation clicks” with helper text “Uses first-party tracking on donations.animallove.cr. Open tracking stays off.” Change the table header and progress copy from “Delivered” to “Sent”.

- [ ] **Step 7: Run focused tests and build**

  Run from `frontend`:

  ```powershell
  node --test tests/campaignWizardState.test.ts tests/campaignPresentation.test.ts tests/campaignTableLayout.test.ts
  npm run build
  ```

  Expected: PASS/build success.

- [ ] **Step 8: Commit campaign opt-in and presentation**

  ```powershell
  git add backend/app/api/v1/endpoints/email_sender.py backend/app/services/email_sender_service.py backend/app/scripts/create_email_sender_table.py backend/tests/test_email_sender_campaign_writes.py frontend/src/features/email-sender frontend/tests/campaignWizardState.test.ts frontend/tests/campaignPresentation.test.ts
  git commit -m "feat: add campaign click tracking opt-in"
  ```

### Task 5: RFC 8058 unsubscribe and suppression enforcement

**Files:**
- Modify: `backend/app/services/email_tracking.py`
- Modify: `backend/app/api/v1/endpoints/email_tracking.py`
- Modify: `backend/app/api/v1/endpoints/email_sender.py`
- Modify: `.env.example`
- Create: `backend/tests/test_email_unsubscribe.py`
- Modify: `backend/tests/test_email_sender_tracking.py`

**Interfaces:**
- Produces: `prepare_unsubscribe(campaign_id, email) -> token`, `unsubscribe(token) -> None`, `is_suppressed(email) -> bool`.
- Consumes: Gmail extra-header support from Task 3.

- [ ] **Step 1: Write failing unsubscribe service tests**

  Verify token hashing, idempotent POST, normalized-email suppression, unknown-token indistinguishability, and suppression lookup.

- [ ] **Step 2: Run service tests and verify RED**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_unsubscribe.py -q`

- [ ] **Step 3: Implement unsubscribe persistence and safe HTML footer**

  Add `append_unsubscribe_footer(html, url)` that uses a fixed accessible footer and refuses non-HTTPS public URLs outside development. Preserve existing body unsubscribe links without appending a duplicate.

- [ ] **Step 4: Add failing route tests**

  Verify RFC 8058 POST accepts `List-Unsubscribe=One-Click`, GET returns a confirmation form without mutating suppression state, confirmation POST suppresses, and neither response exposes the email.

- [ ] **Step 5: Implement routes and Gmail headers**

  Build URLs from `EMAIL_PUBLIC_API_BASE_URL`. Tracking-enabled production sends fail before Gmail when the public HTTPS base is missing. Check suppression immediately before preparation/send and record a non-send reason without calling Gmail.

- [ ] **Step 6: Run unsubscribe and worker tests**

  Run:

  ```powershell
  backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_unsubscribe.py backend/tests/test_email_sender_tracking.py backend/tests/test_gmail_send_result.py -q
  ```

  Expected: PASS.

- [ ] **Step 7: Commit unsubscribe support**

  ```powershell
  git add backend/app/services/email_tracking.py backend/app/api/v1/endpoints/email_tracking.py backend/app/api/v1/endpoints/email_sender.py .env.example backend/tests/test_email_unsubscribe.py backend/tests/test_email_sender_tracking.py
  git commit -m "feat: add one-click unsubscribe suppression"
  ```

### Task 6: WordPress tracking plugin and ZIP artifact

**Files:**
- Create: `integrations/wordpress/animal-love-email-tracking/animal-love-email-tracking.php`
- Create: `integrations/wordpress/animal-love-email-tracking/assets/js/tracker.js`
- Create: `integrations/wordpress/animal-love-email-tracking/readme.txt`
- Create: `integrations/wordpress/animal-love-email-tracking/tests/tracker.test.mjs`
- Create: `scripts/build_wordpress_tracking_plugin.ps1`

**Interfaces:**
- Consumes: `POST /api/v1/email-tracking/events` and the `#alc=` contract.
- Produces: WordPress settings `alc_tracker_enabled`, `alc_event_endpoint`, `alc_retention_days`; browser events from the spec; `dist/animal-love-email-tracking.zip`.

- [ ] **Step 1: Write failing browser behavior tests**

  Execute the real script inside a controlled `vm` context. Verify token extraction, token removal while preserving other fragment parameters, one event per session, interaction classification, text/plain beacon payload, fetch fallback, secure attribution cookie, and disabled/invalid endpoint behavior.

- [ ] **Step 2: Run plugin JavaScript tests and verify RED**

  Run:

  ```powershell
  node --test integrations/wordpress/animal-love-email-tracking/tests/tracker.test.mjs
  ```

  Expected: FAIL because `tracker.js` is absent.

- [ ] **Step 3: Implement the tracker script**

  Use an IIFE with a small public test surface only when `module.exports` is available. In the browser, read configuration from `window.AnimalLoveEmailTracking` localized by WordPress. Never log tokens.

- [ ] **Step 4: Run tests and verify GREEN**

  Run the Node command from Step 2. Expected: PASS.

- [ ] **Step 5: Implement the minimal WordPress plugin shell**

  Register/sanitize HTTPS endpoint and 1–90 day retention settings, enqueue the script only when enabled, and localize only endpoint/retention values. Include uninstall-safe behavior: settings remain unless the administrator explicitly removes the plugin.

- [ ] **Step 6: Validate PHP and build the ZIP**

  Run:

  ```powershell
  php -l integrations/wordpress/animal-love-email-tracking/animal-love-email-tracking.php
  powershell -ExecutionPolicy Bypass -File scripts/build_wordpress_tracking_plugin.ps1
  ```

  Expected: no PHP syntax errors and `dist/animal-love-email-tracking.zip` contains one top-level plugin directory.

- [ ] **Step 7: Commit plugin sources and build script**

  ```powershell
  git add integrations/wordpress/animal-love-email-tracking scripts/build_wordpress_tracking_plugin.ps1
  git commit -m "feat: add WordPress email tracking plugin"
  ```

### Task 7: Campaign engagement report

**Files:**
- Modify: `backend/app/services/email_tracking.py`
- Modify: `backend/app/api/v1/endpoints/email_sender.py`
- Create: `backend/tests/test_email_campaign_report.py`
- Modify: `frontend/src/features/email-sender/types.ts`
- Create: `frontend/src/features/email-sender/campaignReport.ts`
- Create: `frontend/tests/campaignReport.test.ts`
- Modify: `frontend/src/pages/CampaignDetailPage.tsx`
- Modify: `frontend/src/features/email-sender/CampaignTableWorkspace.tsx`

**Interfaces:**
- Produces: authenticated `GET /api/v1/sender/campaigns/{campaign_id}/report`.
- Produces: `CampaignReportResponse` with `summary`, `top_links`, and `recent_engagement`.

- [ ] **Step 1: Write failing backend aggregation tests**

  Seed two sent deliveries, repeated landing events, one interaction, one scanner event, and two destinations in the in-memory repository. Assert literal totals, unique counts, rate denominator, normalized link labels, ordering, and recipient masking rules.

- [ ] **Step 2: Run backend report tests and verify RED**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_campaign_report.py -q`

- [ ] **Step 3: Implement bulk summaries and detailed report query**

  Use `COUNT(DISTINCT delivery_id) FILTER (...)`. Human-likely click rate is unique deliveries with `human_interaction` divided by sent deliveries. Return zero rather than null for counts and null for a rate whose denominator is zero.

- [ ] **Step 4: Write failing frontend presentation tests**

  Test stat-card labels, zero-data state, percent formatting, top-link path formatting, and the distinction between human-likely and unconfirmed activity.

- [ ] **Step 5: Run frontend report tests and verify RED**

  Run from `frontend`: `node --test tests/campaignReport.test.ts`

- [ ] **Step 6: Implement the report page**

  Replace the current basic layout with a responsive report header, Sent/Human-likely/Unconfirmed/Suspected automation cards, top-links table, recent-engagement table, and existing email preview. Preserve loading, error, and sending-state polling behavior. Correct the breadcrumb route to `/email-sender`.

- [ ] **Step 7: Run frontend tests and build**

  Run from `frontend`:

  ```powershell
  node --test tests/campaignReport.test.ts tests/campaignPresentation.test.ts tests/campaignTableLayout.test.ts
  npm run build
  ```

  Expected: PASS/build success.

- [ ] **Step 8: Commit the report**

  ```powershell
  git add backend/app/services/email_tracking.py backend/app/api/v1/endpoints/email_sender.py backend/tests/test_email_campaign_report.py frontend/src/features/email-sender frontend/src/pages/CampaignDetailPage.tsx frontend/tests/campaignReport.test.ts
  git commit -m "feat: add campaign click engagement report"
  ```

### Task 8: Full verification, artifact inspection, and deployment guide

**Files:**
- Create: `docs/email-click-tracking-deployment.md`
- Modify if required by verification: only files already listed in Tasks 1–7.

**Interfaces:**
- Produces: operator steps for SQL migration, API variables/CORS, WordPress ZIP install, test campaign, rollback, and metric interpretation.

- [ ] **Step 1: Write the deployment guide**

  Include exact commands to apply `backend/migrations/20260827_email_tracking.sql` manually, configure `EMAIL_PUBLIC_API_BASE_URL`, `EMAIL_TRACKING_ALLOWED_ORIGINS`, `EMAIL_TRACKING_ALLOWED_HOSTS`, and `EMAIL_TRACKING_IP_HASH_KEY`, install/configure the ZIP, run a one-recipient canary, confirm Gmail headers, and disable tracking without uninstalling the plugin.

- [ ] **Step 2: Run the complete backend suite**

  Run: `backend\venv\Scripts\python.exe -m pytest backend/tests -q`

  Expected: all tests PASS.

- [ ] **Step 3: Run the complete frontend unit suite and build**

  Run from `frontend`:

  ```powershell
  node --test tests/*.test.ts
  npm run build
  ```

  Expected: all tests PASS and production build succeeds.

- [ ] **Step 4: Run plugin verification**

  Run:

  ```powershell
  node --test integrations/wordpress/animal-love-email-tracking/tests/tracker.test.mjs
  php -l integrations/wordpress/animal-love-email-tracking/animal-love-email-tracking.php
  powershell -ExecutionPolicy Bypass -File scripts/build_wordpress_tracking_plugin.ps1
  ```

  Inspect the ZIP listing and confirm no test files, secrets, local paths, or build metadata are present.

- [ ] **Step 5: Run security and privacy checks**

  Search generated HTML/fixtures and the ZIP for test email addresses, raw tokens, `.env`, credentials, and `token_*.json`. Exercise disallowed origin, invalid token, scanner GET on unsubscribe, and a suppressed recipient through automated tests.

- [ ] **Step 6: Commit docs and final corrections**

  ```powershell
  git add docs/email-click-tracking-deployment.md
  git commit -m "docs: add email tracking deployment guide"
  ```

- [ ] **Step 7: Review integration state**

  Run `git status --short`, `git log --oneline -8`, and inspect the diff against the starting commit. Do not push, apply the live migration, or install the plugin without explicit user authorization.
