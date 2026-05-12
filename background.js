const DEFAULT_SETTINGS = {
  blockAds: true,
  hideAdblockPopup: true,
  removeBanners: true,
  forceMaxQuality: true,
  enableTimemachine: true,
  showControls: true,
  preventLiveDeparture: true
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  } else {
    await chrome.storage.local.set({
      settings: { ...DEFAULT_SETTINGS, ...stored.settings }
    });
  }
  await syncStaticRules();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) {
    await syncStaticRules();
  }
});

async function syncStaticRules() {
  try {
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
    if (settings.blockAds) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ['ck_static']
      });
    } else {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ['ck_static']
      });
    }
  } catch (e) {
    console.warn('[CK] rule sync failed', e);
  }
}
