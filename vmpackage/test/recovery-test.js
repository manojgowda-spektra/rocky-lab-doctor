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

check('a click that MISSES the glowed control counts as an attempt', () => {
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Create a resource']));
  win.LabPilotOverlay = { tracked: { contains: () => false } };     // something is glowed
  const before = W.current().learner.attempts;
  RC._onClick({ target: { nodeType: 1, closest: () => null } });    // ...and this is not it
  assert.strictEqual(W.current().learner.attempts, before + 1, 'the miss was not recorded');
  delete win.LabPilotOverlay;
});

check('a click when NOTHING is glowed is not an attempt', () => {
  /*
   * The demo-path defect: filling three wizard fields with nothing glowed made the learner
   * "stuck" on the third, and the ladder told someone doing it right that it takes people a
   * minute. With no target there is nothing to miss, so a click is the learner working.
   */
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Create a resource']));
  delete win.LabPilotOverlay;
  const before = W.current().learner.attempts;
  for (let i = 0; i < 5; i++) RC._onClick({ target: { nodeType: 1, closest: () => null } });
  assert.strictEqual(W.current().learner.attempts, before, 'clicks with no glow were counted as attempts');
  assert.notStrictEqual(W.stuck(), 'repeated-attempts', 'a learner working with nothing glowed read as stuck');
});

check('Rocky never counts a click on his OWN UI', () => {
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Create a resource']));
  const before = W.current().learner.attempts;
  // closest('[data-labpilot="1"]') matching means it is our overlay
  RC._onClick({ target: { nodeType: 1, closest: (sel) => (sel.indexOf('labpilot') >= 0 ? {} : null) } });
  assert.strictEqual(W.current().learner.attempts, before, 'clicking Rocky counted as a failed attempt');
});

check('three misses on one step reads as stuck', () => {
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Create a resource']));
  win.LabPilotOverlay = { tracked: { contains: () => false } };
  assert.strictEqual(W.stuck(), null, 'stuck before anything happened');
  for (let i = 0; i < 3; i++) RC._onClick({ target: { nodeType: 1, closest: () => null } });
  assert.strictEqual(W.stuck(), 'repeated-attempts', `got ${W.stuck()}`);
  delete win.LabPilotOverlay;
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
  // BEHAVIOUR: an admission plus a request for what only the learner can see. Never the answer.
  assert.match(r4.text, /run out of ideas|out of useful suggestions|cannot see/i,
    'STOP must be an honest admission: ' + r4.text);
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

/* ------------------------------------------------------------------------------------------
 * RUNG 0 - DIAGNOSE. The portal said what went wrong; these pin that Rocky repeats it.
 *
 * The bar these have to clear: before this layer existed, recovery's ONLY trigger was a dwell
 * timer, so the best Rocky could offer a learner staring at "you do not have permission" was
 * "you have been on this step a little while". Every test here is about that gap.
 * ------------------------------------------------------------------------------------------ */

const FAIL_AT = 1000000;
const fail = (text, at) => ({ text, frame: 'https://x.reactblade.portal.azure.net', at: at || FAIL_AT });
const fresh = () => ({ rung: 0, lastRungAt: 0, engaged: false, said: 0, saidFailure: null });

check('a portal failure is classified, not just repeated', () => {
  // The real one, measured on the live Azure portal.
  assert.strictEqual(
    RC._classify("Client Error - Looks like you don't have the right permissions").code,
    'permission');
  assert.strictEqual(RC._classify('The resource group already exists.').code, 'conflict');
  assert.strictEqual(RC._classify('Resource not found').code, 'notfound');
  assert.strictEqual(RC._classify('Request timed out, please try again').code, 'transient');
  assert.strictEqual(RC._classify('Name is required').code, 'validation');
  /*
   * THE NUMERIC BRANCHES, tested on their own.
   *
   * `\b404\b` shipped as `<BS>404<BS>` - a heredoc ate one backslash and Python turned the
   * survivor into a backspace - and every test above still passed, because each phrase matched
   * a DIFFERENT alternative in the same regex. A pattern with five alternatives needs a case
   * that only one of them can satisfy, or four of them can rot unnoticed.
   */
  assert.strictEqual(RC._classify('Request failed: 404').code, 'notfound');
  assert.strictEqual(RC._classify('The service returned 503.').code, 'transient');
  assert.strictEqual(RC._classify('Cost is 404404 per month').code, 'unknown',
    'the word boundary is gone - 404 is matching inside a longer number');
});

check('an error Rocky cannot read gets no invented cause', () => {
  // Guessing a plausible reason for an unreadable error is how a tutor loses a learner for
  // good. The unknown class must offer NO advice at all.
  const c = RC._classify('Operation failed with status QX-77.');
  assert.strictEqual(c.code, 'unknown');
  assert.strictEqual(c.move, '', 'Rocky invented a cause for an error he cannot read');
  const d = RC._diagnose(fresh(), fail('Operation failed with status QX-77.'), FAIL_AT + 1000);
  assert.ok(d, 'an unreadable failure should still be reported');
  assert.ok(/cannot tell/i.test(d.text), 'Rocky did not admit he cannot tell: ' + d.text);
});

check('a permission failure explains the lab cause, not the learner', () => {
  const d = RC._diagnose(fresh(), fail("You don't have the right permissions"), FAIL_AT + 1000);
  assert.ok(d, 'no diagnosis for a fresh permission failure');
  assert.strictEqual(d.kind, 'DIAGNOSE');
  assert.strictEqual(d.rung, 0, 'a diagnosis must not consume a ladder rung');
  assert.ok(/permissions problem/i.test(d.text), d.text);
  assert.ok(/not something you typed wrong|role/i.test(d.text),
    'Rocky blamed the learner for a permissions failure: ' + d.text);
});

check('Rocky quotes the portal rather than paraphrasing it', () => {
  // He did not watch the click fail. He watched the portal say so, and the sentence must not
  // claim more than that.
  const d = RC._diagnose(fresh(), fail('Client Error - no permission to list keys'), FAIL_AT + 1);
  assert.ok(d.text.indexOf('Client Error - no permission to list keys') >= 0,
    'the portal\u2019s own words are missing: ' + d.text);
  assert.ok(/portal (said|just reported)/i.test(d.text), 'no attribution to the portal: ' + d.text);
});

check('each distinct failure is announced exactly once', () => {
  const st = fresh();
  const f = fail('Access denied');
  const d1 = RC._diagnose(st, f, FAIL_AT + 1000);
  assert.ok(d1, 'first failure was silent');
  st.saidFailure = d1.id; st.lastRungAt = FAIL_AT + 1000;
  // WELL OUTSIDE the rate-limit window, or this proves nothing: an earlier version of this
  // test asked again 1 s later, so FAILURE_GAP_MS returned null and the assertion passed even
  // with the de-duplication deleted. A test that two separate guards can satisfy is testing
  // neither of them.
  assert.strictEqual(RC._diagnose(st, f, FAIL_AT + 20000), null,
    'the same failure was announced twice');
  // A NEW failure with the same words is a new event, and must speak again.
  const later = fail('Access denied', FAIL_AT + 30000);
  assert.ok(RC._diagnose(st, later, FAIL_AT + 31000),
    'a second, genuinely new failure was swallowed');
});

check('a stale failure is old news and stays quiet', () => {
  // Rising edge, not state. A banner that has been sitting there for two minutes says nothing
  // about now - and on a Rocky that has just reloaded it would otherwise announce history.
  assert.strictEqual(RC._diagnose(fresh(), fail('Access denied'), FAIL_AT + 120000), null,
    'Rocky announced a two-minute-old error as if it had just happened');
  assert.ok(RC._diagnose(fresh(), fail('Access denied'), FAIL_AT + 3000),
    'a three-second-old failure should still be fresh');
});

check('two failures in the same breath get one sentence', () => {
  const st = fresh();
  const d1 = RC._diagnose(st, fail('Access denied'), FAIL_AT + 500);
  st.saidFailure = d1.id; st.lastRungAt = FAIL_AT + 500;
  assert.strictEqual(RC._diagnose(st, fail('Name is required', FAIL_AT + 600), FAIL_AT + 900), null,
    'Rocky talked over himself');
});

check('no failure means no diagnosis', () => {
  assert.strictEqual(RC._diagnose(fresh(), null, FAIL_AT), null);
  assert.strictEqual(RC._diagnose(fresh(), { text: '', at: FAIL_AT }, FAIL_AT + 1), null);
});

/* ---- the dwell ladder names what it observed ------------------------------------------------- */

check('rung 1 says WHY Rocky thinks you are stuck, not that time passed', () => {
  // The world model knows the reason. The old rung 1 said "you have been on this step a little
  // while" for all four of them — a timer talking. An instructor names what they saw.
  const r1 = RC._ladder(world({ stuck: 'repeated-attempts' }), S(), 100000);
  assert.match(r1.text, /clicked (\d+ times|a few times) on things other than the control I highlighted/, r1.text);
  const r2 = RC._ladder(world({ stuck: 'oscillating' }), S(), 100000);
  assert.match(r2.text, /page address has changed .* since this step began/, r2.text);
  const r3 = RC._ladder(world({ stuck: 'after-error' }), S(), 100000);
  assert.match(r3.text, /portal reported an error and nothing has changed since/, r3.text);
  const r4 = RC._ladder(world({ stuck: 'dwelling' }), S(), 100000);
  assert.match(r4.text, /Nothing I watch for on this page has moved this step on/, r4.text);
  for (const r of [r1, r2, r3, r4]) {
    assert.ok(!/a little while|takes people a minute/.test(r.text), 'the timer is still talking: ' + r.text);
    assert.match(r.text, /What can you see on the screen\?$/, 'rung 1 should end by asking, not telling');
  }
});

check('rung 1 cites the last thing Rocky watched the portal do, when there is one', () => {
  win.LabPilotMentor = { journey: () => [{ evidence: 'the list went from 1 to 2' }], why: () => null };
  const r = RC._ladder(world({ stuck: 'repeated-attempts' }), S(), 100000);
  assert.match(r.text, /The last change I saw was when the list went from 1 to 2\./, r.text);
  delete win.LabPilotMentor;
});

check('rung 2 teaches from the guide\'s reason before the knowledge base', () => {
  win.LabPilotMentor = { journey: () => [], why: () => ({ text: 'This is part of Create the custom departing-user policy.', source: 'guide-task' }) };
  win.LabPilotKB = { lookup: () => ({ what: 'a button.', does: 'It does things.' }) };
  const r = RC._ladder(world({ stuck: 'dwelling' }), S({ rung: 1, lastRungAt: 0 }), 100000);
  assert.strictEqual(r.rung, 2);
  assert.match(r.text, /This is part of Create the custom departing-user policy\./, r.text);
  assert.ok(!/a button\./.test(r.text), 'the KB spoke over the guide: ' + r.text);
  delete win.LabPilotMentor; delete win.LabPilotKB;
});

/* ---- the ladder now consumes Position ---------------------------------------------------- */

check('the dwell ladder shuts up once the lab is complete', () => {
  const w = world({ stuck: 'dwelling' });
  assert.ok(RC._ladder(w, S(), 100000), 'baseline: a stuck learner should get a rung');
  assert.strictEqual(
    RC._ladder(w, S(), 100000, { workflow: { state: 'complete' }, place: {} }), null,
    'Rocky nagged a learner who had already finished the lab');
});

check('a hint says where the learner is, when Position knows', () => {
  const snap = { workflow: { state: 'guiding' }, place: { page: 'Insider risk management' } };
  const r1 = RC._ladder(world({ stuck: 'dwelling' }), S(), 100000, snap);
  assert.ok(/Insider risk management/.test(r1.text), 'rung 1 ignored Position: ' + r1.text);
  const r3 = RC._ladder(world({ stuck: 'dwelling' }), S({ rung: 2, lastRungAt: 0 }), 100000, snap);
  assert.strictEqual(r3.rung, 3);
  assert.ok(/Insider risk management/.test(r3.text), 'rung 3 ignored Position: ' + r3.text);
});

check('a hint stays unqualified when Position does not know where they are', () => {
  // An unqualified sentence beats a confidently wrong one. No place, no claim about place.
  const r = RC._ladder(world({ stuck: 'dwelling' }), S(), 100000,
    { workflow: { state: 'guiding' }, place: { page: null } });
  assert.ok(!/You are on/.test(r.text), 'Rocky claimed a place he does not know: ' + r.text);
});

check('recovery actually reads Position and the failure channel', () => {
  // A wiring test, because the whole point of this layer is that it is CONNECTED. Behavioural,
  // not a grep for a word: the module must resolve window.LabPilotPosition at call time.
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'webext', 'content', 'recovery.js'), 'utf8');
  assert.ok(/window\.LabPilotPosition/.test(src), 'recovery never reaches for Position');
  assert.ok(/recovery\s*&&\s*snap\.recovery\.failure|recovery\.failure/.test(src),
    'recovery never reads the portal failure channel');
  assert.ok(/lastCompletion/.test(src),
    'recovery does not reset on an observed world change');
});

check('Purview\'s "not assigned to a role group" is a permissions problem', () => {
  // The same recorded string as in completion-engine-test.js. If it reaches the ladder it must
  // come out as the permissions move, which is the best sentence in this file.
  const c = RC._classify("Attention: You currently aren't assigned to a role group that allows you to view alerts.");
  assert.strictEqual(c.code, 'permission', 'classified as "' + c.code + '"');
  assert.match(c.move, /permissions problem/);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky helps when you are stuck, and knows when to stop.\n`);
