/*
 * coach-wiring-test.js — the ladder has to be REACHABLE, not merely correct.
 *
 * coach.js was written, unit tested to 13 assertions, committed, and then sat in the tree doing
 * absolutely nothing: it was never listed in the manifest, so the browser never loaded it, and
 * nothing ever called it. Every one of its tests passed the whole time, because they load the
 * file directly from disk. A module can be perfect and still be dead.
 *
 * So this file tests the WIRING, which is the part unit tests structurally cannot see:
 *
 *   1. the manifest actually loads coach.js, and before the pilot that calls it
 *   2. the pilot exposes coach() and it is never null, for any world the model can be in
 *   3. the escalation path uses the ladder instead of its old hand-rolled line
 *   4. "where am I" can never answer null — the question a lost learner actually asks
 *   5. the world model reports what the ladder needs in order to say what comes next
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', 'webext');
const src = (f) => fs.readFileSync(path.join(root, 'content', f), 'utf8');
// Comments describing a rule are not the rule. Strip them before asserting on code, or a check
// passes on the very comment that explains why it exists — which has happened in this repo.
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function load(file, win, href) {
  const doc = {
    readyState: 'complete', addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null, documentElement: {}, getElementById: () => null, title: 'Purview',
  };
  new Function('window', 'document', 'setTimeout', 'setInterval', 'MutationObserver',
    'performance', 'location', 'history', 'chrome', src(file))(
    win, doc, () => 0, () => 0, function () { return { observe() {}, disconnect() {} }; },
    { now: () => Date.now() },
    { href: href || 'https://purview.microsoft.com/insiderriskmgmt/policies' }, {}, undefined);
  return win;
}

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

console.log('\n=== THE LADDER IS REACHABLE ===\n');

// ---- 1. loaded at all --------------------------------------------------------------------
check('the manifest loads coach.js, and loads it before the pilot that calls it', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const js = m.content_scripts[0].js;
  const c = js.indexOf('content/coach.js');
  const p = js.indexOf('content/pilot.js');
  assert.ok(c >= 0, 'coach.js is not in the manifest — the browser never loads it, so the ladder is dead code');
  assert.ok(p >= 0, 'pilot.js is not in the manifest');
  assert.ok(c < p, `coach.js loads at ${c}, after pilot.js at ${p} — LabPilotCoach is undefined when the pilot needs it`);
});

// ---- 2. the pilot's public door ------------------------------------------------------------
const win = {};
load('world-model.js', win);
load('coach.js', win);
load('pilot.js', win);
const W = win.LabPilotWorld;
const P = win.LabPilotPilot;

const GUIDE = {
  title: 'Challenge 04: Insider Risk Detection for Departing Users',
  steps: [
    { text: 'Open Solutions > Insider Risk Management.', surface: 'browser',
      targets: [{ n: 1, label: 'Solutions' }, { n: 2, label: 'Insider Risk Management' }] },
    { text: 'Open Settings > Policy indicators.', surface: 'browser',
      targets: [{ n: 1, label: 'Settings' }, { n: 2, label: 'Policy indicators' }] },
    { text: 'Select Save.', surface: 'browser', targets: [{ n: 1, label: 'Save' }] },
  ],
};

check('the pilot exposes coach(), and it answers from a cold start with no guide at all', () => {
  assert.strictEqual(typeof P.coach, 'function', 'the pilot does not expose coach()');
  W.reset();
  const r = P.coach();
  assert.ok(r && typeof r.text === 'string' && r.text.trim().length > 10,
    `empty answer from a cold start: ${JSON.stringify(r)}`);
  assert.ok(win.LabPilotCoach._levels.includes(r.level), `unknown level ${r.level}`);
});

check('coach() answers for every world the model can be in, and never apologises', () => {
  // The phrasings that mark this product category's failure. None may ever be the answer.
  const banned = /\b(i (don'?t|do not) know|not sure|cannot determine|unable to determine|no idea)\b/i;
  const NAV = ['Solutions', 'Settings', 'Home', 'Policies', 'Insider Risk Management'];
  const shot = (extra, url) => ({
    url, title: 'Microsoft Purview',
    controls: NAV.concat(extra || []).map((n) => ({ name: n, role: 'button', id: '' })),
  });

  const worlds = [
    ['cold, no guide', () => { W.reset(); }],
    ['a guide, but nothing observed yet', () => { W.reset(); W.ingest(GUIDE); }],
    ['a page that matches nothing in the guide', () => {
      W.reset(); W.ingest(GUIDE);
      for (let i = 0; i < 6; i++) W.observe({ url: 'https://example.com/x', title: 'X', controls: [] });
    }],
    ['deep inside the lab', () => {
      W.reset(); W.ingest(GUIDE);
      for (let i = 0; i < 8; i++) {
        W.observe(shot(['Policy indicators'], 'https://purview.microsoft.com/insiderriskmgmt/settings'));
      }
    }],
    ['a URL the guide has never heard of', () => {
      W.reset(); W.ingest(GUIDE);
      for (let i = 0; i < 6; i++) W.observe(shot([], 'https://portal.azure.com/#blade/xyz'));
    }],
  ];
  for (const [label, setup] of worlds) {
    setup();
    const r = P.coach();
    assert.ok(r && r.text && r.text.trim().length > 10, `${label}: no answer — ${JSON.stringify(r)}`);
    assert.ok(!banned.test(r.text), `${label}: gave up instead of degrading — "${r.text}"`);
  }
});

check('below POINT the pilot never offers to glow, because it has not found the control', () => {
  W.reset(); W.ingest(GUIDE);
  for (let i = 0; i < 6; i++) W.observe({ url: 'https://example.com/x', title: 'X', controls: [] });
  const r = P.coach();
  if (r.level !== 'POINT') {
    assert.strictEqual(r.canGlow, false, `${r.level} offered to glow a control Rocky has not found`);
  }
});

// ---- 3. the escalation path actually uses it ------------------------------------------------
check('the stuck path says what the ladder chose, not its old hand-rolled line', () => {
  const p = code('pilot.js');
  assert.ok(/coach\(\s*\{\s*world:/.test(p), 'the ESCALATE branch does not call coach()');
  assert.ok(!/I cannot find/.test(p),
    'the old "I cannot find X on this page" line is still in the code — the ladder was added beside it, not wired in');
});

// ---- 4. the question a lost learner actually asks ---------------------------------------------
check('"where am I" reaches the ladder rather than answering null', () => {
  const lc = code('lab-context.js');
  const from = lc.indexOf('where am i');
  // Anchored AFTER the match: "resource group" also appears in this file's header, where the
  // questions it answers are listed, so an unanchored search slices the file backwards.
  const to = lc.indexOf('resource group', from);
  assert.ok(from >= 0 && to > from, 'could not find the where-am-i answer in order to check it');
  const where = lc.slice(from, to);
  assert.ok(/\.coach\(\)/.test(where),
    'the where-am-i answer never consults the coach, so a learner with no AI key still gets "I cannot answer that yet"');
});

// ---- 5. the model reports what the ladder needs ------------------------------------------------
check('the world reports the guide and the done ledger, so ORIENT can name what comes next', () => {
  W.reset(); W.ingest(GUIDE);
  const c = W.current();
  assert.ok(Array.isArray(c.steps) && c.steps.length === 3,
    `steps not reported: ${c.steps && c.steps.length}`);
  assert.ok(c.doneMap && typeof c.doneMap === 'object', 'doneMap not reported');
  // and the ladder must actually use them: ORIENT names the next UNFINISHED step, by the
  // guide's own words, from the done ledger rather than from the belief.
  const said = win.LabPilotCoach.say({
    steps: c.steps, doneMap: { s0: 1 }, total: 3, confidence: 0.1,
    url: 'https://purview.microsoft.com/insiderriskmgmt/overview',
  });
  assert.strictEqual(said.level, 'ORIENT', `expected ORIENT, got ${said.level}`);
  assert.match(said.text, /Settings/, `ORIENT did not name the next unfinished step: "${said.text}"`);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — the ladder is loaded, called, and cannot answer with silence.\n`);
