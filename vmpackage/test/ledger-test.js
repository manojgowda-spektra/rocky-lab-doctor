/*
 * ledger-test.js — completion belongs to a guide, and a fresh guide is not a finished one.
 *
 * TWO DEFECTS, BOTH LIVE ON EVERY MULTI-PAGE LAB UNTIL TODAY.
 *
 * (1) COMPLETION LEAKED ACROSS GUIDE PAGES. Step identity is positional — ids are "s0", "s1",
 *     "s2" — and guide-reader re-parses on every guide page turn. ingest() reset belief, index
 *     and confidence and left `done` and `hop` untouched, so challenge 5's step 1 inherited
 *     challenge 4's step 1's completion record. State the model treats as irreversible proof of
 *     finished work was transplanted onto unrelated steps, silently, every time a learner
 *     turned the page.
 *
 *     It cannot simply reset on every call, because ingest() also runs when the SAME page is
 *     re-parsed and wiping progress then would lose real work. The ledgers are therefore keyed
 *     to a signature of the guide's CONTENT — step texts and targets, not the step count, since
 *     two different challenges can have the same number of steps.
 *
 * (2) A PARSED GUIDE ASSERTED STEP ONE. index was set to 0 the moment a guide was read, before
 *     a single observation. A learner who reloaded mid-lab was declared to be at the beginning
 *     and guided back there. The rule is now "the first step the ledger does not record as
 *     done", which is step one for a fresh lab and the real resume point otherwise.
 *
 * A note on the signature itself: the first version joined step texts on "\u0001" and the
 * literal control character 0x01 reached the shipped file, because a backslash escape does not
 * survive being written through a shell heredoc. source-integrity-test.js caught it. The
 * signature is JSON now, which needs no separator and has nothing to mangle.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadWorld() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'world-model.js'), 'utf8');
  const win = {};
  const doc = { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, documentElement: {}, getElementById: () => null };
  new Function('window', 'document', 'setTimeout', 'setInterval', 'MutationObserver', 'performance', 'location', 'history', 'chrome', code)(
    win, doc, () => 0, () => 0, function () { return { observe() {}, disconnect() {} }; },
    { now: () => Date.now() }, { href: 'https://purview.microsoft.com/insiderriskmgmt/policiespage' }, {}, undefined);
  return win.LabPilotWorld;
}

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// Two DIFFERENT challenges that happen to have the same number of steps — which is ordinary in
// a lab series, and is exactly the case a count-based signature would miss.
const CH4 = {
  title: 'Challenge 04: Insider Risk Detection for Departing Users',
  steps: [
    { text: 'Open Solutions > Insider Risk Management.', surface: 'browser', targets: [{ n: 1, label: 'Solutions' }, { n: 2, label: 'Insider Risk Management' }] },
    { text: 'Open Settings > Policy indicators.', surface: 'browser', targets: [{ n: 1, label: 'Settings' }, { n: 2, label: 'Policy indicators' }] },
    { text: 'Select Save.', surface: 'browser', targets: [{ n: 1, label: 'Save' }] },
  ],
};
const CH5 = {
  title: 'Challenge 05: Data Loss Prevention policies',
  steps: [
    { text: 'Open Solutions > Data Loss Prevention.', surface: 'browser', targets: [{ n: 1, label: 'Solutions' }, { n: 2, label: 'Data Loss Prevention' }] },
    { text: 'Open Policies.', surface: 'browser', targets: [{ n: 1, label: 'Policies' }] },
    { text: 'Select Create policy.', surface: 'browser', targets: [{ n: 1, label: 'Create policy' }] },
  ],
};

console.log('\n=== COMPLETION BELONGS TO A GUIDE ===\n');

check('turning the guide page clears the completion ledger', () => {
  const W = loadWorld();
  W.reset(); W.ingest(CH4);
  W.note({ type: 'complete' });                    // finish a step of challenge 4
  W.note({ type: 'complete' });
  const before = W.current();
  assert.ok(before.done >= 1, `setup: nothing was recorded done (${before.done})`);

  W.ingest(CH5);                                   // the learner turns to challenge 5
  const after = W.current();
  assert.strictEqual(after.done, 0,
    `challenge 5 opened with ${after.done} step(s) already marked done — challenge 4's record ` +
    `was transplanted onto it because step ids are positional`);
});

check('re-parsing the SAME guide keeps the progress', () => {
  // guide-reader re-parses constantly. Wiping on every ingest would throw away real work.
  const W = loadWorld();
  W.reset(); W.ingest(CH4);
  W.note({ type: 'complete' });
  const done = W.current().done;
  assert.ok(done >= 1, 'setup: nothing recorded done');
  W.ingest(CH4);                                   // same guide, parsed again
  assert.strictEqual(W.current().done, done,
    're-parsing the same guide threw away progress the learner had really made');
});

check('the signature reads the CONTENT, not the step count', () => {
  // Two challenges with three steps each. A count-based check would call these the same guide.
  const W = loadWorld();
  W.reset(); W.ingest(CH4);
  assert.strictEqual(CH4.steps.length, CH5.steps.length, 'fixture: the two guides must have equal length');
  W.note({ type: 'complete' });
  W.ingest(CH5);
  assert.strictEqual(W.current().done, 0, 'two different guides of the same length were treated as one');
});

check('the hop ledger is scoped to the guide too', () => {
  const W = loadWorld();
  W.reset(); W.ingest(CH4);
  W.note({ type: 'hop' });                          // half way through a two-target step
  const hopBefore = W.current().hop;
  W.ingest(CH5);
  assert.strictEqual(W.current().hop, 0,
    `challenge 5 opened mid-step (hop ${W.current().hop}, was ${hopBefore} on challenge 4)`);
});

// ---- resume, do not guess ----------------------------------------------------------------
check('a fresh guide opens at step one — that prior is honest', () => {
  const W = loadWorld();
  W.reset(); W.ingest(CH4);
  const c = W.current();
  assert.strictEqual(c.index, 0, `a brand new lab opened at step ${c.index + 1}`);
  assert.strictEqual(c.confidence, 0, 'a guide that has never been observed reported confidence');
});

check('a RE-parse after progress resumes where the work stopped, not at the beginning', () => {
  /*
   * The reload case. A learner three steps in refreshes the portal tab; guide-reader parses the
   * same guide again. Before this, Rocky declared them to be at step one and guided them back.
   */
  const W = loadWorld();
  W.reset(); W.ingest(CH4);
  W.note({ type: 'complete' });                     // step 1 done
  W.ingest(CH4);                                    // the reload
  const c = W.current();
  assert.ok(c.index > 0,
    `after a reload with step 1 recorded done, Rocky reopened at step ${c.index + 1} and would have ` +
    `guided the learner back through work they had finished`);
  assert.ok(!c.doneMap[c.steps[c.index].id],
    'resumed onto a step the ledger already records as done');
});

check('a guide with no steps is position UNKNOWN, not step one', () => {
  const W = loadWorld();
  W.reset(); W.ingest({ title: 'empty', steps: [] });
  assert.strictEqual(W.current().index, -1, 'an empty guide claimed a position');
});

check('ingest never states a confidence it has not earned', () => {
  const W = loadWorld();
  W.reset(); W.ingest(CH4);
  W.note({ type: 'complete' });
  W.ingest(CH4);
  assert.strictEqual(W.current().confidence, 0,
    'a re-parse published a confidence without a single observation behind it');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — a new challenge starts empty, and a reload resumes.\n`);
