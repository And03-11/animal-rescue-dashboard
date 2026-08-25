import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const focus = await import(
  '../src/features/email-sender/campaignWizardFocus.ts'
).catch(() => null);

const wizardState = await import(
  '../src/features/email-sender/campaignWizardState.ts'
).catch(() => null);

test('every wizard validation message maps to its relevant focus target', () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  const cases = [
    ['Select at least one Airtable audience.', 'audienceMatrix'],
    ['Select no more than four Airtable audiences.', 'audienceMatrix'],
    ['Refresh the Airtable audience preview before continuing.', 'audienceMatrix'],
    ['Please select a CSV file.', 'csvFile'],
    ['Wait for the CSV preview to finish loading.', 'csvFile'],
    ['The CSV must be previewed before continuing.', 'csvFile'],
    ['Select the column containing email addresses.', 'csvEmailColumn'],
    ['Select the column containing recipient names.', 'csvNameColumn'],
    ['Email and name must be mapped to different columns.', 'csvEmailColumn'],
    ['Select a sender group.', 'senderGroup'],
    ['Select at least one sender account.', 'senderAccounts'],
    ['Select a sender mode.', 'senderMode'],
    ['Campaign name is required.', 'campaignName'],
    ['Email subject is required.', 'subject'],
    ['Cannot schedule a campaign with zero recipients.', 'schedule'],
    ['Email body is required.', 'emailBody'],
  ] as const;

  for (const [message, expected] of cases) {
    assert.equal(
      focus.focusTargetForValidationError(message),
      expected,
      `wrong focus target for: ${message}`,
    );
  }
  assert.equal(
    focus.focusTargetForValidationError('Unexpected API failure.'),
    'errorAlert',
  );
});

test('successful transitions focus the semantic container for each step', () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  assert.equal(focus.focusTargetForStep(0), 'stepAudience');
  assert.equal(focus.focusTargetForStep(1), 'stepSetup');
  assert.equal(focus.focusTargetForStep(2), 'stepContent');
});

test('scheduled focus resolves targets only inside the supplied dialog root', () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  let queued: (() => void) | null = null;
  let focused = 0;
  const selectors: string[] = [];
  const scheduler = {
    request(callback: () => void) {
      queued = callback;
      return 7;
    },
    cancel() {},
  };
  const root = {
    querySelector(selector: string) {
      selectors.push(selector);
      return { focus: () => { focused += 1; } };
    },
  };

  focus.scheduleWizardFocus({
    scheduler,
    getRoot: () => root,
    target: 'campaignName',
    isCurrent: () => true,
  });

  assert.equal(focused, 0, 'focus must wait until after the next render frame');
  assert.ok(queued, 'focus callback was not scheduled');
  (queued as () => void)();
  assert.deepEqual(selectors, [`#${focus.WIZARD_FOCUS_TARGET_IDS.campaignName}`]);
  assert.equal(focused, 1);
});

test('cancelling scheduled focus prevents stale callbacks after close or unmount', () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  let queued: (() => void) | null = null;
  const cancelledHandles: unknown[] = [];
  let focused = 0;
  const cancel = focus.scheduleWizardFocus({
    scheduler: {
      request(callback: () => void) {
        queued = callback;
        return 'focus-handle';
      },
      cancel(handle: unknown) {
        cancelledHandles.push(handle);
      },
    },
    getRoot: () => ({
      querySelector: () => ({ focus: () => { focused += 1; } }),
    }),
    target: 'stepSetup',
    isCurrent: () => true,
  });

  cancel();
  assert.deepEqual(cancelledHandles, ['focus-handle']);
  assert.ok(queued, 'focus callback was not scheduled');
  (queued as () => void)();
  assert.equal(focused, 0);
});

test('a stale session generation cannot resolve or focus a target', () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  let queued: (() => void) | null = null;
  let queried = false;
  focus.scheduleWizardFocus({
    scheduler: {
      request(callback: () => void) {
        queued = callback;
        return 8;
      },
      cancel() {},
    },
    getRoot: () => ({
      querySelector: () => {
        queried = true;
        return { focus() {} };
      },
    }),
    target: 'errorAlert',
    isCurrent: () => false,
  });

  assert.ok(queued, 'focus callback was not scheduled');
  (queued as () => void)();
  assert.equal(queried, false);
});

test('real wizard JSX wires every target to scoped focus and semantic regions', async () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  const files = [
    'CampaignWizard.tsx',
    'AudienceStep.tsx',
    'CampaignSetupStep.tsx',
    'ContentReviewStep.tsx',
  ];
  const sources = await Promise.all(files.map((file) => readFile(
    new URL(`../src/features/email-sender/${file}`, import.meta.url),
    'utf8',
  )));
  const [wizardSource] = sources;
  const componentSource = sources.join('\n');

  for (const target of Object.keys(focus.WIZARD_FOCUS_TARGET_IDS)) {
    assert.match(
      componentSource,
      new RegExp(`WIZARD_FOCUS_TARGET_IDS\\.${target}\\b`),
      `real JSX does not wire focus target: ${target}`,
    );
  }
  assert.match(wizardSource, /scheduleWizardFocus\s*\(/);
  assert.match(wizardSource, /getRoot:\s*\(\)\s*=>\s*dialogPaperRef\.current/);
  assert.doesNotMatch(componentSource, /document\.querySelector/);
  assert.match(componentSource, /role="alert"/);
  assert.match(componentSource, /tabIndex=\{-1\}/);
  assert.match(componentSource, /aria-label=\{STEPS\[activeStep\]\}/);
});

function validDraft() {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const audiences = [{ region: 'USA' as const, is_bounced: false }];
  return {
    sourceType: 'airtable' as const,
    audiences,
    segment: 'standard' as const,
    audiencePreview: {
      branches: [{ region: 'USA' as const, is_bounced: false, count: 2 }],
      total_unique: 2,
    },
    audiencePreviewStale: false,
    audiencePreviewKey: wizardState.computeAudiencePreviewKey(audiences, 'standard'),
    senderMode: 'all' as const,
    selectedGroup: '',
    selectedAccounts: [],
    campaignName: 'Campaign',
    subject: 'Subject',
    htmlBody: '<p>Body</p>',
    scheduledAt: null,
    csvFile: null,
  };
}

test('real step validators produce messages with the relevant focus plan', () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const base = validDraft();
  const cases = [
    [0, { ...base, audiences: [], audiencePreview: null }, 'audienceMatrix'],
    [0, { ...base, audiencePreviewStale: true }, 'audienceMatrix'],
    [0, { ...base, sourceType: 'csv', csvFile: null }, 'csvFile'],
    [1, { ...base, senderMode: 'group', selectedGroup: '' }, 'senderGroup'],
    [1, { ...base, senderMode: 'manual', selectedAccounts: [] }, 'senderAccounts'],
    [1, { ...base, senderMode: 'legacy' }, 'senderMode'],
    [1, { ...base, campaignName: '' }, 'campaignName'],
    [1, { ...base, subject: '' }, 'subject'],
    [1, {
      ...base,
      audiencePreview: { branches: [], total_unique: 0 },
      scheduledAt: '2026-08-25T12:00:00.000Z',
    }, 'schedule'],
    [2, { ...base, htmlBody: '' }, 'emailBody'],
  ] as const;

  for (const [step, draft, target] of cases) {
    const message = wizardState.validateWizardStep(step, draft);
    assert.ok(message, `scenario for step ${step} did not produce an error`);
    assert.equal(focus.focusPlanForValidationError(message).target, target);
  }
});

test('real CSV validators and producer constants map to the visible upload or mapping control', () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const base = {
    ...validDraft(),
    sourceType: 'csv' as const,
    csvFile: { name: 'contacts.csv', type: 'text/csv' } as File,
  };
  const preview = {
    columns: ['Email', 'Name'],
    preview_row: ['ada@example.com', 'Ada'],
    has_header: true,
  };
  const cases = [
    [wizardState.validateCsvMapping(base, true), 'csvFile'],
    [wizardState.validateCsvMapping(base, false), 'csvFile'],
    [wizardState.validateCsvMapping({ ...base, csvPreview: preview, csvMapping: { email: '', name: 'Name', has_header: true } }, false), 'csvEmailColumn'],
    [wizardState.validateCsvMapping({ ...base, csvPreview: preview, csvMapping: { email: 'Email', name: '', has_header: true } }, false), 'csvNameColumn'],
    [wizardState.validateCsvMapping({ ...base, csvPreview: preview, csvMapping: { email: 'Email', name: 'Email', has_header: true } }, false), 'csvEmailColumn'],
    [wizardState.validateCsvFileSelection({ name: 'contacts.txt', type: 'text/plain' }), 'csvFile'],
    [wizardState.validateCsvContent('   '), 'csvFile'],
    [wizardState.CAMPAIGN_WIZARD_CSV_ERRORS.readFailure, 'csvFile'],
  ] as const;

  for (const [message, target] of cases) {
    assert.ok(message, `CSV scenario for ${target} did not produce an error`);
    assert.equal(focus.focusPlanForValidationError(message).target, target);
  }
  assert.equal(
    focus.focusPlanForValidationError(
      wizardState.CAMPAIGN_WIZARD_VALIDATION_MESSAGES.tooManyAudiences,
    ).target,
    'audienceMatrix',
  );
});

test('body validation requests code mode before focus and falls back to the alert', () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const message = wizardState.validateWizardStep(2, { ...validDraft(), htmlBody: '' });
  assert.ok(message, 'blank body did not produce an error');
  assert.deepEqual(focus.focusPlanForValidationError(message), {
    target: 'emailBody',
    viewMode: 'code',
    fallbackTarget: 'errorAlert',
  });
});

test('scheduled focus falls back inside the dialog when a conditional target is absent', () => {
  assert.ok(focus, 'campaign wizard focus module is missing');
  let queued: (() => void) | null = null;
  let focused = 0;
  const selectors: string[] = [];
  focus.scheduleWizardFocus({
    scheduler: {
      request(callback: () => void) {
        queued = callback;
        return 9;
      },
      cancel() {},
    },
    getRoot: () => ({
      querySelector(selector: string) {
        selectors.push(selector);
        if (selector === `#${focus.WIZARD_FOCUS_TARGET_IDS.errorAlert}`) {
          return { focus: () => { focused += 1; } };
        }
        return null;
      },
    }),
    target: 'emailBody',
    fallbackTarget: 'errorAlert',
    isCurrent: () => true,
  });

  assert.ok(queued, 'focus callback was not scheduled');
  (queued as () => void)();
  assert.deepEqual(selectors, [
    `#${focus.WIZARD_FOCUS_TARGET_IDS.emailBody}`,
    `#${focus.WIZARD_FOCUS_TARGET_IDS.errorAlert}`,
  ]);
  assert.equal(focused, 1);
});

test('real JSX orders body-mode mounting before focus and routes every CSV producer', async () => {
  const [wizardSource, audienceSource] = await Promise.all([
    readFile(new URL('../src/features/email-sender/CampaignWizard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/email-sender/AudienceStep.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(
    wizardSource,
    /const focusPlan = focusPlanForValidationError\(message\);[\s\S]*setError\(message\);[\s\S]*if \(focusPlan\.viewMode\) setViewMode\(focusPlan\.viewMode\);[\s\S]*requestFocus\(focusPlan\.target, session, focusPlan\.fallbackTarget\);/,
    'body-required view mounting must be requested before focus scheduling',
  );
  assert.match(wizardSource, /onCsvError=\{showValidationError\}/);
  assert.doesNotMatch(wizardSource, /onErrorChange=\{setError\}/);

  assert.match(audienceSource, /const fileError = validateCsvFileSelection\(file\);/);
  assert.match(audienceSource, /if \(fileError\)[\s\S]*onCsvError\(fileError\);/);
  assert.match(audienceSource, /CAMPAIGN_WIZARD_CSV_ERRORS\.readFailure/);
  assert.match(audienceSource, /const contentError = validateCsvContent\(text\);/);
  assert.match(audienceSource, /if \(contentError\)[\s\S]*onError\(contentError\);/);
  assert.match(audienceSource, /onCsvError\(message\);/);
  assert.doesNotMatch(audienceSource, /onErrorChange\(message\);/);
  assert.match(
    audienceSource,
    /id=\{WIZARD_FOCUS_TARGET_IDS\.csvFile\}[\s\S]*role="group"[\s\S]*tabIndex=\{-1\}[\s\S]*aria-labelledby="campaign-wizard-csv-upload-label"/,
    'visible CSV drop group must be the labelled programmatic focus target',
  );
});
