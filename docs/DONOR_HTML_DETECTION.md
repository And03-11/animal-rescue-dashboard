# Automatic donor wording in HTML templates

Pasting HTML into **Templates → Create/Edit template** automatically detects the current donor thank-you phrase, replaces its text with `{{Day}}`, and fills the singular/plural donor phrase settings. **Detect donor wording** runs the same analysis on existing HTML. Ordinary typing and loading a saved template do not automatically rewrite it.

Known date/count phrases use local rules. Other donor wording can use OpenAI. The model receives only visible text from the first note, up to 1,200 characters; it returns an exact text fragment and two plain-text phrases. It never returns replacement HTML. Source offsets identify the text to change without serializing the HTML, leaving all surrounding bytes, tags, styles, images and links intact.

Quoted/forwarded notes, hidden preheaders, comments, script/style content and attributes are excluded. Multiple candidates, unverifiable AI output, and phrases spanning HTML formatting remain unchanged for manual placement. Existing `{{Day}}` keeps the saved phrase settings. **Undo** restores the original HTML and donor phrases. Editing the HTML or phrases cancels pending analysis; an old response cannot overwrite newer edits. Saving waits until detection finishes.

## Backend configuration

```dotenv
OPENAI_API_KEY=your-existing-server-side-key
DONOR_PHRASE_MODEL=gpt-4.1-mini
DONOR_PHRASE_AI_ENABLED=true
```

The key stays on the server. Rules work without a key. A missing/disabled key, timeout, refusal or invalid result leaves the pasted HTML intact and returns a manual-configuration message. AI requests have a 12-second timeout and no automatic retries; only explicitly retried detection creates another request. They are performed during template preparation, never per recipient.

The authenticated, non-persisting endpoint is `POST /api/v1/templates/detect-donor-phrase`, accepting `{ "content": "..." }` up to 1,000,000 characters. Statuses are `matched`, `already_configured`, `not_found`, `needs_review`, and `ai_unavailable`. Successful results contain the changed HTML and both phrase settings. Detection does not create templates or send emails.

No additional migration is needed for detection itself. The existing donor-personalization feature requires `backend/migrations/20261123_donor_personalization.sql` and coordinated frontend/backend deployment. Singular/plural selections remain stored as phrase strings, including custom AI wording shown under **Other**.

## Validation

- Backend: `backend/tests/test_donor_phrase_detection.py`, `test_donor_templates_api.py`, `test_donor_personalization.py`; run with `SCHEDULER_ENABLED=false`.
- Frontend: `npm test -- --threads false`, targeted ESLint and `npm run build`.
- Rules were evaluated against a bounded 140-DNR corpus: 94 automatic matches, with all tags preserved across all 140 samples. Remaining samples were left unchanged in this rules-only evaluation; AI was not called on the corpus.
- A synthetic unfamiliar phrase was checked against the live AI integration and through the isolated local template UI. Paste, Undo, singular/plural preview and saving were verified without a production database, scheduler or email sender.
