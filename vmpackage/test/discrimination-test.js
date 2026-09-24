/*
 * discrimination-test.js — evidence that does not discriminate is not evidence.
 *
 * THE DEFECT, MEASURED LIVE. On purview.microsoft.com/home the belief reported:
 *
 *     index: 0    confidence: 1.0    progress: "Step 1 of 5"
 *
 * Maximum certainty. The cause: step 1's label is "Solutions", and "Solutions" sits in
 * Purview's left navigation on EVERY page of the portal. Permanent navigation chrome produced
 * permanent maximum evidence, so step 1 would have stayed the believed step for the whole lab
 * — and a learner genuinely on step 4 would have been told "Step 1 of 5", confidently, at the
 * one moment they most needed to be told the truth.
 *
 * This is worse than silence, and it is worse than a low number. The pilot's honesty rule
 * (never show a step number below 0.80 confidence) was working exactly as designed; it was
 * being fed a signal that saturates on furniture. Every feature that reads position —
 * progress, recovery's "you have been here a while", end-state, what Rocky answers when asked
 * — inherits the error.
 *
 * THE FIX. A label's worth is inversely proportional to how many of the lab's steps it
 * currently supports. Unique to one step: counts full. Shared by every step: counts ~0. Same
 * principle as inverse document frequency, and the same one cloudlabs-kb.js already uses.
 *
 * Deliberately NOT a stop-list of portal nouns: that needs maintaining per portal and would be
 * wrong the moment a lab genuinely is about clicking "Settings".
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
  new Function('window', 'document', 'setTimeout', 'setInterval', 'MutationObserver',
    'performance', 'location', 'history', 'chrome', code)(
    win, doc, () => 0, () => 0, function () { return { observe() {}, disconnect() {} }; },
    { now: () => Date.now() }, { href: 'https://purview.microsoft.com/home' }, {}, undefined);
  return win;
}

const win = {};
load('world-model.js', win);
const W = win.LabPilotWorld;

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

/*
 * The REAL lab, verbatim: Know Your Data (SMB), Challenge 04, as the guide reader parses it
 * from the live CloudLabs pane. Five steps, and the hops are what the parser actually returns.
 */
const GUIDE = {
  title: 'Challenge 04: Insider Risk Detection for Departing Users',
  steps: [
    { text: 'In Microsoft Edge, open https://purview.microsoft.com, then open Solutions > Insider Risk Management.',
      surface: 'browser', targets: [{ n: 1, label: 'Solutions' }, { n: 2, label: 'Insider Risk Management' }] },
    { text: 'Open Settings > Policy indicators and remain on the Built-in indicators tab.',
      surface: 'browser', targets: [{ n: 1, label: 'Settings' }, { n: 2, label: 'Policy indicators' }] },
    { text: 'Select Save and wait for the success notification.',
      surface: 'browser', targets: [{ n: 1, label: 'Save' }] },
    { text: 'In Insider Risk Management, open Policies.',
      surface: 'browser', targets: [{ n: 1, label: 'Policies' }] },
    { text: 'Select Create policy > Custom policy. Do not select Quick policy.',
      surface: 'browser', targets: [{ n: 1, label: 'Create policy' }, { n: 2, label: 'Custom policy' }] },
  ],
};

// Purview's PERMANENT left navigation — on screen on every page of the portal, whatever the
// learner is doing. This is the furniture that produced confidence 1.0.
const NAV = ['Solutions', 'Settings', 'Home', 'Data Map', 'Roles and scopes', 'Insider Risk Management'];

const screen = (extra, url) => ({
  url: url || 'https://purview.microsoft.com/home',
  title: 'Microsoft Purview',
  controls: NAV.concat(extra || []).map((n) => ({ name: n, role: 'button', id: '' })),
});

console.log('\n=== EVIDENCE MUST DISCRIMINATE ===\n');

check('permanent nav chrome alone never reaches the "show a number" threshold', () => {
  // THE MEASURED DEFECT. Nothing on screen but Purview's own navigation. Before the fix this
  // settled at confidence 1.0 on step 1 and would have claimed "Step 1 of 5" all lab long.
  W.reset(); W.ingest(GUIDE);
  let c;
  for (let i = 0; i < 25; i++) { W.observe(screen()); c = W.current(); }
  console.log(`         nav only -> index ${c.index}, confidence ${c.confidence}`);
  assert.ok(c.confidence < 0.80,
    `confidence ${c.confidence} on navigation furniture alone — Rocky would state a step number he cannot know`);
});

check('a control unique to one step does move the belief', () => {
  // "Policy indicators" belongs to step 2 and to nothing else, so it discriminates perfectly.
  W.reset(); W.ingest(GUIDE);
  let c;
  for (let i = 0; i < 12; i++) { W.observe(screen(['Policy indicators', 'Built-in indicators'])); c = W.current(); }
  console.log(`         unique control -> index ${c.index}, confidence ${c.confidence}`);
  assert.strictEqual(c.index, 1, `settled on step ${c.index + 1}, expected step 2`);
  assert.ok(c.confidence >= 0.65, `confidence only ${c.confidence} on a perfectly discriminating control`);
});

check('the unique control beats the furniture it is surrounded by', () => {
  // The realistic case: the nav is ALWAYS there too, and the learner has moved through a few
  // pages to get here — which is exactly how Rocky learns which labels are furniture.
  W.reset(); W.ingest(GUIDE);
  const walk = (extra, url) => { for (let i = 0; i < 8; i++) W.observe(screen(extra, url)); };
  walk([], 'https://purview.microsoft.com/home');
  walk(['Policy indicators'], 'https://purview.microsoft.com/insiderriskmgmt/settings');
  walk(['Policies'], 'https://purview.microsoft.com/insiderriskmgmt/policies');
  walk(['Create policy', 'Custom policy'], 'https://purview.microsoft.com/insiderriskmgmt/policies/create');
  const c = W.current();
  console.log(`         step-5 controls + nav -> index ${c.index}, confidence ${c.confidence}`);
  assert.strictEqual(c.index, 4, `settled on step ${c.index + 1} with step 5's controls on screen`);
});

check('the belief moves when the learner moves, rather than sticking on step 1', () => {
  // The whole point. Work through the lab and the belief must follow, not anchor on the nav.
  W.reset(); W.ingest(GUIDE);
  const at = (extra, url) => { for (let i = 0; i < 12; i++) W.observe(screen(extra, url)); return W.current().index; };
  const a = at(['Policy indicators'], 'https://purview.microsoft.com/insiderriskmgmt/settings');
  const b = at(['Policies'], 'https://purview.microsoft.com/insiderriskmgmt/policies');
  const c = at(['Create policy', 'Custom policy'], 'https://purview.microsoft.com/insiderriskmgmt/policies/create');
  console.log(`         walked the lab -> steps ${a + 1} then ${b + 1} then ${c + 1}`);
  assert.notStrictEqual(a, b, 'the belief did not move between two different pages');
  assert.ok(c >= b, `the belief went backwards: step ${b + 1} then step ${c + 1}`);
});

check('discrimination is computed from the lab, not a hard-coded list of portal nouns', () => {
  // A lab genuinely ABOUT the Settings page must still be able to point at Settings. A
  // stop-list of common nouns would silently break that; discrimination adapts for free.
  W.reset();
  W.ingest({ title: 'A lab about Settings', steps: [
    { text: 'Open Settings.', surface: 'browser', targets: [{ n: 1, label: 'Settings' }] },
    { text: 'Open Reports.', surface: 'browser', targets: [{ n: 1, label: 'Reports' }] },
  ] });
  let c;
  for (let i = 0; i < 12; i++) { W.observe({ url: 'https://purview.microsoft.com/', title: 'P',
    controls: [{ name: 'Settings', role: 'button' }, { name: 'Home', role: 'button' }] }); c = W.current(); }
  console.log(`         "Settings" as a real target -> index ${c.index}, confidence ${c.confidence}`);
  assert.strictEqual(c.index, 0, 'a lab whose real target is "Settings" can no longer find it');
  assert.ok(c.confidence >= 0.65, `confidence only ${c.confidence} — a legitimate Settings step was suppressed`);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky's certainty now comes from evidence that can tell steps apart.\n`);
