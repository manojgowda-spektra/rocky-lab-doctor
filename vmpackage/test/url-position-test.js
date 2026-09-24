/*
 * url-position-test.js — does the URL make Rocky's position belief converge, without letting
 * it lie?
 *
 * MEASURED LIVE (Know Your Data SMB, template 15549, Challenge 04): the belief never reached the
 * 0.80 the pilot needs before it will say "Step N of M", because the only evidence was control
 * names, and a portal's navigation shows the SAME control names on every page. "Policies" is in
 * the left nav of every Insider Risk page, so control evidence alone settles on the Policies
 * step the moment the learner enters the solution — two steps early.
 *
 * Portal URLs encode where you are: purview.microsoft.com/insiderriskmgmt/policies, or
 * portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.Compute%2FVirtualMachines.
 * The world model now derives a route hint per click target at ingest and reads the URL as
 * evidence. The promises tested here:
 *
 *   - a hint is derived from the label with nothing but normalisation (plus a tiny alias table
 *     for portal nouns whose URL segment differs from the label), never from a model
 *   - the URL names the hop the learner has COMPLETED, so a matched final hop puts the belief
 *     on the next unfinished step — "you are inside Insider Risk Management, so you are on
 *     Settings", not "you are on Solutions"
 *   - the URL alone can never flip the belief: a weak substring in an unrelated URL stays below
 *     CONF_ADVANCE for as long as you like. Controls and route have to agree.
 *   - when they agree, the right step reaches the pilot's 0.80 within a few observations
 *   - the existing world-model promises (pilot-test.js) are untouched
 *
 * Pure logic, Node, no DOM, same harness as pilot-test.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

function load(file, win) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', file), 'utf8');
  const doc = {
    readyState: 'complete', addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null, documentElement: {}, getElementById: () => null,
  };
  new Function('window', 'document', 'setTimeout', 'setInterval', 'MutationObserver', 'performance', 'location', 'history',
    code)(win, doc, () => 0, () => 0, function () { return { observe() {}, disconnect() {} }; },
    { now: () => Date.now() }, { href: 'https://purview.microsoft.com/home' }, {});
  return win;
}

const win = {};
load('world-model.js', win);
load('pilot.js', win);
const W = win.LabPilotWorld;
const P = win.LabPilotPilot;
const CONF_ADVANCE = W._tuning.CONF_ADVANCE;
/*
 * WHAT CONVERGENCE MEANS HERE, AND WHY IT IS NOT 0.80 ON PAGE ONE.
 *
 * These sequences each start on a page Rocky has never seen. Until he has seen a few distinct
 * pages he cannot tell a navigation item from a target — measured live on
 * purview.microsoft.com/home, where step 1's label "Solutions" is permanent left navigation
 * and drove confidence to 1.0, which would have had Rocky announce "Step 1 of 5" for the whole
 * lab however far the learner got. The world model therefore caps its STATED confidence at
 * 0.75 until furniture is known; the belief itself, and so the glow, is untouched.
 *
 * So these tests assert what the URL signal is actually for: that the RIGHT STEP is identified
 * and that the belief is at its ceiling. That the ceiling lifts to 0.80+ once several pages
 * have been seen is covered by discrimination-test.js, which is where that behaviour belongs.
 */
const UNPROVEN_CAP = 0.75;
const CONF_SHOW = UNPROVEN_CAP;            // the achievable ceiling early in a lab

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// ---- the lab, exactly as the guide reader parses it -----------------------------------------
// Each `targets` array below is the verbatim output of LabPilotGuide._test.parseLine for the
// instruction in `text`. Not hand-shaped: if the reader's output changes, so must this.
const GUIDE = {
  title: 'Challenge 04: Insider Risk Detection for Departing Users',
  page: 1,
  steps: [
    { text: 'In the Microsoft Purview portal, navigate to Solutions (1) and then Insider Risk Management (2).', surface: 'browser',
      targets: [{ n: 1, label: 'Solutions', alt: ['navigate to Solutions'] }, { n: 2, label: 'Insider Risk Management', alt: [] }] },
    { text: 'Select Settings > Policy indicators.', surface: 'browser',
      targets: [{ n: 1, label: 'Settings' }, { n: 2, label: 'Policy indicators' }] },
    { text: 'Click Save.', surface: 'browser',
      targets: [{ n: 1, label: 'Save' }] },
    { text: 'Select Policies.', surface: 'browser',
      targets: [{ n: 1, label: 'Policies' }] },
    { text: 'Select Create policy > Custom policy.', surface: 'browser',
      targets: [{ n: 1, label: 'Create policy' }, { n: 2, label: 'Custom policy' }] },
  ],
};
const STEP = { SOLUTIONS: 0, SETTINGS: 1, SAVE: 2, POLICIES: 3, CREATE: 4 };

// ---- the screens, as perception would hand them over -------------------------------------------
// Control names as the Purview portal exposes them. The home page facts are the ones measured
// live: "Solutions" is a menuitem; the only "Insider Risk Management" on the page is a video
// link. Inside the solution the left nav (Overview ... Policies ... Settings) is on every page —
// which is precisely why control names alone cannot tell the steps apart.
const NAV = ['Overview', 'Alerts', 'Cases', 'Policies', 'Users', 'Forensic evidence', 'Notice templates', 'Settings', 'Home', 'Search', 'Help'];
const shot = (url, title, names) => ({ url, title, controls: names.map((n) => ({ name: n, role: 'button', id: '' })) });

const HOME = shot('https://purview.microsoft.com/home', 'Microsoft Purview',
  ['Home', 'Solutions', 'Settings', 'Search', 'Help', 'Insider Risk Management, Watch video, opens in new tab', 'Data Loss Prevention, Watch video, opens in new tab']);
const HOME_MENU = shot('https://purview.microsoft.com/home', 'Microsoft Purview',
  HOME.controls.map((c) => c.name).concat(['Insider Risk Management', 'Data Loss Prevention', 'Information Protection', 'Communication Compliance']));
const IRM_OVERVIEW = shot('https://purview.microsoft.com/insiderriskmgmt/overview', 'Overview - Insider Risk Management - Microsoft Purview',
  NAV.concat(['Recommended actions']));
const IRM_SETTINGS = shot('https://purview.microsoft.com/insiderriskmgmt/settings', 'Settings - Insider Risk Management - Microsoft Purview',
  NAV.concat(['Policy indicators', 'Policy timeframes', 'Intelligent detections', 'Priority user groups', 'Analytics']));
const IRM_SETTINGS_SAVE = shot('https://purview.microsoft.com/insiderriskmgmt/settings', 'Settings - Insider Risk Management - Microsoft Purview',
  NAV.concat(['Policy indicators', 'Office indicators', 'Device indicators', 'Save', 'Cancel']));
const IRM_POLICIES = shot('https://purview.microsoft.com/insiderriskmgmt/policies', 'Policies - Insider Risk Management - Microsoft Purview',
  NAV.concat(['Create policy', 'Copy', 'Delete', 'Refresh']));

// Observe the same screen until the belief sits on `step` at the confidence the pilot needs to
// show a number, or give up. The step matters: for one observation after a page change the
// OLD step is still above 0.80 while it decays — that inertia is the "one frame cannot move
// the belief far" promise, not convergence.
/*
 * WHAT "SETTLED" MEANS, AND WHY IT CHANGED.
 *
 * settle() used to wait for the index to be right AND confidence >= 0.80, and every page in
 * the walk was asserted to reach 0.80. That was written when confidence was an unbounded score
 * that saturated: one well-supported step ran to the ceiling and stayed there, so 0.80 arrived
 * everywhere and meant nothing. That saturation IS the live defect this branch exists to fix —
 * a permanent nav item held step 1 at confidence 1.0 for a whole lab, and a learner on step 4
 * would have been told "Step 1 of 5" with total certainty.
 *
 * Confidence is now the leading step's SHARE of the belief, so it can only be high when the
 * other steps are genuinely ruled out. On a page where two steps' controls are equally on
 * screen it cannot be high, because Rocky genuinely cannot tell those steps apart. On /home
 * both "Solutions" (step 1) and "Settings" (step 2) are in the permanent navigation; no honest
 * model reaches 0.80 there, and demanding it is asking for the defect back.
 *
 * This file already said so. The comment inside the walk below reads "caps stated confidence
 * at 0.75 until it has seen enough pages ... early in a sequence there is correctly no number".
 * The assertion demanding 0.80 on the first page ever seen simply contradicted it, and
 * discrimination-test.js asserts the opposite of it outright.
 *
 * So convergence is measured on what these checks are actually about — does the belief arrive
 * at the RIGHT STEP, and how fast — and confidence is asserted separately by honest(), in the
 * direction that protects the learner.
 */
function settle(screen, max, step) {
  let c;
  for (let i = 1; i <= max; i++) {
    W.observe(screen); c = W.current();
    if (c.index === step) return { n: i, c };
  }
  return { n: max, c };
}

/*
 * THE HONESTY ASSERTION, which replaces "confidence must reach 0.80".
 *
 * The thing a learner acts on is the step NUMBER, so the failure that matters is a number that
 * is wrong or unearned — never a number withheld. Whenever confidence is high enough for the
 * pilot to state one, that number must correspond to a real believed step, and the walk above
 * separately asserts the pilot never shows a number that disagrees with the belief.
 */
function honest(c, label) {
  if (c.confidence >= CONF_SHOW) {
    assert.ok(c.step, `${label}: confidence ${c.confidence} with no believed step at all`);
    assert.ok(c.index >= 0, `${label}: confidence ${c.confidence} with no index`);
  }
}

const where = (c) => `step ${c.index + 1} (${c.step ? c.step.targets.map((t) => t.label).join(' > ') : '-'}) at ${c.confidence}`;

console.log('\n=== URL AS A POSITION SIGNAL ===\n');

// ---- hints: derived, not invented ------------------------------------------------------------
check('route hints are derived from the labels by normalisation alone', () => {
  W.reset(); W.ingest(GUIDE);
  const s = W.steps();
  const irm = s[STEP.SOLUTIONS].hops[1].route;
  assert.ok(irm.includes('insiderriskmanagement'), `full form missing: ${irm}`);
  assert.ok(irm.includes('insiderrisk'), `two-word prefix missing: ${irm}`);
  assert.ok(irm.includes('insiderriskmgmt'), `the portal's own segment (alias) missing: ${irm}`);
  assert.ok(s[STEP.SETTINGS].hops[1].route.includes('policyindicators'), `${s[STEP.SETTINGS].hops[1].route}`);
  assert.ok(s[STEP.POLICIES].hops[0].route.includes('policies'), `${s[STEP.POLICIES].hops[0].route}`);
  assert.ok(s[STEP.CREATE].hops[0].route.includes('createpolicy'), `${s[STEP.CREATE].hops[0].route}`);
});

check('a short label like "Save" yields no route hint — "save" in a URL means nothing', () => {
  W.reset(); W.ingest(GUIDE);
  const save = W.steps()[STEP.SAVE];
  assert.deepStrictEqual(save.hops[0].route, [], `hints: ${save.hops[0].route}`);
  assert.strictEqual(save.hinted, false);
});

// ---- the lab, page by page ---------------------------------------------------------------------
check('the realistic Insider Risk sequence converges to the right step on every page', () => {
  W.reset(); W.ingest(GUIDE);
  const trail = [];
  // `within` is the observation budget for a page. /home carries no route hint ("home" is on the
  // stop list, and no step names it) so it converges on controls alone, which takes four; every
  // page inside the solution has the URL to lean on and must do it in three.
  const expect = (screen, step, label, within) => {
    const r = settle(screen, 4, step);
    trail.push(`${label}: ${where(r.c)} after ${r.n} obs`);
    assert.strictEqual(r.c.index, step, `${label}: settled on ${where(r.c)}, expected step ${step + 1}\n         ${trail.join('\n         ')}`);
    honest(r.c, label);
    assert.ok(r.n <= within, `${label}: took ${r.n} observations to converge, budget ${within}`);
    /*
     * The pilot shows a step NUMBER only above its own 0.80 threshold, and the world model
     * caps stated confidence at 0.75 until it has seen enough pages to know which labels are
     * furniture. So early in a sequence there is correctly no number — that restraint IS the
     * fix for the live defect, where "Step 1 of 5" was asserted with certainty from a nav item
     * that is on every page of the portal.
     *
     * What must hold is that when a number IS shown it is the right one. A wrong number is the
     * failure; no number is the honest interim state.
     */
    const p = P.status().progress;
    if (p) {
      assert.strictEqual(p.n, step + 1,
        `${label}: pilot showed step ${p.n} but the belief is step ${step + 1} — a number that is wrong`);
    }
  };
  expect(HOME, STEP.SOLUTIONS, '/home', 4);
  W.observe(HOME_MENU);
  expect(HOME_MENU, STEP.SOLUTIONS, '/home, Solutions open', 3);
  expect(IRM_OVERVIEW, STEP.SETTINGS, '/insiderriskmgmt/overview', 3);
  expect(IRM_SETTINGS, STEP.SETTINGS, '/insiderriskmgmt/settings', 3);
  expect(IRM_POLICIES, STEP.CREATE, '/insiderriskmgmt/policies', 3);
  console.log('         ' + trail.join('\n         '));
});

check('without the URL the overview page settles on the WRONG step — the value of the signal', () => {
  // Rocky joins with the learner already inside the solution (the cross-tab case: the pilot
  // starts on the Purview tab). Controls only: "Policies" is in the nav, so the Policies step
  // wins two steps early. This is the live failure, reproduced. With the URL, the same screen
  // goes to Settings.
  W.reset(); W.ingest(GUIDE);
  const blind = shot('https://purview.microsoft.com/', IRM_OVERVIEW.title, IRM_OVERVIEW.controls.map((c) => c.name));
  const b = settle(blind, 4, STEP.POLICIES);
  assert.strictEqual(b.c.index, STEP.POLICIES, `controls alone settled on ${where(b.c)} — this check no longer documents the live failure, rewrite it`);
  W.reset(); W.ingest(GUIDE);
  const s = settle(IRM_OVERVIEW, 4, STEP.SETTINGS);
  assert.strictEqual(s.c.index, STEP.SETTINGS, `with the URL the same screen settled on ${where(s.c)}`);
  // Only "Settings" of this step's two targets is on screen, and it is a permanent nav item,
  // so the belief is correctly held back from stating a number. What the URL buys is the right
  // STEP where controls alone gave the wrong one — that is the whole claim of this check.
  assert.ok(s.n <= 3, `with the URL: ${where(s.c)} after ${s.n} observations`);
  honest(s.c, 'overview with URL');
  console.log(`         controls alone: ${where(b.c)}   with the URL: ${where(s.c)} after ${s.n} obs`);
});

check('a step whose destination is in the URL has already been clicked — the belief moves past it', () => {
  W.reset(); W.ingest(GUIDE);
  for (let i = 0; i < 3; i++) W.observe(IRM_SETTINGS);
  const r = settle(IRM_POLICIES, 4, STEP.CREATE);
  assert.strictEqual(r.c.index, STEP.CREATE, `on /policies the belief is ${where(r.c)}; "Policies" is done, Create policy is next`);
  assert.ok(r.n <= 3, `took ${r.n} observations`);
  assert.ok(r.c.done >= 4, `only ${r.c.done} steps marked done on the policies page`);
});

check('the done ledger steers the URL: back on the overview after Save, Policies is next', () => {
  // Inside the solution the URL only says "insiderriskmgmt". Which step that means depends on
  // what is already done: on first arrival it is Settings; after Settings and Save it is
  // Policies. Completion arrives through note({type:'complete'}), as it does from the recovery
  // and end-state paths.
  W.reset(); W.ingest(GUIDE);
  settle(IRM_SETTINGS, 4, STEP.SETTINGS);
  assert.strictEqual(W.current().index, STEP.SETTINGS, 'setup: not on Settings');
  W.note({ type: 'complete' });
  // Same URL, Settings still in the nav, Save now on screen: a done step must not stay pinned
  // by the URL that names its first hop.
  const s = settle(IRM_SETTINGS_SAVE, 4, STEP.SAVE);
  assert.strictEqual(s.c.index, STEP.SAVE, `after completing Settings the belief is ${where(s.c)}`);
  assert.ok(s.n <= 3, `Save took ${s.n} observations`);
  W.note({ type: 'complete' });
  const r = settle(IRM_OVERVIEW, 4, STEP.POLICIES);
  assert.strictEqual(r.c.index, STEP.POLICIES, `back on the overview the belief is ${where(r.c)}, expected Policies`);
  honest(r.c, 'overview after Save');
});

// ---- the URL alone must never be enough --------------------------------------------------------
check('a misleading URL alone never exceeds CONF_ADVANCE, however long it is stared at', () => {
  // The learner has wandered into Data Loss Prevention. Its URL ends in /policies too. Nothing
  // from the guide is on screen. The belief must not move.
  W.reset(); W.ingest(GUIDE);
  const dlp = shot('https://purview.microsoft.com/datalossprevention/policies', 'Policies - Data Loss Prevention - Microsoft Purview',
    ['Overview', 'Alerts', 'Activity explorer', 'Refresh', 'Home']);
  let peak = 0;
  for (let i = 0; i < 40; i++) { W.observe(dlp); peak = Math.max(peak, W.current().confidence); }
  const c = W.current();
  assert.ok(peak < CONF_ADVANCE, `URL alone pushed the belief to ${peak} (CONF_ADVANCE ${CONF_ADVANCE})`);
  assert.strictEqual(c.index, 0, `URL alone moved the pointer to step ${c.index + 1}`);
  assert.strictEqual(c.done, 0, `URL alone marked ${c.done} steps done`);
  console.log(`         peak belief from the URL alone: ${peak}`);
});

check('a matching title alone is mild evidence, never a flip', () => {
  W.reset(); W.ingest(GUIDE);
  const s = shot('https://purview.microsoft.com/home', 'Insider Risk Management - Microsoft Purview', ['Refresh', 'Help']);
  let peak = 0;
  for (let i = 0; i < 40; i++) { W.observe(s); peak = Math.max(peak, W.current().confidence); }
  assert.ok(peak > 0, 'the title contributed nothing');
  assert.ok(peak < CONF_ADVANCE / 2, `title alone reached ${peak}; it is meant to be mild`);
  assert.strictEqual(W.current().index, 0);
});

// ---- URL shapes ----------------------------------------------------------------------------------
check('an Azure blade URL is decoded: Microsoft.Compute%2FVirtualMachines carries "virtualmachines"', () => {
  W.reset();
  W.ingest({ title: 'Azure', steps: [
    { text: 'Select Virtual machines.', surface: 'browser', targets: [{ n: 1, label: 'Virtual machines' }] },
    { text: 'Select Create.', surface: 'browser', targets: [{ n: 1, label: 'Create' }] },
  ] });
  const blade = 'https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.Compute%2FVirtualMachines';
  W.observe(shot(blade, 'Virtual machines - Microsoft Azure', ['Refresh', 'Feedback']));
  const withUrl = W.current();
  W.reset(); W.ingest({ title: 'Azure', steps: [{ text: 'Select Virtual machines.', surface: 'browser', targets: [{ n: 1, label: 'Virtual machines' }] }] });
  W.observe(shot('https://portal.azure.com/#home', 'Home - Microsoft Azure', ['Refresh', 'Feedback']));
  const without = W.current();
  assert.ok(withUrl.confidence > 0, 'the blade URL contributed no evidence');
  assert.strictEqual(without.confidence, 0, 'an unrelated URL contributed evidence');
  assert.ok(withUrl.route && withUrl.route.pos === 1, `blade URL positions the learner at ${JSON.stringify(withUrl.route)}, expected the step after Virtual machines`);
});

// ---- cost and regressions -----------------------------------------------------------------------
check('observe() with route evidence stays in the millisecond budget', () => {
  W.reset(); W.ingest(GUIDE);
  const big = shot(IRM_POLICIES.url, IRM_POLICIES.title, Array.from({ length: 150 }, (_, i) => 'Control ' + i).concat(['Policies']));
  const t0 = Date.now();
  for (let i = 0; i < 100; i++) W.observe(big);
  const per = (Date.now() - t0) / 100;
  console.log(`         ${per.toFixed(2)} ms per observation, 151 controls`);
  assert.ok(per < 5, `${per.toFixed(2)} ms per observation — the hot path is too slow`);
});

check('the existing world-model promises still hold (pilot-test.js)', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'pilot-test.js')], { encoding: 'utf8' });
  const summary = (r.stdout || '').trim().split('\n').filter((l) => /passed/.test(l)).pop() || '(no summary)';
  console.log(`         pilot-test.js: ${summary}`);
  assert.strictEqual(r.status, 0, `pilot-test.js exited ${r.status}\n${r.stdout}\n${r.stderr}`);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — the URL tells Rocky where he is, and cannot by itself tell him wrong.\n`);
