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
