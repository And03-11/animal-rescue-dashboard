import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { test, vi } from 'vitest';
import apiClient from '../src/api/axiosConfig';
import { WebSocketContext } from '../src/context/webSocketContext';
import { CampaignAnalyticsPage } from '../src/pages/CampaignAnalyticsPage';

vi.mock('../src/api/axiosConfig', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('framer-motion', async () => {
  const { createElement, forwardRef } = await import('react');
  const plainElement = (tag) => forwardRef((props, ref) => {
    const { animate, exit, initial, transition, variants, ...domProps } = props;
    void animate; void exit; void initial; void transition; void variants;
    return createElement(tag, { ...domProps, ref });
  });
  return {
    motion: { div: plainElement('div'), h1: plainElement('h1'), p: plainElement('p') },
    AnimatePresence: ({ children }) => children,
    useReducedMotion: () => true,
  };
});

test('loads the second page of donations when only a source is selected', async () => {
  const source = 'Big Campaign';
  const firstPage = Array.from({ length: 50 }, (_, index) => ({
    id: `donation-${index + 1}`,
    date: '2026-09-16T12:00:00Z',
    amount: 10,
    donorName: `Donor ${index + 1}`,
    donorEmail: `donor${index + 1}@example.com`,
  }));
  const nextDonation = {
    id: 'donation-51',
    date: '2026-09-15T12:00:00Z',
    amount: 20,
    donorName: 'Donor 51',
    donorEmail: 'donor51@example.com',
  };
  const sourceRequests = [];
  apiClient.get.mockImplementation(async (url, config) => {
    if (url === '/campaigns/sources') return { data: [source] };
    if (url === `/campaigns?source=${source}`) return { data: [] };
    if (url.startsWith(`/campaigns/source/${source}/stats`)) {
      return { data: { source_total_amount: 520, source_total_count: 51, stats_by_campaign: [] } };
    }
    if (url === `/campaigns/source/${source}/donations`) {
      sourceRequests.push(config?.params);
      if (config?.params?.offset === 0) return { data: { donations: firstPage, total_count: 51 } };
      if (config?.params?.offset === 50) return { data: { donations: [nextDonation], total_count: 51 } };
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const observers = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  });
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const host = document.createElement('main');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(createElement(WebSocketContext.Provider, {
        value: { isConnected: false, subscribe: () => () => {} },
      }, createElement(LocalizationProvider, { dateAdapter: AdapterDayjs }, createElement(CampaignAnalyticsPage))));
    });

    const sourceSelect = document.querySelector('[aria-label="Source"]');
    assert.ok(sourceSelect, 'source filter should be present');
    await act(async () => {
      sourceSelect.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    const option = Array.from(document.querySelectorAll('[role="option"]'))
      .find((element) => element.textContent === source);
    assert.ok(option, 'source should be selectable');
    await act(async () => { option.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const updateButton = Array.from(document.querySelectorAll('button'))
      .find((element) => element.textContent?.includes('Update view'));
    assert.ok(updateButton);
    await act(async () => { updateButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    assert.equal(sourceRequests.length, 1, 'the first source page should load');
    assert.equal(sourceRequests[0].offset, 0);

    const donationsTab = Array.from(document.querySelectorAll('[role="tab"]'))
      .find((element) => element.textContent?.includes('Donations (51)'));
    assert.ok(donationsTab);
    await act(async () => { donationsTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    let paginationObserver;
    await vi.waitFor(() => {
      paginationObserver = observers.findLast((observer) => observer.target?.tagName === 'TR' && !observer.disconnected);
      assert.ok(paginationObserver, 'pagination sentinel should be observed');
    });

    await act(async () => { paginationObserver.callback([{ isIntersecting: true }]); });
    assert.equal(sourceRequests.length, 2, 'scrolling should request the next source page');
    assert.equal(sourceRequests[1].page_size, 50);
    assert.equal(sourceRequests[1].offset, 50);
    assert.ok(document.body.textContent.includes('Donor 51'), 'the next donation should appear');
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
    apiClient.get.mockReset();
    vi.unstubAllGlobals();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
