// Dev hot reload (unpacked installs only): listens to dev/watch.js and reloads the extension and open TRACS tabs.
(() => {
  const WS_URL = 'ws://127.0.0.1:35729';
  const TABS = 'https://tracs.utoronto.ca/*';

  chrome.management.getSelf().then((self) => {
    if (self.installType !== 'development') return;

    // Tabs keep the old content scripts after a reload, so refresh them once the new worker starts.
    chrome.storage.local.get('devReloadTabs').then(({ devReloadTabs }) => {
      if (!devReloadTabs) return;
      chrome.storage.local.remove('devReloadTabs');
      // Only the postings list; refreshing an application form could discard unsaved answers.
      chrome.tabs.query({ url: TABS }).then((tabs) => tabs
        .filter((t) => new URL(t.url).pathname === '/')
        .forEach((t) => chrome.tabs.reload(t.id)));
    });

    let retry = 1000;
    (function connect() {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => { retry = 1000; };
      ws.onmessage = async (e) => {
        if (e.data !== 'reload') return;
        await chrome.storage.local.set({ devReloadTabs: true });
        chrome.runtime.reload();
      };
      ws.onclose = () => setTimeout(connect, (retry = Math.min(retry * 2, 30000)));
    })();
  });
})();
