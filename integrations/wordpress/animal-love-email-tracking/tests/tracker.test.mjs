import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const trackerPath = path.resolve(testDirectory, '../assets/js/tracker.js');

async function loadTracker() {
  const source = await readFile(trackerPath, 'utf8');
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, URL, URLSearchParams });
  vm.runInContext(source, context, { filename: trackerPath });
  return module.exports;
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

class FakeBlob {
  constructor(parts, options = {}) {
    this.textValue = parts.join('');
    this.type = options.type ?? '';
  }
}

function browserEnvironment({
  hash = '#alc=abcdefghijklmnop',
  beaconResult = true,
  fetchResults = [],
  storage = new MemoryStorage(),
} = {}) {
  const listeners = new Map();
  const listenerOptions = new Map();
  const beacons = [];
  const fetches = [];
  const timers = [];
  const replacements = [];
  let cookie = '';
  let now = 1_000;
  const document = {
    addEventListener(type, callback, options) {
      const callbacks = listeners.get(type) ?? [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
      listenerOptions.set(type, options);
    },
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      cookie = value;
    },
    visibilityState: 'visible',
  };
  const environment = {
    location: {
      hash,
      pathname: '/a-source-of-strength-n/',
      search: '?utm_source=email',
    },
    history: {
      replaceState(_state, _title, url) {
        replacements.push(url);
      },
    },
    document,
    navigator: {
      sendBeacon(endpoint, payload) {
        beacons.push({ endpoint, payload });
        return beaconResult;
      },
    },
    fetch(endpoint, options) {
      fetches.push({ endpoint, options });
      const result = fetchResults[fetches.length - 1];
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result ?? { ok: true });
    },
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    sessionStorage: storage,
    crypto: {
      getRandomValues(bytes) {
        bytes.forEach((_value, index) => { bytes[index] = index + 1; });
        return bytes;
      },
    },
    Blob: FakeBlob,
    innerWidth: 390,
    performance: { now: () => now },
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) ?? [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
  };
  return {
    environment,
    listeners,
    listenerOptions,
    beacons,
    fetches,
    timers,
    replacements,
    storage,
    readCookie: () => cookie,
    runNextTimer() {
      const timer = timers.shift();
      if (!timer) return null;
      timer.callback();
      return timer.delay;
    },
    advance(milliseconds) { now += milliseconds; },
  };
}

function fetchEvents(browser) {
  return browser.fetches.map(({ options }) => JSON.parse(options.body));
}

async function settleAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
}

const config = {
  enabled: true,
  endpoint: 'https://api.animallove.cr/api/v1/email-tracking/events',
  retentionDays: 30,
};

test('extracts alc and preserves unrelated fragment parameters', async () => {
  const tracker = await loadTracker();

  assert.deepEqual(
    { ...tracker.parseAttributionHash('#section=amounts&alc=abcdefghijklmnop&panel=card') },
    { token: 'abcdefghijklmnop', cleanedHash: '#section=amounts&panel=card' },
  );
  assert.deepEqual(
    { ...tracker.parseAttributionHash('#section=amounts') },
    { token: null, cleanedHash: '#section=amounts' },
  );
});

test('starts without delaying navigation, strips token, and emits one landing event', async () => {
  const tracker = await loadTracker();
  const browser = browserEnvironment({
    hash: '#section=amounts&alc=abcdefghijklmnop',
  });

  tracker.start(browser.environment, config);
  tracker.start(browser.environment, config);
  await settleAsyncWork();

  assert.deepEqual(browser.replacements, [
    '/a-source-of-strength-n/?utm_source=email#section=amounts',
  ]);
  assert.equal(browser.fetches.length, 1);
  assert.equal(browser.beacons.length, 0);
  assert.equal(browser.fetches[0].endpoint, config.endpoint);
  assert.equal(browser.fetches[0].options.keepalive, true);
  const payload = JSON.parse(browser.fetches[0].options.body);
  assert.equal(payload.token, 'abcdefghijklmnop');
  assert.equal(payload.event_type, 'landing_loaded');
  assert.equal(payload.viewport_width, 390);
  assert.ok(payload.visitor_id.length >= 8);
  assert.equal(browser.readCookie().includes('alc_attribution=abcdefghijklmnop'), true);
  assert.equal(browser.readCookie().includes('Secure'), true);
  assert.equal(browser.readCookie().includes('SameSite=Lax'), true);
});

test('classifies the first trusted interaction and emits one session summary', async () => {
  const tracker = await loadTracker();
  const browser = browserEnvironment();

  tracker.start(browser.environment, config);
  browser.listeners.get('pointerdown')[0]({ isTrusted: true });
  browser.listeners.get('pointerdown')[0]({ isTrusted: true });
  browser.advance(2_500);
  browser.listeners.get('pagehide')[0]();
  browser.listeners.get('pagehide')[0]();

  const events = fetchEvents(browser);
  assert.deepEqual(events.map(({ event_type }) => event_type), [
    'landing_loaded',
    'human_interaction',
    'session_summary',
  ]);
  assert.equal(events[2].engagement_ms, 2500);
});

test('treats a trusted scroll as a passive human interaction signal', async () => {
  const tracker = await loadTracker();
  const browser = browserEnvironment();

  tracker.start(browser.environment, config);
  browser.listeners.get('scroll')[0]({ isTrusted: false });
  browser.listeners.get('scroll')[0]({ isTrusted: true });

  const events = fetchEvents(browser);
  assert.deepEqual(events.map(({ event_type }) => event_type), [
    'landing_loaded',
    'human_interaction',
  ]);
  assert.equal(browser.listenerOptions.get('scroll').passive, true);
});

test('first hidden transition summarizes only visible time and pagehide does not duplicate it', async () => {
  const tracker = await loadTracker();
  const browser = browserEnvironment();

  tracker.start(browser.environment, config);
  browser.advance(2_000);
  browser.environment.document.visibilityState = 'hidden';
  browser.listeners.get('visibilitychange')[0]();
  browser.advance(8_000);
  browser.listeners.get('pagehide')[0]();

  const summaries = fetchEvents(browser)
    .filter(({ event_type }) => event_type === 'session_summary');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].engagement_ms, 2000);
});

test('uses confirmable fetch delivery even when sendBeacon would accept the payload', async () => {
  const tracker = await loadTracker();
  const browser = browserEnvironment({ beaconResult: true });

  tracker.start(browser.environment, config);

  assert.equal(browser.fetches.length, 1);
  assert.equal(browser.beacons.length, 0);
  assert.equal(browser.fetches[0].endpoint, config.endpoint);
  assert.equal(browser.fetches[0].options.method, 'POST');
  assert.equal(browser.fetches[0].options.keepalive, true);
  assert.equal(browser.fetches[0].options.headers['Content-Type'], 'text/plain;charset=UTF-8');
  assert.equal(JSON.parse(browser.fetches[0].options.body).event_type, 'landing_loaded');
});

test('pagehide mirrors pending events to best-effort beacons without duplicating the flush', async () => {
  const tracker = await loadTracker();
  const browser = browserEnvironment({
    fetchResults: [new Error('blocked'), new Error('blocked')],
  });

  tracker.start(browser.environment, config);
  browser.listeners.get('pagehide')[0]();
  browser.listeners.get('pagehide')[0]();

  assert.deepEqual(
    browser.beacons.map(({ payload }) => JSON.parse(payload.textValue).event_type),
    ['landing_loaded', 'session_summary'],
  );
});

test('retries a failed landing and marks it delivered only after a confirmed response', async () => {
  const tracker = await loadTracker();
  const browser = browserEnvironment({
    fetchResults: [{ ok: false }, { ok: true }],
  });

  tracker.start(browser.environment, config);
  await settleAsyncWork();

  assert.equal(browser.fetches.length, 1);
  assert.equal(browser.timers.length, 1);
  assert.equal(browser.runNextTimer(), 1000);
  await settleAsyncWork();
  assert.equal(browser.fetches.length, 2);

  tracker.start(browser.environment, config);
  await settleAsyncWork();
  assert.equal(browser.fetches.length, 2);
});

test('recovers an undelivered event from session storage after a reload without the token hash', async () => {
  const tracker = await loadTracker();
  const storage = new MemoryStorage();
  const firstPage = browserEnvironment({
    storage,
    fetchResults: [
      new Error('offline'),
      new Error('still offline'),
      new Error('still offline'),
    ],
  });

  tracker.start(firstPage.environment, config);
  await settleAsyncWork();
  assert.equal(firstPage.runNextTimer(), 1000);
  await settleAsyncWork();
  assert.equal(firstPage.runNextTimer(), 3000);
  await settleAsyncWork();
  assert.equal(firstPage.fetches.length, 3);

  const trackerAfterReload = await loadTracker();
  const reloadedPage = browserEnvironment({ hash: '', storage });

  assert.equal(trackerAfterReload.start(reloadedPage.environment, config), false);
  await settleAsyncWork();
  assert.equal(reloadedPage.fetches.length, 1);
  assert.equal(
    JSON.parse(reloadedPage.fetches[0].options.body).event_type,
    'landing_loaded',
  );

  trackerAfterReload.start(reloadedPage.environment, config);
  await settleAsyncWork();
  assert.equal(reloadedPage.fetches.length, 1);
});

test('recovers pending events when a page returns from the back-forward cache', async () => {
  const tracker = await loadTracker();
  const browser = browserEnvironment({
    fetchResults: [
      new Error('offline'),
      new Error('still offline'),
      new Error('still offline'),
      { ok: true },
    ],
  });

  tracker.start(browser.environment, config);
  await settleAsyncWork();
  browser.runNextTimer();
  await settleAsyncWork();
  browser.runNextTimer();
  await settleAsyncWork();
  assert.equal(browser.fetches.length, 3);

  browser.listeners.get('pageshow')[0]({ persisted: true });
  await settleAsyncWork();
  assert.equal(browser.fetches.length, 4);
});

test('disabled or non-HTTPS configuration does not consume attribution', async () => {
  const tracker = await loadTracker();
  const disabled = browserEnvironment();
  const insecure = browserEnvironment();

  assert.equal(tracker.start(disabled.environment, { ...config, enabled: false }), false);
  assert.equal(
    tracker.start(insecure.environment, { ...config, endpoint: 'http://api.animallove.cr/events' }),
    false,
  );

  for (const browser of [disabled, insecure]) {
    assert.equal(browser.beacons.length, 0);
    assert.equal(browser.fetches.length, 0);
    assert.equal(browser.replacements.length, 0);
    assert.equal(browser.readCookie(), '');
  }
});
