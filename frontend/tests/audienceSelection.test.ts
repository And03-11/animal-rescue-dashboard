import assert from 'node:assert/strict';
import test from 'node:test';

const audienceSelection = await import(
  '../src/features/email-sender/audienceSelection.ts'
).catch(() => null);

test('audience shortcuts replace the selection with exact branches', () => {
  assert.ok(audienceSelection, 'audience selection module is missing');
  assert.deepEqual(audienceSelection.applyAudienceShortcut('EUR'), [
    { region: 'EUR', is_bounced: false },
    { region: 'EUR', is_bounced: true },
  ]);
  assert.deepEqual(audienceSelection.applyAudienceShortcut('Valid'), [
    { region: 'USA', is_bounced: false },
    { region: 'EUR', is_bounced: false },
  ]);
  assert.equal(audienceSelection.applyAudienceShortcut('All').length, 4);
  assert.deepEqual(audienceSelection.applyAudienceShortcut('Clear'), []);
});

test('legacy campaign filters hydrate when normalized audiences are absent or empty', () => {
  assert.ok(audienceSelection, 'audience selection module is missing');
  for (const audiences of [undefined, []]) {
    assert.deepEqual(audienceSelection.hydrateAudienceSelection({
      audiences,
      region: 'USA',
      is_bounced: true,
    }), [{ region: 'USA', is_bounced: true }]);
  }
});

test('checkbox toggles preserve arbitrary subsets and normalize ordering', () => {
  assert.ok(audienceSelection, 'audience selection module is missing');
  const bouncedEur = { region: 'EUR' as const, is_bounced: true };
  const validUsa = { region: 'USA' as const, is_bounced: false };
  const selection = audienceSelection.toggleAudience(
    audienceSelection.toggleAudience([bouncedEur], validUsa),
    bouncedEur,
  );
  assert.deepEqual(selection, [validUsa]);
  assert.deepEqual(audienceSelection.normalizeAudienceSelection([
    { region: 'EUR', is_bounced: true },
    { region: 'USA', is_bounced: true },
    { region: 'EUR', is_bounced: false },
    { region: 'USA', is_bounced: false },
    { region: 'USA', is_bounced: false },
  ]), [
    { region: 'USA', is_bounced: false },
    { region: 'USA', is_bounced: true },
    { region: 'EUR', is_bounced: false },
    { region: 'EUR', is_bounced: true },
  ]);
});

test('summary labels describe one, same-region, all, and arbitrary selections', () => {
  assert.ok(audienceSelection, 'audience selection module is missing');
  assert.equal(
    audienceSelection.summarizeAudienceSelection([{ region: 'EUR', is_bounced: false }]),
    'EUR · Valid',
  );
  assert.equal(
    audienceSelection.summarizeAudienceSelection([
      { region: 'EUR', is_bounced: false },
      { region: 'EUR', is_bounced: true },
    ]),
    'EUR · All email states',
  );
  assert.equal(
    audienceSelection.summarizeAudienceSelection([
      { region: 'USA', is_bounced: false },
      { region: 'USA', is_bounced: true },
      { region: 'EUR', is_bounced: false },
      { region: 'EUR', is_bounced: true },
    ]),
    'All Airtable audiences',
  );
  assert.equal(
    audienceSelection.summarizeAudienceSelection([
      { region: 'USA', is_bounced: false },
      { region: 'EUR', is_bounced: true },
    ]),
    'USA · Valid +1',
  );
});
