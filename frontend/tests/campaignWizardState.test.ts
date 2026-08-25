import assert from 'node:assert/strict';
import test from 'node:test';

const wizardState = await import(
  '../src/features/email-sender/campaignWizardState.ts'
).catch(() => null);

const baseDraft = () => ({
  sourceType: 'airtable' as const,
  audiences: [{ region: 'USA' as const, is_bounced: false }],
  segment: 'standard' as const,
  audiencePreview: {
    branches: [{ region: 'USA' as const, is_bounced: false, count: 2 }],
    total_unique: 2,
  },
  audiencePreviewStale: false,
  senderMode: 'all' as const,
  selectedGroup: '',
  selectedAccounts: [],
  campaignName: 'Campaign',
  subject: 'Subject',
  htmlBody: '<p>Body</p>',
  scheduledAt: null,
  csvFile: null,
});

test('audience step requires branches and a fresh preview', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  assert.equal(wizardState.validateWizardStep(0, {
    ...baseDraft(),
    audiences: [],
    segment: 'standard',
    audiencePreview: null,
    audiencePreviewStale: true,
  }), 'Select at least one Airtable audience.');
});

test('audience step rejects stale previews after a selection change', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  assert.equal(wizardState.validateWizardStep(0, {
    ...baseDraft(),
    audiencePreviewStale: true,
  }), 'Refresh the Airtable audience preview before continuing.');
});

test('audience preview identity rejects direct audience mutation', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const originalAudiences = baseDraft().audiences;
  const previewKey = wizardState.computeAudiencePreviewKey(originalAudiences, 'standard');
  assert.equal(wizardState.validateWizardStep(0, {
    ...baseDraft(),
    audiences: [{ region: 'EUR', is_bounced: false }],
    audiencePreviewKey: previewKey,
  }), 'Refresh the Airtable audience preview before continuing.');
});

test('audience preview identity rejects direct segment mutation', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const previewKey = wizardState.computeAudiencePreviewKey(baseDraft().audiences, 'standard');
  assert.equal(wizardState.validateWizardStep(0, {
    ...baseDraft(),
    segment: 'dnr',
    audiencePreviewKey: previewKey,
  }), 'Refresh the Airtable audience preview before continuing.');
});

test('matching preview identity accepts fresh preview and ignores branch ordering', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const previewKey = wizardState.computeAudiencePreviewKey([
    { region: 'EUR', is_bounced: true },
    { region: 'USA', is_bounced: false },
  ], 'dnr');
  assert.equal(previewKey, wizardState.computeAudiencePreviewKey([
    { region: 'USA', is_bounced: false },
    { region: 'EUR', is_bounced: true },
  ], 'dnr'));
  assert.equal(wizardState.validateWizardStep(0, {
    ...baseDraft(),
    audiences: [
      { region: 'EUR', is_bounced: true },
      { region: 'USA', is_bounced: false },
    ],
    segment: 'dnr',
    audiencePreviewKey: previewKey,
  }), null);
});

test('sender step validates group and manual selections', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  assert.equal(wizardState.validateWizardStep(1, {
    ...baseDraft(),
    senderMode: 'group',
    selectedGroup: '',
  }), 'Select a sender group.');
  assert.equal(wizardState.validateWizardStep(1, {
    ...baseDraft(),
    senderMode: 'manual',
    selectedAccounts: [],
  }), 'Select at least one sender account.');
});

test('sender step validates campaign name, subject, and zero-recipient scheduling', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  assert.equal(wizardState.validateWizardStep(1, {
    ...baseDraft(),
    campaignName: '  ',
  }), 'Campaign name is required.');
  assert.equal(wizardState.validateWizardStep(1, {
    ...baseDraft(),
    subject: '',
  }), 'Email subject is required.');
  assert.equal(wizardState.validateWizardStep(1, {
    ...baseDraft(),
    audiencePreview: { branches: [], total_unique: 0 },
    scheduledAt: '2026-08-25T12:00:00.000Z',
  }), 'Cannot schedule a campaign with zero recipients.');
  assert.equal(wizardState.validateWizardStep(1, {
    ...baseDraft(),
    audiencePreview: { branches: [], total_unique: 0 },
    scheduledAt: null,
  }), null);
});

test('blank scheduled timestamps are Draft-valid and payload-null', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const draft = {
    ...baseDraft(),
    audiencePreview: { branches: [], total_unique: 0 },
    scheduledAt: '   ',
  };
  assert.equal(wizardState.validateWizardStep(1, draft), null);
  assert.equal(wizardState.buildCampaignPayload(draft).scheduled_at, null);
});

test('CSV source ignores retained Airtable zero preview state', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const csvFile = { name: 'recipients.csv' } as unknown as File;
  const draft = {
    ...baseDraft(),
    sourceType: 'csv' as const,
    csvFile,
    audiencePreview: { branches: [], total_unique: 0 },
    audiencePreviewStale: false,
    audiencePreviewKey: 'old-airtable-preview',
    scheduledAt: '2026-08-25T12:00:00.000Z',
  };
  assert.equal(wizardState.validateWizardStep(0, draft), null);
  assert.equal(wizardState.validateWizardStep(1, draft), null);
  const payload = wizardState.buildCampaignPayload(draft);
  assert.equal(payload.scheduled_at, '2026-08-25T12:00:00.000Z');
  assert.equal('audiences' in payload, false);
  assert.equal('segment' in payload, false);
});

test('body step requires HTML content', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  assert.equal(wizardState.validateWizardStep(2, {
    ...baseDraft(),
    htmlBody: '  ',
  }), 'Email body is required.');
});

test('payload keeps all selected branches and one segment', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const payload = wizardState.buildCampaignPayload({
    ...baseDraft(),
    audiences: [
      { region: 'USA', is_bounced: false },
      { region: 'EUR', is_bounced: true },
    ],
    segment: 'dnr',
    audiencePreview: {
      branches: [
        { region: 'USA', is_bounced: false, count: 17 },
        { region: 'EUR', is_bounced: true, count: 49 },
      ],
      total_unique: 66,
    },
    campaignName: 'Combined audience',
    subject: 'A subject',
    htmlBody: '<p>Hello</p>',
  });
  assert.deepEqual(payload.audiences, [
    { region: 'USA', is_bounced: false },
    { region: 'EUR', is_bounced: true },
  ]);
  assert.equal(payload.segment, 'dnr');
  assert.equal('region' in payload, false);
  assert.equal('is_bounced' in payload, false);
  assert.equal(payload.sender_config, 'all');
});

test('payload maps group and manual sender branches immutably', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const group = wizardState.buildCampaignPayload({
    ...baseDraft(),
    senderMode: 'group',
    selectedGroup: 'fundraising',
  });
  assert.equal(group.sender_config, 'fundraising');
  const accounts = [{ id: 'a-1', group: 'fundraising' }];
  const manual = wizardState.buildCampaignPayload({
    ...baseDraft(),
    senderMode: 'manual',
    selectedAccounts: accounts,
  });
  assert.deepEqual(manual.sender_config, ['a-1']);
  assert.notStrictEqual(manual.sender_config, accounts);
});

test('CSV payload is source-specific and only includes a new upload', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const csvFile = { name: 'recipients.csv' } as unknown as File;
  const fresh = wizardState.buildCampaignPayload({
    ...baseDraft(),
    sourceType: 'csv',
    csvFile,
    campaignId: null,
  });
  assert.equal(fresh.csvFile, csvFile);
  assert.equal('audiences' in fresh, false);
  assert.equal('segment' in fresh, false);
  const edit = wizardState.buildCampaignPayload({
    ...baseDraft(),
    sourceType: 'csv',
    csvFile,
    campaignId: 'campaign-1',
  });
  assert.equal('csvFile' in edit, false);
  assert.equal('audiences' in edit, false);
  assert.equal('segment' in edit, false);
});

test('audience preview invalidation is immutable', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const draft = {
    ...baseDraft(),
    audiencePreviewKey: wizardState.computeAudiencePreviewKey(baseDraft().audiences, 'standard'),
  };
  const invalidated = wizardState.invalidateAudiencePreview(draft);
  assert.equal(invalidated.audiencePreview, null);
  assert.equal(invalidated.audiencePreviewKey, null);
  assert.equal(invalidated.audiencePreviewStale, true);
  assert.equal(draft.audiencePreviewStale, false);
  assert.notStrictEqual(invalidated, draft);
});

test('legacy hydration preserves source, sender, schedule, template, and content state', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const draft = wizardState.hydrateCampaignWizardDraft({
    id: 'campaign-7',
    campaign_name: 'Legacy campaign',
    source_type: 'airtable',
    subject: 'Legacy subject',
    html_body: '<p>Legacy body</p>',
    sender_config: ['acct-1', 'acct-2'],
    scheduled_at: '2026-08-26T15:00:00.000Z',
    region: 'EUR',
    is_bounced: true,
    segment: 'dnr',
    template_id: 'template-2',
  });
  assert.equal(draft.campaignId, 'campaign-7');
  assert.equal(draft.sourceType, 'airtable');
  assert.deepEqual(draft.audiences, [{ region: 'EUR', is_bounced: true }]);
  assert.equal(draft.segment, 'dnr');
  assert.equal(draft.senderMode, 'manual');
  assert.deepEqual(draft.selectedAccounts, [
    { id: 'acct-1', group: '' },
    { id: 'acct-2', group: '' },
  ]);
  assert.equal(draft.scheduledAt, '2026-08-26T15:00:00.000Z');
  assert.equal(draft.campaignName, 'Legacy campaign');
  assert.equal(draft.subject, 'Legacy subject');
  assert.equal(draft.htmlBody, '<p>Legacy body</p>');
  assert.equal(draft.templateId, 'template-2');
});

test('new Airtable hydration ignores legacy region when audiences are present', () => {
  assert.ok(wizardState, 'campaign wizard state module is missing');
  const draft = wizardState.hydrateCampaignWizardDraft({
    campaign_name: 'New campaign',
    source_type: 'airtable',
    subject: 'Subject',
    html_body: '<p>Body</p>',
    sender_config: 'all',
    scheduled_at: null,
    audiences: [
      { region: 'USA', is_bounced: false },
      { region: 'EUR', is_bounced: true },
    ],
    region: 'USA',
    is_bounced: true,
  });
  assert.deepEqual(draft.audiences, [
    { region: 'USA', is_bounced: false },
    { region: 'EUR', is_bounced: true },
  ]);
});
