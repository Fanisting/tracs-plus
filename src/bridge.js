// Isolated-world content script: relays between the page script (main.js) and the extension.
(() => {
  'use strict';
  const DEFAULTS = { showName: true, showInstr: true, showEmail: true, lecOnly: true, anyTerm: false, hideEmpty: true, rememberJob: false, jobTitle: '' };
  const TO_PAGE = 'tracsplus-bridge';
  const FROM_PAGE = 'tracsplus-main';

  const post = (msg) => window.postMessage({ src: TO_PAGE, ...msg }, location.origin);
  // After the extension is reloaded or updated, scripts left in already-open tabs lose chrome.* access.
  const alive = () => !!globalThis.chrome?.runtime?.id;
  const sendSettings = () => alive() && chrome.storage.sync.get(DEFAULTS).then((settings) => post({ type: 'settings', settings }));

  window.addEventListener('message', async (e) => {
    const msg = e.data;
    if (e.source !== window || !msg || msg.src !== FROM_PAGE) return;
    if (!alive()) {
      if (msg.type === 'lookup') post({ type: 'result', id: msg.id, error: 'TRACS+ was updated; reload this page' });
      return;
    }
    switch (msg.type) {
      case 'hello':
        sendSettings();
        break;
      case 'saveSettings':
        chrome.storage.sync.set(msg.settings);
        break;
      case 'openGuide':
        chrome.runtime.sendMessage({ type: 'openGuide' });
        break;
      case 'lookup': {
        let res;
        try {
          res = await chrome.runtime.sendMessage({ type: 'lookup', raw: msg.raw, dept: msg.dept, year: msg.year });
        } catch (err) {
          res = { error: String(err.message || err) };
        }
        post({ type: 'result', id: msg.id, ...res });
        break;
      }
    }
  });

  if (alive()) chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'sync') sendSettings(); });
  sendSettings();
})();
