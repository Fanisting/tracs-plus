// Fills in the version and whether the toolbar icon is pinned (rechecked when you come back to this tab).
document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;

const pin = document.getElementById('pin-state');
async function showPinned() {
  if (!chrome.action.getUserSettings) return;
  const { isOnToolbar } = await chrome.action.getUserSettings();
  pin.hidden = false;
  pin.textContent = isOnToolbar ? 'Pinned' : 'Not pinned yet';
  pin.classList.toggle('ok', isOnToolbar);
}
showPinned();
document.addEventListener('visibilitychange', () => { if (!document.hidden) showPinned(); });
window.addEventListener('focus', showPinned);
