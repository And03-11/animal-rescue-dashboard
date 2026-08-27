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
