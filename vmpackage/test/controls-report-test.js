/*
 * controls-report-test.js — Next and Back must not fail in silence.
 *
 * THE BUG THIS PINS. setIndex() in controls.js wrapped its whole chrome.storage call in an
 * empty catch. If the storage call threw, Next and Back did NOTHING: the step did not move,
 * no message appeared, and nothing was logged. From the learner's seat that is
 * indistinguishable from Rocky being broken, and it is the same shape as the defect that
 * reached a live lab — a throw swallowed into an empty catch, with the user still waiting.
 *
 * It was worse than a plain swallow. explore.js wraps every menu action in a reporter that
 * catches, logs, and tells the learner "That button broke: ... My bug, not yours." under an
 * "I BROKE" banner. An empty catch INSIDE the action defeats that reporter entirely: the
 * error never reaches it, so the one mechanism built to surface exactly this never fires.
 *
 * WHAT PASSING MEANS. Not that storage works — it may genuinely be unavailable. It means the
 * failure is visible: the error reaches the caller's reporter, and the asynchronous variants
 * (a lastError with no throw) are at least logged rather than dropped.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'webext', 'content');
const controlsSrc = fs.readFileSync(path.join(SRC, 'controls.js'), 'utf8');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

function extract(src, signature) {
  const i = src.indexOf(signature);
  if (i < 0) throw new Error(`could not find ${signature} in the source`);
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error(`unbalanced braces after ${signature}`);
}

const setIndexSrc = extract(controlsSrc, '  function setIndex(delta)');

// Run setIndex against a chrome stub, and report exactly what the learner would learn:
// did it throw (so the menu's reporter fires), and was anything logged?
function run(opts) {
  const logged = [];
  const chrome = {
    runtime: { lastError: opts.lastError || null },
    storage: {
      local: {
        get: (keys, cb) => {
          if (opts.getThrows) throw new TypeError('storage unavailable');
          if (opts.getSilent) return;                 // never calls back
          cb(opts.value || { lpStepIndex: 3 });
        },
        set: (obj, cb) => {
          if (opts.setThrows) throw new TypeError('quota exceeded');
          opts.wrote = obj;
          if (cb) cb();
        },
      },
    },
  };
  const sandbox = {
    chrome,
    console: { error: (...a) => logged.push(a.join(' ')), warn: () => {}, log: () => {} },
    setTimeout: (fn) => { fn(); return 1 },
    location: { reload: () => {} },
  };
  const fn = new Function(...Object.keys(sandbox), setIndexSrc + '\n; return setIndex;');
  const setIndex = fn(...Object.values(sandbox));

  let threw = null;
  try { setIndex(1); } catch (e) { threw = e; }
  return { threw, logged, wrote: opts.wrote };
}

console.log('\n=== NEXT AND BACK REPORT THEIR OWN FAILURES ===\n');

check('a normal Next moves the pointer', () => {
  const o = {};
  const r = run(Object.assign(o, { value: { lpStepIndex: 3 } }));
  assert(!r.threw, `a working storage call must not throw: ${r.threw && r.threw.message}`);
  assert(o.wrote && o.wrote.lpStepIndex === 4,
    `expected the pointer to move to 4, got ${JSON.stringify(o.wrote)}`);
});

check('a throwing storage call reaches the menu error reporter', () => {
  // explore.js catches what it.on() throws and shows "I BROKE" to the learner. An empty catch
  // in here means that reporter never fires and the button just does nothing.
  const r = run({ getThrows: true });
  assert(r.threw,
    'setIndex swallowed the error, so explore.js\'s "I BROKE" reporter never fires and Next ' +
    'silently does nothing — the learner cannot tell Rocky from a dead button');
  assert(r.logged.length > 0, 'nothing was logged either, so there is no trace to debug from');
});

check('a lastError on the read is logged rather than dropped', () => {
  // Asynchronous failures do not throw: chrome sets runtime.lastError and calls back anyway.
  // Nothing can be re-thrown from inside the callback usefully, so the floor is a log line.
  const r = run({ lastError: { message: 'storage disconnected' } });
  assert(r.logged.some((l) => /storage disconnected/.test(l)),
    `a lastError must be reported, got: ${JSON.stringify(r.logged)}`);
});

check('the pointer is not moved when the read failed', () => {
  // Writing a step index derived from a failed read would move the learner somewhere
  // arbitrary. Doing nothing is correct here; doing it silently is not, which the check
  // above covers.
  const o = { lastError: { message: 'storage disconnected' } };
  run(o);
  assert(!o.wrote, `a failed read must not write a guessed pointer, wrote ${JSON.stringify(o.wrote)}`);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — a broken button says so.\n`);
