/*
 * occlusion-test.js — the live failure of 2026-09-24, reproduced and nailed shut.
 *
 * WHAT HAPPENED, MEASURED ON A REAL LAB (Challenge 04, template 15549, Purview).
 *
 * The learner had reached "New insider risk policy" — the full-page wizard you get after
 * clicking Policies and then Create policy. Rocky's own state at that moment:
 *
 *     believedIndex   3  ("In Insider Risk Management, open Policies")
 *     done            5  of 5   <- the ledger said the ENTIRE LAB was finished
 *     resolution      { status: "resolved", label: "Policies", score: 0.8 }
 *     "Policies" on screen   none
 *     the glow sat on        "Users and groups"
 *     misclicks       4
 *     stuck           "repeated-attempts"
 *
 * so Rocky interrupted with "STUCK? You have been on this step a little while. It is: In
 * Insider Risk Management, open Policies" — to someone who had finished it — while glowing a
 * control of an entirely different name.
 *
 * ONE ROOT CAUSE, THREE SYMPTOMS. Purview opens the wizard as a full-page overlay and leaves
 * the solution navigation in the DOM behind it. Every visibility test the engine had —
 * display, visibility, opacity, size, isConnected — PASSES for a buried element, because it
 * really is drawn; it is simply unreachable. So:
 *
 *   1. "Policies" resolved from the buried nav, and the overlay glowed its rectangle. The
 *      wizard's "Users and groups" had moved into that rectangle.
 *   2. Every click the learner made in the wizard was not on the glowed element, so
 *      recovery.js scored it a MISCLICK. Four of those tripped the stuck rule.
 *   3. The belief slid back onto a step the ledger had already recorded as done, because
 *      selection read the belief and never asked whether that step was behind the learner.
 *
 * The clicks WERE being detected. They were being counted as mistakes. That is the difference
 * between a page matcher and a learner model, and it is what these checks exist to hold.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// ---- a DOM just real enough to be painted over ------------------------------------------------
function makeDom() {
  const all = [];
  let topmostAt = null;         // what elementFromPoint should answer

  function el(name, rect, opts) {
    const o = opts || {};
    const node = {
      nodeType: 1, isConnected: true, tagName: o.tag || 'BUTTON',
      innerText: name, textContent: name,
      attrs: Object.assign({ role: o.role || 'button' }, o.attrs || {}),
      children: [], parent: null,
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      setAttribute(k, v) { this.attrs[k] = v; },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
      getBoundingClientRect() { return Object.assign({ x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height }, rect); },
      contains(other) { return other === this || this.children.indexOf(other) >= 0; },
      closest() { return null; },
      matches() { return false; },
      querySelectorAll() { return []; },
      get ownerDocument() { return doc; },
    };
    all.push(node);
    return node;
  }

  const win = { innerWidth: 1600, innerHeight: 900, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) };
  const doc = {
    defaultView: win,
    documentElement: { }, body: { },
    querySelectorAll() { return all; },
    querySelector() { return null; },
    getElementById() { return null; },
    // THE TEST THAT WAS MISSING. Answers with whatever is painted on top at that point.
    elementFromPoint(x, y) { return typeof topmostAt === 'function' ? topmostAt(x, y) : topmostAt; },
  };
  return { doc, win, el, all, setTopmost(f) { topmostAt = f; } };
}

function loadEngine(dom) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'anchor-engine.js'), 'utf8');
  const win = Object.assign({}, dom.win);
  new Function('window', 'document', 'location', 'getComputedStyle', 'setTimeout', 'MutationObserver', 'performance', code)(
    win, dom.doc, { href: 'https://purview.microsoft.com/insiderriskmgmt/policiespage' },
    dom.win.getComputedStyle, () => 0, function () { return { observe() {}, disconnect() {} }; }, { now: () => Date.now() });
  return win.LabPilotAnchor;
}

console.log('\n=== A CONTROL YOU CANNOT SEE IS NOT A CONTROL ===\n');

check('isCovered: a control with the wizard painted over it is covered', () => {
  const dom = makeDom();
  const buried = dom.el('Policies', { left: 64, top: 268, width: 243, height: 48 });
  const wizard = dom.el('Users and groups', { left: 0, top: 0, width: 1600, height: 900 });
  dom.setTopmost(() => wizard);                      // the wizard is on top everywhere
  const A = loadEngine(dom);
  assert.strictEqual(typeof A.isCovered, 'function', 'the engine has no occlusion test at all');
  assert.strictEqual(A.isCovered(buried), true,
    'a control with a full-page wizard over it was judged reachable — this is the live defect');
});

check('isCovered: a control nothing is covering is not covered', () => {
  const dom = makeDom();
  const open = dom.el('Policies', { left: 64, top: 268, width: 243, height: 48 });
  dom.setTopmost(() => open);
  const A = loadEngine(dom);
  assert.strictEqual(A.isCovered(open), false, 'a perfectly visible control was called covered');
});

check('isCovered: the hit landing on a CHILD is the same control, not an occluder', () => {
  // Real controls wrap their label in a span, and elementFromPoint returns the span.
  const dom = makeDom();
  const button = dom.el('Policies', { left: 64, top: 268, width: 243, height: 48 });
  const span = dom.el('Policies', { left: 70, top: 274, width: 200, height: 20 });
  button.children.push(span);
  dom.setTopmost(() => span);
  const A = loadEngine(dom);
  assert.strictEqual(A.isCovered(button), false,
    'the hit landed on the control own label and the control was called covered — nothing would ever resolve');
});

check('isCovered: off screen counts as unreachable', () => {
  const dom = makeDom();
  const below = dom.el('Policies', { left: 64, top: 2000, width: 243, height: 48 });
  dom.setTopmost(() => null);
  const A = loadEngine(dom);
  assert.strictEqual(A.isCovered(below), true, 'a control 1100px below the fold was treated as pointable');
});

check('isCovered: when the hit test is unavailable, do NOT refuse to point', () => {
  // Refusing to glow because a hit test threw would be a worse failure than the one fixed.
  const dom = makeDom();
  const e = dom.el('Policies', { left: 64, top: 268, width: 243, height: 48 });
  delete dom.doc.elementFromPoint;
  const A = loadEngine(dom);
  assert.strictEqual(A.isCovered(e), false, 'no hit test available should mean "cannot tell", not "covered"');
});

// ---- the whole resolution, end to end ------------------------------------------------------
function resolveFor(dom, label) {
  const A = loadEngine(dom);
  return A.resolve({ text: label, role: 'button' });
}

check('the live case: "Policies" buried under the wizard resolves ABSENT, not resolved', () => {
  const dom = makeDom();
  const buried = dom.el('Policies', { left: 64, top: 268, width: 243, height: 48 });
  const wizard = dom.el('Users and groups', { left: 0, top: 0, width: 1600, height: 900 });
  dom.setTopmost(() => wizard);
  const r = resolveFor(dom, 'Policies');
  assert.notStrictEqual(r.status, 'resolved',
    `resolved a control the learner cannot see or reach: ${JSON.stringify(r)} — Rocky would glow the wizard`);
  assert.strictEqual(r.reason, 'covered', `expected reason "covered", got ${JSON.stringify(r)}`);
});

check('the same control resolves normally once the wizard is gone', () => {
  const dom = makeDom();
  const nav = dom.el('Policies', { left: 64, top: 268, width: 243, height: 48 });
  dom.setTopmost(() => nav);
  const r = resolveFor(dom, 'Policies');
  assert.strictEqual(r.status, 'resolved', `the control is plainly visible and did not resolve: ${JSON.stringify(r)}`);
  assert.strictEqual(r.element, nav);
});

check('a buried duplicate cannot manufacture a false AMBIGUOUS either', () => {
  // Two "Save" buttons, one of them behind a dialog. Filtering AFTER choosing would leave the
  // buried one able to tie with the real one and produce "I can see more than one Save",
  // which is just as wrong as pointing at the wrong one.
  const dom = makeDom();
  const real = dom.el('Save', { left: 900, top: 800, width: 90, height: 32 });
  const buried = dom.el('Save', { left: 200, top: 400, width: 90, height: 32 });
  dom.setTopmost((x) => (x > 800 ? real : dom.all[dom.all.length - 1]));
  dom.el('Dialog backdrop', { left: 0, top: 0, width: 800, height: 900 });
  const r = resolveFor(dom, 'Save');
  assert.strictEqual(r.status, 'resolved', `a buried duplicate produced ${r.status}: ${JSON.stringify(r)}`);
  assert.strictEqual(r.element, real, 'resolved the buried duplicate rather than the reachable one');
});

// ---- the done ledger must not be contradicted ------------------------------------------------
function loadWorld() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'world-model.js'), 'utf8');
  const win = {};
  const doc = { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, documentElement: {}, getElementById: () => null };
  new Function('window', 'document', 'setTimeout', 'setInterval', 'MutationObserver', 'performance', 'location', 'history', 'chrome', code)(
    win, doc, () => 0, () => 0, function () { return { observe() {}, disconnect() {} }; },
    { now: () => Date.now() }, { href: 'https://purview.microsoft.com/insiderriskmgmt/policiespage' }, {}, undefined);
  return win.LabPilotWorld;
}

const GUIDE = {
  title: 'Challenge 04: Insider Risk Detection for Departing Users',
  steps: [
    { text: 'Open Solutions > Insider Risk Management.', surface: 'browser', targets: [{ n: 1, label: 'Solutions' }, { n: 2, label: 'Insider Risk Management' }] },
    { text: 'Open Settings > Policy indicators.', surface: 'browser', targets: [{ n: 1, label: 'Settings' }, { n: 2, label: 'Policy indicators' }] },
    { text: 'Select Save.', surface: 'browser', targets: [{ n: 1, label: 'Save' }] },
    { text: 'In Insider Risk Management, open Policies.', surface: 'browser', targets: [{ n: 1, label: 'Policies' }] },
    { text: 'Select Create policy > Custom policy.', surface: 'browser', targets: [{ n: 1, label: 'Create policy' }, { n: 2, label: 'Custom policy' }] },
  ],
};
// Purview's chrome on the policies page. "Policies" and "Settings" are both permanently here,
// which is why a finished step keeps being fed evidence long after it is over.
const NAV = ['Overview', 'Alerts', 'Cases', 'Policies', 'Users', 'Settings', 'Home', 'Search', 'Help'];
const screen = (extra, url) => ({
  url: url || 'https://purview.microsoft.com/insiderriskmgmt/policiespage',
  title: 'Policies - Insider Risk Management - Microsoft Purview',
  controls: NAV.concat(extra || []).map((n) => ({ name: n, role: 'button', id: '' })),
});

check('the pointer never rests on a step the ledger says is finished', () => {
  /*
   * THE LIVE STATE, REBUILT.
   *
   * The learner reaches step 5 (so the ledger records steps 1-4 done), then opens the wizard.
   * Purview keeps the URL at /policiespage — which CONTAINS "policies", so the route argues
   * for step 4 — leaves "Policies" in the buried nav, and removes "Create policy" from view.
   * Every signal now points at step 4, a step the ledger already recorded as finished, and
   * that is exactly where the belief slid back to on the real lab.
   */
  const W = loadWorld();
  W.reset(); W.ingest(GUIDE);
  for (let i = 0; i < 8; i++) W.observe(screen(['Policy indicators'], 'https://purview.microsoft.com/insiderriskmgmt/settings'));
  for (let i = 0; i < 10; i++) W.observe(screen(['Create policy', 'Custom policy'], 'https://purview.microsoft.com/insiderriskmgmt/policiespage/create'));
  const reached = W.current();
  assert.strictEqual(reached.index, 4, `setup: expected to reach step 5, got step ${reached.index + 1}`);
  // NOTE: the ids belong to the world's own copies of the steps, not to the guide literal.
  assert.ok(reached.doneMap[reached.steps[3].id], 'setup: step 4 was not recorded done on the way past it');

  // now the wizard: step 4's control is back in view, step 5's are gone, the URL says policies
  for (let i = 0; i < 10; i++) W.observe(screen(['Users and groups', 'Policy template', 'Next'], 'https://purview.microsoft.com/insiderriskmgmt/policiespage'));
  const c = W.current();
  assert.ok(c.index < 0 || c.complete || !c.doneMap[c.steps[c.index].id],
    `slid back onto step ${c.index + 1}, which the ledger already records as done — the live contradiction, ` +
    `beliefs ${JSON.stringify(W._beliefs())}`);
});

check('when every step is done the lab is COMPLETE, not "step N of N"', () => {
  const W = loadWorld();
  W.reset(); W.ingest(GUIDE);
  for (let i = 0; i < 6; i++) W.observe(screen([], 'https://purview.microsoft.com/insiderriskmgmt/policiespage'));
  // the end-state path marks the last step done, exactly as progress.js does
  for (let i = 0; i < GUIDE.steps.length; i++) W.note({ type: 'complete' });
  const c = W.current();
  assert.strictEqual(c.done, GUIDE.steps.length, `ledger holds ${c.done} of ${GUIDE.steps.length}`);
  assert.strictEqual(c.complete, true, 'every step is done and the world does not say the lab is complete');
});

check('a finished lab cannot be "stuck" — the counts describe work already over', () => {
  const W = loadWorld();
  W.reset(); W.ingest(GUIDE);
  for (let i = 0; i < 6; i++) W.observe(screen([], 'https://purview.microsoft.com/insiderriskmgmt/policiespage'));
  for (let i = 0; i < GUIDE.steps.length; i++) W.note({ type: 'complete' });
  // the four clicks the learner made WHILE finishing, which were scored as failures to finish
  for (let i = 0; i < 4; i++) W.note({ type: 'misclick' });
  const c = W.current();
  assert.strictEqual(c.stuck, null,
    `a completed lab reported stuck:"${c.stuck}" — this is the "STUCK?" card shown to someone who had finished`);
});

// ---- the pilot must act on it ------------------------------------------------------------------
check('the pilot goes silent on a finished lab rather than glowing completed work', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'pilot.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/world\.complete/.test(code) && /lab-complete/.test(code),
    'nothing in the pilot checks world.complete, so a finished lab still gets a glow and a step number');
});

check('the coach says the lab is done instead of hunting for a finished step', () => {
  const c = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'coach.js'), 'utf8');
  const win = {};
  new Function('window', c)(win);
  const said = win.LabPilotCoach.say({
    complete: true, total: 5, lab: 'Challenge 04', confidence: 0.9,
    step: GUIDE.steps[3], verdict: { status: 'resolved', label: 'Policies' },
    url: 'https://purview.microsoft.com/insiderriskmgmt/policiespage',
  });
  assert.strictEqual(said.level, 'DONE', `a finished lab produced level ${said.level}: "${said.text}"`);
  assert.strictEqual(said.canGlow, false, 'offered to glow a control belonging to completed work');
  assert.ok(!/Step \d+ of/.test(said.text), `claimed a step number on a finished lab: "${said.text}"`);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky will not point at what you cannot see, nor at what you have finished.\n`);
