// Page-world script: adds "Course Name" and "Instructor" columns to the TRACS postings bootstrap-table.
(() => {
  'use strict';
  const L = window.TracsPlusLib;
  const TABLE = '#postings-table';
  // TRACS's customSearch skips course_title, so the name lives in its own (searchable) field.
  const F_NAME = '_tp_name';
  const F_INSTR = '_tp_instr';
  const F_EMAIL = '_tp_email';
  const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  const emailsOf = (row) => [...new Set(String(row.ta_support || '').match(EMAIL_RE) || [])];
  const MAX_INFLIGHT = 6;

  let settings = { showName: true, showInstr: true, showEmail: true, lecOnly: true, anyTerm: false, hideEmpty: true, rememberJob: false, jobTitle: '' };
  // The job title chosen on this page. It starts at "All departments" unless "Remember my choice" is on,
  // in which case it starts from the saved settings.jobTitle (set once, when the saved settings first arrive).
  let currentJob = '';
  let jobRestored = false;
  let appliedJobTitle = '';
  let jobColHidden = false;
  let autoHidden = []; // TRACS columns hidden because every listed posting leaves them blank
  const HIDDEN_BY_DEFAULT = ['appointment']; // Hours; can be shown again from the table's column picker
  const cache = new Map(); // key -> { offerings } | { error }
  const queued = new Set();
  const queue = [];
  const pending = new Map(); // message id -> key
  let nextId = 1;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const keyOf = (row) => `${row.course_code}|${row.dept_id}|${row.sess_year}`;
  const post = (msg) => window.postMessage({ src: 'tracsplus-main', ...msg }, location.origin);

  // ---------- instructor lookups ----------
  function enqueue(row) {
    const key = keyOf(row);
    if (cache.has(key) || queued.has(key) || !row.course_code) return;
    queued.add(key);
    queue.push({ key, raw: row.course_code, dept: row.dept_id, year: row.sess_year });
    pump();
  }

  function pump() {
    while (pending.size < MAX_INFLIGHT && queue.length) {
      const job = queue.shift();
      const id = nextId++;
      pending.set(id, job.key);
      post({ type: 'lookup', id, raw: job.raw, dept: job.dept, year: job.year });
    }
    updateStatus();
  }

  function onResult(msg) {
    const key = pending.get(msg.id);
    if (!key) return;
    pending.delete(msg.id);
    queued.delete(key);
    cache.set(key, msg.error ? { error: msg.error } : { offerings: msg.offerings || [] });
    refreshKey(key);
    pump();
  }

  function pick(row) {
    const entry = cache.get(keyOf(row));
    if (!entry) return null;
    if (entry.error) return { error: entry.error };
    const { section } = L.parseCode(row.course_code, row.dept_id);
    return L.pickInstructors(entry.offerings, {
      prefixes: L.termPrefixes(row.sess_year, row.sess_sess),
      section,
      lecOnly: settings.lecOnly,
      anyTerm: settings.anyTerm,
    });
  }

  function instrText(row) {
    const p = pick(row);
    return p && !p.error ? p.names.join('; ') : '';
  }

  // Rows without a known instructor sort last in both directions (bootstrap-table multiplies by the order).
  function sortEmptyLast(a, b) {
    if (!a === !b) return String(a || '').localeCompare(String(b || ''));
    const dir = table()?.options.sortOrder === 'desc' ? -1 : 1;
    return (a ? -1 : 1) * dir;
  }

  // 4-digit codes (RSM2512H) are graduate courses, which the UofT Timetable Builder does not cover.
  const isGrad = (row) => /^[A-Z]{3}\d{4}/.test(String(row.course_code || '').toUpperCase().replace(/\s+/g, ''));

  // named | tba | grad | missing | error | loading
  function rowState(row) {
    const p = pick(row);
    if (!p) return 'loading';
    if (p.error) return 'error';
    if (p.names.length) return 'named';
    if (p.inTimetable) return 'tba';
    return isGrad(row) ? 'grad' : 'missing';
  }

  const EMPTY_CELL = {
    tba: ['TBA', 'In the UofT timetable, but no instructor is posted for this term yet'],
    grad: ['grad course', 'Graduate course: the UofT Timetable Builder only lists undergraduate courses, and graduate instructors are not published publicly'],
    missing: ['not in timetable', 'This course code is not in the UofT Timetable Builder'],
  };

  function instrHTML(row) {
    const k = esc(keyOf(row));
    const p = pick(row);
    if (!p) return `<span class="tp-instr tp-muted" data-k="${k}">…</span>`;
    if (p.error) return `<span class="tp-instr tp-muted" data-k="${k}" title="Lookup failed: ${esc(p.error)}">error</span>`;
    if (!p.names.length) {
      const [label, tip] = EMPTY_CELL[rowState(row)];
      return `<span class="tp-instr tp-muted" data-k="${k}" title="${esc(tip)}">${label}</span>`;
    }
    const tip = (p.otherTerm ? `Not offered in the posting's term; showing ${p.term}\n` : '') + p.detail.join('\n');
    const names = p.names.map((n) => `<div>${esc(n)}</div>`).join('');
    const term = p.otherTerm ? `<small>(${esc(p.term)})</small>` : '';
    return `<span class="tp-instr${p.otherTerm ? ' tp-other' : ''}" data-k="${k}" title="${esc(tip)}">${names}${term}</span>`;
  }

  // ---------- table patching ----------
  const table = () => window.jQuery && window.jQuery(TABLE).data('bootstrap.table');

  function refreshKey(key) {
    const bt = table();
    if (!bt) return;
    for (const row of bt.options.data) if (keyOf(row) === key) row[F_INSTR] = instrText(row);
    for (const span of document.querySelectorAll(`${TABLE} span.tp-instr[data-k="${CSS.escape(key)}"]`)) {
      const row = bt.data[span.closest('tr')?.dataset.index];
      if (row) span.outerHTML = instrHTML(row);
    }
  }

  function refreshAll() {
    const bt = table();
    if (!bt) return;
    for (const key of new Set(bt.options.data.map(keyOf))) refreshKey(key);
    updateStatus();
  }

  function ourColumns() {
    return [
      {
        field: F_NAME, title: 'Course Name', sortable: true, switchable: true, visible: settings.showName, searchFormatter: false,
        class: 'tp-col tp-name-col',
        formatter: (v, row) => `<span class="tp-name" title="${esc(String(row.course_desc || '').slice(0, 500))}">${esc(v)}</span>`,
      },
      {
        field: F_INSTR, title: 'Instructor', sortable: true, switchable: true, visible: settings.showInstr, searchFormatter: false,
        class: 'tp-col',
        sorter: sortEmptyLast,
        formatter: (_v, row) => { enqueue(row); return instrHTML(row); },
      },
      {
        field: F_EMAIL, title: 'TA Support', sortable: true, switchable: true, visible: settings.showEmail, searchFormatter: false,
        class: 'tp-col tp-email-col',
        formatter: (_v, row) => {
          const list = emailsOf(row);
          if (!list.length) return esc(row.ta_support || '');
          // <wbr> lets a long address break before "@", keeping the column narrow.
          return list.map((m) => `<div><a class="tp-email" href="mailto:${esc(m)}">${esc(m).replace('@', '<wbr>@')}</a></div>`).join('');
        },
      },
    ];
  }

  let patchScheduled = false;
  function ensure() {
    const bt = table();
    if (!bt) return;
    ensureBar(bt);
    const cols = bt.options.columns.flat();
    if (cols.some((c) => c.field === F_INSTR)) {
      for (const a of document.querySelectorAll(`${TABLE} a.posting-action`)) if (a.textContent.trim() === 'Apply') a.classList.add('tp-apply');
      scheduleHideEmpty();
      updateStatus();
      return;
    }
    if (patchScheduled) return;
    patchScheduled = true;
    // Defer: TRACS rebuilds the table on every search, and we are inside its post-body event.
    setTimeout(() => {
      patchScheduled = false;
      const cur = table();
      if (!cur || cur.options.columns.flat().some((c) => c.field === F_INSTR)) return;
      const base = cur.options.columns.flat().map((c) => {
        const { fieldIndex, colspanIndex, colspanGroup, ...rest } = c;
        return rest;
      });
      autoHidden = [];
      jobColHidden = false; // TRACS rebuilt the columns; applyJobFilter below hides Job Title again if needed
      for (const c of base) if (HIDDEN_BY_DEFAULT.includes(c.field)) c.visible = false;
      const at = base.findIndex((c) => c.field === 'course_code');
      base.splice(at < 0 ? base.length : at + 1, 0, ...ourColumns());
      for (const row of cur.options.data) {
        row[F_NAME] = row.course_title || '';
        row[F_EMAIL] = emailsOf(row).join('; ') || String(row.ta_support || '');
        row[F_INSTR] = instrText(row);
        enqueue(row);
      }
      fillJobTitles(cur.options.data);
      pinSubmitted(cur);
      window.jQuery(TABLE).bootstrapTable('refreshOptions', {
        columns: base,
        customSearch: wrapSearch(cur.options.customSearch),
        pageSize: 'All', // always list every posting on one page
      });
      // bootstrap-table skips the search step on init when the search box is empty, so run it once.
      appliedJobTitle = '';
      applyJobFilter();
    }, 0);
  }

  // Postings you already submitted stay at the top. bootstrap-table re-sorts after every search, filter
  // and column sort, so a stable partition runs right after its sort step (refreshOptions keeps this instance).
  function pinSubmitted(bt) {
    if (bt.tpPinned) return;
    bt.tpPinned = true;
    const sort = bt.initSort;
    bt.initSort = function (...args) {
      sort.apply(this, args);
      this.data.sort((a, b) => (b.app_status === 'Submitted') - (a.app_status === 'Submitted'));
    };
  }

  const cellText = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  // Columns that also hide when every listed row shows the same value (e.g. all "RSM-TA").
  const HIDE_WHEN_SAME = ['app_id'];

  // TRACS columns (shown, or hidden by us) that are blank for every row currently listed,
  // so the result follows the search box and the job title filter.
  function blankFields(bt) {
    const rows = bt.data;
    if (!rows.length) return autoHidden;
    return bt.options.columns.flat()
      .filter((c) => c.field && c.field !== F_NAME && c.field !== F_INSTR && c.field !== 'operate')
      .filter((c) => c.visible !== false || autoHidden.includes(c.field))
      .filter((c) => {
        const f = typeof c.formatter === 'function' ? c.formatter : typeof c.formatter === 'string' ? window[c.formatter] : null;
        let texts;
        try {
          texts = rows.map((row, i) => cellText(f ? f.call(c, row[c.field], row, i, c.field) : row[c.field]));
        } catch {
          return false;
        }
        if (texts.every((t) => !t)) return true;
        return HIDE_WHEN_SAME.includes(c.field) && texts.every((t) => t === texts[0]);
      })
      .map((c) => c.field);
  }

  // Runs after every render; showColumn/hideColumn re-render, which settles because the set no longer changes.
  let hideEmptyScheduled = false;
  function scheduleHideEmpty() {
    if (hideEmptyScheduled) return;
    hideEmptyScheduled = true;
    setTimeout(() => {
      hideEmptyScheduled = false;
      const bt = table();
      if (!bt || !bt.options.columns.flat().some((c) => c.field === F_INSTR)) return;
      const want = settings.hideEmpty ? blankFields(bt) : [];
      const show = autoHidden.filter((f) => !want.includes(f) && (f !== F_EMAIL || settings.showEmail));
      const hide = want.filter((f) => !autoHidden.includes(f));
      if (!show.length && !hide.length) return;
      autoHidden = want;
      const $t = window.jQuery(TABLE);
      for (const f of show) $t.bootstrapTable('showColumn', f);
      for (const f of hide) $t.bootstrapTable('hideColumn', f);
    }, 0);
  }

  // The job title dropdown is the only filter. A saved title that is not among the current
  // results counts as "All job titles", so a new search never comes back empty because of it.
  let jobTitles = []; // [title, count], titles with whitespace collapsed
  const activeJob = () => jobTitles.find(([t]) => L.sameJobTitle(t, currentJob))?.[0] || '';

  // TRACS's customSearch bypasses bootstrap-table's filterBy, so the job title filter runs in front of it.
  function wrapSearch(orig) {
    if (orig?.tpWrapped) return orig;
    const base = typeof orig === 'function' ? orig : typeof orig === 'string' ? window[orig] : null;
    const search = function (data, text, filters) {
      const job = activeJob();
      const rows = job ? data.filter((r) => L.sameJobTitle(r.job_title, job)) : data;
      if (base) return base.call(this, rows, text, filters);
      const q = String(text || '').toLowerCase();
      return q ? rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q))) : rows;
    };
    search.tpWrapped = true;
    return search;
  }

  function applyJobFilter() {
    const bt = table();
    if (!bt || appliedJobTitle === activeJob() || !bt.options.customSearch?.tpWrapped) return;
    appliedJobTitle = activeJob();
    const $t = window.jQuery(TABLE);
    // While filtering, every listed job title looks alike, so the Job Title column is hidden.
    const hideJob = !!activeJob().trim();
    if (hideJob !== jobColHidden) {
      jobColHidden = hideJob;
      $t.bootstrapTable(hideJob ? 'hideColumn' : 'showColumn', 'job_title');
    }
    $t.bootstrapTable('resetSearch', bt.searchText || '');
  }

  function fillJobTitles(rows) {
    const counts = new Map();
    for (const r of rows) {
      const t = String(r.job_title || '').replace(/\s+/g, ' ').trim();
      if (t) counts.set(t, (counts.get(t) || 0) + 1);
    }
    jobTitles = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const select = document.getElementById('tp-job-select');
    if (!select) return;
    select.innerHTML = `<option value="">All departments (${rows.length})</option>`
      + jobTitles.map(([t, n]) => `<option value="${esc(t)}">${esc(t)} (${n})</option>`).join('');
    select.value = activeJob();
  }

  // ---------- settings bar ----------
  const TOGGLES = [
    ['showName', 'Course name', 'Show the Course Name column'],
    ['showInstr', 'Instructor', 'Show the Instructor column'],
    ['showEmail', 'TA support email', 'Show the TA Support column (contact email from the posting)'],
    ['lecOnly', 'Lecture sections only', 'List instructors of lecture sections only (ignore tutorial and practical sections)'],
    ['anyTerm', 'Use other terms if none', "If the course has no offering in the posting's term, show instructors from another term (in italics)"],
    ['hideEmpty', 'Hide empty columns', 'Hide TRACS columns that are blank for every listed posting (e.g. Type), and Dept-App when every listed posting has the same one'],
  ];

  function ensureBar(bt) {
    if (document.getElementById('tp-bar')) return;
    const wrap = bt.$el.closest('.bootstrap-table')[0];
    if (!wrap) return;
    const bar = document.createElement('div');
    bar.id = 'tp-bar';
    // Bootstrap's own form classes keep the controls in TRACS's style; the badge marks the bar as an add-on.
    const check = (k, label, tip, cls = '') => `<label class="tp-check${cls}" title="${esc(tip)}">`
      + `<input class="form-check-input" type="checkbox" data-s="${k}"> ${esc(label)}</label>`;
    bar.innerHTML = '<div class="tp-row tp-row-job">'
      + '<span class="tp-badge" title="Added by the TRACS+ extension">TRACS+</span>'
      + '<label for="tp-job-select" class="tp-job-label">Filter postings by job title</label>'
      + '<select id="tp-job-select" class="form-select form-select-sm"></select>'
      + check('rememberJob', 'Remember my choice', 'When on, TRACS+ opens with the job title you chose last time. When off, it always starts with All departments.')
      + '<a href="#" class="tp-guide" title="Open the TRACS+ guide">Guide</a>'
      + '</div><div class="tp-row">'
      + TOGGLES.map(([k, label, tip]) => check(k, label, tip)).join('')
      + '</div><div class="tp-row tp-status"></div>';
    wrap.parentNode.insertBefore(bar, wrap);
    bar.addEventListener('change', (e) => {
      const k = e.target.dataset.s;
      if (!k) return;
      settings = { ...settings, [k]: e.target.checked };
      post({ type: 'saveSettings', settings });
      applySettings();
    });
    bar.querySelector('.tp-guide').addEventListener('click', (e) => {
      e.preventDefault();
      post({ type: 'openGuide' });
    });
    bar.querySelector('#tp-job-select').addEventListener('change', (e) => {
      currentJob = e.target.value;
      settings = { ...settings, jobTitle: currentJob };
      post({ type: 'saveSettings', settings });
      applyJobFilter();
    });
    fillJobTitles(bt.options.data);
    syncBar();
  }

  function syncBar() {
    for (const input of document.querySelectorAll('#tp-bar input[data-s]')) input.checked = !!settings[input.dataset.s];
    const select = document.getElementById('tp-job-select');
    if (select && select.value !== activeJob()) select.value = activeJob();
  }

  function applySettings() {
    syncBar();
    applyJobFilter();
    const bt = table();
    if (!bt || !bt.options.columns.flat().some((c) => c.field === F_INSTR)) return;
    const $t = window.jQuery(TABLE);
    $t.bootstrapTable(settings.showName ? 'showColumn' : 'hideColumn', F_NAME);
    $t.bootstrapTable(settings.showInstr ? 'showColumn' : 'hideColumn', F_INSTR);
    if (!autoHidden.includes(F_EMAIL)) $t.bootstrapTable(settings.showEmail ? 'showColumn' : 'hideColumn', F_EMAIL);
    scheduleHideEmpty();
    refreshAll();
  }

  function updateStatus() {
    const el = document.querySelector('#tp-bar .tp-status');
    const bt = table();
    if (!el || !bt) return;
    // One count per course among the listed postings, judged by its first posting.
    const firstRow = new Map();
    for (const row of bt.data) if (!firstRow.has(keyOf(row))) firstRow.set(keyOf(row), row);
    let named = 0, unnamed = 0, loading = 0;
    for (const row of firstRow.values()) {
      const s = rowState(row);
      if (s === 'named') named++;
      else if (s === 'loading') loading++;
      else unnamed++;
    }
    const total = bt.options.data.length;
    const job = activeJob().trim();
    const shown = bt.data.length === total ? `Showing all ${total} postings` : `Showing ${bt.data.length} of ${total} postings`;
    el.textContent = shown + (job ? ` (job title: "${job}")` : '')
      + ` · ${firstRow.size} courses: ${named} with instructor, ${unnamed} without`
      + (loading ? ` · loading ${loading}…` : '');
    el.title = 'Courses without an instructor are graduate courses (the UofT timetable only covers undergraduate courses), '
      + 'courses with no instructor assigned yet (TBA), or courses not in the timetable. Hover over a cell for the reason.';
  }

  // ---------- wiring ----------
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (e.source !== window || !msg || msg.src !== 'tracsplus-bridge') return;
    if (msg.type === 'settings') {
      settings = { ...settings, ...msg.settings };
      if (!jobRestored) {
        jobRestored = true;
        if (settings.rememberJob) currentJob = settings.jobTitle;
      }
      applySettings();
    }
    else if (msg.type === 'result') onResult(msg);
  });

  // ---------- one-click "Rotman TA" search ----------
  function selectOnly(id, labelRe, fallback) {
    const s = document.getElementById(id)?.selectize;
    if (!s) return false;
    const opt = Object.values(s.options).find((o) => labelRe.test(o[s.settings.labelField]));
    s.setValue([opt ? opt[s.settings.valueField] : fallback]);
    return true;
  }

  function addQuickSearch() {
    const search = document.getElementById('searchPostings');
    if (!search || document.getElementById('tp-quick')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'tp-quick';
    btn.className = 'btn btn-outline-primary me-1';
    btn.innerHTML = '<span class="tp-mark">+</span>Rotman TA';
    btn.title = 'TRACS+: search Teaching Assistant postings at the Rotman School of Management';
    search.parentNode.insertBefore(btn, search);
    btn.addEventListener('click', () => {
      const ok = selectOnly('departments', /rotman/i, 'rsm') && selectOnly('applications', /^teaching assistant$/i, 'ta');
      if (ok) search.click();
    });
  }

  function start() {
    window.jQuery(document).on('post-body.bs.table', TABLE, ensure);
    addQuickSearch();
    ensure();
    post({ type: 'hello' });
  }

  // ---------- application form: short notes between a question and its answer field ----------
  const FORM_NOTES = [
    {
      id: 'tp-convocation-note',
      question: /anticipated convocation date/i,
      text: 'Your expected graduation date. U of T convocations are in June and November.',
    },
    {
      id: 'tp-candidate-note',
      question: /best candidate for this position/i,
      prefill: '.',
      text: 'Prefilled with "." (required field). If the instructor has not already agreed, write a few sentences instead.',
    },
  ];

  // Fill an empty answer field only; never overwrite what the applicant wrote. Nothing is saved until they click Next.
  // The field is the one the label points to, or else the only text field in the question's own group.
  const TEXT_FIELD = 'textarea, input[type="text"], input:not([type])';
  function prefillField(label, value) {
    let field = label.htmlFor && document.getElementById(label.htmlFor);
    if (!field) {
      const group = label.closest('.form-group');
      const fields = group ? group.querySelectorAll(TEXT_FIELD) : [];
      field = fields.length === 1 ? fields[0] : null;
    }
    if (!field || !field.matches(TEXT_FIELD) || field.value.trim()) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function addFormNotes() {
    const labels = [...document.querySelectorAll('label')];
    for (const { id, question, text, prefill } of FORM_NOTES) {
      if (document.getElementById(id)) continue;
      const label = labels.find((l) => question.test(l.textContent));
      if (!label) continue;
      const note = document.createElement('div');
      note.id = id;
      note.className = 'tp-note';
      note.innerHTML = `<span class="tp-badge">TRACS+</span> ${esc(text)}`;
      label.insertAdjacentElement('afterend', note);
      if (prefill) prefillField(label, prefill);
    }
  }
  addFormNotes();

  (function waitForJQuery(tries) {
    if (window.jQuery && window.jQuery.fn.bootstrapTable) start();
    else if (tries > 0) setTimeout(() => waitForJQuery(tries - 1), 100);
  })(100);
})();
