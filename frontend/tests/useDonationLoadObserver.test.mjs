import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { test, vi } from 'vitest';
import { useDonationLoadObserver } from '../src/hooks/useDonationLoadObserver.ts';

test('connects donation pagination when its table mounts after another tab', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const observers = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      observers.push(this);
    }

    observe(target) {
      this.target = target;
    }

    disconnect() {
      this.disconnected = true;
    }
  });

  let loadCount = 0;
  function Harness({ showDonations }) {
    const { containerRef, sentinelRef } = useDonationLoadObserver({
      hasMore: true,
      isLoading: false,
      onLoadMore: () => { loadCount += 1; },
    });

    return showDonations
      ? createElement('div', { ref: containerRef }, createElement('div', { ref: sentinelRef }))
      : null;
  }

  const host = document.createElement('main');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => { root.render(createElement(Harness, { showDonations: false })); });
    assert.equal(observers.length, 0);

    await act(async () => { root.render(createElement(Harness, { showDonations: true })); });
    assert.ok(observers.length > 0, 'observer should be created after the table appears');
    const observer = observers.at(-1);
    assert.equal(observer.options.root, host.firstElementChild);
    assert.equal(observer.target, host.firstElementChild.firstElementChild);

    await act(async () => { observer.callback([{ isIntersecting: true }]); });
    assert.equal(loadCount, 1, 'reaching the table end should request the next page');

    await act(async () => { root.render(createElement(Harness, { showDonations: false })); });
    assert.equal(observer.disconnected, true, 'switching tabs should disconnect the old observer');

    await act(async () => { root.render(createElement(Harness, { showDonations: true })); });
    assert.ok(observers.length > 1, 'returning to donations should reconnect pagination');
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
    vi.unstubAllGlobals();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
