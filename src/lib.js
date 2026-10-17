// Pure helpers shared by the page script, the service worker, and the Node tests.
(function (root) {
  'use strict';

  // "PSY220H5 S" -> PSY220H5 + section S; "MGY381" -> MGY381H1, MGY381Y1, ...
  const CODE_RE = /^([A-Z]{3}(?:[A-D]\d{2}|\d{3,4}))([HY])?(\d)?([FSY])?$/;

  function campusOrder(dept) {
    const d = String(dept || '').toUpperCase();
    if (d.startsWith('UM')) return ['5', '1', '3'];
    if (d.startsWith('UT') || d.startsWith('SC')) return ['3', '1', '5'];
    return ['1', '5', '3'];
  }

  function parseCode(raw, dept) {
    const clean = String(raw || '').toUpperCase().replace(/\s+/g, '').replace(/-.*$/, '');
    const m = CODE_RE.exec(clean);
    if (!m) return { base: clean, section: null, candidates: clean ? [clean] : [] };
    const [, base, hy, campus, section] = m;
    const graduate = /\d{4}$/.test(base);
    let candidates;
    if (hy && campus) {
      candidates = [base + hy + campus];
    } else if (graduate) {
      // Graduate codes are rarely in the timetable; spend one request at most.
      candidates = [base + (hy || 'H') + (campus || '1')];
    } else {
      const hys = hy ? [hy] : ['H', 'Y'];
      const campuses = campus ? [campus] : campusOrder(dept);
      candidates = [];
      for (const c of campuses) for (const h of hys) candidates.push(base + h + c);
    }
    return { base, section: section || null, candidates };
  }

  // TRACS sess_year is the calendar year of the Winter term (2027 = 2026-27).
  function sessionsFor(year) {
    const y = Number(year);
    return [`${y - 1}9`, `${y}1`, `${y - 1}9-${y}1`, `${y}5`, `${y}9`];
  }

  function termPrefixes(year, sess) {
    const y = Number(year);
    switch (String(sess)) {
      case '1':
      case '3': return [`${y}1`];
      case '5': return [`${y}5`];
      case '9': return [`${y}9`, `${y - 1}9`];
      default: return [];
    }
  }

  const TERM_NAMES = { 1: 'Winter', 5: 'Summer', 9: 'Fall' };
  function termLabel(sessions) {
    return (sessions || []).map((s) => {
      const parts = String(s).split('-').map((p) => `${TERM_NAMES[p.slice(4, 5)] || '?'} ${p.slice(0, 4)}`);
      return parts.join('-');
    }).join(', ');
  }

  function offeringInTerm(off, prefixes) {
    if (!prefixes.length) return true;
    return (off.ses || []).some((s) => String(s).split('-').some((p) => prefixes.some((x) => p.startsWith(x))));
  }

  // offerings: compact courses from the service worker (see background.js).
  function pickInstructors(offerings, opts) {
    const { prefixes = [], section = null, lecOnly = true, anyTerm = false } = opts || {};
    const all = (offerings || []).filter((o) => !section || o.sec === section || o.sec === 'Y');
    let chosen = all.filter((o) => offeringInTerm(o, prefixes));
    let otherTerm = false;
    if (!chosen.length && anyTerm) { chosen = all; otherTerm = chosen.length > 0; }

    const names = [];
    const detail = [];
    for (const off of chosen) {
      const withNames = off.s.filter((s) => s.i.length);
      const lec = withNames.filter((s) => s.m === 'LEC');
      const secs = lecOnly && lec.length ? lec : withNames;
      for (const s of secs) {
        detail.push(`${off.code}${off.sec} ${s.n}: ${s.i.join(', ')}`);
        for (const n of s.i) if (!names.includes(n)) names.push(n);
      }
    }
    return {
      names,
      detail,
      otherTerm,
      inTimetable: (offerings || []).length > 0,
      term: otherTerm ? termLabel([...new Set(chosen.flatMap((o) => o.ses))]) : '',
    };
  }

  function compactCourses(courses) {
    return (courses || []).map((c) => ({
      code: c.code,
      sec: c.sectionCode,
      ses: c.sessions || [],
      s: (c.sections || []).map((s) => ({
        n: s.name,
        m: s.teachMethod,
        i: (s.instructors || []).map((i) => `${i.firstName || ''} ${i.lastName || ''}`.trim()).filter(Boolean),
      })),
    }));
  }

  const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Job titles in TRACS vary in case and spacing ("Teaching  Assistant"), so compare them normalized.
  const sameJobTitle = (a, b) => !!normalize(a) && normalize(a) === normalize(b);

  const api = { parseCode, sessionsFor, termPrefixes, termLabel, pickInstructors, compactCourses, sameJobTitle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TracsPlusLib = api;
})(typeof self !== 'undefined' ? self : globalThis);
