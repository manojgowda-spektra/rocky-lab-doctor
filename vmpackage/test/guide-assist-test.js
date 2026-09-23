/*
 * guide-assist-test.js — the model fills the guide lines the rules missed, and cannot invent
 * a target while doing it.
 *
 * WHY THIS GATE EXISTS. guide-reader.js parseLine was patched three times in one day, for three
 * idioms from three labs: (1)(2) markers, **bold**, and "A > B > C" paths behind a leading
 * clause. Every lab writes its instructions differently and that will not stop. The fix is not
 * a fourth rule; it is to let a model read the lines the rules cannot — under constraints tight
 * enough that a wrong reading can never become a wrong glow.
 *
 * THE PROMISES BEING TESTED, each of which is a way this could go wrong in a lab:
 *   - a label the model returns is accepted ONLY if it appears verbatim in its own source line
 *     (case- and whitespace-insensitive). This is the rule that stops an invented target.
 *   - deterministic results win on overlap: a line the rules parsed is never rewritten.
 *   - ONE model call per guide page, and a hash of the text in chrome.storage.local means the
 *     same text is never asked about twice — not after a reload, not from a second tab.
 *   - no AI configured means a silent no-op: no error, no announcement, no retry.
 *   - the hot path never waits: the rules' steps ingest immediately and the model's reading is
 *     merged when it lands, announced through onChange so the pilot re-ingests.
 *   - the payload is guide text only.
 *
 * HOW IT RUNS. The shipped background.js and guide-reader.js, loaded into stubs with a MOCKED
 * model. No browser, no network, no key. The mocked reply is deliberately hostile: an invented
 * label, a rewritten line, an out-of-range index, an unknown surface, and an attempt to
 * overwrite a line the rules already parsed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const EXT = path.join(__dirname, '..', 'webext');

let pass = 0; const fails = [];
async function check(name, fn) {
  try { await fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// ---- the background: a chrome stub with in-memory storage and a counting, mocked fetch ------
function loadBackground(opts) {
  const src = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  const mod = { exports: {} };
  const store = Object.assign({}, opts.store || {});
  let listener = null;
  const fetchCalls = [];
  const chrome = {
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: {
      get(keys, cb) {
        const out = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) out[k] = store[k]; });
        cb(out);
      },
      set(obj, cb) { Object.assign(store, obj); if (cb) cb(); },
    } },
  };
  const fetchImpl = (url, init) => {
    fetchCalls.push({ url, headers: init.headers, body: init.body });
    const reply = opts.model(fetchCalls.length);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: reply } }] }) });
  };
  new Function('module', 'exports', 'chrome', 'fetch', 'self', src)(mod, mod.exports, chrome, fetchImpl, {});

  // Drive the real onMessage listener the way Chrome would, and refuse to wait forever: an
  // unhandled message type produces no sendResponse at all, which must read as a failure.
  const send = (msg) => new Promise((resolve, reject) => {
    if (!listener) { reject(new Error('background.js registered no onMessage listener')); return; }
    const t = setTimeout(() => reject(new Error(`no response to '${msg.type}' within 1500 ms`)), 1500);
    let async;
    try { async = listener(msg, {}, (res) => { clearTimeout(t); resolve(res); }); }
    catch (e) { clearTimeout(t); reject(e); return; }
    if (async !== true) { clearTimeout(t); reject(new Error(`the background does not handle '${msg.type}' (listener returned ${async})`)); }
  });
  return { send, store, fetchCalls, exports: mod.exports };
}

const AI = { endpoint: 'https://myres.openai.azure.com', deployment: 'luna-6', apiKey: 'FAKE-KEY-FOR-TESTS' };

// Lines from the Insider Risk lab (template 15549) that the deterministic parser reads as
// nothing today, plus one line of prose that names no control.
const LINES = [
  'Turn on the toggle for Departing users policy indicator.',   // 0
  'Under Policy templates, pick Data leaks by risky users.',    // 1
  'This challenge takes about 20 minutes.',                     // 2
  'On the Policies page, hit Create policy.',                   // 3
];

// The hostile mock: every way a model reply can be wrong, in one reply.
const HOSTILE = JSON.stringify([
  { i: 0, targets: ['Departing users', 'Save changes'], surface: 'browser' },   // 'Save changes' is invented
  { i: 1, targets: ['data  LEAKS by risky users'], surface: 'browser' },        // case/whitespace differ: still verbatim
  { i: 2, targets: ['20 minutes'], surface: 'browser' },                       // present, but prose - the resolver will refuse it
  { i: 3, targets: ['Create policy'], surface: 'spaceship' },                  // unknown surface
  { i: 7, targets: ['Nothing'] },                                              // out of range
  { line: 'Turn on something completely different.', targets: ['Turn'] },    // rewritten line
]);

(async () => {
  console.log('\n=== THE MODEL FILLS THE GAPS, AND CANNOT INVENT A TARGET ===\n');

  // ---- pure validation ----------------------------------------------------------------------
  await check('a label absent from its line is rejected; one present is accepted', async () => {
    const bg = loadBackground({ store: { lpAI: AI }, model: () => HOSTILE });
    const parse = bg.exports.parseModelSteps;
    assert.ok(parse, 'background.js does not export parseModelSteps');
    const steps = parse(HOSTILE, LINES);
    const byLine = {}; steps.forEach((s) => { byLine[s.line] = s; });
    assert.deepStrictEqual(byLine[LINES[0]].targets, ['Departing users'],
      `an invented label survived: ${JSON.stringify(byLine[LINES[0]].targets)}`);
    assert.ok(byLine[LINES[3]], 'a valid line with a bad surface was dropped entirely');
    assert.deepStrictEqual(byLine[LINES[3]].targets, ['Create policy']);
  });

  await check('an accepted label is returned in the GUIDE\'s spelling, not the model\'s', async () => {
    // The resolver scores against the live page; the guide's own spelling is the one to hand it.
    const bg = loadBackground({ store: { lpAI: AI }, model: () => HOSTILE });
    const steps = bg.exports.parseModelSteps(HOSTILE, LINES);
    const s = steps.find((x) => x.line === LINES[1]);
    assert.ok(s, 'the whitespace/case variant was rejected - the check is too strict');
    assert.deepStrictEqual(s.targets, ['Data leaks by risky users'], `got ${JSON.stringify(s.targets)}`);
  });

  await check('a rewritten line and an out-of-range index are dropped', async () => {
    const bg = loadBackground({ store: { lpAI: AI }, model: () => HOSTILE });
    const steps = bg.exports.parseModelSteps(HOSTILE, LINES);
    assert.ok(steps.every((s) => LINES.includes(s.line)), `a line the guide never contained came back: ${JSON.stringify(steps.map((s) => s.line))}`);
  });

  await check('an unknown surface becomes "browser"; a reply that is not JSON is null, not []', async () => {
    const bg = loadBackground({ store: { lpAI: AI }, model: () => HOSTILE });
    const steps = bg.exports.parseModelSteps(HOSTILE, LINES);
    assert.strictEqual(steps.find((x) => x.line === LINES[3]).surface, 'browser');
    assert.strictEqual(bg.exports.parseModelSteps('Sorry, I cannot help with that.', LINES), null);
    assert.deepStrictEqual(bg.exports.parseModelSteps('```json\n[]\n```', LINES), [], 'a fenced empty array should parse');
  });

  // ---- the message handler, end to end ---------------------------------------------------------
  await check('lp-parse-guide calls the model once and returns validated steps', async () => {
    const bg = loadBackground({ store: { lpAI: AI }, model: () => HOSTILE });
    const res = await bg.send({ type: 'lp-parse-guide', payload: { lines: LINES } });
    assert.ok(res && Array.isArray(res.steps), `no steps in the reply: ${JSON.stringify(res)}`);
    assert.strictEqual(bg.fetchCalls.length, 1, `the model was called ${bg.fetchCalls.length} times`);
    const s0 = res.steps.find((x) => x.line === LINES[0]);
    assert.deepStrictEqual(s0.targets, ['Departing users'], 'the invented label reached the reply');
  });

  await check('the request carries the guide lines and only the guide lines - and no key', async () => {
    const bg = loadBackground({ store: { lpAI: AI }, model: () => HOSTILE });
    await bg.send({ type: 'lp-parse-guide', payload: { lines: LINES, url: 'https://purview.microsoft.com/secret', html: '<body>page content</body>' } });
    const body = bg.fetchCalls[0].body;
    for (const l of LINES) assert.ok(body.includes(l), `a guide line is missing from the request: ${l}`);
    assert.ok(!body.includes('purview.microsoft.com/secret') && !body.includes('page content'), 'something other than guide text was sent');
    assert.ok(!body.includes(AI.apiKey), 'the key is in the body');
    assert.ok(bg.fetchCalls[0].headers['api-key'] === AI.apiKey, 'the key is not in the header');
    assert.ok(bg.fetchCalls[0].url.startsWith('https://myres.openai.azure.com/'), `wrong endpoint: ${bg.fetchCalls[0].url}`);
  });

  await check('identical text is never asked about twice - the cache answers', async () => {
    const bg = loadBackground({ store: { lpAI: AI }, model: () => HOSTILE });
    const first = await bg.send({ type: 'lp-parse-guide', payload: { lines: LINES } });
    const second = await bg.send({ type: 'lp-parse-guide', payload: { lines: LINES } });
    assert.strictEqual(bg.fetchCalls.length, 1, `the same text cost ${bg.fetchCalls.length} model calls`);
    assert.strictEqual(second.cached, true, 'the second reply did not come from the cache');
    assert.deepStrictEqual(second.steps, first.steps, 'the cached reply differs from the original');
    assert.ok(bg.store.lpGuideParse && Object.keys(bg.store.lpGuideParse).length === 1, 'nothing was written to chrome.storage.local');
  });

  await check('the cache survives a reload of the extension - it lives in storage, not memory', async () => {
    const one = loadBackground({ store: { lpAI: AI }, model: () => HOSTILE });
    await one.send({ type: 'lp-parse-guide', payload: { lines: LINES } });
    // a fresh service worker, same storage
    const two = loadBackground({ store: one.store, model: () => HOSTILE });
    const res = await two.send({ type: 'lp-parse-guide', payload: { lines: LINES } });
    assert.strictEqual(two.fetchCalls.length, 0, 'a new worker asked the model again for text already answered');
    assert.strictEqual(res.cached, true);
  });

  await check('different text IS a new question', async () => {
    const bg = loadBackground({ store: { lpAI: AI }, model: () => '[]' });
    await bg.send({ type: 'lp-parse-guide', payload: { lines: LINES } });
    await bg.send({ type: 'lp-parse-guide', payload: { lines: LINES.slice(0, 2) } });
    assert.strictEqual(bg.fetchCalls.length, 2);
  });

  await check('a reply that is not JSON is reported and NOT cached', async () => {
    // Caching a failure would silence the assist for that page forever.
    let n = 0;
    const bg = loadBackground({ store: { lpAI: AI }, model: () => (++n === 1 ? 'I am a language model and cannot' : HOSTILE) });
    const bad = await bg.send({ type: 'lp-parse-guide', payload: { lines: LINES } });
    assert.ok(bad.error, 'a non-JSON reply was not reported as an error');
    const good = await bg.send({ type: 'lp-parse-guide', payload: { lines: LINES } });
    assert.strictEqual(bg.fetchCalls.length, 2, 'the failure was cached');
    assert.ok(Array.isArray(good.steps) && good.steps.length, 'the retry did not produce steps');
  });

  await check('no AI configured: a silent skip, no model call, no error', async () => {
    const bg = loadBackground({ store: {}, model: () => HOSTILE });
    const res = await bg.send({ type: 'lp-parse-guide', payload: { lines: LINES } });
    assert.strictEqual(bg.fetchCalls.length, 0, 'the model was called with no configuration');
    assert.strictEqual(res.skipped, true, `expected {skipped:true}, got ${JSON.stringify(res)}`);
    assert.ok(!res.error, 'the no-AI path produced an error - it must be silent');
  });

  await check('Ask Rocky still uses the same plumbing (one request builder, one caller)', async () => {
    // The requirement was to REUSE lp-ask-ai's endpoint/config path, not copy it.
    const src = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
    const builders = (src.match(/normaliseEndpoint\(cfg\.endpoint\)/g) || []).length;
    assert.strictEqual(builders, 1, `normaliseEndpoint(cfg.endpoint) is called from ${builders} places - the plumbing was duplicated`);
    const fetches = (src.match(/\bfetch\(/g) || []).length;
    assert.strictEqual(fetches, 1, `fetch( appears ${fetches} times - the call path was duplicated`);
    const bg = loadBackground({ store: { lpAI: AI }, model: () => 'Rocky online.' });
    const res = await bg.send({ type: 'lp-ask-ai', payload: { question: 'hi' } });
    assert.strictEqual(res.text, 'Rocky online.', 'lp-ask-ai broke in the refactor');
  });

  // ---- the guide reader: merge, order, one call, re-ingest --------------------------------------
  // A realistic pane: three verb-led lines (what findGuidePane needs), two lines the rules cannot
  // read, and one line of prose. Verbatim idioms from the Insider Risk lab.
  const PANE = [
    'Challenge 04: Insider Risk Detection for Departing Users',
    'In Microsoft Edge, open https://purview.microsoft.com, then open Solutions > Insider Risk Management.',
    'Open Settings > Policy indicators and remain on the Built-in indicators tab.',
    'Turn on the toggle for Departing users policy indicator.',
    'Select Save and wait for the success notification.',
    'In Insider Risk Management, open Policies.',
    'On the Policies page, hit Create policy.',
    'Select Create policy > Custom policy. Do not select Quick policy.',
    'This challenge takes about 20 minutes.',
  ];

  function loadReader(extra) {
    const win = {};
    const sent = []; let pending = null;
    const chrome = { runtime: { lastError: null, sendMessage(msg, cb) { sent.push(msg); pending = cb; } } };
    const pane = { innerText: PANE.join('\n'), querySelector: () => ({ innerText: PANE[0] }) };
    const doc = {
      readyState: 'complete', addEventListener() {},
      querySelectorAll: (sel) => (/^div/.test(sel) ? [pane] : []),
      querySelector: () => null, documentElement: {}, getElementById: () => null,
    };
    const warnings = [];
    const consoleStub = { warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push(a.join(' ')), log() {} };
    const load = (file) => {
      const code = fs.readFileSync(path.join(EXT, 'content', file), 'utf8');
      new Function('window', 'document', 'setInterval', 'setTimeout', 'chrome', 'console', 'MutationObserver', 'performance', 'location', 'history', code)(
        win, doc, () => 0, () => 0, chrome, consoleStub, function () { return { observe() {}, disconnect() {} }; },
        { now: () => Date.now() }, { href: 'https://experience.cloudlabs.ai/' }, {});
    };
    (extra || []).forEach(load);
    load('guide-reader.js');
    return { win, G: win.LabPilotGuide, sent, reply: (res) => { const cb = pending; pending = null; if (cb) cb(res); }, warnings };
  }

  const labels = (step) => step.targets.map((t) => t.label);

  await check('the rules\' steps come back immediately, and the missed lines go to the model once', async () => {
    const r = loadReader();
    const first = r.G.read();
    assert.ok(first.found, 'the pane was not found');
    assert.strictEqual(first.steps.length, 5, `expected the 5 rule-parsed steps, got ${first.steps.length}`);
    assert.strictEqual(r.sent.length, 1, `expected one lp-parse-guide message, got ${r.sent.length}`);
    assert.strictEqual(r.sent[0].type, 'lp-parse-guide');
    const asked = r.sent[0].payload.lines;
    assert.ok(asked.includes(PANE[3]) && asked.includes(PANE[6]), `the missed lines were not sent: ${JSON.stringify(asked)}`);
    assert.ok(!asked.includes(PANE[4]) && !asked.includes(PANE[2]), 'a line the rules already parsed was sent to the model');
    r.G.read(); r.G.read();
    assert.strictEqual(r.sent.length, 1, `re-reading the same pane asked the model again (${r.sent.length} calls)`);
  });

  await check('when the reading lands: merged in guide order, invented labels rejected, rules win, watchers told', async () => {
    const r = loadReader();
    r.G.read();
    const seen = [];
    r.G.onChange((g) => seen.push(g));
    r.reply({ steps: [
      { line: PANE[3], targets: ['Departing users', 'Save changes'], surface: 'browser' },   // 'Save changes' invented
      { line: PANE[6], targets: ['Create policy'], surface: 'browser' },
      { line: PANE[4], targets: ['success notification'], surface: 'browser' },            // a rule-parsed line: must not change
    ] });
    assert.strictEqual(seen.length, 1, `onChange fired ${seen.length} times, expected once`);
    const g = seen[0];
    assert.strictEqual(g.steps.length, 7, `expected 7 steps after the merge, got ${g.steps.length}`);
    // guide order, not "rules first then model"
    assert.deepStrictEqual(g.steps.map((s) => s.text), [PANE[1], PANE[2], PANE[3], PANE[4], PANE[5], PANE[6], PANE[7]].map((s) => s.replace(/\*\*/g, '')),
      'the merged steps are not in the guide\'s order');
    assert.deepStrictEqual(labels(g.steps[2]), ['Departing users'], `invented label kept: ${JSON.stringify(labels(g.steps[2]))}`);
    assert.deepStrictEqual(labels(g.steps[5]), ['Create policy']);
    assert.deepStrictEqual(labels(g.steps[3]), ['Save'], `the model overwrote a rule-parsed line: ${JSON.stringify(labels(g.steps[3]))}`);
    assert.strictEqual(g.assisted, 2, `assisted count is ${g.assisted}`);
    assert.strictEqual(r.sent.length, 1, 'the merge re-read triggered another model call');
    assert.strictEqual(r.warnings.length, 0, `unexpected warnings: ${r.warnings.join(' | ')}`);
  });

  await check('a rule-parsed line is never rewritten, even if the model\'s reading is already stored', async () => {
    const r = loadReader();
    const T = r.G._test;
    T.assist.byLine[PANE[4].toLowerCase()] = { targets: ['success notification'], surface: 'browser' };
    const p = T.parseLines([PANE[4]]);
    assert.deepStrictEqual(labels(p.steps[0]), ['Save'], `got ${JSON.stringify(labels(p.steps[0]))}`);
  });

  await check('a reading with an unreadable label is not a step at all', async () => {
    const r = loadReader();
    const T = r.G._test;
    T.assist.byLine[PANE[3].toLowerCase()] = { targets: ['Nonexistent control'], surface: 'browser' };
    const p = T.parseLines([PANE[3]]);
    assert.strictEqual(p.steps.length, 0, 'a line with only invented labels became a step');
  });

  await check('no AI: the reader stays exactly as it was, silently', async () => {
    const r = loadReader();
    const before = r.G.read();
    let fired = 0; r.G.onChange(() => fired++);
    r.reply({ skipped: true });
    assert.strictEqual(fired, 0, 'onChange fired on a skipped assist');
    assert.strictEqual(r.G.read().steps.length, before.steps.length);
    assert.strictEqual(r.sent.length, 1, 'the skip caused a retry');
    assert.strictEqual(r.warnings.length, 0, 'the no-AI path logged something');
  });

  await check('a failed assist leaves a trace and does not retry', async () => {
    const r = loadReader();
    r.G.read();
    let fired = 0; r.G.onChange(() => fired++);
    r.reply({ error: 'HTTP 401 unauthorised' });
    assert.strictEqual(fired, 0);
    assert.ok(r.warnings.some((w) => /401/.test(w)), 'the failure left no trace');
    r.G.read();
    assert.strictEqual(r.sent.length, 1, 'a failure was retried - one call per page is the rule');
  });

  await check('the pilot re-ingests when the reading lands - nothing waited for the model', async () => {
    const r = loadReader(['world-model.js']);
    r.win.LabPilotPerceive = { onChange() {}, snapshot: () => ({ url: 'https://experience.cloudlabs.ai/', title: 'Lab', controls: [] }) };
    r.win.LabPilotLabel = { resolveAny: () => ({ status: 'absent', reason: 'no-candidates' }) };
    const pilotCode = fs.readFileSync(path.join(EXT, 'content', 'pilot.js'), 'utf8');
    new Function('window', 'document', 'setTimeout', 'setInterval', pilotCode)(r.win,
      { querySelector: () => null, readyState: 'complete', addEventListener() {} }, () => 0, () => 0);
    const started = r.win.LabPilotPilot.start();
    assert.ok(started.ok, `the pilot did not start: ${started.why}`);
    assert.strictEqual(r.win.LabPilotWorld.current().total, 5, 'the world model did not get the rules\' steps immediately');
    r.reply({ steps: [
      { line: PANE[3], targets: ['Departing users'], surface: 'browser' },
      { line: PANE[6], targets: ['Create policy'], surface: 'browser' },
    ] });
    assert.strictEqual(r.win.LabPilotWorld.current().total, 7, 'the world model was not re-ingested when the reading landed');
  });

  console.log('');
  if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
  console.log(`${pass} passed, 0 failed — the model reads what the rules cannot, and cannot point at anything the guide did not say.\n`);
})();
