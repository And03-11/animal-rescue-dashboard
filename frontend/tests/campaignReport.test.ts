import assert from 'node:assert/strict';
import test from 'node:test';

const reportModule = await import(
  '../src/features/email-sender/campaignReport.ts'
).catch(() => null);

const summary = {
  sent: 100,
  landing_visits: 42,
  human_likely_clicks: 18,
  unconfirmed_activity: 24,
  suspected_automation: 5,
  landing_rate: 42,
  human_click_rate: 18,
};

test('report stat cards use conservative engagement labels', () => {
  assert.ok(reportModule, 'campaign report presentation module is missing');
  const cards = reportModule.buildCampaignReportCards(summary);

  assert.deepEqual(cards.map((card) => card.label), [
    'Sent',
    'Unique landing recipients',
    'Unique human clickers',
    'Unconfirmed activity',
    'Suspected automation',
  ]);
  assert.deepEqual(cards.map((card) => card.value), [100, 42, 18, 24, 5]);
  assert.equal(cards.some((card) => card.label.includes('Open')), false);
  assert.equal(cards.some((card) => card.label === 'Clicks'), false);
});

test('zero-data state and percentages distinguish unknown denominators', () => {
  assert.ok(reportModule, 'campaign report presentation module is missing');
  assert.equal(reportModule.hasCampaignEngagement({ ...summary, landing_visits: 0, human_likely_clicks: 0, unconfirmed_activity: 0, suspected_automation: 0 }), false);
  assert.equal(reportModule.formatCampaignRate(null), '—');
  assert.equal(reportModule.formatCampaignRate(18), '18.0%');
  assert.equal(reportModule.formatCampaignRate(18.25), '18.3%');
});

test('destination labels preserve normalized path and readable host', () => {
  assert.ok(reportModule, 'campaign report presentation module is missing');
  assert.deepEqual(
    reportModule.formatCampaignDestination(
      'https://donations.animallove.cr',
      '/a-source-of-strength-n/',
    ),
    {
      path: '/a-source-of-strength-n/',
      host: 'donations.animallove.cr',
    },
  );
});

test('activity classifications remain explicit', () => {
  assert.ok(reportModule, 'campaign report presentation module is missing');
  assert.equal(reportModule.formatActivityClassification('human_likely'), 'Human-likely');
  assert.equal(reportModule.formatActivityClassification('unconfirmed'), 'Unconfirmed');
  assert.equal(reportModule.formatActivityClassification('suspected_automation'), 'Suspected automation');
});

test('tracking-disabled detail hides engagement cards even when a report exists', () => {
  assert.ok(reportModule, 'campaign report presentation module is missing');

  assert.deepEqual(
    reportModule.buildCampaignReportVisibility(false, true),
    {
      trackingEnabled: false,
      showEngagement: false,
      statusLabel: 'Tracking off',
    },
  );
  assert.deepEqual(
    reportModule.buildCampaignReportVisibility(true, true),
    {
      trackingEnabled: true,
      showEngagement: true,
      statusLabel: null,
    },
  );
});
