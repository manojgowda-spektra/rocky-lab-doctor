/*
 * ask-path-test.js - the submit path must survive every state it can really be in.
 *
 * THE BUG THIS PINS. A learner types a question, submits, and NOTHING happens - no answer,
 * no error, no spinner. Reported from a live lab across five releases while sixteen gates
 * stayed green.
 *
 * Cause: context() opened with an unguarded st.steps[st.stepIndex]. st.steps is filled by a
 * fetch of the packaged bundle, so a failed or not-yet-landed fetch leaves it undefined and
 * that line throws a TypeError - before any try block. submitAsk() then caught it in an
 * EMPTY catch, so the error had nowhere to go and the question simply vanished.
 *
 * Two defects, one symptom: a crash on an optimistic assumption, and an empty catch that
 * made the crash invisible. This file covers the first; explore-test covers the second.
 */
const fs = require('fs'), path = require('path');
const SRC = path.join('C:', 'AI-Testing-Workspace', 'Cloudlabs - Rocky', 'vmpackage', 'webext', 'content');
const src = fs.readFileSync(path.join(SRC, 'explore.js'), 'utf8');

const i = src.indexOf('  function context()');
const body = src.slice(i, src.indexOf('\n  }', i) + 4);

function run(st, label) {
  const fn = new Function('st', 'window', 'document', 'location', 'console',
    body + '\n; return context();');
  try {
    const c = fn(st, {}, { title: 'Lab' }, { pathname: '/x' }, console);
    console.log(`  [ok]   ${label} -> context built, keys: ${Object.keys(c).join(',')}`);
    return true;
  } catch (e) {
    console.log(`  [FAIL] ${label} -> ${e.constructor.name}: ${e.message}`);
    return false;
  }
}

console.log('\n=== context() UNDER REAL FAILURE STATES ===\n');
let ok = 0, n = 0;
n++; if (run({ steps: [], stepIndex: 0, history: [], on: false, lab: '' }, 'bundle loaded, empty')) ok++;
n++; if (run({ stepIndex: 0, history: [], on: false, lab: '' }, 'st.steps UNDEFINED (failed fetch)')) ok++;
n++; if (run({ steps: undefined, stepIndex: 3, history: undefined, on: false }, 'steps AND history undefined')) ok++;
n++; if (run({ steps: [{ text: 'do thing' }], stepIndex: 0, history: [], on: false, lab: 'L' }, 'normal')) ok++;
console.log(`\n${ok}/${n} survived\n`);
process.exit(ok === n ? 0 : 1);
