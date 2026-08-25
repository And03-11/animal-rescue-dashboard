# Task 8 implementer report

## Status

Complete. Base was `5585fcba7306cb5fbcc4c6a97be911b4718df045`; the intended implementation commit is `feat: replace campaign form with guided wizard`.

## Architecture and behavior preservation

- `CampaignWizard` is the sole owner of `CampaignWizardDraft`, current step, sender/template loading, audience preview, save/test/template async state, inline errors, and success notices. It delegates selection invalidation, step validation, edit hydration, deterministic preview identity, and final payload construction to the Task 6/7 helpers.
- `AudienceStep` renders the source and segment controls, semantic Airtable branch matrix, exact replacement shortcuts, server branch/unique counts, and the existing CSV drag/drop, local preview, auto-mapping, mapping validation, edit preview, and warning flow. Airtable preview is called only from the Audience Continue action, uses a 15-second timeout, retains state on failure, and stores the deterministic request key before advancing.
- `CampaignSetupStep` preserves all/group/manual sender modes and account/group choices, campaign name, subject, and optional schedule. Airtable zero-recipient previews disable the schedule picker with the required Draft guidance; Task 7 validation independently blocks any retained zero-recipient schedule.
- `ContentReviewStep` preserves template load/save, HTML edit/preview, `EmailPreview`, and campaign/ad-hoc send-test behavior. Template summaries fetch full content on selection. Review values use `summarizeAudienceSelection` plus one precomputed segment, sender, and schedule label set.
- `EmailSenderPage` keeps the existing save callback, CSV create/upload/mapping pipeline, campaign fetch/polling, pagination, launch, pause/resume, edit, delete, and snackbar behavior. Save failures now reject back to the wizard so the modal remains open with an actionable inline error.

## Skill-driven UI decisions

- Used the existing MUI/theme system for a neutral authenticated workspace: one primary footer action, restrained outlined surfaces, concise copy, and an 8px-derived spacing rhythm.
- The desktop dialog is task-sized at `maxWidth="lg"`; narrow screens use a full-screen sheet. The title/Stepper and actions remain fixed while only `DialogContent` scrolls.
- Shortcut/tool groups wrap, responsive grids stack before shrinking, and all flex/grid children use bounded or `minWidth: 0` layouts to avoid horizontal overflow at 320px, 768px, and zoomed narrow viewports.
- Airtable choices use fieldsets/legends and semantically labelled checkboxes. MUI supplies focus trapping, Escape/return-focus behavior, focus-visible states, and disabled/loading states.

## Files and staged hunks

- Added `frontend/src/features/email-sender/CampaignWizard.tsx`.
- Added `frontend/src/features/email-sender/AudienceStep.tsx`.
- Added `frontend/src/features/email-sender/CampaignSetupStep.tsx`.
- Added `frontend/src/features/email-sender/ContentReviewStep.tsx`.
- Task-owned `EmailSenderPage.tsx` hunks remove the inline `CampaignForm` and its imports/interfaces, add `CampaignWizard`, replace the legacy campaign dialog block, and propagate save failures to the wizard.
- Added this report.
- Because `EmailSenderPage.tsx` contained extensive pre-existing dirty work, its Task 8 version is staged through a verified index blob based on the recorded base. The unrelated current table/pagination/API-error refactors remain in the working tree and are not staged.

## Verification

- `node --test tests/audienceSelection.test.ts tests/campaignWizardState.test.ts` — exit 0, 20/20 tests passed.
- `npm exec eslint -- src/features/email-sender/CampaignWizard.tsx src/features/email-sender/AudienceStep.tsx src/features/email-sender/CampaignSetupStep.tsx src/features/email-sender/ContentReviewStep.tsx src/pages/EmailSenderPage.tsx` — exit 0 with no warnings or unused imports.
- `npm run build` — exit 0; `tsc -b` and Vite production build completed. Vite emitted only the existing large-chunk advisory.
- The behavior-critical selection/state/payload contracts were already established by the Task 6/7 red-green suites; Task 8 adds UI extraction/wiring without duplicating those business rules.

## Self-review / concerns

- No new dependency was added, and Task 8 components depend only on files present at the recorded base plus existing frontend libraries/components.
- Browser visual verification remains assigned to Task 10 by the ledger. This task verified responsive layout rules by code inspection, focused lint, TypeScript, and the production build.
- Existing unrelated dirty and untracked files remain untouched and unstaged.

## Review round 1 — RED/GREEN

1. **CSV edit save contract**
   - RED: the reviewed callback returned after `/save-mapping` whenever an existing CSV edit supplied mapping, so the later campaign `PUT` never ran. The new orchestration suite was first run without an implementation module and failed all four assertions (exit 1), including the required edit and create ordering.
   - GREEN: `planCampaignSave` is now the single ordered flow decision. Existing CSV edits produce `update-campaign -> save-mapping` (and upload between them only when a replacement file exists); new CSV campaigns produce `create-campaign -> upload-csv -> save-mapping`. The page executes that plan with the full campaign payload and one campaign ID, preserving Airtable create/update behavior.

2. **Fatal edit hydration**
   - RED: a details-load rejection cleared the loading flag but left the default draft and normal footer active against the existing ID.
   - GREEN: the wizard now records `loading`, `ready`, or `failed` hydration. A failed edit exposes only a persistent error with Retry and Close; step navigation and final save remain disabled until a guarded retry successfully hydrates the draft.

3. **Wizard async session isolation**
   - RED: audience preview and several template/test calls had no open/campaign session identity, so a closed session could complete into a reopened wizard.
   - GREEN: `WizardSessionLifecycle` gives every open/retry/ID generation its own `AbortController`. Begin, retry, close, ID change, reopen, and effect cleanup abort/invalidate older handles. Audience preview, credentials, templates, detail/CSV hydration, template load/save, send-test, and parent save all receive the active signal and gate success, error, loading, and navigation mutations on current-session identity. The lifecycle test proves begin and explicit abort invalidate every older handle.

4. **CSV FileReader isolation**
   - RED: each file selection created an untracked reader whose callbacks could overwrite the current file's preview and mapping after a later selection or unmount.
   - GREEN: `AudienceStep` aborts the previous reader, increments a per-read generation, and accepts callbacks only from the current reader/generation. Source switch and unmount invalidate/abort the reader; invalid/read-error paths clear the file preview/mapping and loading state, so file B cannot be saved with file A's columns.

5. **Exact committed lint gate**
   - RED: the reviewed committed page contained 12 explicit `any` occurrences at the reported locations; the prior success came from a dirty configuration that downgraded the rule.
   - GREEN: the Task 8 page index blob is derived from the exact prior commit and replaces all 12 occurrences with campaign/API/error domain types. An archive of staged source tree `f5dbef6d0058ccfc402d8f3e038a1c4b4cf1d9eb`, using the committed ESLint configuration, passed the mandated five-file command with `FIVE_FILE_ESLINT_EXIT=0`; the new orchestration helper separately passed with `HELPER_ESLINT_EXIT=0`. No lint/config/package dependency change is staged.

## Review round 1 files and commit scope

- Modified `CampaignWizard.tsx` for fatal hydration, retry/close, session generations, abort signals, and guarded async completions.
- Modified `AudienceStep.tsx` for tracked, abortable, generation-gated CSV reads and stale-state cleanup.
- Added `campaignWizardOrchestration.ts` and `campaignWizardOrchestration.test.ts` for save ordering and session lifecycle contracts.
- Staged only the Task 8 `EmailSenderPage.tsx` save-order/type hunks through verified blob `3b5f5dbb25a5337ceae35bc6c3a484a87e851c06`; the page's unrelated dirty workspace refactors remain unstaged.
- This report update and those five implementation/test paths are the complete intended scope of `fix: harden campaign wizard sessions and CSV edits`.

## Review round 1 verification

- RED: `node --test tests/campaignWizardOrchestration.test.ts` — exit 1, 0/4 passed before the helper existed.
- GREEN exact staged snapshot: `node --test tests/audienceSelection.test.ts tests/campaignWizardState.test.ts tests/campaignWizardOrchestration.test.ts` — exit 0, 24/24 passed.
- GREEN exact staged snapshot: mandated ESLint on `EmailSenderPage.tsx`, `CampaignWizard.tsx`, `AudienceStep.tsx`, `CampaignSetupStep.tsx`, and `ContentReviewStep.tsx` — exit 0; helper ESLint — exit 0.
- Exact staged TypeScript first exposed four legacy-page typing errors after removing `any`; the equivalent typed expressions were corrected. Rerun: `tsc -p tsconfig.app.json --noEmit` — exit 0.
- GREEN exact staged snapshot: `npm run build` — exit 0; `tsc -b`, 13,171 transformed modules, and the Vite production bundle completed.
- `git diff --cached --check` is required again immediately before commit.

## Review round 1 self-review / concerns

- No component-test DOM runtime is installed. The save/session contracts are covered by dependency-free tests; fatal hydration and FileReader callback gating were verified through focused lint, TypeScript, exact diff review, and production build. Browser interaction remains part of Task 10.
- Cancel intentionally remains enabled while preview/save work is active; it synchronously aborts and invalidates the session before delegating close.
- Existing unrelated dirty and untracked files are preserved and excluded from the index.

## Review round 2 — parent ID/session coupling

### RED / root cause

- The exact committed page assigned the create response to `campaignId` and immediately called `setEditingCampaignId(campaignId)` before `upload-csv` and `save-mapping`. That parent state changed `CampaignWizard.initialCampaignId`; the wizard correctly treated it as a new identity, aborted the signal used by the same save, and rehydrated the incomplete server campaign.
- The integration regression was added before the executor. `node --test tests/campaignWizardOrchestration.test.ts` exited 1: the four prior tests passed and all three new parent-publisher tests failed because `executeCampaignSavePlan` was missing.

### GREEN / architecture and behavior preservation

- `executeCampaignSavePlan` now owns the complete ordered operation sequence and keeps a newly returned ID inside its local execution scope. An optional ID publisher runs only after every operation succeeds; the page intentionally supplies no publisher because success immediately closes the wizard.
- `EmailSenderPage` no longer calls `setEditingCampaignId` after create. It passes the same wizard signal through create, upload, and mapping, receives the final ID only after the plan completes, then shows success, closes, clears the parent ID, and refreshes campaigns.
- Upload or mapping rejection occurs before publication. The page leaves the parent ID unchanged (`null` for a new campaign), keeps the same open wizard generation and CSV file/preview/mapping draft, clears transient snackbar copy, and rethrows so the existing inline actionable error remains visible.
- Existing CSV edits still execute `update-campaign -> save-mapping`; new CSV campaigns still execute `create-campaign -> upload-csv -> save-mapping`; Airtable remains one create/update operation. No sender, template, editor, send-test, schedule, preview, hydration, pagination, launch, edit, or delete behavior changed.

### Regression coverage

- The success integration test creates a real `WizardSessionLifecycle`/`AbortController`, simulates a parent ID publisher by beginning a new session, and asserts the ID stays unpublished and the original signal stays live during create, upload, and mapping. Publication and the resulting abort occur only after the final mapping completes.
- Separate upload and mapping failure cases assert rejection, exact operation cutoff, no ID publication, no signal abort, and continued current-session identity.

### Files and commit scope

- Modified `campaignWizardOrchestration.ts` with the dependency-free atomic executor.
- Extended `campaignWizardOrchestration.test.ts` with three integration-level parent-session regressions.
- Staged only the precise `EmailSenderPage.tsx` import/save-handler changes through exact base-derived blob `010ca6757609baabeadf27e85fba3004f5a08c3a`; unrelated dirty page/table/pagination work remains unstaged.
- This report update plus those three implementation/test paths are the complete intended scope of `fix: keep CSV creation in one wizard session`.

### Exact-snapshot verification

- Exact staged source tree: `d7586bb72657fb8e06532dabf4a826df35ce5e91`.
- Task 6/7/8 Node command — exit 0, 27/27 passed.
- Mandated five-file ESLint — exit 0; orchestration helper/test ESLint — exit 0, using the committed configuration.
- `tsc -p tsconfig.app.json --noEmit` — exit 0.
- `npm run build -- --logLevel silent` — exit 0; `tsc -b` and Vite completed.
- `git diff --cached --check` is required again immediately before commit.

### Self-review / concerns

- No DOM component-test runtime is installed; the parent-ID effect is covered at the dependency-free executor/session boundary and the real page consumes that same executor.
- If create succeeds but upload or mapping fails, the backend may retain its pre-existing incomplete draft. This fix deliberately does not publish or hydrate that ID; cleanup/reuse would require a separate backend contract. The user-facing wizard session and local CSV state remain recoverable.
- No dependency, package, lockfile, ESLint configuration, plan, specification, or ledger change is included.
