import assert from 'node:assert/strict';
import test from 'node:test';

const orchestration = await import(
  '../src/features/email-sender/campaignWizardOrchestration.ts'
).catch(() => null);

test('existing CSV edits update campaign configuration before saving mapping', () => {
  assert.ok(orchestration, 'campaign wizard orchestration module is missing');
  assert.deepEqual(orchestration.planCampaignSave({
    existingCampaignId: 'campaign-7',
    sourceType: 'csv',
    hasCsvFile: false,
    hasMapping: true,
  }), ['update-campaign', 'save-mapping']);
});

test('new CSV saves create, upload, and mapping in dependency order', () => {
  assert.ok(orchestration, 'campaign wizard orchestration module is missing');
  assert.deepEqual(orchestration.planCampaignSave({
    existingCampaignId: null,
    sourceType: 'csv',
    hasCsvFile: true,
    hasMapping: true,
  }), ['create-campaign', 'upload-csv', 'save-mapping']);
});

test('Airtable saves use exactly one configuration write', () => {
  assert.ok(orchestration, 'campaign wizard orchestration module is missing');
  assert.deepEqual(orchestration.planCampaignSave({
    existingCampaignId: null,
    sourceType: 'airtable',
    hasCsvFile: false,
    hasMapping: false,
  }), ['create-campaign']);
  assert.deepEqual(orchestration.planCampaignSave({
    existingCampaignId: 'campaign-8',
    sourceType: 'airtable',
    hasCsvFile: false,
    hasMapping: false,
  }), ['update-campaign']);
});

test('starting or aborting a wizard session invalidates every older handle', () => {
  assert.ok(orchestration, 'campaign wizard orchestration module is missing');
  const lifecycle = new orchestration.WizardSessionLifecycle();
  const first = lifecycle.begin();
  assert.equal(lifecycle.isCurrent(first), true);

  const second = lifecycle.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(lifecycle.isCurrent(first), false);
  assert.equal(lifecycle.isCurrent(second), true);

  lifecycle.abort();
  assert.equal(second.signal.aborted, true);
  assert.equal(lifecycle.isCurrent(second), false);

  const retry = lifecycle.begin();
  assert.equal(lifecycle.isCurrent(retry), true);
  assert.notEqual(retry.generation, second.generation);
});
