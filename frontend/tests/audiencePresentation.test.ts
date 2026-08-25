import assert from 'node:assert/strict';
import test from 'node:test';

test('summarizes all four Airtable branches', async () => {
  const { buildAudiencePresentation } = await import(
    '../src/features/email-sender/audiencePresentation.ts'
  );

  const result = buildAudiencePresentation({
    id: 'Campaign_all',
    createdAt: '2026-08-24T12:00:00Z',
    source_type: 'airtable',
    status: 'Draft',
    audiences: [
      { region: 'USA', is_bounced: false },
      { region: 'USA', is_bounced: true },
      { region: 'EUR', is_bounced: false },
      { region: 'EUR', is_bounced: true },
    ],
    segment: 'standard',
  });

  assert.equal(result.label, 'All Airtable audiences');
  assert.equal(result.detail, 'Not Donors');
  assert.equal(
    result.tooltip,
    'USA · Valid, USA · Bounced, EUR · Valid, EUR · Bounced',
  );
});

test('labels a single EUR valid branch', async () => {
  const { buildAudiencePresentation } = await import(
    '../src/features/email-sender/audiencePresentation.ts'
  );

  const result = buildAudiencePresentation({
    id: 'Campaign_eur_valid',
    createdAt: '2026-08-24T12:00:00Z',
    source_type: 'airtable',
    status: 'Draft',
    audiences: [{ region: 'EUR', is_bounced: false }],
    segment: 'standard',
  });

  assert.deepEqual(result, {
    label: 'EUR · Valid',
    detail: 'Not Donors',
    tooltip: 'EUR · Valid',
  });
});

test('summarizes both branches in one region', async () => {
  const { buildAudiencePresentation } = await import(
    '../src/features/email-sender/audiencePresentation.ts'
  );

  const result = buildAudiencePresentation({
    id: 'Campaign_eur_states',
    createdAt: '2026-08-24T12:00:00Z',
    source_type: 'airtable',
    status: 'Draft',
    audiences: [
      { region: 'EUR', is_bounced: true },
      { region: 'EUR', is_bounced: false },
    ],
    segment: 'dnr',
  });

  assert.equal(result.label, 'EUR · All email states');
  assert.equal(result.detail, 'Donors');
  assert.equal(result.tooltip, 'EUR · Valid, EUR · Bounced');
});

test('uses the normalized first branch and count for arbitrary subsets', async () => {
  const { buildAudiencePresentation } = await import(
    '../src/features/email-sender/audiencePresentation.ts'
  );

  const result = buildAudiencePresentation({
    id: 'Campaign_subset',
    createdAt: '2026-08-24T12:00:00Z',
    source_type: 'airtable',
    status: 'Draft',
    audiences: [
      { region: 'EUR', is_bounced: true },
      { region: 'USA', is_bounced: true },
      { region: 'EUR', is_bounced: false },
    ],
    segment: 'standard',
  });

  assert.equal(result.label, 'USA · Bounced +2');
  assert.equal(result.tooltip, 'USA · Bounced, EUR · Valid, EUR · Bounced');
});

test('hydrates legacy Airtable filters through the same presentation path', async () => {
  const { buildAudiencePresentation } = await import(
    '../src/features/email-sender/audiencePresentation.ts'
  );

  const result = buildAudiencePresentation({
    id: 'Campaign_legacy',
    createdAt: '2026-08-24T12:00:00Z',
    source_type: 'airtable',
    status: 'Completed',
    region: 'EUR',
    is_bounced: true,
    segment: 'standard',
  });

  assert.equal(result.label, 'EUR · Bounced');
  assert.equal(result.tooltip, 'EUR · Bounced');
});

test('presents CSV filename and processing state', async () => {
  const { buildAudiencePresentation } = await import(
    '../src/features/email-sender/audiencePresentation.ts'
  );

  const draft = buildAudiencePresentation({
    id: 'Campaign_csv_draft',
    createdAt: '2026-08-24T12:00:00Z',
    source_type: 'csv',
    status: 'Draft',
    csv_filename: 'donors.csv',
  });
  const processed = buildAudiencePresentation({
    id: 'Campaign_csv_processed',
    createdAt: '2026-08-24T12:00:00Z',
    source_type: 'csv',
    status: 'Completed',
  });

  assert.deepEqual(draft, {
    label: 'donors.csv',
    detail: 'Upload pending',
    tooltip: 'donors.csv',
  });
  assert.deepEqual(processed, {
    label: 'CSV audience',
    detail: 'File processed',
    tooltip: 'CSV audience',
  });
});
