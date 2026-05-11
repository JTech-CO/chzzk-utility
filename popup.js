const DEFAULTS = {
  blockAds: true,
  hideAdblockPopup: true,
  removeBanners: true,
  forceMaxQuality: true,
  enableTimemachine: true,
  showControls: true
};

const KEYS = Object.keys(DEFAULTS);

const $ = sel => document.querySelector(sel);

function statusFlash(msg) {
  const el = $('#ck-status');
  el.textContent = msg;
  el.classList.add('is-saved');
  clearTimeout(statusFlash._t);
  statusFlash._t = setTimeout(() => {
    el.textContent = '설정이 자동으로 저장됩니다';
    el.classList.remove('is-saved');
  }, 1200);
}

async function loadSettings() {
  const stored = await chrome.storage.local.get('settings');
  const s = { ...DEFAULTS, ...(stored.settings || {}) };
  for (const k of KEYS) {
    const input = document.getElementById('opt-' + k);
    if (input) input.checked = !!s[k];
  }

  try {
    const v = chrome.runtime.getManifest().version;
    $('#ck-version').textContent = 'v' + v;
  } catch (_) {}
}

async function saveOne(key, value) {
  const stored = await chrome.storage.local.get('settings');
  const s = { ...DEFAULTS, ...(stored.settings || {}) };
  s[key] = !!value;
  await chrome.storage.local.set({ settings: s });
  statusFlash('저장됨');
}

function bind() {
  for (const k of KEYS) {
    const input = document.getElementById('opt-' + k);
    if (!input) continue;
    input.addEventListener('change', () => saveOne(k, input.checked));
  }

  $('#ck-reset').addEventListener('click', async () => {
    await chrome.storage.local.set({ settings: { ...DEFAULTS } });
    await loadSettings();
    statusFlash('기본값으로 초기화');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bind();
});
