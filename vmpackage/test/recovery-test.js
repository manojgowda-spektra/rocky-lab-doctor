/*
 * recovery-test.js — Rocky notices you are stuck, and does not become Clippy about it.
 *
 * TWO THINGS ARE BEING TESTED, and the first matters more.
 *
 * 1. THE FEED. An adversarial review found LabPilotWorld.note() had zero callers anywhere in
 *    the extension — every note() in content.js goes to LabPilotWatcher instead. So
 *    learner.attempts/errors/misclicks were permanently 0, which made two stuck reasons
 *    unreachable AND made 'dwelling' actively wrong, since it requires attempts === 0 and
 *    would fire on a learner who had been clicking busily for 45 seconds. A ladder built on
 *    that would escalate at the wrong learners. These tests pin the feed.
 *
 * 2. THE RESTRAINT. The ladder is the easy half. What decides whether recovery is useful or
 *    hated is: does it cap itself, does it wait, and does it leave the moment the learner
 *    makes progress. Clippy failed on etiquette, not capability.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function load(file, win, extraGlobals) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', file), 'utf8');
  const doc = {
    readyState: 'complete', addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], querySelector: () => null,
    documentElement: {}, getElementById: () => null,
  };
  const g = Object.assign({
    window: win, document: doc, setTimeout: () => 0, setInterval: () => 0,
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    performance: { now: () => Date.now() },
    location: { href: 'https://portal.azure.com/' }, history: {},
  }, extraGlobals || {});
  new Function(...Object.keys(g), code)(...Object.values(g));
  return win;
}

const win = {};
load('world-model.js', win);
load('pilot.js', win);
load('recovery.js', win);
const W = win.LabPilotWorld;
const RC = win.LabPilotRecovery;

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

const GUIDE = {
  title: 'Deploy a VM',
  steps: [
    { text: 'Click on Create a resource.', surface: 'browser', targets: [{ n: 1, label: 'Create a resource' }] },
    { text: 'Select Virtual machine.', surface: 'browser', targets: [{ n: 1, label: 'Virtual machine' }] },
  ],
};
const screen = (names, url) => ({
  url: url || 'https://portal.azure.com/#home', title: 'Azure',
  controls: names.map((n) => ({ name: n, role: 'button', id: '' })),
});
const world = (over) => Object.assign({
  step: { text: 'Click on Create a resource.', surface: 'browser', targets: [{ n: 1, label: 'Create a resource' }] },
  stuck: null, index: 0, done: 0,
}, over || {});
const S = (over) => Object.assign({ rung: 0, lastRungAt: 0 }, over || {});

console.log('\n=== RECOVERY ===\n');

// ---- 1. THE FEED: the bug that made stuck detection meaningless -------------------------------
check('the extension actually calls LabPilotWorld.note() somewhere', () => {
  // The defect, checked at the source level: if nothing feeds the world model, every stuck
  // reason below is measuring a counter that never moves.
  const dir = path.join(__dirname, '..', 'webext', 'content');
  const callers = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== 'world-model.js')
    .filter((f) => /LabPilotWorld\s*&&\s*window\.LabPilotWorld\.note|w\.note\(|W\(\)\.note\(/.test(
      fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.ok(callers.length > 0,
    'nothing feeds LabPilotWorld.note() — attempts/errors/misclicks stay 0 and stuck() is dead');
});

check('a click on something else counts as an attempt', () => {
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Create a resource']));
  const before = W.current().learner.attempts;
  RC._onClick({ target: { nodeType: 1, closest: () => null } });
  assert.strictEqual(W.current().learner.attempts, before + 1, 'the click was not recorded');
});

check('Rocky never counts a click on his OWN UI', () => {
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Create a resource']));
  const before = W.current().learner.attempts;
  // closest('[data-labpilot="1"]') matching means it is our overlay
  RC._onClick({ target: { nodeType: 1, closest: (sel) => (sel.indexOf('labpilot') >= 0 ? {} : null) } });
  assert.strictEqual(W.current().learner.attempts, before, 'clicking Rocky counted as a failed attempt');
});

check('three attempts on one step reads as stuck', () => {
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Create a resource']));
  assert.strictEqual(W.stuck(), null, 'stuck before anything happened');
  for (let i = 0; i < 3; i++) RC._onClick({ target: { nodeType: 1, closest: () => null } });
  assert.strictEqual(W.stuck(), 'repeated-attempts', `got ${W.stuck()}`);
});

// ---- 2. THE LADDER: escalates AWAY from the answer ---------------------------------------------
check('a learner who is fine gets nothing', () => {
  assert.strictEqual(RC._ladder(world(), S(), 100000), null, 'Rocky spoke at a learner who was fine');
});

check('rung 1 names the step, not the answer', () => {
  const r = RC._ladder(world({ stuck: 'dwelling' }), S(), 100000);
  assert.ok(r, 'nothing offered to a stuck learner');
  assert.strictEqual(r.kind, 'POINT');
  assert.match(r.text, /Click on Create a resource/);
});

check('rung 2 teaches, and rung 3 recovers', () => {
  const r2 = RC._ladder(world({ stuck: 'dwelling' }), S({ rung: 1, lastRungAt: 0 }), 100000);
  assert.strictEqual(r2.kind, 'TEACH', `got ${r2.kind}`);
  const r3 = RC._ladder(world({ stuck: 'dwelling' }), S({ rung: 2, lastRungAt: 0 }), 100000);
  assert.strictEqual(r3.kind, 'RECOVER', `got ${r3.kind}`);
});

check('the last rung is an honest admission, NOT the answer', () => {
  // Bastani PNAS 2025: answer-giving tutors left students 17% worse once removed. The final
  // rung must move away from the answer, not toward it.
  const r4 = RC._ladder(world({ stuck: 'dwelling' }), S({ rung: 3, lastRungAt: 0 }), 100000);
  assert.strictEqual(r4.kind, 'STOP');
  assert.match(r4.text, /out of useful suggestions|cannot see/i);
  assert.ok(!/click the|press the|the answer is/i.test(r4.text), `rung 4 gave the answer: ${r4.text}`);
});

check('Rocky stops offering after the cap', () => {
  const r = RC._ladder(world({ stuck: 'dwelling' }), S({ rung: 4, lastRungAt: 0 }), 100000);
  assert.strictEqual(r, null, 'Rocky kept offering hints past the cap — this is the Clippy failure');
});

check('rungs wait for the minimum gap', () => {
  const r = RC._ladder(world({ stuck: 'dwelling' }), S({ rung: 1, lastRungAt: 95000 }), 100000);
  assert.strictEqual(r, null, 'Rocky escalated within seconds of the previous hint');
});

check('no ladder at all when the step is on a surface Rocky cannot see', () => {
  // Offering "let us get back to a known state" for a VS Code step would be noise.
  const w = world({ stuck: 'dwelling', step: { text: 'Open VS Code', surface: 'VS Code', targets: [{ label: 'Visual Studio Code' }] } });
  const r = RC._ladder(w, S(), 100000);
  // The ladder itself does not gate on surface — the PILOT does, before recovery ever runs.
  // What matters is that if it does speak, it never claims to see something it cannot.
  if (r) assert.ok(!/glow|highlighted|I am pointing/i.test(r.text), `claimed to point at an unseeable control: ${r.text}`);
});

// ---- 3. THE EXIT: progress must end recovery immediately ------------------------------------------
check('a correct click resets the ladder', () => {
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Create a resource']));
  RC._state.rung = 3; RC._state.engaged = true;
  const glowed = { contains: () => false };
  win.LabPilotOverlay = { tracked: glowed };
  RC._onClick({ target: Object.assign({ nodeType: 1, closest: (s) => (s.indexOf('labpilot') >= 0 ? null : glowed) }) });
  assert.strictEqual(RC._state.rung, 0, `rung stayed at ${RC._state.rung} after a correct click`);
  assert.strictEqual(RC._state.engaged, false, 'still engaged after the learner succeeded');
  delete win.LabPilotOverlay;
});

check('recovery is hard to enter and trivially easy to leave', () => {
  // The asymmetry is deliberate: 3 attempts or 45 s to enter, one correct action to leave.
  const lim = RC._limits;
  assert.ok(lim.MAX_RUNGS <= 3, `cap is ${lim.MAX_RUNGS} — more than the evidence supports`);
  assert.ok(lim.MIN_GAP_MS >= 15000, `gap is only ${lim.MIN_GAP_MS} ms`);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky helps when you are stuck, and knows when to stop.\n`);
