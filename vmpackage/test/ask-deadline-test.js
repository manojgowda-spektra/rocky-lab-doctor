/*
 * ask-deadline-test.js — a learner who is waiting must always be released.
 *
 * THE BUG THIS PINS. "Ask AI ▸" on an explained control puts a spinner on screen —
 * "Asking your Foundry deployment…" — and then waits on chrome.runtime.sendMessage with no
 * deadline of any kind. In MV3 the background service worker is killed aggressively. If it is
 * asleep, dies, or throws before calling sendResponse, the callback NEVER FIRES. The spinner
 * stays on screen for the rest of the lab.
 *
 * The same path had a second, earlier hang. LabPilotExplainCache.get() is consulted first,
 * and it calls chrome.storage.local.get. If THAT callback never fires, ask() is never reached
 * — the question is not merely unanswered, it is never sent at all.
 *
 * Neither had a timeout, so neither could ever resolve. A failure that is invisible is worse
 * than a failure that is loud: the learner does not know whether to wait or to click again.
 *
 * WHAT "PASSING" MEANS HERE. Not that the answer arrives — with no model configured it cannot.
 * It means that within a bounded time the learner is TOLD SOMETHING. Any terminal state is
 * acceptable; staying on the spinner is not.
 *
 * HOW THIS RUNS. Both functions are extracted from the shipped source and executed against
 * stubs that reproduce the exact failure: a chrome API whose callback is simply never called.
 * No browser, no network, no timing luck.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'webext', 'content');
const exploreSrc = fs.readFileSync(path.join(SRC, 'explore.js'), 'utf8');
const cacheSrc = fs.readFileSync(path.join(SRC, 'explain-cache.js'), 'utf8');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

// Pull a function out of the shipped file by name, brace-matching to its end. Reading the
// real source is the point: a test written against a copy proves nothing about what ships.
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

console.log('\n=== NOBODY WAITS FOREVER ===\n');

// ---------------------------------------------------------------------------------------
// 1. askAI(): the background worker never replies.
// ---------------------------------------------------------------------------------------
const askAISrc = extract(exploreSrc, '  function askAI(desc, kbText)');

function runAskAI(opts) {
  const rendered = [];               // every announce/explain the learner would see
  let timers = [];

  const R = () => ({
    explain: (el, text, o) => rendered.push({ text: text, ai: (o && o.ai) || null, mood: o && o.mood }),
    announce: (text, o) => rendered.push({ text: text, ai: (o && o.ai) || null, mood: o && o.mood }),
  });

  const chrome = {
    runtime: {
      lastError: opts.lastError || null,
      // The failure under test: accept the message, then never call back.
      sendMessage: (msg, cb) => { if (opts.reply) opts.reply(cb); },
    },
  };

  const sandbox = {
    R,
    chrome,
    labelFor: () => 'ASK',
    askBox: () => null,
    window: { LabPilotExplainCache: opts.cache || null },
    document: { title: 'Lab' },
    location: { pathname: '/x' },
    console: { error: () => {}, warn: () => {}, log: () => {} },
    setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cancelled = true; },
  };

  const fn = new Function(...Object.keys(sandbox), askAISrc + '\n; return askAI;');
  const askAI = fn(...Object.values(sandbox));
  askAI({ el: {}, name: 'Deploy', role: 'button', context: '', state: '' }, 'a button');

  // Fire every pending timer that was not cancelled — this is the deadline, if one exists.
  const fireAll = () => {
    const due = timers.filter((t) => !t.cancelled && !t.fired);
    due.forEach((t) => { t.fired = true; try { t.fn(); } catch (e) {} });
    return due.length;
  };

  return { rendered, timers, fireAll };
}

check('askAI shows a spinner while it waits (the state that must be escapable)', () => {
  const r = runAskAI({ reply: () => {} });          // worker never calls back
  assert(r.rendered.length > 0, 'nothing was rendered at all');
  const spinner = r.rendered.some((x) => /Asking your Foundry deployment/i.test(String(x.ai || '')));
  assert(spinner, `expected the waiting state to be shown; got ${JSON.stringify(r.rendered)}`);
});

check('askAI releases the learner when the worker never replies', () => {
  const r = runAskAI({ reply: () => {} });          // the MV3 worker is asleep: no callback, ever
  assert(r.timers.filter((t) => !t.cancelled).length > 0,
    'no timer was set, so the spinner "Asking your Foundry deployment…" stays on screen for ' +
    'the rest of the lab. In MV3 the service worker is killed aggressively; a sendMessage ' +
    'callback that never fires is a routine state, not an exotic one.');
  r.fireAll();
  const last = r.rendered[r.rendered.length - 1];
  assert(!/Asking your Foundry deployment/i.test(String(last.ai || '')),
    `after the deadline the learner is still looking at the spinner: ${JSON.stringify(last)}`);
  assert(last.ai, 'the deadline fired but told the learner nothing');
});

check('askAI still shows the answer when the worker replies in time', () => {
  const r = runAskAI({ reply: (cb) => cb({ text: 'Because it deploys the model.' }) });
  const last = r.rendered[r.rendered.length - 1];
  assert(/Because it deploys the model/.test(String(last.ai || '')),
    `a timely answer must still render: ${JSON.stringify(last)}`);
});

check('askAI does not overwrite a delivered answer when its deadline later fires', () => {
  // The fix must cancel or guard its own timer. A deadline that replaces a good answer with
  // "timed out" seconds later would be a worse bug than the one being fixed.
  const r = runAskAI({ reply: (cb) => cb({ text: 'A real answer.' }) });
  r.fireAll();
  const last = r.rendered[r.rendered.length - 1];
  assert(/A real answer/.test(String(last.ai || '')),
    `the deadline clobbered a delivered answer: ${JSON.stringify(last)}`);
});

check('askAI reports an explicit error rather than silence', () => {
  const r = runAskAI({ reply: (cb) => cb({ error: 'no key configured' }) });
  const last = r.rendered[r.rendered.length - 1];
  assert(/no key configured|unavailable/i.test(String(last.ai || '')),
    `an error must be shown, not swallowed: ${JSON.stringify(last)}`);
});

// ---------------------------------------------------------------------------------------
// 2. explain-cache load(): chrome.storage never calls back.
// ---------------------------------------------------------------------------------------
const loadSrc = extract(cacheSrc, '  function load(cb)');

function runLoad(opts) {
  let timers = [];
  const chrome = { storage: { local: { get: (keys, cb) => { if (opts.reply) opts.reply(cb); } } } };
  const sandbox = {
    chrome,
    STORE: 'lpExplainCache',
    mem: null,
    console: { error: () => {}, warn: () => {}, log: () => {} },
    setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cancelled = true; },
  };
  const fn = new Function(...Object.keys(sandbox), 'var mem = null;\n' + loadSrc + '\n; return load;');
  const load = fn(...Object.values(sandbox));

  let called = null;
  load((m) => { called = m; });
  const fireAll = () => timers.filter((t) => !t.cancelled && !t.fired)
    .forEach((t) => { t.fired = true; try { t.fn(); } catch (e) {} });
  return { get called() { return called; }, timers, fireAll };
}

check('the explain cache calls back when storage answers', () => {
  const r = runLoad({ reply: (cb) => cb({ lpExplainCache: { a: { text: 'x' } } }) });
  assert(r.called !== null, 'the callback never fired on a normal storage read');
});

check('the explain cache calls back even when storage never answers', () => {
  // get() gates the ENTIRE Ask-AI path behind this callback. If it is dropped, ask() is never
  // reached and the question is never sent — no spinner, no error, nothing.
  const r = runLoad({ reply: () => {} });
  if (r.called === null) {
    assert(r.timers.filter((t) => !t.cancelled).length > 0,
      'chrome.storage.local.get never called back and no deadline was set, so the whole ' +
      'Ask-AI path stops here and the question is never sent');
    r.fireAll();
  }
  assert(r.called !== null,
    'the cache never released the caller, so askAI() never ran and the learner got nothing');
});

check('a timed-out cache read is not remembered as an empty cache', () => {
  // The deadline must release the caller WITHOUT caching {}. Storage that was slow once is
  // not storage that is empty: remembering {} would make every later lookup a permanent miss
  // for the rest of the session, so a transient stall would cost the cache entirely.
  //
  // Asserted by BEHAVIOUR, not by matching the source text: a regex over the file would pass
  // whatever the code actually does, which is the failure mode this whole exercise is about.
  // First call stalls and times out; the second is answered normally and MUST reach storage
  // again rather than being served from a remembered empty object.
  let timers = [];
  let reads = 0;
  let stall = true;
  const chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          reads++;
          if (stall) return;                                  // first call: never answers
          cb({ lpExplainCache: { 'button|deploy|/x': { text: 'remembered' } } });
        },
      },
    },
  };
  const sandbox = {
    chrome,
    STORE: 'lpExplainCache',
    console: { error: () => {}, warn: () => {}, log: () => {} },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cancelled = true; },
  };
  const body = extract(cacheSrc, '  function load(cb)');
  const fn = new Function(...Object.keys(sandbox), 'var mem = null;\n' + body + '\n; return load;');
  const load = fn(...Object.values(sandbox));

  let first = 'not-called';
  load((m) => { first = m; });
  timers.filter((t) => !t.cancelled).forEach((t) => t.fn());     // the deadline fires
  assert(first !== 'not-called', 'the stalled read never released its caller');
  assert(Object.keys(first).length === 0, 'a timed-out read should hand back an empty cache');

  stall = false;
  let second = 'not-called';
  load((m) => { second = m; });
  assert(reads === 2,
    'the second lookup was served from a remembered empty cache — a transient stall has ' +
    'permanently disabled the cache for this session');
  assert(second && second['button|deploy|/x'],
    `the second read should return the real stored entry, got ${JSON.stringify(second)}`);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — a learner who is waiting is always released.\n`);
