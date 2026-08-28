import assert from 'node:assert/strict';
import test from 'node:test';

const refreshModule = await import(
  '../src/features/email-sender/campaignTrackingRefresh.ts'
).catch(() => null);

test('completed tracked campaigns remain eligible for list refreshes', () => {
  assert.ok(refreshModule, 'campaign tracking refresh module is missing');

  assert.equal(refreshModule.shouldPollCampaignList([
    {
      id: 'Campaign_tracked',
      createdAt: '2026-08-28T10:00:00',
      source_type: 'csv',
      status: 'Completed',
      click_tracking_enabled: true,
    },
  ]), true);
});

test('sending campaigns keep status refreshes when tracking is off', () => {
  assert.ok(refreshModule, 'campaign tracking refresh module is missing');

  assert.equal(refreshModule.shouldPollCampaignList([
    {
      id: 'Campaign_sending',
      createdAt: '2026-08-28T10:00:00',
      source_type: 'csv',
      status: 'Sending',
      click_tracking_enabled: false,
    },
  ]), true);
});

test('completed tracked reports remain eligible for detail refreshes', () => {
  assert.ok(refreshModule, 'campaign tracking refresh module is missing');

  assert.equal(refreshModule.shouldPollCampaignReport('Completed', true), true);
  assert.equal(refreshModule.shouldPollCampaignReport('Completed', false), false);
});

test('background tabs suppress network refreshes', () => {
  assert.ok(refreshModule, 'campaign tracking refresh module is missing');

  assert.equal(refreshModule.canRefreshTrackingMetrics('visible'), true);
  assert.equal(refreshModule.canRefreshTrackingMetrics('hidden'), false);
});

test('silent refreshes never overlap and release their lock after completion', async () => {
  assert.ok(refreshModule, 'campaign tracking refresh module is missing');

  const lock = { current: false };
  let releaseFirstRefresh: (() => void) | undefined;
  let refreshCalls = 0;
  const firstRefresh = refreshModule.runExclusiveRefresh(lock, async () => {
    refreshCalls += 1;
    await new Promise<void>((resolve) => {
      releaseFirstRefresh = resolve;
    });
  });

  assert.equal(await refreshModule.runExclusiveRefresh(lock, async () => {
    refreshCalls += 1;
  }), false);
  assert.equal(refreshCalls, 1);

  releaseFirstRefresh?.();
  assert.equal(await firstRefresh, true);
  assert.equal(lock.current, false);
  assert.equal(await refreshModule.runExclusiveRefresh(lock, async () => {
    refreshCalls += 1;
  }), true);
  assert.equal(refreshCalls, 2);
});

test('silent refresh lock is released when the request fails', async () => {
  assert.ok(refreshModule, 'campaign tracking refresh module is missing');

  const lock = { current: false };
  await assert.rejects(
    refreshModule.runExclusiveRefresh(lock, async () => {
      throw new Error('network unavailable');
    }),
    /network unavailable/,
  );
  assert.equal(lock.current, false);
});
