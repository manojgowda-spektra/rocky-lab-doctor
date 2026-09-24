/*
 * replay.js — score the position model on recorded traces. A measurement, not a pass/fail.
 *
 * WHY A BENCH AND NOT MORE TESTS. Every assertion in this suite answers a yes/no question, and
 * yes/no is the wrong shape for "does Rocky know where the learner is". A model can pass every
 * assertion and still be wrong a third of the time on a real lab, and a model can fail an
 * assertion written against an older design and be strictly better. Tuning against assertions
 * produced exactly that: constants chosen to move a number over a line.
 *
 * So this prints a SCORECARD per trace, and fails the build only on the invariants that are
 * genuinely non-negotiable. Everything else is a number to be improved and compared between
 * designs, which is what lets a rewrite be justified with evidence instead of argument.
 *
 * THE INVARIANTS (these fail the build):
 *
 *   harmfulConfidence   frames where Rocky was confident enough to STATE A STEP NUMBER and the
 *                       number was wrong. This must be zero. A wrong number is the only failure
 *                       that actively misleads a learner; silence never does.
 *
 *   furnitureCeiling    the highest confidence reached on a frame whose only matching controls
 *                       are persistent navigation. Must stay below the display threshold. This
 *                       is the original defect — "Step 1 of 5" at confidence 1.0 from a nav item
 *                       on every page of the portal.
 *
 *   inflationDelta      how much confidence climbs when the SAME screen is observed over and
 *                       over. Staring at a page is not thirty confirmations. Must be small.
 *
 * THE MEASUREMENTS (these are reported, and compared):
 *
 *   accuracy            fraction of labelled frames where the believed step is the true step
 *   accuracyWhenSpoken  accuracy restricted to frames where Rocky would have said a number —
 *                       the only accuracy a learner ever experiences
 *   silence             fraction of labelled frames where the truth was knowable and Rocky
 *                       said nothing. The price of honesty; worth paying, worth watching.
 *   latency             observations between the truth changing and the belief following
 *   recovery            did the belief come back after an off-procedure excursion, and how fast
 *   offHandling         on frames labelled "off", did Rocky correctly decline to claim a step
 *
 * USAGE
 *   node test/replay.js                     every trace in test/traces, current model
 *   node test/replay.js --trace foo.json    one trace
 *   node test/replay.js --verbose           per-frame detail
 *   node test/replay.js --json              machine-readable, for comparing two models
 *   node test/replay.js --model path.js     score a DIFFERENT world-model implementation,
 *                                           which is how a replacement is justified
 *
 * A trace is produced by test/trace-capture.js, pasted into the portal console of a running
 * lab. Traces marked provenance "synthetic" were written by hand and prove only that the model
 * behaves as its author expected; they are a smoke test, not evidence. Only a trace marked
 * "captured" is evidence about a real portal.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CONF_SHOW = 0.80;        // pilot.js: the bar for stating a step NUMBER out loud
const TRACE_DIR = path.join(__dirname, 'traces');

// ---- load a world model in isolation ---------------------------------------------------------
function loadModel(file) {
  const code = fs.readFileSync(file, 'utf8');
  const win = {};
  const doc = {
    readyState: 'complete', addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null, documentElement: {}, getElementById: () => null, title: '',
  };
  new Function('window', 'document', 'setTimeout', 'setInterval', 'MutationObserver',
    'performance', 'location', 'history', 'chrome', code)(
    win, doc, () => 0, () => 0, function () { return { observe() {}, disconnect() {} }; },
    { now: () => Date.now() }, { href: 'about:blank' }, {}, undefined);
  if (!win.LabPilotWorld) throw new Error(`${file} did not define window.LabPilotWorld`);
  return win.LabPilotWorld;
}

// ---- helpers ---------------------------------------------------------------------------------
const pct = (n) => (n == null ? '  —  ' : (n * 100).toFixed(0).padStart(3) + '%');
const num = (n, d = 2) => (n == null ? '—' : Number(n).toFixed(d));

/*
 * A "furniture frame": every control on it that matches any step's label sits in persistent
 * chrome. If a trace records scope (captured traces do), use it — that is the portal's own
 * statement. Otherwise fall back to the set of labels seen on EVERY frame of the trace, which
 * is the same inference the model makes, computed here independently so the bench does not
 * simply agree with the model by construction.
 */
function furnitureFrames(trace, labels) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const wanted = new Set(labels.map(norm).filter(Boolean));
  const hasScope = trace.frames.some((f) => (f.controls || []).some((c) => c.scope));

  if (hasScope) {
    return trace.frames.map((f) => {
      const matching = (f.controls || []).filter((c) => wanted.has(norm(c.name)));
      if (!matching.length) return false;
      return matching.every((c) => c.scope === 'nav' || c.scope === 'banner');
    });
  }
  // no scope recorded: a label present on every single frame is chrome by definition
  const onEvery = new Set([...wanted].filter((w) =>
    trace.frames.every((f) => (f.controls || []).some((c) => norm(c.name) === w))));
  return trace.frames.map((f) => {
    const matching = (f.controls || []).filter((c) => wanted.has(norm(c.name)));
    if (!matching.length) return false;
    return matching.every((c) => onEvery.has(norm(c.name)));
  });
}

// ---- score one trace ---------------------------------------------------------------------------
function score(W, trace, opts) {
  const guide = trace.guide;
  if (!guide || !guide.steps || !guide.steps.length) {
    return { error: 'trace has no guide' };
  }
  const labels = [];
  guide.steps.forEach((s) => (s.targets || []).forEach((t) => {
    if (t.label) labels.push(t.label);
    (t.alt || []).forEach((a) => labels.push(a));
  }));
  const isFurniture = furnitureFrames(trace, labels);

  W.reset();
  W.ingest(guide);

  const rows = [];
  let prevTruth = null;
  let pendingSince = null;              // observation index where the truth last changed

  trace.frames.forEach((f, i) => {
    // A frame recorded with repeats:N means the learner sat on that screen. Feeding it N times
    // is the honest replay, and it is also the inflation test with real data rather than a
    // synthetic loop.
    const reps = Math.max(1, f.repeats || 1);
    let c = null;
    let confMin = 1, confMax = 0;
    for (let r = 0; r < reps; r++) {
      W.observe({ url: f.url, title: f.title, controls: f.controls || [] });
      c = W.current();
      if (c.confidence < confMin) confMin = c.confidence;
      if (c.confidence > confMax) confMax = c.confidence;
    }
    const truth = f.truth;
    if (truth != null && truth !== prevTruth) { pendingSince = i; prevTruth = truth; }

    const correct = truth == null ? null
      : truth === 'off' ? (c.confidence < CONF_SHOW)     // "off" is handled right by NOT claiming
      : c.index === truth;

    rows.push({
      i, url: f.url.replace(/^https?:\/\/[^/]+/, ''), reps,
      truth, index: c.index, conf: c.confidence, correct,
      furniture: isFurniture[i],
      inflation: reps > 1 ? +(confMax - confMin).toFixed(3) : 0,
      spoke: c.confidence >= CONF_SHOW,
      settledAt: (truth != null && truth !== 'off' && c.index === truth && pendingSince != null)
        ? i - pendingSince : null,
    });
  });

  const labelled = rows.filter((r) => r.truth != null);
  const onProc = labelled.filter((r) => r.truth !== 'off');
  const spoken = onProc.filter((r) => r.spoke);
  const harmful = labelled.filter((r) => r.spoke && r.correct === false);
  const furnCeil = rows.filter((r) => r.furniture).reduce((m, r) => Math.max(m, r.conf), 0);
  const inflation = rows.reduce((m, r) => Math.max(m, r.inflation), 0);

  // latency: for each truth change, how many observations until the belief agreed
  const latencies = [];
  let seen = new Set();
  rows.forEach((r) => {
    if (r.settledAt != null && !seen.has(r.truth)) { latencies.push(r.settledAt); seen.add(r.truth); }
  });

  // recovery: frames labelled "off" followed by a return to a real step
  const offRuns = [];
  let run = null;
  rows.forEach((r, i) => {
    if (r.truth === 'off') { if (!run) run = { from: i, n: 0 }; run.n++; }
    else if (run) { run.recoveredIn = null; offRuns.push(run); run = null; }
  });
  if (run) offRuns.push(run);
  offRuns.forEach((o) => {
    for (let i = o.from + o.n; i < rows.length; i++) {
      if (rows[i].truth != null && rows[i].truth !== 'off' && rows[i].correct) {
        o.recoveredIn = i - (o.from + o.n); break;
      }
    }
  });

  return {
    name: trace.name, provenance: trace.provenance || 'unknown', portal: trace.portal,
    frames: rows.length, observations: rows.reduce((n, r) => n + r.reps, 0), labelled: labelled.length,
    accuracy: onProc.length ? onProc.filter((r) => r.correct).length / onProc.length : null,
    accuracyWhenSpoken: spoken.length ? spoken.filter((r) => r.correct).length / spoken.length : null,
    silence: onProc.length ? onProc.filter((r) => !r.spoke).length / onProc.length : null,
    offHandling: labelled.filter((r) => r.truth === 'off').length
      ? labelled.filter((r) => r.truth === 'off' && r.correct).length /
        labelled.filter((r) => r.truth === 'off').length : null,
    harmfulConfidence: harmful.length,
    harmfulDetail: harmful.slice(0, 5).map((r) => `frame ${r.i} ${r.url}: said step ${r.index + 1} at ${r.conf}, truth ${typeof r.truth === 'number' ? r.truth + 1 : r.truth}`),
    furnitureCeiling: +furnCeil.toFixed(2),
    furnitureFrames: rows.filter((r) => r.furniture).length,
    inflationDelta: +inflation.toFixed(3),
    latencyMedian: latencies.length ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] : null,
    latencyWorst: latencies.length ? Math.max(...latencies) : null,
    recoveries: offRuns.map((o) => o.recoveredIn),
    rows: opts && opts.verbose ? rows : undefined,
  };
}

// ---- report -------------------------------------------------------------------------------------
function report(results, asJson) {
  if (asJson) { console.log(JSON.stringify(results, null, 2)); return results.some((r) => r.fail); }

  let anyFail = false;
  console.log('\n=== POSITION MODEL SCORECARD ===\n');
  for (const r of results) {
    if (r.error) { console.log(`  ${r.name}: ${r.error}\n`); continue; }
    const synthetic = r.provenance !== 'captured';
    console.log(`  ${r.name}`);
    console.log(`  ${'-'.repeat(Math.max(20, r.name.length))}`);
    console.log(`    provenance        ${r.provenance}${synthetic ? '   (written by hand — a smoke test, not evidence about a real portal)' : '   (recorded from the live portal)'}`);
    console.log(`    portal            ${r.portal || '—'}`);
    console.log(`    frames            ${r.frames} (${r.observations} observations, ${r.labelled} labelled)`);
    console.log('');
    console.log(`    accuracy          ${pct(r.accuracy)}     believed step == true step`);
    console.log(`    when spoken       ${pct(r.accuracyWhenSpoken)}     accuracy on the frames a learner would have SEEN a number`);
    console.log(`    silence           ${pct(r.silence)}     truth knowable, Rocky said no number`);
    if (r.offHandling != null) {
      console.log(`    off-procedure     ${pct(r.offHandling)}     correctly declined to claim a step while wandering`);
    }
    console.log(`    latency           ${r.latencyMedian == null ? '—' : r.latencyMedian + ' obs median, ' + r.latencyWorst + ' worst'}`);
    if (r.recoveries.length) {
      console.log(`    recovery          ${r.recoveries.map((n) => (n == null ? 'never' : n + ' obs')).join(', ')}`);
    }
    console.log('');
    const inv = [
      ['harmful confidence', r.harmfulConfidence, r.harmfulConfidence === 0, `${r.harmfulConfidence} frame(s) stated a WRONG step number`],
      ['furniture ceiling', num(r.furnitureCeiling), r.furnitureCeiling < CONF_SHOW, `reached ${r.furnitureCeiling} on ${r.furnitureFrames} nav-only frame(s), bar is ${CONF_SHOW}`],
      ['inflation delta', num(r.inflationDelta, 3), r.inflationDelta <= 0.15, `confidence climbed ${r.inflationDelta} from staring at one screen`],
    ];
    for (const [label, value, ok, why] of inv) {
      if (!ok) anyFail = true;
      console.log(`    ${ok ? '[ok]  ' : '[FAIL]'} ${label.padEnd(20)} ${String(value).padStart(6)}   ${ok ? '' : why}`);
    }
    if (r.harmfulDetail.length) r.harmfulDetail.forEach((d) => console.log(`             ${d}`));
    if (r.rows) {
      console.log('\n    frame  page                                    reps  truth  believed  conf   furn');
      r.rows.forEach((x) => console.log(
        `    ${String(x.i).padStart(5)}  ${x.url.slice(0, 38).padEnd(38)}  ${String(x.reps).padStart(4)}  ` +
        `${String(x.truth == null ? '-' : x.truth).padStart(5)}  ${String(x.index).padStart(8)}  ` +
        `${num(x.conf).padStart(4)}   ${x.furniture ? 'yes' : ''}`));
    }
    console.log('');
  }
  const captured = results.filter((r) => r.provenance === 'captured').length;
  console.log(`  ${results.length} trace(s), ${captured} recorded from a live portal.`);
  if (!captured) {
    console.log('  NOTE: no captured trace. Every number above reflects screens written by hand,');
    console.log('        so it measures self-consistency, not whether Rocky works on Purview.');
    console.log('        Record one with test/trace-capture.js on a running lab.');
  }
  console.log('');
  return anyFail;
}

// ---- cli --------------------------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const verbose = argv.includes('--verbose');
  const asJson = argv.includes('--json');
  const modelPath = arg('--model', path.join(__dirname, '..', 'webext', 'content', 'world-model.js'));
  const only = arg('--trace', null);

  let W;
  try { W = loadModel(modelPath); }
  catch (e) { console.error(`could not load model ${modelPath}: ${e.message}`); process.exit(2); }

  if (!fs.existsSync(TRACE_DIR)) {
    console.error(`no trace directory at ${TRACE_DIR} — record one with test/trace-capture.js`);
    process.exit(2);
  }
  let files = fs.readdirSync(TRACE_DIR).filter((f) => f.endsWith('.json'));
  if (only) files = files.filter((f) => f === only || f === only + '.json');
  if (!files.length) { console.error('no traces found'); process.exit(2); }

  const results = files.map((f) => {
    const trace = JSON.parse(fs.readFileSync(path.join(TRACE_DIR, f), 'utf8'));
    trace.name = trace.name || f;
    try { return score(W, trace, { verbose }); }
    catch (e) { return { name: trace.name, error: e.message, provenance: trace.provenance, recoveries: [], harmfulDetail: [] }; }
  });

  const failed = report(results, asJson);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main();
module.exports = { loadModel, score };
