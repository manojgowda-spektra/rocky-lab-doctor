/*
 * no-feedback-loop-test.js — Rocky must never wake himself up.
 *
 * THE DEFECT THIS PINS. content.js watches the DOM with a MutationObserver and, when the
 * current step cannot be resolved, ends evaluate() by calling O.checking() — which writes a
 * message into Rocky's bubble. Rocky's bubble is in the DOM. The observer excluded
 * #labpilot-overlay-root but NOT Rocky, so:
 *
 *     checking() -> Rocky's DOM changes -> observer fires -> evaluate() -> checking() -> ...
 *
 * Traced on the live Purview portal: content.js:298 firing every ~16 ms, sixty times a
 * second, indefinitely. Two consequences, and the second is the one that mattered:
 *   - it burns CPU on every lab page, forever;
 *   - checking() hides the glow, so pointing at anything became IMPOSSIBLE the moment the
 *     current step was unresolvable — which is always true on a lab the packaged fixture was
 *     not captured for. Rocky resolved "Solutions" correctly and still never glowed it.
 *
 * No behavioural gate could see this: the loop is invisible unless you count the calls, and
 * the symptom ("Rocky does nothing") looks identical to "Rocky decided to stay quiet".
 *
 * The rule: every DOM observer in the extension must ignore Rocky's own output. Everything he
 * renders carries data-labpilot="1", which is what perception.js already keys on.
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

console.log('\n=== NO FEEDBACK LOOPS ===\n');

// Every file that constructs a MutationObserver must exclude Rocky's own subtree.
const observers = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => /new MutationObserver/.test(fs.readFileSync(path.join(SRC, f), 'utf8')));

/*
 * STRIP COMMENTS BEFORE ASSERTING.
 *
 * The first version of this gate passed on deliberately reverted code, because the regex
 * matched the explanatory COMMENT above the guard rather than the guard itself. A gate that
 * greps its own prose proves nothing — the same shape of mistake as a sed that matches
 * nothing and reports success.
 */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

check('every MutationObserver ignores Rocky\'s own DOM', () => {
  assert.ok(observers.length > 0, 'no MutationObserver found at all — has the file moved?');
  const bad = [];
  for (const f of observers) {
    const src = code(fs.readFileSync(path.join(SRC, f), 'utf8'));
    const i = src.indexOf('new MutationObserver');
    const body = src.slice(i, i + 900);
    if (!/data-labpilot|labpilot-overlay-root|labpilot-rocky/.test(body)) bad.push(f);
  }
  assert.deepStrictEqual(bad, [], `these observers would react to Rocky's own output:\n         ${bad.join('\n         ')}`);
});

check('content.js excludes ROCKY, not only the overlay root', () => {
  // The specific defect: the guard existed but named only ONE of Rocky's two hosts, so a
  // mutation in his bubble still woke evaluate(), which called checking(), which wrote to
  // his bubble. Assert on the selector the code actually passes to closest().
  const src = code(fs.readFileSync(path.join(SRC, 'content.js'), 'utf8'));
  const i = src.indexOf('new MutationObserver');
  assert.ok(i > 0, 'content.js no longer has a MutationObserver');
  const body = src.slice(i, i + 900);
  const m = /\.closest\(\s*(['"`])([^'"`]+)\1\s*\)/.exec(body);
  assert.ok(m, 'the observer no longer guards with closest() at all');
  const selector = m[2];
  assert.ok(/data-labpilot/.test(selector),
    `the observer guard is "${selector}" — it does not cover Rocky's own subtree, so ` +
    'checking() -> bubble mutation -> evaluate() -> checking() loops at 60 fps');
});

check('the packaged fixture is scoped to the lab it was captured for', () => {
  // Applied everywhere, its steps never resolve, evaluate() falls to the MISNAVIGATION
  // branch, and Rocky nags about a step from a lab the learner is not doing.
  const src = fs.readFileSync(path.join(SRC, 'content.js'), 'utf8');
  const i = src.indexOf('bundle/test-bundle.json');
  assert.ok(i > 0, 'the fixture fallback has moved');
  const around = src.slice(Math.max(0, i - 1200), i + 200);
  assert.match(around, /ai\\?\.azure\\?\.com|location\.hostname/,
    'the fixture is loaded on every host, so Rocky nags on labs it was never captured for');
});

// The reveal must not depend on an animation frame that may never come.
check('the glow reveals even if the flight animation never lands', () => {
  const src = fs.readFileSync(path.join(SRC, 'overlay.js'), 'utf8');
  const i = src.indexOf('function guide(element, text, meta)');
  assert.ok(i > 0, 'overlay.guide has moved');
  const body = src.slice(i, i + 2600);
  assert.match(body, /setTimeout\(\s*reveal/,
    'the glow appears only on Rocky\'s rAF arrival; a throttled or occluded tab withholds it forever');
  assert.match(body, /placeNow\(\)/,
    'the fallback reveal does not position the glow, so it would appear at 0,0');
});

check('placeNow positions from the tracked element and is synchronous', () => {
  const src = fs.readFileSync(path.join(SRC, 'overlay.js'), 'utf8');
  const i = src.indexOf('function placeNow()');
  assert.ok(i > 0, 'placeNow is gone');
  const body = src.slice(i, i + 600);
  assert.match(body, /getBoundingClientRect/, 'placeNow does not read the control geometry');
  assert.ok(!/requestAnimationFrame/.test(body), 'placeNow waits for a frame — that defeats its purpose');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky does not wake himself up, and the glow always arrives.\n`);
