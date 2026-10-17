const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/lib.js');

test('parseCode handles the course code formats seen in TRACS', () => {
  assert.deepEqual(L.parseCode('RSM270H1').candidates, ['RSM270H1']);
  assert.deepEqual(L.parseCode('PSY220H5 S'), { base: 'PSY220', section: 'S', candidates: ['PSY220H5'] });
  assert.deepEqual(L.parseCode('JAV130H1S'), { base: 'JAV130', section: 'S', candidates: ['JAV130H1'] });
  assert.deepEqual(L.parseCode('MGY381', 'MOGEN').candidates, ['MGY381H1', 'MGY381Y1', 'MGY381H5', 'MGY381Y5', 'MGY381H3', 'MGY381Y3']);
  assert.deepEqual(L.parseCode('MGY381', 'UMPSY').candidates.slice(0, 2), ['MGY381H5', 'MGY381Y5']);
  assert.deepEqual(L.parseCode('NUR351Y').candidates, ['NUR351Y1', 'NUR351Y5', 'NUR351Y3']);
  assert.deepEqual(L.parseCode('NUR371-R1').candidates.length, 6);
  assert.deepEqual(L.parseCode('RSM2512H').candidates, ['RSM2512H1']);
  assert.deepEqual(L.parseCode('FOR3005HF'), { base: 'FOR3005', section: 'F', candidates: ['FOR3005H1'] });
  assert.deepEqual(L.parseCode('CSCA08H3').candidates, ['CSCA08H3']);
  assert.deepEqual(L.parseCode('').candidates, []);
});

test('sessions and term prefixes follow the TRACS academic-year convention', () => {
  assert.deepEqual(L.sessionsFor(2027), ['20269', '20271', '20269-20271', '20275', '20279']);
  assert.deepEqual(L.termPrefixes(2027, '3'), ['20271']);
  assert.deepEqual(L.termPrefixes(2027, '5'), ['20275']);
  assert.equal(L.termLabel(['20269']), 'Fall 2026');
  assert.equal(L.termLabel(['20269-20271']), 'Fall 2026-Winter 2027');
});

const RSM270 = [
  { code: 'RSM270H1', sec: 'F', ses: ['20269'], s: [
    { n: 'LEC0101', m: 'LEC', i: ['Vahid Roshanaei'] },
    { n: 'LEC0601', m: 'LEC', i: ['Hamid Arzani'] },
  ] },
  { code: 'RSM270H1', sec: 'S', ses: ['20271'], s: [
    { n: 'LEC0101', m: 'LEC', i: ['Hansheng Jiang'] },
    { n: 'LEC0201', m: 'LEC', i: ['Hansheng Jiang'] },
    { n: 'LEC0401', m: 'LEC', i: ['Adam Saunders'] },
    { n: 'LEC5101', m: 'LEC', i: [] },
    { n: 'TUT0101', m: 'TUT', i: ['Some TA'] },
  ] },
];

test('pickInstructors returns unique lecture instructors for the posting term', () => {
  const p = L.pickInstructors(RSM270, { prefixes: ['20271'] });
  assert.deepEqual(p.names, ['Hansheng Jiang', 'Adam Saunders']);
  assert.equal(p.otherTerm, false);
  assert.equal(p.detail.length, 3);
});

test('lecOnly=false also lists tutorial instructors', () => {
  const p = L.pickInstructors(RSM270, { prefixes: ['20271'], lecOnly: false });
  assert.deepEqual(p.names, ['Hansheng Jiang', 'Adam Saunders', 'Some TA']);
});

test('explicit section suffix filters offerings', () => {
  const p = L.pickInstructors(RSM270, { prefixes: [], section: 'F' });
  assert.deepEqual(p.names, ['Vahid Roshanaei', 'Hamid Arzani']);
});

test('other-term fallback only when enabled', () => {
  const fallOnly = [RSM270[0]];
  const off = L.pickInstructors(fallOnly, { prefixes: ['20271'] });
  assert.deepEqual(off.names, []);
  assert.equal(off.inTimetable, true);
  const on = L.pickInstructors(fallOnly, { prefixes: ['20271'], anyTerm: true });
  assert.deepEqual(on.names, ['Vahid Roshanaei', 'Hamid Arzani']);
  assert.equal(on.otherTerm, true);
  assert.equal(on.term, 'Fall 2026');
});

test('full-year offerings match the winter term', () => {
  const y = [{ code: 'ABC100Y1', sec: 'Y', ses: ['20269-20271'], s: [{ n: 'LEC0101', m: 'LEC', i: ['A B'] }] }];
  assert.deepEqual(L.pickInstructors(y, { prefixes: ['20271'], section: 'S' }).names, ['A B']);
});

test('not in timetable', () => {
  const p = L.pickInstructors([], { prefixes: ['20271'] });
  assert.equal(p.inTimetable, false);
  assert.deepEqual(p.names, []);
});

test('sameJobTitle: exact match ignoring case and spacing', () => {
  assert.equal(L.sameJobTitle('Teaching  Assistant', 'teaching assistant'), true);
  assert.equal(L.sameJobTitle('Teaching Asst [FIN]', 'Teaching Asst [FIN] [OMS]'), false);
  assert.equal(L.sameJobTitle('Teaching Asst [FIN]', 'Teaching Asst'), false);
  assert.equal(L.sameJobTitle('', ''), false);
  assert.equal(L.sameJobTitle(null, 'x'), false);
});

test('compactCourses keeps only what the UI needs', () => {
  const out = L.compactCourses([{ code: 'X', sectionCode: 'S', sessions: ['20271'], sections: [
    { name: 'LEC0101', teachMethod: 'LEC', instructors: [{ firstName: 'Ada', lastName: 'Lovelace' }], extra: 1 },
  ] }]);
  assert.deepEqual(out, [{ code: 'X', sec: 'S', ses: ['20271'], s: [{ n: 'LEC0101', m: 'LEC', i: ['Ada Lovelace'] }] }]);
});
