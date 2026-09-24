/*
 * coach-test.js — Rocky must always have something true and useful to say.
 *
 * THE REQUIREMENT. Every assistant in this category fails the same way: one signal fails and
 * the whole thing collapses to "I'm not sure", "I cannot determine your step", or silence. A
 * human instructor never does that. Unsure, they say something less precise that is still
 * worth hearing.
 *
 * So the contract these tests enforce is not "Rocky is always right". It is:
 *
 *   1. There is NO input for which Rocky has nothing to say.
 *   2. What he says never claims more than the evidence supports — in particular a step
 *      NUMBER only appears once the belief has converged.
 *   3. Only the top level glows. Every level below it has, by definition, failed to find the
 *      control, and pointing anyway is the one unforgivable failure.
 *
 * The levels are deliberately ordered by how much evidence each needs, so that losing a
 * signal costs specificity rather than availability.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'coach.js'), 'utf8');
const win = {};
new Function('window', code)(win);
const C = win.LabPilotCoach;

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// The real lab, as the guide reader parses it.
const STEPS = [
  { id: 's0', text: 'Open Solutions > Insider Risk Management.', targets: [{ label: 'Solutions' }, { label: 'Insider Risk Management' }] },
  { id: 's1', text: 'Open Settings > Policy indicators.', targets: [{ label: 'Settings' }, { label: 'Policy indicators' }] },
  { id: 's2', text: 'Select Save.', targets: [{ label: 'Save' }] },
  { id: 's3', text: 'Open Policies.', targets: [{ label: 'Policies' }] },
  { id: 's4', text: 'Select Create policy > Custom policy.', targets: [{ label: 'Create policy' }, { label: 'Custom policy' }] },
];
const BASE = {
  lab: 'Challenge 04: Insider Risk Detection for Departing Users',
  steps: STEPS, total: 5, done: 0, doneMap: {}, hop: 0,
  url: 'https://purview.microsoft.com/insiderriskmgmt/overview',
};

console.log('\n=== ROCKY ALWAYS HAS SOMETHING TO SAY ===\n');

// ---- the contract: never nothing ---------------------------------------------------------
check('there is no input for which Rocky says nothing', () => {
  // Including the inputs a defensive programmer forgets. If any of these returns null or an
  // empty string, a learner somewhere gets silence at the moment they most need help.
  const nasty = [
    undefined, null, {}, { step: null }, { steps: [] },
    { step: STEPS[0], confidence: NaN },
    { step: STEPS[0], confidence: 0, verdict: null, url: '' },
    { step: { id: 'x', text: '', targets: [] }, confidence: 1, total: 5 },
    { url: 'not a url at all' },
    { step: STEPS[0], confidence: 0.9, verdict: { status: 'weird-unknown-status' }, total: 5 },
  ];
  for (const ctx of nasty) {
    const r = C.say(ctx);
    assert.ok(r && typeof r.text === 'string' && r.text.trim().length > 10,
      `empty or useless answer for ${String(JSON.stringify(ctx)).slice(0, 70)}: ${JSON.stringify(r)}`);
    assert.ok(C._levels.includes(r.level), `unknown level ${r.level}`);
  }
});

check('Rocky never says he does not know and leaves it there', () => {
  // The specific phrasings that mark this whole product category's failure.
  const banned = /\b(i (don'?t|do not) know|not sure|cannot determine|unable to determine|no idea)\b/i;
  const ctxs = [
    {}, { url: 'https://purview.microsoft.com/' }, Object.assign({}, BASE, { confidence: 0 }),
    Object.assign({}, BASE, { step: STEPS[0], confidence: 0.2 }),
  ];
  for (const ctx of ctxs) {
    const r = C.say(ctx);
    assert.ok(!banned.test(r.text), `gave up instead of degrading: "${r.text}"`);
  }
});

// ---- the ladder, level by level ------------------------------------------------------------
check('POINT: a resolved control is pointed at, and only this level glows', () => {
  const r = C.say(Object.assign({}, BASE, {
    step: STEPS[0], index: 0, confidence: 0.9, verdict: { status: 'resolved', label: 'Solutions' },
  }));
  assert.strictEqual(r.level, 'POINT');
  assert.strictEqual(r.canGlow, true);
  assert.match(r.text, /Step 1 of 5/);
});

check('LOCATE: the step is known but the control is not on screen — named, not pointed at', () => {
  const r = C.say(Object.assign({}, BASE, {
    step: STEPS[1], index: 1, confidence: 0.85, verdict: { status: 'absent' },
  }));
  assert.strictEqual(r.level, 'LOCATE');
  assert.strictEqual(r.canGlow, false, 'Rocky offered to glow a control he could not find');
  assert.match(r.text, /Settings/);
  assert.match(r.text, /cannot see it/i);
});

check('LOCATE handles ambiguity by asking, never by choosing', () => {
  const r = C.say(Object.assign({}, BASE, {
    step: STEPS[4], index: 4, confidence: 0.85, verdict: { status: 'ambiguous', count: 2 },
  }));
  assert.strictEqual(r.canGlow, false);
  assert.match(r.text, /more than one/i);
  assert.ok(/\?/.test(r.text), 'ambiguity should end in a question, not a guess');
});

check('ORIENT: belief too weak to name a step, but the URL still says the section', () => {
  // This is the level that replaces "I cannot determine your step".
  const r = C.say(Object.assign({}, BASE, {
    step: STEPS[3], index: 3, confidence: 0.2,
    url: 'https://purview.microsoft.com/insiderriskmgmt/policies',
  }));
  assert.strictEqual(r.level, 'ORIENT');
  assert.match(r.text, /Insider Risk Management/);
  assert.ok(!/Step \d+ of/.test(r.text), `claimed a step number at confidence 0.2: "${r.text}"`);
});

check('ORIENT names the next UNFINISHED step, from the done ledger', () => {
  const r = C.say(Object.assign({}, BASE, {
    confidence: 0.1, doneMap: { s0: 1, s1: 1 },
    url: 'https://purview.microsoft.com/insiderriskmgmt/policies',
  }));
  assert.match(r.text, /Select Save/, `should have named step 3 as next: "${r.text}"`);
});

check('SITUATE: no section either — the lab and the done count are still facts', () => {
  const r = C.say(Object.assign({}, BASE, { confidence: 0, url: 'https://example.com/', done: 2 }));
  assert.strictEqual(r.level, 'SITUATE');
  assert.match(r.text, /2 of 5/);
});

check('ASK: nothing matched, so turn it into a question', () => {
  const r = C.say({ url: 'https://example.com/' });
  assert.strictEqual(r.level, 'ASK');
  assert.ok(/\?/.test(r.text), 'the last resort should ask, not apologise');
});

check('SURFACE: a step outside the browser is named, not hunted for', () => {
  const r = C.say(Object.assign({}, BASE, {
    step: STEPS[0], index: 0, confidence: 0.9, surface: 'VS Code',
    verdict: { status: 'resolved', label: 'Solutions' },
  }));
  assert.strictEqual(r.level, 'SURFACE');
  assert.strictEqual(r.canGlow, false, 'offered to glow a control in an application Rocky cannot see');
  assert.match(r.text, /VS Code/);
});

// ---- honesty: the number is the thing most easily got wrong ----------------------------------
check('a step NUMBER appears only when the belief has converged', () => {
  // The live defect this guards: "Step 1 of 5" stated with certainty from a nav item that is
  // on every page of the portal. Below the threshold the step may still be named — but never
  // numbered, because the number is what a learner acts on.
  for (const conf of [0, 0.3, 0.5, 0.65, 0.79]) {
    const r = C.say(Object.assign({}, BASE, {
      step: STEPS[2], index: 2, confidence: conf, verdict: { status: 'resolved', label: 'Save' },
    }));
    assert.ok(!/Step \d+ of/.test(r.text), `claimed a step number at confidence ${conf}: "${r.text}"`);
  }
  const sure = C.say(Object.assign({}, BASE, {
    step: STEPS[2], index: 2, confidence: 0.85, verdict: { status: 'resolved', label: 'Save' },
  }));
  assert.match(sure.text, /Step 3 of 5/, 'a converged belief should state the number');
});

check('only POINT can glow — every lower level has failed to find the control', () => {
  const levels = [
    [{ step: STEPS[0], index: 0, confidence: 0.9, verdict: { status: 'resolved' } }, true],
    [{ step: STEPS[0], index: 0, confidence: 0.9, verdict: { status: 'absent' } }, false],
    [{ step: STEPS[0], index: 0, confidence: 0.9, verdict: { status: 'ambiguous' } }, false],
    [{ confidence: 0.1, url: 'https://purview.microsoft.com/insiderriskmgmt/x' }, false],
    [{}, false],
  ];
  for (const [ctx, expected] of levels) {
    const r = C.say(Object.assign({}, BASE, ctx));
    assert.strictEqual(r.canGlow, expected, `${r.level} canGlow should be ${expected}`);
  }
});

// ---- the section reader --------------------------------------------------------------------
check('the section is read from the URL, and an unknown one still yields something', () => {
  assert.strictEqual(C._sectionOf('https://purview.microsoft.com/insiderriskmgmt/policies'), 'Insider Risk Management');
  assert.strictEqual(C._sectionOf('https://purview.microsoft.com/dlp/policies'), 'Data Loss Prevention');
  // Unknown section: fall back to the route's own words rather than nothing.
  const other = C._sectionOf('https://portal.azure.com/resource-groups');
  assert.ok(other && other.length > 2, `no fallback section for an unknown route: ${other}`);
  assert.strictEqual(C._sectionOf('not a url'), null);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky degrades in specificity, never into silence.\n`);
