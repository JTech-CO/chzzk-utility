/* 라이브 방송 강제 복귀 (튀겨나온 직후 재접속) */

const CK_LIVE_RE = /chzzk\.naver\.com\/live\/([a-zA-Z0-9_-]+)/;
const CK_MAIN_RE = /^https?:\/\/chzzk\.naver\.com\/?(?:\?.*)?$/;

function trackOrRecoverLive() {
  const liveMatch = location.href.match(CK_LIVE_RE);

  if (liveMatch) {
    sessionStorage.setItem('__ck_live_id', liveMatch[1]);
    sessionStorage.setItem('__ck_live_ts', Date.now().toString());
    sessionStorage.setItem('__ck_retries', '0');
    return;
  }

  if (!CK_MAIN_RE.test(location.href)) {
    sessionStorage.removeItem('__ck_live_id');
    return;
  }

  const savedId = sessionStorage.getItem('__ck_live_id');
  const savedTs = parseInt(sessionStorage.getItem('__ck_live_ts') || '0');
  const retries = parseInt(sessionStorage.getItem('__ck_retries') || '0');
  const elapsed = Date.now() - savedTs;

  if (savedId && elapsed < 5000 && retries < 5) {
    sessionStorage.setItem('__ck_retries', (retries + 1).toString());
    sessionStorage.setItem('__ck_live_ts', Date.now().toString());
    location.replace('https://chzzk.naver.com/live/' + savedId);
  } else {
    sessionStorage.removeItem('__ck_live_id');
  }
}

trackOrRecoverLive();

const DEFAULTS = {
  blockAds: true,
  hideAdblockPopup: true,
  removeBanners: true,
  forceMaxQuality: true,
  enableTimemachine: true,
  showControls: true,
  preventLiveDeparture: true
};

let settings = { ...DEFAULTS };

/* inject.js를 페이지 컨텍스트(Main World)로 주입 */

function injectMainWorldScript() {
  const main = document.createElement('script');
  main.src = chrome.runtime.getURL('inject.js');
  main.async = false;
  main.dataset.ckSettings = JSON.stringify(settings);
  (document.head || document.documentElement).appendChild(main);
  main.onload = () => {
    main.remove();
    pushSettingsToPage();
  };
}

function pushSettingsToPage() {
  window.postMessage({ __ck_type: 'settings', payload: settings }, '*');
}

/* 팝업 차단 (광고 차단 감지 + 비정상 접근 경고) */

const POPUP_PHRASES = [
  '광고 차단',
  '광고차단',
  '애드블록',
  'AdBlock',
  '비정상적 접근',
  '허용되지 않는',
  '고화질 라이브를 감상할 수 없습니다',
  '다른 브라우저를 이용해주세요'
];

function isBlockablePopup(el) {
  if (!el || !el.textContent) return false;
  const t = el.textContent;
  if (t.length > 600) return false;
  return POPUP_PHRASES.some(p => t.includes(p));
}

function killPopups() {
  if (!settings.hideAdblockPopup) return;

  const selectors = [
    '[role="dialog"]',
    '[class*="dialog" i]',
    '[class*="modal" i]',
    '[class*="popup" i]',
    '[class*="layer" i]',
    '[class*="overlay" i]',
    '[class*="alert" i]',
    '[class*="toast" i]',
    '[class*="dimmed" i]'
  ].join(', ');

  const candidates = document.querySelectorAll(selectors);
  for (const el of candidates) {
    if (el.dataset.ckKilled) continue;
    if (!isBlockablePopup(el)) continue;
    dismissPopup(el);
  }

  /* 인라인 모달 탐색 최적화 (포털 컨테이너 한정) */
  const portalCandidates = document.querySelectorAll('body > div, [id*="root" i] > div, [id*="portal" i] > div');
  for (const el of portalCandidates) {
    if (el.dataset.ckKilled) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    if (parseInt(cs.zIndex) < 100) continue;
    if (!isBlockablePopup(el)) continue;
    dismissPopup(el);
  }
}

function dismissPopup(el) {
  const close = el.querySelector('button[aria-label*="닫" i], button[class*="close" i], [role="button"][class*="close" i], button');
  if (close) {
    try { close.click(); } catch (_) {}
  }
  el.style.setProperty('display', 'none', 'important');
  el.dataset.ckKilled = '1';

  /* 부모 오버레이/백드롭도 함께 제거 */
  const parent = el.parentElement;
  if (parent && parent !== document.body && parent !== document.documentElement) {
    const ps = getComputedStyle(parent);
    if (ps.position === 'fixed' || ps.position === 'absolute') {
      parent.style.setProperty('display', 'none', 'important');
      parent.dataset.ckKilled = '1';
    }
  }

  document.documentElement.style.removeProperty('overflow');
  document.body && document.body.style.removeProperty('overflow');
}

/* 페이지 내 배너 광고 제거 */

const BANNER_SELECTORS = [
  'a[href*="//ad."]',
  'a[href*="ad.naver.com"]',
  'iframe[src*="ad."]',
  'iframe[src*="advertisement"]',
  '[class*="advertisement" i]',
  '[class*="banner_ad" i]',
  '[data-promotion="true"]',
  '[data-ad-type]',
  '[class*="event_banner" i][class*="ad" i]'
];

function removeBanners() {
  if (!settings.removeBanners) return;
  for (const sel of BANNER_SELECTORS) {
    document.querySelectorAll(sel).forEach(el => {
      if (el.closest('video, [class*="player_layout" i]')) return;
      el.style.setProperty('display', 'none', 'important');
    });
  }
}

/* 최고 화질 강제 유지 */

function forceMaxQuality() {
  if (!settings.forceMaxQuality) return;

  try {
    const keys = ['chzzk-quality-1', 'chzzk_player_quality', 'liveQuality', 'preferredQuality'];
    for (const k of keys) {
      const cur = localStorage.getItem(k);
      if (cur && /best|max|1080|original/i.test(cur)) continue;
      try { localStorage.setItem(k, JSON.stringify({ value: 'best' })); } catch (_) {}
    }
  } catch (_) {}

  installQualityAutoPicker();
}

let qualityPickerInstalled = false;
function installQualityAutoPicker() {
  if (qualityPickerInstalled) return;
  qualityPickerInstalled = true;

  const observer = new MutationObserver(() => {
    if (!settings.forceMaxQuality) return;
    const lists = document.querySelectorAll('[role="menu"], [class*="quality_list" i], ul[class*="setting" i]');
    for (const list of lists) {
      const items = list.querySelectorAll('button, [role="menuitem"], li');
      if (items.length < 2) continue;

      const looksLikeQuality = Array.from(items).some(it => /\d{3,4}\s*p/i.test(it.textContent || ''));
      if (!looksLikeQuality) continue;
      if (list.dataset.ckQualityPicked) continue;

      let target = null;
      for (const it of items) {
        if (/자동|auto/i.test(it.textContent || '')) continue;
        target = it; break;
      }
      if (target) {
        list.dataset.ckQualityPicked = '1';
        try { target.click(); } catch (_) {}
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

/* 되감기 컨트롤 바 */

function findVideo() {
  const videos = Array.from(document.querySelectorAll('video'));
  if (videos.length === 0) return null;
  const ready = videos.find(v => v.readyState >= 1 && !isNaN(v.duration));
  return ready || videos[0];
}

function findInsertionPoint() {
  const candidates = [
    '[class*="live_information_title" i]',
    '[class*="live_title" i]',
    '[class*="video_information_title" i]',
    '[class*="information_title" i]',
    'h2[class*="title" i]'
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function buildControlBar() {
  const bar = document.createElement('div');
  bar.id = 'ck-controls';
  bar.className = 'ck-controls';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Chzzk Utility 재생 컨트롤');

  const buttons = [
    { act: 'b30', label: '-30s', title: '30초 전' },
    { act: 'b5',  label: '-5s',  title: '5초 전' },
    { act: 'tg',  label: 'Pause', title: '재생 / 일시정지' },
    { act: 'f5',  label: '+5s',  title: '5초 후' },
    { act: 'f30', label: '+30s', title: '30초 후' },
    { act: 'live', label: 'LIVE', title: '라이브 엣지로' }
  ];

  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ck-btn' + (b.act === 'live' ? ' ck-btn-live' : '');
    btn.dataset.act = b.act;
    btn.title = b.title;
    btn.textContent = b.label;
    bar.appendChild(btn);
  }

  bar.addEventListener('click', onControlClick);
  return bar;
}

function onControlClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const v = findVideo();
  if (!v) return;

  const act = btn.dataset.act;
  const seekableEnd = v.seekable && v.seekable.length ? v.seekable.end(v.seekable.length - 1) : null;

  switch (act) {
    case 'b30':  v.currentTime = Math.max(0, v.currentTime - 30); break;
    case 'b5':   v.currentTime = Math.max(0, v.currentTime - 5);  break;
    case 'tg':
      if (v.paused) { v.play(); btn.textContent = 'Pause'; }
      else { v.pause(); btn.textContent = 'Play'; }
      break;
    case 'f5':   v.currentTime = clampForward(v, v.currentTime + 5);  break;
    case 'f30':  v.currentTime = clampForward(v, v.currentTime + 30); break;
    case 'live':
      if (seekableEnd != null) v.currentTime = seekableEnd - 0.5;
      v.play().catch(()=>{});
      break;
  }
}

function clampForward(v, t) {
  if (v.seekable && v.seekable.length) {
    const end = v.seekable.end(v.seekable.length - 1);
    return Math.min(end - 0.5, t);
  }
  return t;
}

function injectControlBar() {
  if (!settings.showControls) return;
  if (document.getElementById('ck-controls')) return;

  const v = findVideo();
  if (!v) return;
  const anchor = findInsertionPoint();
  if (!anchor) return;

  const bar = buildControlBar();
  if (anchor.parentElement) {
    anchor.parentElement.insertBefore(bar, anchor.nextSibling);
  }
}

function removeControlBar() {
  const bar = document.getElementById('ck-controls');
  if (bar) bar.remove();
}

/* SPA 라우팅 대응 + 통합 옵저버 */

let lastUrl = location.href;
function onUrlChanged() {
  removeControlBar();
}

const tick = () => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    onUrlChanged();
    trackOrRecoverLive();
  }
  killPopups();
  removeBanners();
  injectControlBar();
};

const mainObserver = new MutationObserver(tick);
function startObservers() {
  mainObserver.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 1500);
}

/* 부트스트랩 */

(async function boot() {
  try {
    const stored = await chrome.storage.local.get('settings');
    if (stored && stored.settings) {
      settings = { ...DEFAULTS, ...stored.settings };
    }
  } catch (_) {}

  injectMainWorldScript();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    settings = { ...DEFAULTS, ...changes.settings.newValue };
    pushSettingsToPage();

    if (!settings.showControls) removeControlBar();
    else injectControlBar();
  });

  if (document.body) {
    startObservers();
    forceMaxQuality();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      startObservers();
      forceMaxQuality();
    }, { once: true });
  }
})();
