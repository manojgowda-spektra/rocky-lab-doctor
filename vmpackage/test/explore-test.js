/*
 * explore-test.js — Explore mode, which until now had NO tests at all.
 *
 * WHY THIS EXISTS. An adversarial review found a live ReferenceError in rocky.js: a
 * `var r = ...` declaration had been appended to the end of a `//` comment, so it was
 * commented out and the next line read it. Every LabPilotRocky.explain() call threw. That
 * means dwell explanations, circle explanations, click comments and the destructive-action
 * warning produced NOTHING — the guard still blocked the click but never said why, which is
 * the worst possible version of that feature.
 *
 * It survived because Explore mode had zero coverage. Twelve browser gates and none of them
 * touched it. This file is that gap closed, and the first test is the one that would have
 * caught it.
 *
 * Tests the three things Item 6 actually turned out to be:
 *   1. explain() runs at all (the bug)
 *   2. the explanation cache: one model call per control, ever, and failures never cached
 *   3. explore and the glow are mutually exclusive (already structural — pin it)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'webext', 'content');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

console.log('\n=== EXPLORE MODE ===\n');

// ---- 1. the bug: does explain() actually run? ------------------------------------------------
check('rocky.js explain() has no swallowed declaration', () => {
  // The specific defect, checked structurally so it cannot come back in a different form:
  // a `var` on the same line as, and AFTER, a // comment is dead code that later lines read.
  const src = fs.readFileSync(path.join(SRC, 'rocky.js'), 'utf8');
  const bad = [];
  src.split('\n').forEach((line, i) => {
    const c = line.indexOf('//');
    if (c < 0) return;
    if (/\bvar\s+\w+\s*=/.test(line.slice(c))) bad.push(`${i + 1}: ${line.trim().slice(0, 100)}`);
  });
  assert.deepStrictEqual(bad, [], `a variable declaration is commented out:\n         ${bad.join('\n         ')}`);
});

check('the explain() body executes without throwing', () => {
  // Run the real function shape with the real control flow. A ReferenceError here is exactly
  // what shipped, so this asserts on behaviour rather than on the text of the file.
  const src = fs.readFileSync(path.join(SRC, 'rocky.js'), 'utf8');
  const m = /explain:\s*function\s*\(el,\s*text,\s*opts\)\s*\{([\s\S]*?)\n\s{4}\},/.exec(src);
  assert.ok(m, 'could not find explain() in rocky.js — has it been renamed?');
  const body = m[1];

  // Only the positioning half is testable in isolation; the rest touches DOM globals. That
  // half is where the bug was, and it is where a swallowed declaration would land again.
  const stubs = {
    setMood() {}, reposition() {}, show() {},
    bub: { style: {} },
    state: {}, performance: { now: () => 0 },
  };
  const upto = body.split('state.pending')[0];
  const fn = new Function('el', 'text', 'opts', 'setMood', 'reposition', 'show', 'bub',
    upto + '\n; return true;');
  const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) };
  assert.strictEqual(fn(el, 'hello', {}, stubs.setMood, stubs.reposition, stubs.show, stubs.bub), true);
});

// ---- 1b. the ask box: Enter must submit ---------------------------------------------------
check('Enter submits the ask box, not just the Ask button', () => {
  // Reported from a live lab: the learner typed a question, pressed Enter, and nothing
  // happened - while the Ask button worked. The box is a <form>, so implicit submission
  // SHOULD fire, but every key is stopPropagation'd to keep the portal from seeing the
  // learner type, and in several portals the implicit submit never reaches the form.
  // Both routes must call the same path.
  const src = fs.readFileSync(path.join(SRC, 'rocky.js'), 'utf8');
  const m = /function submitAsk\(\)[\s\S]{0,400}/.exec(src);
  assert.ok(m, 'no explicit submit path - Enter depends on implicit form submission');
  assert.match(src, /e\.key==="Enter"|e\.keyCode===13/,
    'the keydown handler never checks for Enter');
  // and exactly one submit handler, or a button click would fire the question twice
  const submits = (src.match(/row\.addEventListener\("submit"/g) || []).length;
  assert.strictEqual(submits, 1, `${submits} submit handlers - a click would ask twice`);
});

check('Shift+Enter does not submit', () => {
  // A learner writing a longer question should be able to break a line without sending it.
  const src = fs.readFileSync(path.join(SRC, 'rocky.js'), 'utf8');
  assert.match(src, /!e\.shiftKey/, 'Shift+Enter would submit the question mid-sentence');
});

// ---- 2. the explanation cache ------------------------------------------------------------------
function loadCache() {
  const code = fs.readFileSync(path.join(SRC, 'explain-cache.js'), 'utf8');
  const store = {};
  const chrome = {
    storage: {
      local: {
        get(keys, cb) { const out = {}; [].concat(keys).forEach((k) => { if (k in store) out[k] = store[k]; }); cb(out); },
        set(obj) { Object.assign(store, obj); },
        remove(k, cb) { delete store[k]; if (cb) cb(); },
      },
    },
  };
  const win = {};
  new Function('window', 'chrome', 'location', code)(win, chrome,
    { pathname: '/resourceGroups/demo', hash: '' });
  return { C: win.LabPilotExplainCache, store };
}

check('the cache key is about the CONTROL, not the element', () => {
  const { C } = loadCache();
  // A React re-render hands back a different node for the same button. Keying on identity or
  // a DOM path would miss every time, which is the same as having no cache.
  const a = C.key({ name: 'Resource group', role: 'combobox', el: {} });
  const b = C.key({ name: 'Resource group', role: 'combobox', el: {} });
  assert.strictEqual(a, b, 'two descriptions of the same control produced different keys');
  assert.ok(a && a.length > 3, `key looks empty: ${a}`);
});

check('different controls do not collide', () => {
  const { C } = loadCache();
  const rg = C.key({ name: 'Resource group', role: 'combobox' });
  const rg2 = C.key({ name: 'Resource group', role: 'button' });
  const other = C.key({ name: 'Region', role: 'combobox' });
  assert.notStrictEqual(rg, other, 'two different controls share a key');
  assert.notStrictEqual(rg, rg2, 'the same name in a different role shares a key');
});

check('a nameless control is not cacheable', () => {
  const { C } = loadCache();
  assert.strictEqual(C.key({ role: 'button' }), '', 'cached something with no identity');
});

check('put then get returns the answer', (done) => {
  const { C } = loadCache();
  const desc = { name: 'Resource group', role: 'combobox' };
  C.put(desc, 'A resource group is a container for related Azure resources.');
  let got = null;
  C.get(desc, (t) => { got = t; });
  assert.match(got || '', /container for related Azure resources/);
});

check('a second ask is a HIT — one model call per control, ever', () => {
  const { C } = loadCache();
  const desc = { name: 'Review + create', role: 'button' };
  let s1 = null;
  C.get(desc, () => {});                       // miss
  C.put(desc, 'Validates the configuration before deploying.');
  C.get(desc, () => {});                       // hit
  C.stats((s) => { s1 = s; });
  assert.strictEqual(s1.hits, 1, `expected 1 hit, got ${s1.hits}`);
  assert.strictEqual(s1.misses, 1, `expected 1 miss, got ${s1.misses}`);
});

check('the cache survives a page load (it is in storage, not memory)', () => {
  const { C, store } = loadCache();
  C.put({ name: 'Deploy', role: 'button' }, 'Starts the deployment.');
  assert.ok(store.lpExplainCache, 'nothing was written to chrome.storage.local');
  assert.ok(Object.keys(store.lpExplainCache).length >= 1, 'storage is empty after a put');
});

check('the cache is bounded — a long session cannot fill storage', () => {
  const { C } = loadCache();
  for (let i = 0; i < 400; i++) C.put({ name: 'Control ' + i, role: 'button' }, 'text ' + i);
  let n = 0;
  C.stats((s) => { n = s.entries; });
  assert.ok(n <= 300, `cache grew to ${n} entries — it is unbounded`);
});

check('an AI FAILURE is never cached', () => {
  // Caching "AI unavailable" would make one network blip permanent for that control.
  const explore = fs.readFileSync(path.join(SRC, 'explore.js'), 'utf8');
  const m = /function askAI\(desc, kbText\)[\s\S]*?\n  \}/.exec(explore);
  assert.ok(m, 'askAI not found in explore.js');
  const body = m[0];
  const failBranch = body.slice(body.indexOf('AI unavailable'));
  assert.ok(!/\.put\(/.test(failBranch), 'the failure path writes to the cache');
});

// ---- 3. explore and the glow are mutually exclusive ---------------------------------------------
check('the overlay refuses to glow while exploring', () => {
  // Already structural in overlay.js — guide() calls exploring() and suspends. Pinned here so
  // a later refactor cannot quietly let Rocky glow and explain at the same time.
  const src = fs.readFileSync(path.join(SRC, 'overlay.js'), 'utf8');
  const m = /function guide\(element, text, meta\)\s*\{([\s\S]{0,200})/.exec(src);
  assert.ok(m, 'overlay.guide not found');
  assert.match(m[1], /if \(exploring\(\)\)\s*\{\s*suspend\(\);\s*return;/,
    'guide() no longer suspends when exploring — Rocky could glow and explain at once');
});

// ---- 4. Explore knows which step it is on, on a lab nobody captured -------------------------------
check('context() prefers the world model over the stale fixture bundle', () => {
  // st.steps is fetched from bundle/test-bundle.json and is EMPTY on any guide-driven lab,
  // so without this Ask Rocky would be told nothing about the current step.
  const src = fs.readFileSync(path.join(SRC, 'explore.js'), 'utf8');
  const m = /function context\(\)([\s\S]*?)\n  \}/.exec(src);
  assert.ok(m, 'context() not found');
  assert.match(m[1], /LabPilotPilot/, 'context() never consults the pilot');
  assert.match(m[1], /delete c\.stepNo/,
    'context() asserts a step number even when the belief is weak');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Explore mode explains, caches, and knows its place.\n`);
