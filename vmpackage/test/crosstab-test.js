/*
 * crosstab-test.js — the guide is on one tab, the work is on another. Does the glow follow?
 *
 * MEASURED LIVE (Know Your Data SMB, template 15549): the guide renders on
 * experience.cloudlabs.ai and the learner works on purview.microsoft.com. LabPilotGuide.read()
 * finds the guide ONLY on the CloudLabs tab, so the pilot never started on Purview and nothing
 * could glow where the learner actually clicks. That is the single biggest gap in the product.
 *
 * The fix is a shared record in chrome.storage.local (one key, lpSharedGuide). The tab that can
 * read the guide PUBLISHES it; a lab tab with no guide of its own FOLLOWS it — ingests the same
 * steps into its own world model and runs the pilot there, so resolution and the glow happen
 * against the real controls. The follower sees the evidence, so its belief is published back
 * and the guide tab adopts it.
 *
 * Two "tabs" here are two fake windows sharing one mocked chrome.storage, each loading the
 * SHIPPED world-model.js and pilot.js (same loader trick as pilot-test.js). No DOM, no browser,
 * no timers: everything asserted is a promise the architecture makes:
 *   - a follower ingests a fresh shared guide and starts the pilot
 *   - a stale record is ignored — that is someone else's lab, or an old one
 *   - a page with a guide of its own never follows; the guide on screen wins
 *   - the follower publishes its belief back and the guide tab converges on it
 *   - the guide tab's belief is NOT imported by the follower (it saw no controls)
 *   - a page turn / new challenge on the guide tab re-ingests on the follower
 *   - a tab that arrives before the guide picks it up when it is published
 *   - a tab never reacts to its own echo
 *   - the record stays small
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---- a mocked chrome.storage.local shared by every tab in a scenario -------------------------
// set() fires onChanged in EVERY context, including the one that wrote — exactly as Chrome does,
// which is why the code under test must recognise its own echo.
function fakeChrome(seed) {
  const store = Object.assign({}, seed || {});
  const listeners = [];
  let writes = 0;
  const api = {
    _store: store,
    get writes() { return writes; },
    storage: {
      local: {
        get(keys, cb) {
          const out = {};
          [].concat(keys).forEach((k) => { if (k in store) out[k] = JSON.parse(JSON.stringify(store[k])); });
          cb(out);
        },
        set(obj, cb) {
          writes++;
          const changes = {};
          for (const k in obj) {
            changes[k] = { oldValue: store[k], newValue: JSON.parse(JSON.stringify(obj[k])) };
            store[k] = changes[k].newValue;
          }
          listeners.slice().forEach((l) => l(changes, 'local'));
          if (cb) cb();
        },
      },
      onChanged: { addListener(l) { listeners.push(l); } },
    },
  };
  return api;
}

function load(file, win, chrome, url) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', file), 'utf8');
  const doc = {
    readyState: 'complete', addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null, documentElement: {}, getElementById: () => null,
  };
  new Function('window', 'document', 'setTimeout', 'setInterval', 'MutationObserver', 'performance', 'location', 'history', 'chrome',
    code)(win, doc, () => 0, () => 0, function () { return { observe() {}, disconnect() {} }; },
    { now: () => Date.now() }, { href: url }, {}, chrome);
  return win;
}

/*
 * One browser tab: its own window (so its own world model and pilot singletons), its own fake
 * guide reader and perception, sharing the scenario's chrome.storage.
 */
function tab(chrome, opts) {
  const win = {};
  const perceiveCbs = [], guideCbs = [], events = [];
  let guide = opts.guide || null;
  let screen = { url: opts.url, title: opts.title || '', controls: [] };

  win.addEventListener = () => {};
  win.dispatchEvent = (ev) => { events.push(ev && ev.type); return true; };
  win.LabPilotGuide = {
    read() { return guide ? Object.assign({ found: true }, guide) : { found: false, title: '', steps: [] }; },
    onChange(cb) { guideCbs.push(cb); },
  };
  win.LabPilotPerceive = { snapshot() { return screen; }, onChange(cb) { perceiveCbs.push(cb); } };
  // The resolver is not under test here; every target is absent so the monitor stays silent
  // and no overlay is needed. The glow contract is gated elsewhere.
  win.LabPilotLabel = { resolveAny(labels) { return { status: 'absent', reason: 'test', label: labels[0] }; } };

  load('world-model.js', win, chrome, opts.url);
  load('pilot.js', win, chrome, opts.url);
  return {
    win, W: win.LabPilotWorld, P: win.LabPilotPilot, events,
    // what is on this tab's screen changed
    show(names) {
      screen = { url: opts.url, title: opts.title || '', controls: names.map((n) => ({ name: n, role: 'button', id: '' })) };
      perceiveCbs.forEach((cb) => cb(screen));
    },
    // the guide pane on this tab changed (page turn, new challenge, or one appeared)
    turnGuide(g) { guide = g; guideCbs.forEach((cb) => cb(Object.assign({ found: true }, g))); },
  };
}

const MIN = 60 * 1000;
const CL_URL = 'https://experience.cloudlabs.ai/#/labguidepreview/abc';
const PV_URL = 'https://purview.microsoft.com/home';

// Shaped exactly like the guide reader's output for the live lab (Challenge 04, 5 steps).
const GUIDE = {
  title: 'Challenge 04: Insider Risk Detection for Departing Users',
  page: 4,
  steps: [
    { text: 'In Microsoft Edge, open https://purview.microsoft.com, then open Solutions > Insider Risk Management.',
      surface: 'browser', targets: [{ n: 1, label: 'Solutions' }, { n: 2, label: 'Insider Risk Management' }] },
    { text: 'Open Settings > Policy indicators and remain on the Built-in indicators tab.',
      surface: 'browser', targets: [{ n: 1, label: 'Settings' }, { n: 2, label: 'Policy indicators' }] },
    { text: 'Select Save and wait for the success notification.', surface: 'browser', targets: [{ n: 1, label: 'Save' }] },
    { text: 'In Insider Risk Management, open Policies.', surface: 'browser', targets: [{ n: 1, label: 'Policies' }] },
    { text: 'Select Create policy > Custom policy. Do not select Quick policy.',
      surface: 'browser', targets: [{ n: 1, label: 'Create policy', alt: ['Select Create policy'] }, { n: 2, label: 'Custom policy' }] },
  ],
};
const GUIDE2 = {
  title: 'Challenge 05: Review Alerts',
  page: 5,
  steps: [
    { text: 'Open Alerts.', surface: 'browser', targets: [{ n: 1, label: 'Alerts' }] },
    { text: 'Select Review.', surface: 'browser', targets: [{ n: 1, label: 'Review' }] },
    { text: 'Click on the Visual Studio Code from the VM desktop.', surface: 'VS Code', surfaceWhy: 'a desktop application',
      targets: [{ n: 1, label: 'Visual Studio Code' }] },
  ],
};

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}
const KEY = 'lpSharedGuide';

console.log('\n=== CROSS-TAB GUIDANCE ===\n');

// ============================================================================================
// Scenario 1: the live lab. Guide on the CloudLabs tab, work on the Purview tab.
// ============================================================================================
const chrome1 = fakeChrome();
const A = tab(chrome1, { guide: GUIDE, url: CL_URL, title: 'CloudLabs' });
const B = tab(chrome1, { guide: null, url: PV_URL, title: 'Microsoft Purview' });
let rA, rB;

check('the guide tab starts as OWNER and publishes the guide to chrome.storage', () => {
  rA = A.P.start();
  assert.ok(rA && rA.ok, `owner refused: ${JSON.stringify(rA)}`);
  assert.strictEqual(rA.role, 'owner', `role ${rA.role}`);
  const rec = chrome1._store[KEY];
  assert.ok(rec, 'nothing published under ' + KEY);
  assert.strictEqual(rec.title, GUIDE.title);
  assert.strictEqual(rec.steps.length, 5, `published ${rec.steps.length} steps`);
  assert.strictEqual(rec.sourceUrl, CL_URL, `sourceUrl ${rec.sourceUrl}`);
  assert.ok(Math.abs(Date.now() - rec.updatedAt) < 5000, 'updatedAt is not now');
  assert.ok(rec.from, 'no tab id on the record — echoes could not be told apart');
  assert.strictEqual(rec.role, 'owner');
});

check('the published record keeps every hop and alternative reading, and stays small', () => {
  const rec = chrome1._store[KEY];
  assert.deepStrictEqual(rec.steps[0].targets.map((t) => t.label), ['Solutions', 'Insider Risk Management']);
  assert.deepStrictEqual(rec.steps[4].targets[0].alt, ['Select Create policy']);
  assert.ok(JSON.stringify(rec).length < 8192, `record is ${JSON.stringify(rec).length} bytes`);
});

check('a lab tab with NO guide of its own becomes a FOLLOWER and ingests the shared steps', () => {
  rB = B.P.start();
  assert.ok(rB && rB.ok, `follower did not start: ${JSON.stringify(rB)}`);
  assert.strictEqual(rB.role, 'follower');
  const c = B.W.current();
  assert.strictEqual(c.total, 5, `follower world model has ${c.total} steps`);
  assert.strictEqual(c.lab, GUIDE.title);
  assert.ok(c.step && /Solutions/.test(c.step.targets[0].label), `follower is on the wrong step: ${c.step && c.step.text}`);
  const st = B.P.status();
  assert.ok(st.on, 'follower pilot is not on');
  assert.strictEqual(st.role, 'follower');
});

check('the follower announces it took the glow, so the bundle loop can stand down', () => {
  assert.ok(B.events.includes('lp-pilot-start'), `events fired: ${B.events.join(', ') || 'none'}`);
});

check('the guide tab is untouched by the follower starting — one glow per tab, it keeps its own', () => {
  assert.strictEqual(A.P.status().role, 'owner');
  assert.strictEqual(A.W.current().total, 5);
});

check('the follower publishes its belief BACK once the real controls move it', () => {
  // The Purview page shows step 2's controls. Repeated evidence moves the belief (pilot-test
  // proves the threshold); the point here is that the move leaves the tab.
  for (let i = 0; i < 8; i++) B.show(['Settings', 'Policy indicators', 'Home']);
  const c = B.W.current();
  assert.strictEqual(c.index, 1, `follower settled on step ${c.index}`);
  const rec = chrome1._store[KEY];
  assert.strictEqual(rec.role, 'follower', `last writer was the ${rec.role}`);
  assert.strictEqual(rec.index, 1, `published index ${rec.index}`);
  assert.ok(rec.confidence >= 0.65, `published confidence ${rec.confidence}`);
  assert.strictEqual(rec.steps.length, 5, 'the follower dropped the steps from the record');
});

check('the guide tab ADOPTS the follower\'s position — it converges from where the evidence is', () => {
  const c = A.W.current();
  assert.strictEqual(c.index, 1, `guide tab still believes step ${c.index}`);
  assert.strictEqual(A.P.status().world.step.targets[0].label, 'Settings');
});

check('the follower does NOT import the guide tab\'s belief — the guide tab saw no controls', () => {
  // The CloudLabs shell happens to show a "Save" button. The owner's belief lands on step 3,
  // and it is published; the follower must not move for it.
  for (let i = 0; i < 10; i++) A.show(['Save', 'Next', 'Previous']);
  assert.strictEqual(A.W.current().index, 2, 'setup: owner did not move to the Save step');
  const rec = chrome1._store[KEY];
  assert.strictEqual(rec.role, 'owner', 'setup: the owner did not publish its move');
  assert.strictEqual(B.W.current().index, 1, `follower moved to step ${B.W.current().index} on the guide tab's say-so`);
});

check('a tab ignores its own echo', () => {
  const rec = Object.assign({}, chrome1._store[KEY], { from: A.P._shared.TAB, updatedAt: Date.now() });
  const r = A.P._shared.onShared(rec);
  assert.strictEqual(r.act, 'ignore', `acted on own echo: ${JSON.stringify(r)}`);
  assert.strictEqual(r.why, 'own-echo');
});

check('the storage traffic is bounded — no publish/receive loop between the tabs', () => {
  const before = chrome1.writes;
  for (let i = 0; i < 20; i++) B.show(['Settings', 'Policy indicators', 'Home']);   // nothing changes
  assert.ok(chrome1.writes - before <= 2, `${chrome1.writes - before} writes for 20 identical frames`);
});

check('the guide tab turns the page: new title, new steps -> the follower re-ingests', () => {
  A.turnGuide(GUIDE2);
  const rec = chrome1._store[KEY];
  assert.strictEqual(rec.title, GUIDE2.title, `published title ${rec.title}`);
  const c = B.W.current();
  assert.strictEqual(c.total, 3, `follower has ${c.total} steps after the page turn`);
  assert.strictEqual(c.lab, GUIDE2.title);
  assert.strictEqual(c.index, 0, 'a new challenge does not start at its first step');
  assert.strictEqual(B.P.status().role, 'follower', 'the follower changed role on a page turn');
});

check('the follower keeps the non-browser surface, so Rocky announces it rather than hunting', () => {
  const steps = B.W.steps();
  assert.strictEqual(steps[2].surface, 'VS Code', `surface ${steps[2].surface}`);
});

check('a stale record is NOT re-ingested by a running follower', () => {
  const stale = Object.assign({}, chrome1._store[KEY], { title: 'Some old lab', from: 'zzzz', role: 'owner', updatedAt: Date.now() - 31 * MIN });
  const r = B.P._shared.onShared(stale);
  assert.strictEqual(r.act, 'ignore', JSON.stringify(r));
  assert.strictEqual(r.why, 'stale');
  assert.strictEqual(B.W.current().lab, GUIDE2.title);
});

check('a follower whose own page grows a guide is promoted to OWNER — the guide on screen wins', () => {
  B.turnGuide(GUIDE);
  assert.strictEqual(B.P.status().role, 'owner', `role ${B.P.status().role}`);
  assert.strictEqual(B.W.current().lab, GUIDE.title);
  const rec = chrome1._store[KEY];
  assert.strictEqual(rec.from, B.P._shared.TAB, 'the promoted tab did not publish');
  assert.strictEqual(rec.role, 'owner');
});

// ============================================================================================
// Scenario 2: a stale record from an earlier lab. Nothing should start.
// ============================================================================================
const stale = Object.assign({}, chrome1._store[KEY], { from: 'old1', role: 'owner', updatedAt: Date.now() - 31 * MIN });
const chrome2 = fakeChrome({ [KEY]: stale });
const C = tab(chrome2, { guide: null, url: PV_URL });

check('a STALE shared guide (31 min old) is ignored — the pilot does not start', () => {
  const r = C.P.start();
  assert.ok(!r.ok, `started on a stale record: ${JSON.stringify(r)}`);
  assert.strictEqual(r.why, 'no-guide-on-screen');
  assert.strictEqual(C.W.current().total, 0, 'stale steps were ingested');
  assert.strictEqual(C.P.status().role, null);
});

check('but a fresh record arriving afterwards does start it', () => {
  chrome2.storage.local.set({ [KEY]: Object.assign({}, stale, { from: 'new1', updatedAt: Date.now() }) });
  assert.ok(C.P.status().on, 'did not start when a fresh record arrived');
  assert.strictEqual(C.P.status().role, 'follower');
});

// ============================================================================================
// Scenario 3: a tab with a guide of its own, and a fresh shared record for something else.
// ============================================================================================
const chrome3 = fakeChrome({ [KEY]: Object.assign({}, chrome1._store[KEY], { title: 'Somebody else\'s lab', from: 'other', role: 'owner', updatedAt: Date.now() }) });
const D = tab(chrome3, { guide: GUIDE2, url: CL_URL });

check('a page with its OWN guide never follows — it leads, and overwrites the shared record', () => {
  const r = D.P.start();
  assert.ok(r.ok && r.role === 'owner', JSON.stringify(r));
  assert.strictEqual(D.W.current().total, 3);
  assert.strictEqual(D.W.current().lab, GUIDE2.title);
  assert.strictEqual(chrome3._store[KEY].title, GUIDE2.title, 'the owner did not publish over the foreign record');
});

check('an owner does not re-ingest a foreign owner\'s guide', () => {
  const foreign = { title: 'Somebody else\'s lab', steps: GUIDE.steps, from: 'other', role: 'owner', updatedAt: Date.now(), index: 0, confidence: 0 };
  const r = D.P._shared.onShared(foreign);
  assert.strictEqual(r.act, 'ignore', JSON.stringify(r));
  assert.strictEqual(D.W.current().lab, GUIDE2.title);
});

// ============================================================================================
// Scenario 4: the work tab opens BEFORE the guide tab has published anything.
// ============================================================================================
const chrome4 = fakeChrome();
const E = tab(chrome4, { guide: null, url: PV_URL });

check('a tab that arrives before the guide waits, then follows when it is published', () => {
  const r = E.P.start();
  assert.ok(!r.ok && r.why === 'no-guide-on-screen', JSON.stringify(r));
  assert.ok(!E.P.status().on);
  const F = tab(chrome4, { guide: GUIDE, url: CL_URL });
  F.P.start();
  assert.ok(E.P.status().on, 'the waiting tab never picked up the published guide');
  assert.strictEqual(E.P.status().role, 'follower');
  assert.strictEqual(E.W.current().total, 5);
});

check('a follower seeded by a confident follower record starts on that step', () => {
  const chrome5 = fakeChrome({ [KEY]: Object.assign({}, chrome1._store[KEY], { from: 'work1', role: 'follower', index: 3, confidence: 0.9, updatedAt: Date.now() }) });
  const H = tab(chrome5, { guide: null, url: 'https://purview.microsoft.com/insiderrisk' });
  const r = H.P.start();
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(H.W.current().index, 3, `started on step ${H.W.current().index}`);
});

check('a follower seeded by an OWNER record does not take its position — it starts from the top', () => {
  const chrome6 = fakeChrome({ [KEY]: Object.assign({}, chrome1._store[KEY], { from: 'guide1', role: 'owner', index: 3, confidence: 0.9, updatedAt: Date.now() }) });
  const I = tab(chrome6, { guide: null, url: PV_URL });
  const r = I.P.start();
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(I.W.current().index, 0, `took the guide tab's position ${I.W.current().index}`);
});

// ============================================================================================
// No chrome at all (pilot-test.js loads it this way): the pilot must behave exactly as before.
// ============================================================================================
check('without chrome.storage the owner path is unchanged and nothing throws', () => {
  const win = {};
  win.LabPilotGuide = { read() { return Object.assign({ found: true }, GUIDE); }, onChange() {} };
  win.LabPilotPerceive = { snapshot() { return { url: CL_URL, title: '', controls: [] }; }, onChange() {} };
  win.LabPilotLabel = { resolveAny(labels) { return { status: 'absent', label: labels[0] }; } };
  load('world-model.js', win, undefined, CL_URL);
  load('pilot.js', win, undefined, CL_URL);
  const r = win.LabPilotPilot.start();
  assert.ok(r.ok && r.role === 'owner', JSON.stringify(r));
  assert.strictEqual(win.LabPilotWorld.current().total, 5);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — the glow follows the learner to the tab where the work is.\n`);
