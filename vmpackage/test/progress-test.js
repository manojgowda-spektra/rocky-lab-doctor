/*
 * progress-test.js — a step is done when the page says so, not when the mouse does.
 *
 * THE DEFECT. recovery.js marked a step complete on the click of the glowed control. Measured
 * against the live lab (Know Your Data SMB, template 15549) that is wrong for
 *   "Select Save and wait for the success notification"   — the click starts the step
 *   "Select Create policy > Custom policy"                 — the click opens a menu
 * and it made Rocky move on before the page had. These tests pin the replacement:
 *
 *   (a) a Save step completes only when a success notice appears, never on the click
 *   (b) a multi-hop step advances to its next hop when that hop resolves, and completes on
 *       the last hop's evidence
 *   (c) a generic step completes when its control disappears, turns selected, the route
 *       changes, or the next step's target APPEARS (not "was always there")
 *   (d) an unmet end-state never completes; after ONE deadline Rocky says one line, keeps
 *       the glow, and does not loop
 *
 * Everything runs the real modules through mocked perception snapshots. The resolver is a
 * fake standing in for LabPilotLabel: the point here is what progress.js does with a verdict,
 * not how the engine reaches one.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---- harness ---------------------------------------------------------------------------------
const timers = [];                 // every setTimeout the modules ask for - so "exactly one" is provable
let notices = [];                  // what the page's status/alert regions currently say
let askOpen = false;               // is Rocky's ask box open
const loc = { href: 'https://purview.microsoft.com/home' };

const doc = {
  readyState: 'complete', addEventListener() {}, removeEventListener() {},
  querySelectorAll: (sel) => (/role="status"/.test(sel) ? notices : []),
  querySelector: (sel) => (askOpen && /data-labpilot/.test(sel) ? {} : null),
  documentElement: {}, getElementById: () => null,
};

function load(file, win) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', file), 'utf8');
  const g = {
    window: win, document: doc,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    setInterval: () => 0,
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    performance: { now: () => Date.now() },
    location: loc, history: {},
    getComputedStyle: () => ({}),
  };
  new Function(...Object.keys(g), code)(...Object.values(g));
  return win;
}

const win = {};
load('world-model.js', win);
load('pilot.js', win);
load('recovery.js', win);
load('progress.js', win);
const W = win.LabPilotWorld, P = win.LabPilotPilot, RC = win.LabPilotRecovery, PG = win.LabPilotProgress;

// ---- fakes -----------------------------------------------------------------------------------
const els = new Map();
function fakeEl(name, attrs) {
  const a = Object.assign({}, attrs || {});
  return {
    nodeType: 1, isConnected: true, innerText: name, textContent: name,
    getAttribute: (k) => (k === 'aria-label' ? name : (a[k] === undefined ? null : a[k])),
    set(k, v) { a[k] = v; },
    closest: () => null, contains: () => false,
  };
}
const elFor = (label) => { if (!els.has(label)) els.set(label, fakeEl(label)); return els.get(label); };

let visible = new Set();           // labels the fake engine would resolve uniquely right now
win.LabPilotLabel = {
  resolveAny(labels) {
    for (const l of [].concat(labels)) if (visible.has(l)) return { status: 'resolved', label: l, element: elFor(l), score: 0.8 };
    return { status: 'absent', reason: 'no-candidates', label: labels[0] };
  },
};
let glowed = null; const glows = []; let hides = 0;
win.LabPilotOverlay = { get tracked() { return glowed; }, guide(el, text) { glows.push({ el, text }); }, hide() { hides++; } };
const said = [];
win.LabPilotRocky = { announce(text, opts) { said.push({ text, opts }); }, checking(text) { said.push({ text, checking: true }); }, exploring: false };

// The live lab's five steps, exactly as the guide reader parses them.
const GUIDE = {
  title: 'Challenge 04: Insider Risk Detection for Departing Users',
  steps: [
    { text: 'In Microsoft Edge, open https://purview.microsoft.com, then open Solutions > Insider Risk Management.', surface: 'browser',
      targets: [{ n: 1, label: 'Solutions' }, { n: 2, label: 'Insider Risk Management' }] },
    { text: 'Open Settings > Policy indicators and remain on the Built-in indicators tab.', surface: 'browser',
      targets: [{ n: 1, label: 'Settings' }, { n: 2, label: 'Policy indicators' }] },
    { text: 'Select Save and wait for the success notification.', surface: 'browser', targets: [{ n: 1, label: 'Save' }] },
    { text: 'In Insider Risk Management, open Policies.', surface: 'browser', targets: [{ n: 1, label: 'Policies' }] },
    { text: 'Select Create policy > Custom policy. Do not select Quick policy.', surface: 'browser',
      targets: [{ n: 1, label: 'Create policy' }, { n: 2, label: 'Custom policy' }] },
  ],
};
const snap = (names, url) => ({ url: url || loc.href, title: 'Purview', controls: names.map((n) => ({ name: n, role: 'button', id: '' })) });
const notice = (text) => ({ isConnected: true, innerText: text, closest: () => null });

// A clean world sitting on step i, with nothing armed, nothing said, no timers.
function fresh(i) {
  W.reset(); W.ingest(GUIDE);
  const labels = GUIDE.steps[i].targets.map((t) => t.label);
  for (let k = 0; k < 10; k++) W.observe(snap(labels));
  assert.strictEqual(W.current().index, i, `setup: world settled on step ${W.current().index}, wanted ${i}`);
  PG._state.armed = null; PG._state.timer = 0; PG._state.last = null;
  timers.length = 0; notices = []; said.length = 0; glows.length = 0; hides = 0; askOpen = false;
  visible = new Set(); glowed = null; els.clear();
  loc.href = 'https://purview.microsoft.com/home';
  Object.assign(P._state, { on: false, lastSpoke: 0, lastTarget: '', lastPointAt: 0, lastIndex: null, lastHop: 0, glowing: null, asking: false });
  RC._state.rung = 0; RC._state.engaged = false;
}
// The learner clicks the control Rocky is glowing.
function click(el) { glowed = el; RC._onClick({ target: el }); }
const liveTimers = () => timers.filter((t) => t.live);
// A one-shot timer goes off: it is spent BEFORE its callback runs, exactly as in a browser, so
// any timer still live afterwards is one the callback armed - which is what a loop looks like.
function fire(t) { t.live = false; t.fn(); }

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

console.log('\n=== END-STATE: advance on evidence, not on a click ===\n');

// ---- pure: what each step is waiting for ----------------------------------------------------------
check('expect() classifies the live lab: hop, hop, notice, generic, hop', () => {
  fresh(0);
  const s = W.steps();
  const e0 = PG._expect(s[0], 0, s[1]);
  assert.strictEqual(e0.kind, 'hop'); assert.deepStrictEqual(e0.next, ['Insider Risk Management']);
  const e0b = PG._expect(s[0], 1, s[1]);                       // last hop of the same step
  assert.strictEqual(e0b.kind, 'generic'); assert.deepStrictEqual(e0b.next, ['Settings']);
  const e2 = PG._expect(s[2], 0, s[3]);
  assert.strictEqual(e2.kind, 'notice', `Save step read as ${e2.kind}`); assert.strictEqual(e2.save, true);
  const e3 = PG._expect(s[3], 0, s[4]);
  assert.strictEqual(e3.kind, 'generic'); assert.deepStrictEqual(e3.next, ['Create policy']);
  const e4 = PG._expect(s[4], 0, null);
  assert.strictEqual(e4.kind, 'hop'); assert.deepStrictEqual(e4.next, ['Custom policy']);
});

check('expect() never hunts for a next step that is not in the browser', () => {
  const e = PG._expect({ text: 'Open Policies.', targets: [{ label: 'Policies' }] }, 0,
    { text: 'Open VS Code', surface: 'VS Code', targets: [{ label: 'Visual Studio Code' }] });
  assert.deepStrictEqual(e.next, []);
});

// ---- (a) the Save step ---------------------------------------------------------------------------------
check('(a) a correct click on Save does NOT complete the step', () => {
  fresh(2);
  const done = W.current().done;
  click(elFor('Save'));
  assert.strictEqual(W.current().done, done, 'the click alone completed the step');
  assert.strictEqual(W.current().index, 2, 'the pointer moved on the click');
  const a = PG.status().armed;
  assert.ok(a && a.kind === 'notice', `armed: ${JSON.stringify(a)}`);
});

check('(a) it completes when the success notice appears, and the belief moves to Policies', () => {
  fresh(2);
  const done = W.current().done;
  click(elFor('Save'));
  PG.check(snap(['Save']));                                      // the page repaints, no toast yet
  assert.strictEqual(W.current().done, done, 'completed with no notice on screen');
  assert.strictEqual(PG.status().last.why, 'no-notice-yet');
  notices = [notice('Settings saved successfully')];
  PG.check(snap(['Save']));
  assert.strictEqual(W.current().done, done + 1, 'the notice did not complete the step');
  assert.strictEqual(W.current().index, 3, `pointer on step ${W.current().index}, expected Policies (3)`);
  assert.strictEqual(PG.status().armed, null, 'still armed after completion');
});

check('(a) a notice that was already on screen before the click is not evidence', () => {
  fresh(2);
  notices = [notice('Saved')];                                    // left over from the previous step
  const done = W.current().done;
  click(elFor('Save'));
  PG.check(snap(['Save']));
  assert.strictEqual(W.current().done, done, 'a stale banner completed the step');
  notices.push(notice('Policy indicators saved'));
  PG.check(snap(['Save']));
  assert.strictEqual(W.current().done, done + 1, 'a NEW notice did not complete it');
});

check('(a) for a notice step, the button going away is NOT completion - only the notice is', () => {
  fresh(2);
  const done = W.current().done;
  const save = elFor('Save');
  click(save);
  save.isConnected = false;                                       // greyed out / re-rendered
  PG.check(snap([]));
  assert.strictEqual(W.current().done, done, 'the Save step completed on the button vanishing');
});

// ---- (b) the multi-hop step -----------------------------------------------------------------------
check('(b) clicking Solutions arms the next hop; the step is not complete', () => {
  fresh(0);
  click(elFor('Solutions'));
  const a = PG.status().armed;
  assert.ok(a && a.kind === 'hop', `armed: ${JSON.stringify(a)}`);
  assert.deepStrictEqual(a.next, ['Insider Risk Management']);
  assert.strictEqual(W.current().done, 0);
});

check('(b) the hop is satisfied when Insider Risk Management resolves: pointer moves, step stays open', () => {
  fresh(0);
  click(elFor('Solutions'));
  PG.check(snap(['Solutions']));                                 // menu not open yet
  assert.strictEqual(W.current().hop, 0, 'hop advanced with nothing resolving');
  visible.add('Insider Risk Management');                        // the menu opened
  PG.check(snap(['Solutions', 'Insider Risk Management']));
  assert.strictEqual(W.current().hop, 1, 'hop did not advance when the next hop resolved');
  assert.strictEqual(W.current().done, 0, 'the whole step was completed by the first hop');
  assert.strictEqual(W.current().index, 0);
  assert.deepStrictEqual(P._labelsFor(W.current().step, W.current().hop), ['Insider Risk Management']);
});

check('(b) one turn after the menu opens, Rocky glows the next hop - no eight-second wait', () => {
  fresh(0);
  P._state.on = true;
  visible.add('Solutions');
  P._turn(snap(['Solutions']));
  assert.strictEqual(P.status().glowing, 'Solutions', `first glow: ${P.status().glowing}`);
  click(elFor('Solutions'));                                     // the learner clicks the glow
  visible.add('Insider Risk Management');                        // the menu opens; perception fires once
  P._turn(snap(['Solutions', 'Insider Risk Management']));
  assert.strictEqual(W.current().hop, 1);
  assert.strictEqual(P.status().glowing, 'Insider Risk Management',
    `Rocky is glowing ${P.status().glowing} (${P._state.lastDecision.act}: ${P._state.lastDecision.why})`);
  P._state.on = false;
});

check('(b) the last hop completes when the menu item disappears', () => {
  fresh(0);
  W.note({ type: 'hop' });                                       // Solutions already satisfied
  const irm = elFor('Insider Risk Management');
  click(irm);
  assert.strictEqual(PG.status().armed.kind, 'generic');
  irm.isConnected = false;                                       // the menu closed
  PG.check(snap(['Solutions']));
  assert.strictEqual(W.current().done, 1, 'the last hop vanishing did not complete the step');
  assert.strictEqual(W.current().index, 1);
});

// ---- (c) generic steps ---------------------------------------------------------------------------------
check('(c) a generic step completes when the clicked control disappears', () => {
  fresh(3);
  const done = W.current().done;
  const el = elFor('Policies');
  click(el);
  PG.check(snap(['Policies']));
  assert.strictEqual(W.current().done, done, 'completed while the control was still there');
  el.isConnected = false;
  PG.check(snap([]));
  assert.strictEqual(W.current().done, done + 1, 'the control vanished and nothing completed');
  assert.strictEqual(PG.status().last.why, 'control-gone');
});

check('(c) a framework re-render is not a disappearance', () => {
  fresh(3);
  const done = W.current().done;
  const el = elFor('Policies');
  click(el);
  el.isConnected = false;                                        // React swapped the node ...
  PG.check(snap(['Policies']));                                  // ... but "Policies" is still on screen
  assert.strictEqual(W.current().done, done, 'a re-render was read as the control going away');
});

check('(c) a tab turning aria-selected completes; one that was already selected does not', () => {
  fresh(3);
  const done = W.current().done;
  const tab = fakeEl('Policies', { 'aria-selected': 'false' });
  click(tab);
  PG.check(snap(['Policies']));
  assert.strictEqual(W.current().done, done);
  tab.set('aria-selected', 'true');
  PG.check(snap(['Policies']));
  assert.strictEqual(W.current().done, done + 1, 'aria-selected="true" was not read as completion');

  fresh(3);
  const already = fakeEl('Policies', { 'aria-selected': 'true' });
  click(already);
  PG.check(snap(['Policies']));
  assert.strictEqual(W.current().done, done, 'a tab that was selected BEFORE the click counted as evidence');
});

check('(c) a route change completes a generic step', () => {
  fresh(3);
  const done = W.current().done;
  click(elFor('Policies'));
  loc.href = 'https://purview.microsoft.com/insiderriskmgmt/policies';
  PG.check(snap(['Policies'], loc.href));
  assert.strictEqual(W.current().done, done + 1);
  assert.strictEqual(PG.status().last.why, 'url-changed');
});

check("(c) the next step's target APPEARING is evidence; having always been there is not", () => {
  fresh(3);
  const done = W.current().done;
  visible.add('Create policy');                                  // in the left nav all along
  click(elFor('Policies'));
  PG.check(snap(['Policies', 'Create policy']));
  assert.strictEqual(W.current().done, done, 'a control that predates the click completed the step');

  fresh(3);
  click(elFor('Policies'));
  PG.check(snap(['Policies']));
  assert.strictEqual(W.current().done, done);
  visible.add('Create policy');                                  // the Policies page rendered
  PG.check(snap(['Policies', 'Create policy']));
  assert.strictEqual(W.current().done, done + 1, "the next step's target appearing did not complete the step");
  assert.strictEqual(PG.status().last.why, 'next-step-resolves');
});

// ---- (d) unmet -----------------------------------------------------------------------------------------
check('(d) an unmet end-state never completes, and there is exactly ONE deadline - no timer loop', () => {
  fresh(2);
  const done = W.current().done;
  click(elFor('Save'));
  for (let i = 0; i < 5; i++) PG.check(snap(['Save']));
  assert.strictEqual(W.current().done, done, 'completed with no evidence');
  assert.strictEqual(liveTimers().length, 1, `${liveTimers().length} timers armed`);
  assert.strictEqual(liveTimers()[0].ms, PG._limits.WAIT_MS);
});

check('(d) at the deadline Rocky says one line, keeps the glow, and still does not complete', () => {
  fresh(2);
  const done = W.current().done;
  click(elFor('Save'));
  PG.check(snap(['Save']));
  fire(liveTimers()[0]);                                         // 10 s pass
  assert.strictEqual(said.length, 1, `Rocky said ${said.length} things`);
  assert.match(said[0].text, /waiting for the save/i);
  assert.strictEqual(said[0].opts.label, 'WAITING');
  assert.strictEqual(hides, 0, 'the glow was taken down');
  assert.strictEqual(W.current().done, done, 'the deadline completed the step');
  assert.ok(PG.status().armed, 'stopped watching for the notice after speaking');
  assert.strictEqual(liveTimers().length, 0, 'the deadline re-armed itself - that is a timer loop');
  notices = [notice('Saved successfully')];                     // the slow save finally lands
  PG.check(snap(['Save']));
  assert.strictEqual(W.current().done, done + 1, 'a late notice no longer completed the step');
});

check('(d) never a word over an open ask box - and no retry either', () => {
  fresh(2);
  click(elFor('Save'));
  askOpen = true;
  fire(liveTimers()[0]);
  assert.strictEqual(said.length, 0, 'Rocky spoke over the learner typing a question');
  assert.ok(PG.status().armed, 'silence disarmed the check');
  assert.strictEqual(liveTimers().length, 0, 'a retry timer was armed');
});

check('(d) the line is said at most once per arm', () => {
  fresh(2);
  click(elFor('Save'));
  const t = liveTimers()[0];
  fire(t); t.fn();                                               // and even if it somehow fired twice
  assert.strictEqual(said.length, 1);
});

// ---- coordination with the rest of Rocky -----------------------------------------------------------
check('a correct click still resets the recovery ladder (the aggressive exit survives)', () => {
  fresh(0);
  RC._state.rung = 3; RC._state.engaged = true;
  click(elFor('Solutions'));
  assert.strictEqual(RC._state.rung, 0);
  assert.strictEqual(RC._state.engaged, false);
  assert.strictEqual(W.current().done, 0, 'and yet the click completed the step');
});

check('the belief moving to another step on its own evidence disarms the check', () => {
  fresh(0);
  click(elFor('Solutions'));
  for (let k = 0; k < 10; k++) W.observe(snap(['Save']));       // the learner is plainly elsewhere
  const r = PG.check(snap(['Save']));
  assert.strictEqual(r.why, 'step-changed');
  assert.strictEqual(PG.status().armed, null);
});

check('a completed step hands the next one enough belief to act on, but not enough to claim a number', () => {
  fresh(2);
  W.note({ type: 'complete' });
  const c = W.current();
  assert.strictEqual(c.index, 3);
  assert.ok(c.confidence >= W._tuning.CONF_ADVANCE, `confidence ${c.confidence}`);
  assert.strictEqual(P.status().progress, null, 'claimed "step 4 of 5" before the page agreed');
});

check('source: the click no longer completes a step, and progress.js loads after recovery.js', () => {
  const dir = path.join(__dirname, '..', 'webext', 'content');
  const rec = fs.readFileSync(path.join(dir, 'recovery.js'), 'utf8');
  assert.match(rec, /LabPilotProgress/, 'recovery.js does not hand off to progress.js');
  const direct = (rec.match(/w\.note\(\{ type: "complete" \}\)/g) || []).length;
  assert.ok(direct <= 1 && /else w\.note\(\{ type: "complete" \}\)/.test(rec),
    'recovery.js still completes a step directly on a click');
  const pilot = fs.readFileSync(path.join(dir, 'pilot.js'), 'utf8');
  assert.match(pilot, /LabPilotProgress\.check\(/, 'the pilot never evaluates the end-state');
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'webext', 'manifest.json'), 'utf8'));
  const js = m.content_scripts[0].js;
  assert.ok(js.indexOf('content/progress.js') > js.indexOf('content/recovery.js'), 'progress.js loads before recovery.js');
  assert.ok(js.indexOf('content/progress.js') > js.indexOf('content/pilot.js'), 'progress.js loads before pilot.js');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky moves on when the page does, not when the mouse does.\n`);
