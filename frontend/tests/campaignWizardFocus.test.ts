import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const focus = await import(
  '../src/features/email-sender/campaignWizardFocus.ts'
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
