/*
 * lab-context-test.js — the questions a learner actually types, answered from evidence or
 * honestly not at all.
 *
 * WHY THIS GATE EXISTS. "What have I done so far?" matched none of the deterministic patterns in
 * lab-context.js, so it fell through to the CloudLabs documentation corpus — which scored an
 * article about ARM templates at 2.81 against a 1.8 floor and answered under "MY BEST GUESS"
 * before the model was ever called. Reproduced offline, one day before it would have happened on
 * stage, one second after the presenter said "every word of that is from what he saw".
 *
 * The deterministic layer is the first thing a question meets, so it is where the honest answer
 * has to live. This gate pins: the accomplishments question is caught here; it answers from what
 * the mentor WATCHED; and with nothing watched it says so rather than guessing around it.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function load(overrides) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'lab-context.js'), 'utf8');
  const win = Object.assign({ LabPilotFrame: { isTop: true, ownsUI: true } }, overrides || {});
  const doc = { readyState: 'complete', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  // lab.json is fetched from the package at load. Give it a Purview identity so nothing here
  // depends on the committed Foundry QA fixture.
  const chrome = { runtime: { getURL: (p) => p, sendMessage() {} } };
  const fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ labCode: 'purview-know-your-data' }) });
  new Function('window', 'document', 'chrome', 'fetch', code)(win, doc, chrome, fetch);
  if (!win.LabPilotLab) throw new Error('lab-context.js did not expose LabPilotLab');
  return win.LabPilotLab;
}

const position = (page) => ({
  read: () => ({
    belief: { index: -1, confidence: 0 }, cursor: { index: -1 },
    place: { page: page || null, section: null, source: page ? 'aria-current' : 'none', confidence: page ? 0.95 : null },
    completed: { count: 0, complete: false }, next: { index: -1, text: null },
    lastCompletion: null, workflow: { state: 'unknown' }, recovery: { reason: null, failure: null },
    sayable: { stepNumber: null, total: 0, source: 'none', why: 'position unknown' }, sources: {},
  }),
  promptLine: () => 'Rocky is NOT certain which step the learner is on.',
});

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

console.log('\n=== THE QUESTIONS A LEARNER TYPES ===\n');

check('"what have I done so far?" is answered HERE, before the docs corpus can', () => {
  const L = load({
    LabPilotMentor: { journey: () => [{ evidence: 'the list went from 1 to 2', place: 'Policies' }] },
    LabPilotPosition: position('Policies'),
  });
  const a = L.answer('what have I done so far?');
  assert.ok(a, 'the question fell through — the corpus will answer it with an ARM-template article');
  assert.match(a, /the list went from 1 to 2 \(on Policies\)/, a);
  assert.match(a, /portal changes I saw, not steps I ticked off/, 'the answer must say what kind of evidence it is');
});

check('with nothing watched, Rocky says he will not claim anything is done', () => {
  const L = load({ LabPilotMentor: { journey: () => [] }, LabPilotPosition: position('Home') });
  const a = L.answer('what did I accomplish?');
  assert.ok(a, 'fell through to the corpus');
  assert.match(a, /will not claim anything is done/, a);
  assert.match(a, /you are on Home/, 'the honest answer should still say what IS known');
  assert.ok(!/\bStep \d/.test(a), 'a step number leaked into an answer about accomplishments');
});

check('the phrasings learners actually use all reach the journey', () => {
  const L = load({ LabPilotMentor: { journey: () => [{ evidence: 'the list went from 0 to 1', place: null }] }, LabPilotPosition: position(null) });
  for (const q of ['what have i done so far', 'What did I do?', 'have I finished anything', 'what have I completed', 'what got done']) {
    const a = L.answer(q);
    assert.ok(a && /the list went from 0 to 1/.test(a), `"${q}" did not reach the journey: ${a}`);
  }
});

check('the latest accomplishment comes first, and no more than three are listed', () => {
  const j = ['a', 'b', 'c', 'd', 'e'].map((x, i) => ({ evidence: 'change ' + x + ' ' + i, place: null }));
  const L = load({ LabPilotMentor: { journey: () => j }, LabPilotPosition: position(null) });
  const a = L.answer('what have I done so far?');
  assert.match(a, /^5 things I watched happen, the latest first: change e 4; change d 3; change c 2\./, a);
});

check('without the mentor loaded the question falls through, rather than crashing', () => {
  const L = load({ LabPilotPosition: position('Home') });
  assert.strictEqual(L.answer('what have I done so far?'), null);
});

check('"which step am I on" still goes to its own answer, not the accomplishments one', () => {
  const L = load({ LabPilotMentor: { journey: () => [{ evidence: 'x', place: null }] }, LabPilotPosition: position('Home') });
  const a = L.answer('which step am I on?') || '';
  assert.ok(!/I watched happen/.test(a), 'a position question was answered with accomplishments: ' + a);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — the first layer a question meets answers from evidence.\n`);
