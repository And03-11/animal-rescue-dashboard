(function bootstrap(root, factory) {
  'use strict';

  var tracker = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = tracker;
    return;
  }
  if (root && root.document) {
    var localized = root.AnimalLoveEmailTracking || {};
    tracker.start(root, {
      enabled: true,
      endpoint: localized.endpoint,
      retentionDays: localized.retentionDays,
    });
  }
}(typeof window !== 'undefined' ? window : globalThis, function createTracker() {
  'use strict';

  var TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,512}$/;
  var VISITOR_KEY = 'alc_visitor_id';

  function parseAttributionHash(hash) {
    var originalHash = typeof hash === 'string' ? hash : '';
    var raw = originalHash.charAt(0) === '#' ? originalHash.slice(1) : originalHash;
    var parameters = new URLSearchParams(raw);
    var token = parameters.get('alc');
    if (!token || !TOKEN_PATTERN.test(token)) {
      return { token: null, cleanedHash: originalHash };
    }
    parameters.delete('alc');
    var cleaned = parameters.toString();
    return { token: token, cleanedHash: cleaned ? '#' + cleaned : '' };
  }

  function endpointIsSafe(endpoint) {
    if (typeof endpoint !== 'string' || !endpoint) return false;
    try {
      var parsed = new URL(endpoint);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
    } catch (_error) {
      return false;
    }
  }

  function tokenFingerprint(token) {
    var value = 2166136261;
    for (var index = 0; index < token.length; index += 1) {
      value ^= token.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return (value >>> 0).toString(36);
  }

  function randomVisitorId(environment) {
    var bytes = new Uint8Array(16);
    environment.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function toHex(value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
  }

  function getVisitorId(environment) {
    var current = environment.sessionStorage.getItem(VISITOR_KEY);
    if (current && current.length >= 8) return current;
    var created = randomVisitorId(environment);
    environment.sessionStorage.setItem(VISITOR_KEY, created);
    return created;
  }

  function boundedRetentionDays(value) {
    var parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(1, Math.min(90, parsed));
  }

  function persistAttribution(environment, token, retentionDays) {
    var maxAge = boundedRetentionDays(retentionDays) * 86400;
    environment.document.cookie = 'alc_attribution=' + encodeURIComponent(token)
      + '; Max-Age=' + maxAge + '; Path=/; Secure; SameSite=Lax';
  }

  function sendPayload(environment, endpoint, payload) {
    var body = JSON.stringify(payload);
    var blob = new environment.Blob([body], { type: 'text/plain;charset=UTF-8' });
    var accepted = false;
    if (environment.navigator && typeof environment.navigator.sendBeacon === 'function') {
      accepted = environment.navigator.sendBeacon(endpoint, blob);
    }
    if (!accepted && typeof environment.fetch === 'function') {
      environment.fetch(endpoint, {
        method: 'POST',
        body: body,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        keepalive: true,
        credentials: 'omit',
      }).catch(function ignoreNetworkFailure() {});
    }
  }

  function start(environment, configuration) {
    if (!environment || !environment.document || !configuration.enabled) return false;
    if (!endpointIsSafe(configuration.endpoint)) return false;

    var attribution = parseAttributionHash(environment.location.hash);
    if (!attribution.token) return false;

    var token = attribution.token;
    var fingerprint = tokenFingerprint(token);
    var consumedKey = 'alc_fragment_consumed_' + fingerprint;
    if (!environment.sessionStorage.getItem(consumedKey)) {
      environment.history.replaceState(
        null,
        '',
        environment.location.pathname + environment.location.search + attribution.cleanedHash,
      );
      environment.sessionStorage.setItem(consumedKey, '1');
    }
    persistAttribution(environment, token, configuration.retentionDays);

    var visitorId = getVisitorId(environment);
    function currentTime() {
      return environment.performance && typeof environment.performance.now === 'function'
        ? environment.performance.now()
        : Date.now();
    }

    var visibleStartedAt = environment.document.visibilityState === 'hidden'
      ? null
      : currentTime();
    var visibleEngagementMs = 0;
    var sessionSummarized = false;

    function emitOnce(eventType, engagementMs) {
      var eventKey = 'alc_event_' + fingerprint + '_' + eventType;
      if (environment.sessionStorage.getItem(eventKey)) return false;
      environment.sessionStorage.setItem(eventKey, '1');
      sendPayload(environment, configuration.endpoint, {
        token: token,
        event_type: eventType,
        visitor_id: visitorId,
        engagement_ms: Math.max(0, Math.round(engagementMs || 0)),
        viewport_width: Number.isFinite(environment.innerWidth)
          ? Math.max(0, Math.round(environment.innerWidth))
          : null,
      });
      return true;
    }

    emitOnce('landing_loaded', 0);

    function humanInteraction(event) {
      if (event && event.isTrusted === false) return;
      emitOnce('human_interaction', 0);
    }
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function listen(type) {
      environment.document.addEventListener(type, humanInteraction, { passive: true });
    });

    function summarizeSession() {
      if (sessionSummarized) return;
      if (visibleStartedAt !== null) {
        visibleEngagementMs += Math.max(0, currentTime() - visibleStartedAt);
        visibleStartedAt = null;
      }
      emitOnce('session_summary', visibleEngagementMs);
      sessionSummarized = true;
    }

    environment.document.addEventListener('visibilitychange', function visibilityChanged() {
      if (environment.document.visibilityState === 'hidden') {
        summarizeSession();
      } else if (!sessionSummarized && visibleStartedAt === null) {
        visibleStartedAt = currentTime();
      }
    });
    environment.addEventListener('pagehide', summarizeSession);
    return true;
  }

  return {
    parseAttributionHash: parseAttributionHash,
    start: start,
  };
}));
