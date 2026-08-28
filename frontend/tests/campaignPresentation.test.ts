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
    trackingEnabled: false,
    landingVisits: null,
    humanLikelyClicks: null,
    landingRate: null,
    humanClickRate: null,
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

test('tracked engagement counts and rates are exposed without recalculating them in the table', async () => {
  const { buildCampaignPresentation } = await import(
    '../src/features/email-sender/campaignPresentation.ts'
  );

  const presentation = buildCampaignPresentation({
    id: 'Campaign_tracked',
    createdAt: '2026-08-24T12:00:00',
    source_type: 'csv',
    status: 'Completed',
    click_tracking_enabled: true,
    performance: {
      landing_visits: 426,
      human_likely_clicks: 54,
      landing_rate: 42.6,
      human_click_rate: 5.4,
    },
  });

  assert.equal(presentation.trackingEnabled, true);
  assert.equal(presentation.landingVisits, 426);
  assert.equal(presentation.humanLikelyClicks, 54);
  assert.equal(presentation.landingRate, 42.6);
  assert.equal(presentation.humanClickRate, 5.4);
});

test('tracking-disabled campaigns ignore zero-valued performance summaries', async () => {
  const { buildCampaignPresentation } = await import(
    '../src/features/email-sender/campaignPresentation.ts'
  );

  const presentation = buildCampaignPresentation({
    id: 'Campaign_tracking_off',
    createdAt: '2026-08-24T12:00:00',
    source_type: 'csv',
    status: 'Completed',
    click_tracking_enabled: false,
    performance: { landing_rate: 0, human_click_rate: 0 },
  });

  assert.equal(presentation.trackingEnabled, false);
  assert.equal(presentation.landingRate, null);
  assert.equal(presentation.humanClickRate, null);
});

test('engagement metric display pairs an exact count with its rate', async () => {
  const presentationModule = await import(
    '../src/features/email-sender/campaignPresentation.ts'
  );

  assert.equal(typeof presentationModule.buildCampaignMetricDisplay, 'function');
  assert.deepEqual(
    presentationModule.buildCampaignMetricDisplay(true, 1, 50),
    { value: '1', helper: '50.0% of sent' },
  );
  assert.deepEqual(
    presentationModule.buildCampaignMetricDisplay(true, 0, 0),
    { value: '0', helper: '0.0% of sent' },
  );
  assert.deepEqual(
    presentationModule.buildCampaignMetricDisplay(false, null, null),
    { value: '—', helper: 'Tracking off' },
  );
});
