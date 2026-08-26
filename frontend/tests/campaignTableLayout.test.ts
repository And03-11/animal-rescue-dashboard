import assert from 'node:assert/strict';
import test from 'node:test';

test('campaign columns consume exactly the available frame width', async () => {
  const layoutModule = await import(
    '../src/features/email-sender/campaignTableLayout.ts'
  ).catch(() => ({ allocateCampaignColumnWidths: undefined }));

  assert.equal(
    typeof layoutModule.allocateCampaignColumnWidths,
    'function',
    'responsive campaign column allocation is missing',
  );

  const widths = layoutModule.allocateCampaignColumnWidths(1232);

  assert.equal(widths.length, 7);
  assert.equal(widths.reduce((total, width) => total + width, 0), 1232);
  assert.ok(widths.every((width) => width > 0));
});

test('campaign list uses cards below md and a table on desktop', async () => {
  const layoutModule = await import(
    '../src/features/email-sender/campaignTableLayout.ts'
  ).catch(() => ({ resolveCampaignListLayout: undefined }));

  assert.equal(
    typeof layoutModule.resolveCampaignListLayout,
    'function',
    'responsive campaign list resolver is missing',
  );
  assert.equal(layoutModule.resolveCampaignListLayout(320), 'cards');
  assert.equal(layoutModule.resolveCampaignListLayout(768), 'cards');
  assert.equal(layoutModule.resolveCampaignListLayout(1280), 'table');
  assert.equal(
    layoutModule.resolveCampaignListLayout(1280, 2),
    'cards',
    'zoom-equivalent compact view must not expose seven clipped columns',
  );
});
