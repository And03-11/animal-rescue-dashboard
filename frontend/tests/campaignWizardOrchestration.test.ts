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

test('new CSV execution publishes its ID only after upload and mapping finish', async () => {
  assert.ok(orchestration, 'campaign wizard orchestration module is missing');
  assert.equal(
    typeof orchestration.executeCampaignSavePlan,
    'function',
    'campaign save execution helper is missing',
  );

  const lifecycle = new orchestration.WizardSessionLifecycle();
  const session = lifecycle.begin();
  const operations = orchestration.planCampaignSave({
    existingCampaignId: null,
    sourceType: 'csv',
    hasCsvFile: true,
    hasMapping: true,
  });
  const events: string[] = [];
  let publishedCampaignId: string | null = null;

  const campaignId = await orchestration.executeCampaignSavePlan({
    operations,
    initialCampaignId: null,
    signal: session.signal,
    runOperation: async ({ operation, campaignId: currentCampaignId, signal }) => {
      events.push(operation);
      assert.equal(publishedCampaignId, null, `${operation} ran after parent ID publication`);
      assert.equal(signal.aborted, false, `${operation} ran after the wizard session aborted`);
      if (operation === 'create-campaign') return 'campaign-new';
      assert.equal(currentCampaignId, 'campaign-new');
      await Promise.resolve();
      assert.equal(signal.aborted, false, `${operation} was aborted while running`);
    },
    publishCampaignId: (createdCampaignId) => {
      events.push(`publish:${createdCampaignId}`);
      publishedCampaignId = createdCampaignId;
      lifecycle.begin();
    },
  });

  assert.equal(campaignId, 'campaign-new');
  assert.deepEqual(events, [
    'create-campaign',
    'upload-csv',
    'save-mapping',
    'publish:campaign-new',
  ]);
  assert.equal(publishedCampaignId, 'campaign-new');
  assert.equal(session.signal.aborted, true, 'parent ID publication should occur only after completion');
});

for (const failedOperation of ['upload-csv', 'save-mapping'] as const) {
  test(`new CSV ${failedOperation} failure keeps the creation session unpublished`, async () => {
    assert.ok(orchestration, 'campaign wizard orchestration module is missing');
    assert.equal(
      typeof orchestration.executeCampaignSavePlan,
      'function',
      'campaign save execution helper is missing',
    );

    const lifecycle = new orchestration.WizardSessionLifecycle();
    const session = lifecycle.begin();
    const visited: string[] = [];
    let publishedCampaignId: string | null = null;

    await assert.rejects(
      () => orchestration.executeCampaignSavePlan({
        operations: ['create-campaign', 'upload-csv', 'save-mapping'],
        initialCampaignId: null,
        signal: session.signal,
        runOperation: async ({ operation }) => {
          visited.push(operation);
          if (operation === 'create-campaign') return 'campaign-incomplete';
          if (operation === failedOperation) throw new Error(`${failedOperation} failed`);
        },
        publishCampaignId: (createdCampaignId) => {
          publishedCampaignId = createdCampaignId;
          lifecycle.begin();
        },
      }),
      new RegExp(`${failedOperation} failed`),
    );

    assert.deepEqual(
      visited,
      failedOperation === 'upload-csv'
        ? ['create-campaign', 'upload-csv']
        : ['create-campaign', 'upload-csv', 'save-mapping'],
    );
    assert.equal(publishedCampaignId, null);
    assert.equal(session.signal.aborted, false);
    assert.equal(lifecycle.isCurrent(session), true);
  });
}
