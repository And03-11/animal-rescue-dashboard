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

function browserEnvironment({ hash = '#alc=abcdefghijklmnop', beaconResult = true } = {}) {
  const listeners = new Map();
  const beacons = [];
  const fetches = [];
  const replacements = [];
  const storage = new MemoryStorage();
  let cookie = '';
  let now = 1_000;
  const document = {
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) ?? [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
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
      return Promise.resolve({ ok: true });
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
    beacons,
    fetches,
    replacements,
    storage,
    readCookie: () => cookie,
    advance(milliseconds) { now += milliseconds; },
  };
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

  assert.deepEqual(browser.replacements, [
    '/a-source-of-strength-n/?utm_source=email#section=amounts',
  ]);
  assert.equal(browser.beacons.length, 1);
  assert.equal(browser.beacons[0].endpoint, config.endpoint);
  assert.equal(browser.beacons[0].payload.type, 'text/plain;charset=UTF-8');
  const payload = JSON.parse(browser.beacons[0].payload.textValue);
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

  const events = browser.beacons.map(({ payload }) => JSON.parse(payload.textValue));
  assert.deepEqual(events.map(({ event_type }) => event_type), [
    'landing_loaded',
    'human_interaction',
    'session_summary',
  ]);
  assert.equal(events[2].engagement_ms, 2500);
});

test('falls back to fetch keepalive when sendBeacon declines the payload', async () => {
  const tracker = await loadTracker();
  const browser = browserEnvironment({ beaconResult: false });

  tracker.start(browser.environment, config);

  assert.equal(browser.fetches.length, 1);
  assert.equal(browser.fetches[0].endpoint, config.endpoint);
  assert.equal(browser.fetches[0].options.method, 'POST');
  assert.equal(browser.fetches[0].options.keepalive, true);
  assert.equal(browser.fetches[0].options.headers['Content-Type'], 'text/plain;charset=UTF-8');
  assert.equal(JSON.parse(browser.fetches[0].options.body).event_type, 'landing_loaded');
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
