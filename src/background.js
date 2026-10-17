// Service worker: queries the UofT Timetable Builder API (CORS blocks this from the page) and caches results.
importScripts('lib.js', 'dev-reload.js');
const { parseCode, sessionsFor, compactCourses } = self.TracsPlusLib;

const API = 'https://api.easi.utoronto.ca/ttb/getPageableCourses';
const TTL_HIT = 24 * 3600 * 1000;
const TTL_MISS = 6 * 3600 * 1000;
const CACHE_VERSION = 'v1';
const inflight = new Map();

// The API answers with an empty body unless the request looks like it came from the Timetable Builder.
// Scoped to requests made by this extension (no tab), so normal browsing is untouched.
const headersReady = chrome.declarativeNetRequest.updateSessionRules({
  removeRuleIds: [1],
  addRules: [{
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'set', value: 'https://ttb.utoronto.ca' },
        { header: 'Referer', operation: 'set', value: 'https://ttb.utoronto.ca/' },
      ],
    },
    condition: {
      urlFilter: '||api.easi.utoronto.ca/ttb/getPageableCourses',
      tabIds: [chrome.tabs.TAB_ID_NONE],
      requestMethods: ['post'],
      resourceTypes: ['xmlhttprequest'],
    },
  }],
});

function body(code, sessions) {
  return JSON.stringify({
    courseCodeAndTitleProps: { courseCode: code, courseTitle: '', searchCourseDescription: false },
    departmentProps: [], campuses: [], sessions, requirementProps: [], instructor: '',
    courseLevels: [], deliveryModes: [], dayPreferences: [], timePreferences: [], divisions: [],
    creditWeights: [], availableSpace: false, waitListable: false, page: 1, pageSize: 20, direction: 'asc',
  });
}

async function queryCode(code, sessions) {
  await headersReady;
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body(code, sessions),
  });
  if (res.status === 404) return [];
  const text = await res.text();
  if (!res.ok || !text) throw new Error(`HTTP ${res.status}${text ? '' : ', empty body'}`);
  return compactCourses(JSON.parse(text)?.payload?.pageableCourse?.courses);
}

// Drop expired cache entries once per service worker start, so the cache cannot grow without end.
chrome.storage.local.get(null).then((all) => {
  const old = Object.entries(all)
    .filter(([k, v]) => k.startsWith(`${CACHE_VERSION}|`) && !(Date.now() - v?.t < TTL_HIT))
    .map(([k]) => k);
  if (old.length) chrome.storage.local.remove(old);
});

async function lookup({ raw, dept, year }) {
  const { candidates } = parseCode(raw, dept);
  const key = `${CACHE_VERSION}|${candidates.join(',')}|${year}`;
  const stored = (await chrome.storage.local.get(key))[key];
  if (stored && Date.now() - stored.t < (stored.o.length ? TTL_HIT : TTL_MISS)) return stored.o;

  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      const sessions = sessionsFor(year);
      let offerings = [];
      for (const code of candidates) {
        offerings = await queryCode(code, sessions);
        if (offerings.length) break;
      }
      await chrome.storage.local.set({ [key]: { t: Date.now(), o: offerings } });
      return offerings;
    })().finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
}

// The guide opens once on first install, and again whenever the toolbar icon or the bar's "Guide" link is clicked.
const openGuide = () => chrome.tabs.create({ url: chrome.runtime.getURL('guide/guide.html') });
chrome.runtime.onInstalled.addListener(({ reason }) => { if (reason === 'install') openGuide(); });
chrome.action.onClicked.addListener(openGuide);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'lookup') {
    lookup(msg).then((offerings) => sendResponse({ offerings }), (e) => sendResponse({ error: String(e.message || e) }));
    return true;
  }
  if (msg?.type === 'openGuide') openGuide();
  return false;
});
