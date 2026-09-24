/*
 * position-api-test.js — one answer to "where is the learner", and nowhere else to get one.
 *
 * WHAT WAS WRONG. Rocky held FOUR representations of position and they disagreed:
 *
 *   world-model.js   a belief distribution WITH a confidence            (honest)
 *   watcher.js       st.stepIndex, a hard counter, no confidence        (fed the AI prompt)
 *   content.js       state.stepIndex, a hard counter, no confidence     (fed four on-screen lines)
 *   explore.js       a copy of lpStepIndex from storage, no confidence  (fed the AI prompt)
 *
 * The honest one was the quiet one. lab-context.js asserted "The learner is on step N of M" into
 * the model's grounding paragraph from a counter with no concept of being unsure, and explore.js
 * deleted its own step number as "believed, not known — do not assert it" and then re-added one
 * two lines later from a different counter. The belief model could be perfectly calibrated,
 * refuse to name a step, and Rocky would still hand the model a number to restate fluently.
 *
 * THE CONTRACT THESE CHECKS HOLD:
 *   - exactly one field may ever be quoted: sayable.stepNumber
 *   - null is an ANSWER, not a failure, and there is no fallback behind it
 *   - a CURSOR (where Rocky points) is not a BELIEF (where the learner is) and is never quoted
 *     as one — except in script mode, which is labelled
 *   - every value carries source, confidence and timestamp
 *   - no consumer computes a step number of its own
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'webext', f), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

/*
 * A page with whichever subsystems we choose to put on it. Everything Position reads is optional
 * by design — a frame with no guide, a build without the relay, a portal tab where the pilot
 * never started — so the harness can leave any of them out.
 */
function makePage(parts) {
  const p = parts || {};
  const els = p.ariaCurrent || [];
  const doc = {
    querySelectorAll(sel) {
      if (sel === '[aria-current]') {
        return els.map((e) => ({
          getAttribute: (k) => (k === 'aria-current' ? e.value : (k === 'aria-label' ? e.name : null)),
          getBoundingClientRect: () => ({ width: e.hidden ? 0 : 200, height: e.hidden ? 0 : 30 }),
          textContent: e.name,
        }));
      }
      return [];
    },
    querySelector: (sel) => (p.h1 && /h1|h2/.test(sel)
      ? { innerText: p.h1, textContent: p.h1 } : null),
  };
  const win = {};
  if (p.world) win.LabPilotWorld = { current: () => p.world };
  if (p.pilot) win.LabPilotPilot = { status: () => p.pilot };
  if (p.relay) win.LabPilotRelay = { events: () => p.relay };
  if (p.watcher) win.LabPilotWatcher = { snapshot: () => p.watcher };
  new Function('window', 'document', 'location', src('content/position.js'))(
    win, doc, { pathname: p.pathname || '/insiderriskmgmt/policiespage', hash: '' });
  return win.LabPilotPosition;
}

const GUIDE_STEPS = [
  { id: 's0', text: 'Open Solutions > Insider Risk Management.', targets: [{ label: 'Solutions' }] },
  { id: 's1', text: 'Open Settings > Policy indicators.', targets: [{ label: 'Settings' }] },
  { id: 's2', text: 'Select Save.', targets: [{ label: 'Save' }] },
];
const worldAt = (index, confidence, doneIds) => ({
  index, total: 3, confidence,
  step: index >= 0 ? GUIDE_STEPS[index] : null,
  steps: GUIDE_STEPS, doneMap: (doneIds || []).reduce((a, k) => (a[k] = 1, a), {}),
  done: (doneIds || []).length, complete: (doneIds || []).length === 3,
  hop: 0, stuck: null, updatedAt: Date.now(),
});

console.log('\n=== ONE ANSWER, AND NOWHERE ELSE TO GET ONE ===\n');

// ---- the only quotable field --------------------------------------------------------------
check('a confident belief is sayable, and says so', () => {
  const P = makePage({ world: worldAt(1, 0.91) });
  const s = P.read();
  assert.strictEqual(s.sayable.stepNumber, 2);
  assert.strictEqual(s.sayable.source, 'belief');
  assert.match(s.sayable.why, /0\.91/);
});

check('an UNSURE belief is not sayable, and null is the answer — not a fallback', () => {
  const P = makePage({ world: worldAt(1, 0.42) });
  const s = P.read();
  assert.strictEqual(s.sayable.stepNumber, null,
    'a step number was offered at confidence 0.42, below the 0.80 bar');
  assert.match(s.sayable.why, /below/);
  // and the belief is still readable for anything that wants to WEIGH it
  assert.strictEqual(s.belief.index, 1);
  assert.strictEqual(s.belief.confidence, 0.42);
});

check('an UNKNOWN position is not sayable', () => {
  const P = makePage({ world: worldAt(-1, 0) });
  assert.strictEqual(P.read().sayable.stepNumber, null);
  assert.match(P.read().sayable.why, /unknown/);
});

check('a COMPLETE lab has no current step to state', () => {
  const P = makePage({ world: worldAt(2, 0.95, ['s0', 's1', 's2']) });
  const s = P.read();
  assert.strictEqual(s.sayable.stepNumber, null, 'a finished lab still claimed a current step');
  assert.strictEqual(s.completed.complete, true);
  assert.strictEqual(s.workflow.state, 'complete');
});

check('the bar matches the pilot exactly — one threshold, not two', () => {
  /*
   * A learner who sees "Step 3 of 5" in the overlay and is told something different by the AI
   * has lost all reason to trust either.
   */
  const pilotSrc = code('content/pilot.js');
  const m = pilotSrc.match(/CONF_SHOW\s*=\s*([\d.]+)/);
  assert.ok(m, 'pilot.js no longer defines CONF_SHOW');
  const P = makePage({ world: worldAt(0, 0.5) });
  assert.strictEqual(P.SAY_AT, Number(m[1]),
    `Position says ${P.SAY_AT}, the pilot says ${m[1]} — two thresholds is two answers`);
});

// ---- cursor is not belief ---------------------------------------------------------------
check('a CURSOR has no confidence, by construction', () => {
  const P = makePage({ watcher: { stepIndex: 2, totalSteps: 6 } });
  const s = P.read();
  assert.strictEqual(s.cursor.index, 2);
  assert.strictEqual(s.cursor.confidence, null,
    'a cursor reported a confidence — it is a decision Rocky made, not a measurement');
  assert.strictEqual(s.belief.index, -1, 'a cursor was promoted into a belief');
});

check('SCRIPT mode is sayable but labelled, because the two paths are exclusive', () => {
  /*
   * content.js hands over to the pilot the moment a guide is found and drives the lab itself
   * only when there is none, so in bundle mode there is no belief at all. Gating on one would
   * leave a captured lab showing no progress. That cursor advances on OBSERVED navigation, so
   * it may be stated — labelled, never disguised as a measured belief.
   */
  const P = makePage({ watcher: { stepIndex: 2, totalSteps: 6 } });
  const s = P.read();
  assert.strictEqual(s.sayable.stepNumber, 3);
  assert.strictEqual(s.sayable.source, 'script', 'script mode was passed off as a belief');
  assert.match(P.promptLine(), /recorded script/i,
    'the prompt line does not tell the model this came from a script');
});

check('a real belief BEATS the script cursor — they never both answer', () => {
  const P = makePage({ world: worldAt(1, 0.93), watcher: { stepIndex: 5, totalSteps: 6 } });
  const s = P.read();
  assert.strictEqual(s.sayable.stepNumber, 2, 'the stale bundle cursor overrode a live belief');
  assert.strictEqual(s.sayable.source, 'belief');
});

// ---- provenance --------------------------------------------------------------------------
check('every value carries source, confidence and timestamp', () => {
  const P = makePage({ world: worldAt(1, 0.9), ariaCurrent: [{ value: 'page', name: 'Insider Risk Management' }] });
  const s = P.read();
  for (const k of ['belief', 'cursor', 'place', 'completed', 'next', 'workflow', 'recovery']) {
    assert.ok('source' in s[k], `${k} has no source`);
    assert.ok('confidence' in s[k], `${k} has no confidence field`);
    assert.ok('at' in s[k], `${k} has no timestamp`);
  }
});

// ---- place ---------------------------------------------------------------------------------
check('the place is read from aria-current BY VALUE, never by presence', () => {
  // getAttribute returns the string "false" on an unselected item, and "false" is truthy.
  const P = makePage({
    ariaCurrent: [
      { value: 'false', name: 'Data Loss Prevention' },
      { value: 'page', name: 'Insider Risk Management' },
      { value: 'page', name: 'Policies' },
    ],
  });
  const s = P.read();
  assert.strictEqual(s.place.section, 'Insider Risk Management',
    'an unselected nav item with aria-current="false" was read as the current place');
  assert.strictEqual(s.place.page, 'Policies');
  assert.strictEqual(s.place.source, 'aria-current');
});

check('with no aria-current the place degrades to the heading, and says so', () => {
  // Measured: Azure declares no aria-current in either frame.
  const P = makePage({ h1: 'Resource groups' });
  const s = P.read();
  assert.strictEqual(s.place.page, 'Resource groups');
  assert.strictEqual(s.place.source, 'heading');
  assert.ok(s.place.confidence < 0.95, 'a heading was trusted as much as a declaration');
});

// ---- the completion stream ------------------------------------------------------------------
check('a world change from ANY frame becomes the last completion', () => {
  const P = makePage({
    world: worldAt(1, 0.9),
    relay: [
      { kind: 'announce', klass: 'busy', frame: 'top', text: 'Loading', t: 1 },
      { kind: 'count-grew', frame: 'https://sandbox-1.reactblade.portal.azure.net', from: 0, to: 3, t: 2 },
    ],
  });
  const c = P.read().lastCompletion;
  assert.ok(c, 'a relayed world change did not reach Position');
  assert.strictEqual(c.kind, 'count-grew');
  assert.ok(/reactblade/.test(c.frame), 'the completion lost which frame it came from');
});

check('MOVEMENT is not completion, even when it arrives on the same stream', () => {
  const P = makePage({
    world: worldAt(1, 0.9),
    relay: [{ kind: 'dialog-opened', frame: 'top', name: 'New policy', t: 1 }],
  });
  assert.strictEqual(P.read().lastCompletion, null,
    'a dialog opening was recorded as a completion');
});

check('a failure the PORTAL announced becomes the recovery reason', () => {
  const P = makePage({
    world: worldAt(1, 0.9),
    relay: [{ kind: 'announce', klass: 'failure', frame: 'top', text: "you don't have the right permissions", t: 5 }],
  });
  const r = P.read().recovery;
  assert.ok(r.failure, 'an announced failure did not reach the recovery state');
  assert.match(r.failure.text, /permission/);
  assert.strictEqual(r.source, 'relay');
});

// ---- the prompt line -------------------------------------------------------------------------
check('the prompt NEVER states a number Position would not state', () => {
  const P = makePage({ world: worldAt(1, 0.4), ariaCurrent: [{ value: 'page', name: 'Insider Risk Management' }] });
  const line = P.promptLine();
  assert.ok(!/step \d+ of/i.test(line), `the prompt stated a step number at 0.40: "${line}"`);
  assert.match(line, /not certain/i);
  assert.match(line, /Insider Risk Management/, 'the prompt withheld what IS known');
});

check('the prompt tells the model what IS known rather than going silent', () => {
  // A model given no position at all will invent one, which is worse than a hedge.
  const P = makePage({ world: worldAt(-1, 0, ['s0']) });
  const line = P.promptLine();
  assert.ok(line.length > 30, `the prompt said almost nothing: "${line}"`);
  assert.match(line, /do not (state|guess)/i, 'the prompt does not forbid inventing a number');
});

// ---- no consumer computes its own ---------------------------------------------------------
check('lab-context no longer builds a step number from the watcher counter', () => {
  const c = code('content/lab-context.js');
  assert.ok(!/stepIndex \+ 1/.test(c),
    'lab-context still derives a step number from a raw counter');
});

check('the grounding paragraph is BUILT BY Position — checked by running it', () => {
  /*
   * A source check for the word "LabPilotPosition" is not enough: a mutation that replaced the
   * call with `false` and fell back to the hardcoded string left the word in place and the test
   * passed. So this runs summary() with Position stubbed to a sentinel and asserts the sentinel
   * comes out. If lab-context ever builds that line itself again, this fails.
   */
  const SENTINEL = 'POSITION-SENTINEL-' + Math.random().toString(36).slice(2, 8);
  const win = { LabPilotPosition: { promptLine: () => SENTINEL, read: () => ({ sayable: { stepNumber: null }, completed: { count: 0 } }) } };
  /*
   * lab.json is fetched from the extension's own package and the step sentence only appears
   * once there IS a lab identity. The stub is a SYNCHRONOUS thenable rather than a real
   * Promise, so the context is loaded by the time this function returns and the check stays
   * ordinary — an async test here would need machinery that can itself fail silently.
   */
  const LAB = { labCode: 'HIAD-TEST', odlId: '72497', deploymentId: 'dep-1' };
  const syncThen = (v) => ({ then(cb) { return syncThen(cb(v)); }, catch() { return syncThen(v); } });
  const chrome = {
    storage: { local: { get(keys, cb) { cb({}); }, set() {} }, onChanged: { addListener() {} } },
    runtime: { getURL: (f) => f, sendMessage() {}, lastError: null },
  };
  new Function('window', 'document', 'chrome', 'location', 'fetch', 'setTimeout',
    src('content/lab-context.js'))(
    win, { readyState: 'complete', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    chrome, { href: 'https://purview.microsoft.com/', hostname: 'purview.microsoft.com' },
    () => syncThen({ ok: true, json: () => syncThen(LAB) }), (fn) => { try { fn(); } catch (e) {} return 0; });
  const L = win.LabPilotLab;
  assert.ok(L && L.summary, 'lab-context did not load');
  const out = String(L.summary() || '');
  assert.ok(out.indexOf(SENTINEL) >= 0,
    `the grounding paragraph did not come from Position. It said: ${JSON.stringify(out.slice(0, 200))}`);
  assert.ok(!/on step \d+ of/i.test(out),
    `the grounding paragraph still asserts a step number: ${JSON.stringify(out.slice(0, 200))}`);
});

check('explore no longer injects a counter-derived number into the prompt', () => {
  const c = code('content/explore.js');
  assert.ok(!/c\.stepNo = st\.stepIndex \+ 1/.test(c), 'explore still sets stepNo from its own counter');
  assert.ok(!/'Step ' \+ \(w\.stepIndex \+ 1\)/.test(c),
    'explore still writes c.observed from the watcher counter — the line that undid its own honesty');
  assert.ok(/LabPilotPosition/.test(c), 'explore does not consult Position');
});

check('the upcoming list is only numbered when a number is sayable', () => {
  const c = code('content/explore.js');
  assert.ok(/sayable/.test(c),
    'the upcoming steps are numbered unconditionally, which asserts a position by implication');
});

check('Position itself infers nothing — it would be a fifth source of truth', () => {
  const c = code('content/position.js');
  assert.ok(!/observe\s*\(|MutationObserver|setInterval/.test(c),
    'position.js observes or schedules, so it computes state of its own');
});

check('the manifest loads Position', () => {
  const m = JSON.parse(src('manifest.json'));
  assert.ok(m.content_scripts[0].js.includes('content/position.js'), 'position.js is not loaded');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — one answer, and nowhere else to get one.\n`);
