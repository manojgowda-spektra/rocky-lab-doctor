/*
 * pilot-test.js — the world model and the monitor, as pure logic.
 *
 * These are the two pieces that decide whether Rocky is useful or annoying, and both are
 * deliberately free of DOM dependencies so they can be tested exhaustively and fast.
 *
 * What is being tested is not "does the code run" but the PROMISES the architecture makes:
 *   - Rocky tracks position as a belief, so one ambiguous frame cannot move him
 *   - Rocky advances when the evidence says so, including out of order
 *   - Rocky stays silent when there is nothing worth saying (the anti-Clippy property)
 *   - a dismissal is permanent
 *   - Assessment mode is silent, always
 *   - a step on a surface Rocky cannot see is announced, not hunted for
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function load(file, win) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', file), 'utf8');
  const doc = {
    readyState: 'complete', addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null, documentElement: {}, getElementById: () => null,
  };
  new Function('window', 'document', 'setTimeout', 'setInterval', 'MutationObserver', 'performance', 'location', 'history',
    code)(win, doc, () => 0, () => 0, function () { return { observe() {}, disconnect() {} }; },
    { now: () => Date.now() }, { href: 'https://portal.azure.com/' }, {});
  return win;
}

const win = {};
load('world-model.js', win);
load('pilot.js', win);
const W = win.LabPilotWorld;
const P = win.LabPilotPilot;

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// A guide shaped exactly like the guide reader's output for the demo lab.
const GUIDE = {
  title: 'Microsoft IQ workshop',
  page: 1,
  steps: [
    { text: 'Click on Publish.', surface: 'browser', targets: [{ n: 1, label: 'Publish' }] },
    { text: 'Select Data source.', surface: 'browser', targets: [{ n: 1, label: 'Data source' }] },
    { text: 'Click on the Visual Studio Code from the VM desktop.', surface: 'VS Code', surfaceWhy: 'a desktop application', targets: [{ n: 1, label: 'Visual Studio Code' }] },
  ],
};

const screen = (names, url) => ({
  url: url || 'https://portal.azure.com/#home',
  title: 'Azure',
  controls: names.map((n) => ({ name: n, role: 'button', id: '' })),
});

console.log('\n=== WORLD MODEL + MONITOR ===\n');

// ---- the task graph -------------------------------------------------------------------------
check('ingest builds one node per instruction, keeping surface and targets', () => {
  W.reset();
  W.ingest(GUIDE);
  const c = W.current();
  assert.strictEqual(c.total, 3, `got ${c.total} steps`);
  assert.strictEqual(c.step.surface, 'browser');
  assert.strictEqual(c.lab, 'Microsoft IQ workshop');
});

check('alternative readings are flattened into the step labels', () => {
  W.reset();
  W.ingest({ steps: [{ text: 'Select File (1) and then Open Folder (2).', surface: 'browser',
    targets: [{ n: 1, label: 'File', alt: ['Select File'] }, { n: 2, label: 'Folder', alt: ['Open Folder'] }] }] });
  const step = W.currentStep();
  assert.ok(step.labels.includes('Select File'), `labels: ${step.labels}`);
  assert.ok(step.labels.includes('Open Folder'), `labels: ${step.labels}`);
});

// ---- position as a belief, not a guess -------------------------------------------------------
check('one ambiguous observation does not move the belief', () => {
  W.reset(); W.ingest(GUIDE);
  // a screen showing nothing from any step
  W.observe(screen(['Home', 'Dashboard', 'Settings']));
  const c = W.current();
  assert.ok(c.confidence < 0.65, `confidence jumped to ${c.confidence} on unrelated controls`);
});

check('repeated consistent evidence does move it', () => {
  W.reset(); W.ingest(GUIDE);
  let c;
  for (let i = 0; i < 8; i++) { W.observe(screen(['Data source', 'Cancel'])); c = W.current(); }
  assert.strictEqual(c.index, 1, `settled on step ${c.index}, expected 1`);
  assert.ok(c.confidence >= 0.65, `confidence only ${c.confidence}`);
});

check('advancing marks earlier steps done — out-of-order work is not an alarm', () => {
  W.reset(); W.ingest(GUIDE);
  // learner goes straight to step 2's control without ever showing step 1's
  for (let i = 0; i < 8; i++) W.observe(screen(['Data source']));
  const c = W.current();
  assert.strictEqual(c.index, 1);
  assert.ok(c.done >= 1, 'step 1 was not marked done when the learner moved past it');
});

check('the belief can move back — a wrong lock-on cannot persist', () => {
  W.reset(); W.ingest(GUIDE);
  for (let i = 0; i < 8; i++) W.observe(screen(['Data source']));
  assert.strictEqual(W.current().index, 1);
  // the learner returns to the first step's screen
  for (let i = 0; i < 12; i++) W.observe(screen(['Publish']));
  const c = W.current();
  assert.strictEqual(c.index, 0, `stayed on step ${c.index} after the screen went back`);
});

// ---- stuck detection --------------------------------------------------------------------------
check('repeated attempts register as stuck', () => {
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Publish']));
  assert.strictEqual(W.stuck(), null, 'stuck before anything happened');
  W.note({ type: 'click' }); W.note({ type: 'click' }); W.note({ type: 'click' });
  assert.strictEqual(W.stuck(), 'repeated-attempts');
});

check('hunting between pages registers as stuck', () => {
  W.reset(); W.ingest(GUIDE);
  for (let i = 0; i < 6; i++) W.observe(screen(['Publish'], 'https://portal.azure.com/#p' + i));
  assert.strictEqual(W.stuck(), 'oscillating');
});

// ---- the monitor: the anti-Clippy properties ----------------------------------------------------
const S = () => ({ mode: 'guided', lastSpoke: 0, lastTarget: '', lastPointAt: 0 });
const world = (over) => Object.assign({
  step: { text: 'Click on Publish.', surface: 'browser', targets: [{ n: 1, label: 'Publish' }] },
  stuck: null,
}, over || {});

check('a resolved target is pointed at', () => {
  const d = P._decide(world(), { status: 'resolved', label: 'Publish', element: {} }, 100000, S());
  assert.strictEqual(d.act, 'POINT', `got ${d.act} (${d.why})`);
});

check('an ambiguous target is NEVER pointed at — Rocky asks instead', () => {
  const d = P._decide(world(), { status: 'ambiguous', label: 'Create', count: 2 }, 100000, S());
  assert.strictEqual(d.act, 'ASK', `got ${d.act}`);
});

check('an absent target on a learner who is fine produces SILENCE', () => {
  const d = P._decide(world(), { status: 'absent', reason: 'no-candidates' }, 100000, S());
  assert.strictEqual(d.act, 'SILENT', `got ${d.act} — Rocky spoke when he had nothing to say`);
});

check('an absent target on a STUCK learner escalates', () => {
  const d = P._decide(world({ stuck: 'dwelling' }), { status: 'absent' }, 100000, S());
  assert.strictEqual(d.act, 'ESCALATE', `got ${d.act}`);
});

check('a non-browser step is announced, not hunted for', () => {
  const d = P._decide(world({ step: { text: 'Open VS Code', surface: 'VS Code', targets: [{ label: 'Visual Studio Code' }] } }),
    { status: 'absent' }, 100000, S());
  assert.strictEqual(d.act, 'SILENT');
  assert.match(d.why, /surface:VS Code/);
});

check('Assessment mode is silent even on a perfect resolution', () => {
  const s = S(); s.mode = 'assessment';
  const d = P._decide(world(), { status: 'resolved', label: 'Publish', element: {} }, 100000, s);
  assert.strictEqual(d.act, 'SILENT', 'Rocky guided during an assessment');
  assert.strictEqual(d.why, 'assessment-mode');
});

check('Observe mode stays quiet until the learner is stuck', () => {
  const s = S(); s.mode = 'observe';
  const quiet = P._decide(world(), { status: 'resolved', label: 'Publish', element: {} }, 100000, s);
  assert.strictEqual(quiet.act, 'SILENT', 'Observe mode pointed unprompted');
  const stuck = P._decide(world({ stuck: 'dwelling' }), { status: 'resolved', label: 'Publish', element: {} }, 100000, s);
  assert.strictEqual(stuck.act, 'POINT', 'Observe mode stayed quiet even when the learner was stuck');
});

check('a dismissal is permanent — the Clippy property', () => {
  W.reset(); W.ingest(GUIDE);
  W.note({ type: 'dismiss', label: 'Publish' });
  const d = P._decide(world(), { status: 'resolved', label: 'Publish', element: {} }, 100000, S());
  assert.strictEqual(d.act, 'SILENT', 'Rocky re-offered something the learner dismissed');
  assert.strictEqual(d.why, 'dismissed');
});

check('Rocky does not re-point at the same target immediately', () => {
  const s = S(); s.lastTarget = 'Publish'; s.lastPointAt = 99000;
  const d = P._decide(world(), { status: 'resolved', label: 'Publish', element: {} }, 100000, s);
  assert.strictEqual(d.act, 'SILENT', 'Rocky re-glowed the same control within seconds');
});

check('a new target still waits for the minimum gap', () => {
  // The dismissal test above put "Publish" in the session's permanent dismiss list, and the
  // world model is a singleton — exactly as it is in the browser. Reset it, or this asserts
  // the wrong thing and would pass for the wrong reason.
  W.reset(); W.ingest(GUIDE);
  const s = S(); s.lastSpoke = 99000; s.lastTarget = 'Something else';
  const d = P._decide(world(), { status: 'resolved', label: 'Publish', element: {} }, 100000, s);
  assert.strictEqual(d.act, 'DEFER', `got ${d.act} — Rocky spoke twice in under the gap`);
});

// ---- progress: shown only when it is true -----------------------------------------------------
check('no progress number while the belief is still forming', () => {
  // The world model tracks a BELIEF. Rendering "step 4 of 12" from weak evidence would be
  // Rocky asserting something he does not know - the one thing the project forbids everywhere.
  W.reset(); W.ingest(GUIDE);
  W.observe(screen(['Home', 'Dashboard']));
  const st = P.status();
  assert.strictEqual(st.progress, null, `claimed progress at confidence ${st.world.confidence}`);
});

check('a converged belief DOES show progress', () => {
  // Three distinct pages first. Rocky caps his stated confidence below the display threshold
  // until he has seen enough of a lab to tell navigation furniture from a real target -
  // measured live on purview.microsoft.com/home, where a permanent nav item ("Solutions")
  // gave step 1 confidence 1.0 and would have had Rocky announce "Step 1 of 5" all lab long.
  // Asserting a step number on the first page ever seen is asking for that defect back.
  W.reset(); W.ingest(GUIDE);
  for (let i = 0; i < 4; i++) W.observe(screen(['Data source'], 'https://portal.azure.com/#p1'));
  for (let i = 0; i < 4; i++) W.observe(screen(['Data source'], 'https://portal.azure.com/#p2'));
  for (let i = 0; i < 12; i++) W.observe(screen(['Data source'], 'https://portal.azure.com/#p3'));
  const st = P.status();
  assert.ok(st.progress, `no progress at confidence ${st.world.confidence}`);
  assert.strictEqual(st.progress.n, 2, `showed step ${st.progress.n}`);
  assert.strictEqual(st.progress.total, 3);
});

check('progress disappears again if the belief weakens', () => {
  // A learner who wanders off-script must not keep seeing a confident number.
  W.reset(); W.ingest(GUIDE);
  for (let i = 0; i < 4; i++) W.observe(screen(['Data source'], 'https://portal.azure.com/#p1'));
  for (let i = 0; i < 4; i++) W.observe(screen(['Data source'], 'https://portal.azure.com/#p2'));
  for (let i = 0; i < 12; i++) W.observe(screen(['Data source'], 'https://portal.azure.com/#p3'));
  assert.ok(P.status().progress, 'setup failed: no progress after convergence');
  for (let i = 0; i < 12; i++) W.observe(screen(['Something', 'Unrelated', 'Entirely']));
  assert.strictEqual(P.status().progress, null, 'kept claiming a step after the evidence vanished');
});

check('a question in progress silences the pilot', () => {
  // Observed live: the learner typed "what step am I on" and got back an unrelated recovery
  // hint, because dwelling fired at the same moment and displaced the reply. Someone typing
  // a question is the LEAST stuck they ever are - they know exactly what they want.
  const s = S(); s.asking = true;
  const d = P._decide(world({ stuck: 'dwelling' }), { status: 'resolved', label: 'Publish', element: {} }, 100000, s);
  assert.strictEqual(d.act, 'SILENT', `Rocky spoke over a question: ${d.act}`);
  assert.strictEqual(d.why, 'learner-is-asking');
});

check('and it resumes once the question is answered', () => {
  const s = S(); s.asking = false;
  const d = P._decide(world(), { status: 'resolved', label: 'Publish', element: {} }, 100000, s);
  assert.strictEqual(d.act, 'POINT', 'Rocky stayed silent after the box closed');
});

// ---- cost -----------------------------------------------------------------------------------
check('observe() stays in the millisecond budget', () => {
  W.reset(); W.ingest(GUIDE);
  const big = screen(Array.from({ length: 150 }, (_, i) => 'Control ' + i).concat(['Publish']));
  const t0 = Date.now();
  for (let i = 0; i < 100; i++) W.observe(big);
  const per = (Date.now() - t0) / 100;
  console.log(`         ${per.toFixed(2)} ms per observation, 151 controls`);
  assert.ok(per < 5, `${per.toFixed(2)} ms per observation — the hot path is too slow`);
});

check('hunting between pages is forgotten once the step advances', () => {
  /*
   * routeChanges was never reset, so four page moves at the start of a lab made every later
   * step read as "oscillating" for the rest of the session — and the ladder fired on a learner
   * doing fine. It is a per-step count, like attempts, and it now resets with it.
   */
  W.reset(); W.ingest(GUIDE);
  // Drive the count the real way, with the same six page moves the oscillation test above uses
  // (the first observe has no previous route to count against).
  for (let i = 0; i < 6; i++) W.observe(screen(['Publish'], 'https://portal.azure.com/#p' + i));
  assert.strictEqual(W.stuck(), 'oscillating', 'baseline: four route changes should read as oscillating');
  W.note({ type: 'complete' });
  assert.strictEqual(W.current().learner.routeChanges, 0, 'routeChanges survived the step advance');
  assert.notStrictEqual(W.stuck(), 'oscillating', 'still oscillating after moving on');
});

check('what the guide said about a step survives ingest', () => {
  // ingest used to rebuild each step from text and targets alone, silently dropping the author's
  // mark-up (which the mentor's dependency rule keys on), the purpose clause, and the task.
  W.reset();
  W.ingest({ title: 'T', page: 1, steps: [
    { text: 'Click Continue.', raw: 'Click **Continue**.', why: 'to sign in', task: 'Sign in', learn: { why: 'x' },
      targets: [{ n: 1, label: 'Continue' }] },
  ] });
  const s = W.steps()[0];
  assert.strictEqual(s.raw, 'Click **Continue**.', 'raw was dropped');
  assert.strictEqual(s.why, 'to sign in', 'why was dropped');
  assert.strictEqual(s.task, 'Sign in', 'task was dropped');
  assert.deepStrictEqual(s.learn, { why: 'x' }, 'learn was dropped');
});

check('CHAIN: the guide\'s task heading reaches the mentor through the path that actually ships', () => {
  /*
   * THE TEST THAT WOULD HAVE CAUGHT TODAY'S BLOCKER. Three layers each rebuilt the step object:
   * guide-reader kept the task heading, world-model's ingest was taught to pass it through, and
   * pilot.js compactSteps() - the ONLY caller of ingest() - stripped it back to text and targets.
   * Every gate called ingest() directly, so all of them were green while nothing reached the
   * mentor in a browser. This drives the real chain, end to end, on a real guide line.
   */
  const code = (f) => fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', f), 'utf8');
  const gw = {};
  new Function('window', 'document', 'setInterval', code('guide-reader.js'))(
    gw, { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null }, () => 0);
  const parsed = gw.LabPilotGuide._test.parseLines([
    'Task 2: Create the custom departing-user policy',
    'Select **Create policy** > **Custom policy**. Do not select **Quick policy**.',
  ]);
  assert.strictEqual(parsed.steps.length, 1, 'the real line should parse to one step');
  assert.strictEqual(parsed.steps[0].task, 'Create the custom departing-user policy', 'guide-reader lost the task');

  const compact = P._compactSteps(parsed.steps);
  assert.strictEqual(compact.length, 1);
  assert.strictEqual(compact[0].task, 'Create the custom departing-user policy', 'compactSteps stripped the task - the blocker is back');
  assert.ok(compact[0].raw && /\*\*Create policy\*\*/.test(compact[0].raw), 'compactSteps stripped the mark-up');

  W.reset(); W.ingest({ title: 'Zava', page: 4, steps: compact });
  const step = W.steps()[0];
  assert.strictEqual(step.task, 'Create the custom departing-user policy', 'ingest lost the task');

  const mw = { LabPilotFrame: { isTop: true, ownsUI: true }, LabPilotWorld: W };
  new Function('window', 'document', code('mentor.js'))(mw, { querySelector: () => null });
  const why = mw.LabPilotMentor.why(step, 0);
  assert.ok(why, 'the mentor found no reason for a step under a task heading');
  assert.strictEqual(why.source, 'guide-task');
  assert.strictEqual(why.text, 'This is part of the task \u201CCreate the custom departing-user policy\u201D.');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky knows where he is, and stays quiet when he should.\n`);
