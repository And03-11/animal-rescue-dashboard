import assert from 'node:assert/strict';
import test from 'node:test';

test('completed campaigns open their report and keep engagement metrics empty until tracked', async () => {
  const { buildCampaignPresentation } = await import(
    '../src/features/email-sender/campaignPresentation.ts'
  );

  const presentation = buildCampaignPresentation({
    id: 'Campaign_completed',
    createdAt: '2026-08-24T12:00:00',
    source_type: 'airtable',
    status: 'Completed',
    progress: { sent: 1031, total: 1032, percentage: 99.9 },
  });

  assert.deepEqual(presentation, {
    primaryAction: 'report',
    sent: 1031,
    total: 1032,
    openRate: null,
    clickRate: null,
  });
  assert.equal('delivered' in presentation, false);
});

test('campaigns with failed recipients expose retry as their primary action', async () => {
  const { buildCampaignPresentation } = await import(
    '../src/features/email-sender/campaignPresentation.ts'
  );

  const presentation = buildCampaignPresentation({
    id: 'Campaign_failed',
    createdAt: '2026-08-24T12:00:00',
    source_type: 'airtable',
    status: 'Completed with Errors',
    progress: { sent: 17, total: 20, percentage: 85 },
  });

  assert.equal(presentation.primaryAction, 'retry');
});

test('tracked engagement rates are exposed without recalculating them in the table', async () => {
  const { buildCampaignPresentation } = await import(
    '../src/features/email-sender/campaignPresentation.ts'
  );

  const presentation = buildCampaignPresentation({
    id: 'Campaign_tracked',
    createdAt: '2026-08-24T12:00:00',
    source_type: 'csv',
    status: 'Completed',
    performance: { open_rate: 42.6, click_rate: 5.4 },
  });

  assert.equal(presentation.openRate, 42.6);
  assert.equal(presentation.clickRate, 5.4);
});
