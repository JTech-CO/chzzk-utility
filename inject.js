(() => {
  if (window.__CK_HOOKED__) return;
  window.__CK_HOOKED__ = true;

  /* script 태그의 data-ck-settings 속성에서 초기 설정 읽기 */
  (function loadInitialSettings() {
    try {
      const me = document.currentScript
        || document.querySelector('script[data-ck-settings]');
      if (me && me.dataset.ckSettings) {
        window.__CK_SETTINGS__ = JSON.parse(me.dataset.ckSettings);
      }
    } catch (_) {}
  })();

  const getSettings = () => window.__CK_SETTINGS__ || {
    blockAds: true,
    enableTimemachine: true,
    forceMaxQuality: true
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data && e.data.__ck_type === 'settings') {
      window.__CK_SETTINGS__ = e.data.payload;
    }
  });

  /* 최고 화질 강제 (Main World localStorage 후킹) */

  const QUALITY_KEYS = [
    'chzzk-quality-1', 'chzzk_player_quality',
    'liveQuality', 'preferredQuality'
  ];
  const BEST_QUALITY = JSON.stringify({ value: 'best' });

  const origGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key) {
    if (getSettings().forceMaxQuality && QUALITY_KEYS.includes(key)) {
      return BEST_QUALITY;
    }
    return origGetItem.call(this, key);
  };

  const origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (getSettings().forceMaxQuality && QUALITY_KEYS.includes(key)) {
      return origSetItem.call(this, key, BEST_QUALITY);
    }
    return origSetItem.call(this, key, value);
  };

  function writeQualityPrefs() {
    if (!getSettings().forceMaxQuality) return;
    for (const k of QUALITY_KEYS) {
      try { origSetItem.call(localStorage, k, BEST_QUALITY); } catch (_) {}
    }
  }
  writeQualityPrefs();
  setInterval(writeQualityPrefs, 5000);

  /* 라이브 방송 이탈 방지 */

  const LIVE_PAGE_RE = /chzzk\.naver\.com\/live\//;
  let userInitiated = false;

  function markUserNav() {
    userInitiated = true;
    setTimeout(() => { userInitiated = false; }, 1000);
  }

  window.addEventListener('popstate', markUserNav);
  document.addEventListener('click', (e) => {
    if (e.isTrusted && e.target.closest('a[href]')) markUserNav();
  }, true);

  function shouldBlockNav(url) {
    if (userInitiated) return false;
    if (!LIVE_PAGE_RE.test(location.href)) return false;
    if (url == null) return false;
    try {
      const target = new URL(String(url), location.href);
      return !LIVE_PAGE_RE.test(target.href);
    } catch (_) {
      return false;
    }
  }

  const origPushState = History.prototype.pushState;
  History.prototype.pushState = function (state, title, url) {
    if (shouldBlockNav(url)) return;
    return origPushState.apply(this, arguments);
  };

  const origReplaceState = History.prototype.replaceState;
  History.prototype.replaceState = function (state, title, url) {
    if (shouldBlockNav(url)) return;
    return origReplaceState.apply(this, arguments);
  };

  const origAssign = Location.prototype.assign;
  Location.prototype.assign = function (url) {
    if (shouldBlockNav(url)) return;
    return origAssign.call(this, url);
  };

  const origLocReplace = Location.prototype.replace;
  Location.prototype.replace = function (url) {
    if (shouldBlockNav(url)) return;
    return origLocReplace.call(this, url);
  };

  /* 응답 변조 핵심 로직 */

  const CHZZK_API_RE = /api\.chzzk\.naver\.com\/(?:service|polling)\//;
  const LIVE_DETAIL_RE = /\/channels\/[^/]+\/live-detail/;
  const VIDEO_DETAIL_RE = /\/videos\/[^/?]+/;
  const CLIP_DETAIL_RE = /\/play-info\/clip\//;

  const AD_FIELDS = [
    'playerAdDisplayResponse',
    'preplayResponse',
    'midrollAdResponse',
    'displayAdResponse',
    'adResponse',
    'adInfo',
    'adProductId'
  ];

  function pruneAdFields(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 6) return false;
    let modified = false;

    for (const key of Object.keys(obj)) {
      if (AD_FIELDS.includes(key)) {
        delete obj[key];
        modified = true;
        continue;
      }
      const val = obj[key];

      if (typeof val === 'string' && val.length > 50 && (val[0] === '{' || val[0] === '[')) {
        try {
          const parsed = JSON.parse(val);
          if (pruneAdFields(parsed, depth + 1)) {
            obj[key] = JSON.stringify(parsed);
            modified = true;
          }
        } catch (_) {}
      } else if (typeof val === 'object') {
        if (pruneAdFields(val, depth + 1)) modified = true;
      }
    }
    return modified;
  }

  function mutateResponseBody(url, bodyText) {
    const settings = getSettings();
    if (!settings.blockAds && !settings.enableTimemachine) return null;

    let data;
    try { data = JSON.parse(bodyText); } catch (_) { return null; }
    if (!data || typeof data !== 'object') return null;

    let modified = false;

    if (settings.blockAds) {
      if (pruneAdFields(data)) modified = true;
    }

    if (settings.enableTimemachine && LIVE_DETAIL_RE.test(url)) {
      const content = data && data.content;
      if (content && typeof content === 'object') {
        if (content.timeMachineActive !== true) {
          content.timeMachineActive = true;
          modified = true;
        }
        if (typeof content.livePlaybackJson === 'string') {
          try {
            const lp = JSON.parse(content.livePlaybackJson);
            if (lp && lp.live && lp.live.timeMachine !== true) {
              lp.live.timeMachine = true;
              content.livePlaybackJson = JSON.stringify(lp);
              modified = true;
            }
          } catch (_) {}
        }
      }
    }

    return modified ? JSON.stringify(data) : null;
  }

  /* fetch 후킹 */

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const response = await origFetch.apply(this, arguments);

    if (!CHZZK_API_RE.test(url)) return response;

    try {
      const cloned = response.clone();
      const text = await cloned.text();
      const mutated = mutateResponseBody(url, text);
      if (mutated == null) return response;

      return new Response(mutated, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (e) {
      return response;
    }
  };

  /* XHR 후킹 */

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ck_url = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const url = this.__ck_url || '';
    if (!CHZZK_API_RE.test(url)) return origSend.apply(this, arguments);

    const onReady = () => {
      if (this.readyState !== 4) return;
      try {
        if (this.responseType && this.responseType !== '' && this.responseType !== 'text') return;
        const original = this.responseText;
        const mutated = mutateResponseBody(url, original);
        if (mutated == null) return;

        Object.defineProperty(this, 'responseText', { get: () => mutated, configurable: true });
        Object.defineProperty(this, 'response',     { get: () => mutated, configurable: true });
      } catch (_) {}
    };

    this.addEventListener('readystatechange', onReady);
    return origSend.apply(this, arguments);
  };

  window.dispatchEvent(new CustomEvent('ck:hook-ready'));
})();
