// Isolated-world content script: relays between the page script (main.js) and the extension.
(() => {
  'use strict';
  const DEFAULTS = { showName: true, showInstr: true, showEmail: true, lecOnly: true, anyTerm: false, hideEmpty: true, rememberJob: false, jobTitle: '' };
  const TO_PAGE = 'tracsplus-bridge';
  const FROM_PAGE = 'tracsplus-main';
  const MAX_LOOKUPS = 6; // in flight at once; main.js keeps to this too, but any page script can post here
  let lookups = 0;

  const post = (msg) => window.postMessage({ src: TO_PAGE, ...msg }, location.origin);
  // After the extension is reloaded or updated, scripts left in already-open tabs lose chrome.* access.
  const alive = () => !!globalThis.chrome?.runtime?.id;
  const sendSettings = () => alive() && chrome.storage.sync.get(DEFAULTS).then((settings) => post({ type: 'settings', settings }));

  // Messages come from the page, so only known settings of the right type are stored.
  function cleanSettings(input) {
    const out = {};
    for (const [k, def] of Object.entries(DEFAULTS)) {
      const v = input?.[k];
      if (typeof def === 'boolean' && typeof v === 'boolean') out[k] = v;
      else if (typeof def === 'string' && typeof v === 'string') out[k] = v.slice(0, 200);
    }
    return out;
  }

  // A course code like "RSM270H1 S" or "RSM1282H.108" and a 4-digit academic year; anything else is not looked up.
  const validLookup = (msg) => typeof msg.raw === 'string' && /^[\w ./-]{3,30}$/.test(msg.raw)
    && /^20\d\d$/.test(String(msg.year)) && (msg.dept == null || /^[A-Za-z0-9 -]{0,20}$/.test(String(msg.dept)));

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
        chrome.storage.sync.set(cleanSettings(msg.settings));
        break;
      case 'openGuide':
        // Only right after a real click, so a page script cannot open tabs on its own.
        if (navigator.userActivation?.isActive) chrome.runtime.sendMessage({ type: 'openGuide' });
        break;
      case 'lookup': {
        if (!validLookup(msg)) { post({ type: 'result', id: msg.id, error: 'not a course code' }); break; }
        if (lookups >= MAX_LOOKUPS) { post({ type: 'result', id: msg.id, error: 'busy, try again' }); break; }
        lookups++;
        let res;
        try {
          res = await chrome.runtime.sendMessage({ type: 'lookup', raw: msg.raw, dept: String(msg.dept ?? ''), year: Number(msg.year) });
        } catch (err) {
          res = { error: String(err.message || err) };
        } finally {
          lookups--;
        }
        post({ type: 'result', id: msg.id, ...res });
        break;
      }
    }
  });

  if (alive()) chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'sync') sendSettings(); });
  sendSettings();
})();
