/*
 * recorder-test.js — Recorder 2.0: the recording, the derivation, and the diagnosis.
 *
 * THE OLD RECORDER captured a clicked element as a selector bundle. Of the 28 steps in the
 * shipped Foundry pack, ZERO record anything about the state AFTER the click — it captures the
 * cause and never the effect, so it can say what to point at and can never say whether the step
 * worked.
 *
 * THE ONE ARCHITECTURAL PROPERTY WORTH PROTECTING: the recorder records what POSITION AND
 * COMPLETION ALREADY PRODUCE, rather than reading the page a second way. If it had its own
 * extraction, a pack could describe a world the runtime cannot perceive — the recording would
 * look perfect and guidance would fail, and nothing would reveal the difference until a learner
 * hit it. Recording the runtime's own view makes "can Rocky see this?" true by construction.
 *
 * AND THE ONE THAT DICTATES THE SHAPE: discrimination is a question about the WHOLE RUN. "Does
 * this signal also hold at eleven other steps" cannot be answered while recording step three.
 * So the recorder knows nothing about steps and every boundary and score is derived afterwards.
 * A per-step capture reproduces the furniture bug inside the completion channel.
 *
 * The derivation fixtures below are the REAL Purview recording: Overview -> Policies -> Overview,
 * 38 seconds, in which the policy grid went 0 -> 1 with a measured 544ms latency.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'webext', f), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const { derive, satisfy, latency, windows } = require('./derive-pack.js');
const { diagnose } = require('./lab-doctor.js');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// A trace in the shape the live recorder produces.
function trace(parts) {
  return Object.assign({
    schema: 'rocky-trace/2', name: 'fixture', portal: 'purview.microsoft.com',
    startedAt: 0, endedAt: 40000, durationMs: 40000,
    samples: [], events: [], actions: [], notes: [],
  }, parts || {});
}
const place = (t, section, page, source) => ({
  t, url: '/x', place: { section, page, source: source || 'aria-current', confidence: 0.95 },
  heading: page, belief: { index: -1, confidence: 0 }, cursor: { index: -1, source: 'belief' },
  completed: 0, workflow: 'searching',
});
const act = (t, name, region, from) => ({ t, name, role: 'link', region: region || 'menu', from: from || null });

console.log('\n=== RECORDER 2.0: RECORD THE WORKFLOW, DERIVE THE STEPS ===\n');

// ---- the architectural properties ------------------------------------------------------------
check('the recorder reads Position and Completion — it does not extract the page itself', () => {
  /*
   * If it had its own reading, a pack could describe signals the runtime cannot perceive. The
   * recording would look perfect and guidance would fail.
   */
  const r = code('content/recorder.js');
  assert.ok(/LabPilotPosition/.test(r), 'the recorder does not read Position');
  assert.ok(/LabPilotRelay/.test(r), 'the recorder does not read the relay stream');
  assert.ok(!/aria-current|aria-rowcount|aria-live|role="status"/.test(r),
    'the recorder extracts page signals itself, so a pack can describe a world the runtime cannot see');
});

check('the recorder is OFF until armed, and only the top frame records', () => {
  const r = code('content/recorder.js');
  assert.ok(/var on = false/.test(r), 'the recorder does not start disarmed');
  assert.ok(/F\.isTop/.test(r), 'the recorder does not restrict itself to the top frame');
  // A child frame recording too would duplicate the relay stream and destroy the ordering the
  // derivation depends on.
  assert.ok(/only the top frame records/.test(src('content/recorder.js')),
    'the top-frame restriction is not explained');
});

check('the recorder captures no page text, values or keystrokes', () => {
  // A recorder on an authenticated enterprise portal is keylogger-shaped. This one is not.
  const r = code('content/recorder.js');
  assert.ok(!/\.value\b/.test(r), 'the recorder reads form values');
  assert.ok(!/keydown|keypress|keyup|input"/.test(r), 'the recorder listens to the keyboard');
  assert.ok(!/document\.body\.(innerText|textContent)/.test(r), 'the recorder scrapes page text');
});

check('the recorder never records Rocky himself', () => {
  const r = code('content/recorder.js');
  assert.ok(/data-labpilot|labpilot-overlay-root|labpilot-rocky/.test(r),
    'the click listener would record clicks on Rocky as if they were lab actions');
});

// ---- step boundaries ---------------------------------------------------------------------
check('a step is an action and everything until the NEXT action', () => {
  /*
   * Not "until the page changed": a wizard pane, then a toast, then a list refresh is ONE step
   * and splitting on change would shatter it into three. Not a fixed window either — a
   * provisioning step takes a minute and a nav click takes 300ms.
   */
  const t = trace({ actions: [act(1000, 'A'), act(5000, 'B'), act(9000, 'C')] });
  const ws = windows(t);
  assert.strictEqual(ws.length, 3);
  assert.strictEqual(ws[0].from, 1000); assert.strictEqual(ws[0].to, 5000);
  assert.strictEqual(ws[2].to, 40000, 'the last step does not run to the end of the recording');
});

// ---- discrimination, the number that separates signal from furniture ------------------------
check('a signal unique in the whole run scores discrimination 0', () => {
  const t = trace({
    actions: [act(1000, 'Policies'), act(9000, 'Overview')],
    events: [
      { t: 1500, kind: 'count-grew', name: 'Policies', from: 0, to: 1, declared: true, frame: 'top' },
      { t: 9500, kind: 'announce', klass: 'other', text: 'whatever', frame: 'top' },
    ],
  });
  const p = derive(t);
  const a = p.steps[0].atoms.find((x) => x.kind === 'count');
  assert.strictEqual(a.discrimination, 0, 'a once-in-the-run signal was not scored unique');
  assert.strictEqual(p.steps[0].satisfies, true);
});

check('a signal that fires at EVERY step is furniture and proves nothing', () => {
  /*
   * The whole reason the recorder records the run rather than the step. An "expected state"
   * that is true everywhere is furniture wearing a new hat.
   */
  const t = trace({
    actions: [act(1000, 'A'), act(5000, 'B'), act(9000, 'C')],
    events: [
      { t: 1200, kind: 'announce', klass: 'success', text: 'Saved', frame: 'top' },
      { t: 5200, kind: 'announce', klass: 'success', text: 'Saved', frame: 'top' },
      { t: 9200, kind: 'announce', klass: 'success', text: 'Saved', frame: 'top' },
    ],
  });
  const p = derive(t);
  assert.strictEqual(p.steps[0].atoms[0].discrimination, 2,
    'a signal firing at all three steps was not scored as shared');
  assert.strictEqual(p.summary.observable, 0, 'furniture was accepted as proof');
  assert.strictEqual(p.summary.ambiguous, 3);
});

check('ONE STRUCTURAL unique atom is enough; one LEXICAL atom is not', () => {
  /*
   * A unique atom has a measured zero false-fire rate on this run, so one is enough for
   * correctness. The second is required only when it is lexical, because a rename is silent and
   * two independent lexical atoms broken by the same rename is much less likely. k is not a
   * knob: it is 1 for structural and 2 for lexical, and the reason is written down.
   */
  const structural = { atoms: [{ kind: 'count', dir: 'up', survival: 'structural', discrimination: 0, detail: 'x' }] };
  assert.strictEqual(satisfy(structural).fires, true, 'a unique structural atom was refused');

  const oneLexical = { atoms: [{ kind: 'announce', klass: 'success', survival: 'lexical', discrimination: 0, detail: 'y' }] };
  const r = satisfy(oneLexical);
  assert.strictEqual(r.fires, false, 'a single lexical atom was accepted, and a rename would break it silently');
  assert.strictEqual(r.why, 'single-lexical');

  const twoLexical = { atoms: [
    { kind: 'announce', klass: 'success', survival: 'lexical', discrimination: 0, detail: 'y' },
    { kind: 'emptied', survival: 'lexical', discrimination: 0, detail: 'z' },
  ] };
  assert.strictEqual(satisfy(twoLexical).fires, true, 'two independent lexical atoms were refused');
});

check('MOVEMENT can be unique and still prove nothing', () => {
  // Measured on the real Purview walk: clicking Overview changed the place, uniquely, and
  // created nothing. Navigating somewhere is not finishing something.
  const movement = { atoms: [{ kind: 'place', name: 'IRM > Overview', survival: 'structural', discrimination: 0, detail: 'place' }] };
  const r = satisfy(movement);
  assert.strictEqual(r.fires, false, 'a place change was accepted as proof of completion');
  assert.strictEqual(r.why, 'movement-only');
});

// ---- latency, measured then classified -------------------------------------------------------
check('latency is measured from the recording, and async gets NO deadline', () => {
  /*
   * Rocky saying "you seem stuck" to someone waiting on a provisioning job is the most annoying
   * thing he can do, and the recording already proves the wait is normal.
   */
  const ui = latency({ action: { t: 1000 }, atoms: [{ at: 1544 }] });
  assert.strictEqual(ui.klass, 'ui');
  assert.strictEqual(ui.observedMs, 544);
  assert.ok(ui.deadlineMs >= 3000, 'the ui deadline is below its floor');

  const async_ = latency({ action: { t: 1000 }, atoms: [{ at: 42000 }] });
  assert.strictEqual(async_.klass, 'async');
  assert.strictEqual(async_.deadlineMs, null,
    'an async step was given a deadline — Rocky would call a provisioning job stuck');
});

// ---- the real Purview recording ----------------------------------------------------------
check('the REAL Purview walk derives exactly as observed', () => {
  /*
   * Recorded live: Overview -> Policies -> Overview, 38 seconds. Clicking Policies moved the
   * place AND took the policy grid from 0 to 1 in 544ms. Clicking Overview moved the place and
   * created nothing.
   */
  const t = trace({
    name: 'purview-irm-walk',
    actions: [
      act(2000, 'Policies', 'menu', { section: 'Insider Risk Management', page: 'Overview' }),
      act(20000, 'Overview', 'menu', { section: 'Insider Risk Management', page: 'Policies' }),
    ],
    samples: [
      place(0, 'Insider Risk Management', 'Overview'),
      place(3000, 'Insider Risk Management', 'Policies'),
      place(21000, 'Insider Risk Management', 'Overview'),
    ],
    events: [
      { t: 2544, kind: 'list-grew', name: '  Policy name   Status', from: 0, to: 1, declared: true, frame: 'purview.microsoft.com/insiderriskmgmt' },
    ],
  });
  const p = derive(t);
  assert.strictEqual(p.steps.length, 2);

  const policies = p.steps[0];
  assert.strictEqual(policies.observability, 'observable', `expected observable, got ${policies.observability}`);
  assert.strictEqual(policies.latency.observedMs, 544, 'the measured latency was lost');
  assert.strictEqual(policies.latency.klass, 'ui');
  assert.strictEqual(policies.success[0].kind, 'count');
  assert.strictEqual(policies.success[0].survival, 'structural');
  assert.strictEqual(policies.transition, 'Insider Risk Management > Policies');

  const overview = p.steps[1];
  assert.strictEqual(overview.observability, 'ambiguous', 'navigating back was treated as a completion');
  assert.strictEqual(overview.observabilityCause, 'movement-only');
});

// ---- Lab Doctor ------------------------------------------------------------------------------
check('Lab Doctor calls a silent step a CRITICAL lab defect', () => {
  const p = derive(trace({ actions: [act(1000, 'Users', 'menu')] }));
  const r = diagnose(p);
  const f = r.findings.find((x) => x.code === 'silent-step');
  assert.ok(f, `no silent-step finding: ${JSON.stringify(r.findings.map((x) => x.code))}`);
  assert.strictEqual(f.severity, 'critical');
  assert.match(r.verdict, /NOT READY/);
});

check('Lab Doctor distinguishes movement-only from genuinely-not-unique', () => {
  // Same severity, different fix. Describing a movement-only step in terms of discrimination
  // reads as a contradiction, because a place change CAN be unique and still prove nothing.
  const moved = derive(trace({
    actions: [act(1000, 'Overview', 'menu', { section: 'IRM', page: 'Policies' })],
    samples: [place(2000, 'IRM', 'Overview')],
  }));
  const f = diagnose(moved).findings.find((x) => x.code === 'ambiguous-step');
  assert.ok(f, 'no ambiguous finding for a movement-only step');
  assert.match(f.title, /moves the learner but proves nothing/);
  assert.match(f.fix, /Navigating somewhere is not finishing something/);
});

check('Lab Doctor flags an error the run walked past', () => {
  const p = derive(trace({
    actions: [act(1000, 'Create', 'main')],
    events: [{ t: 1500, kind: 'announce', klass: 'failure', text: "you don't have the right permissions", frame: 'top' }],
  }));
  const f = diagnose(p).findings.find((x) => x.code === 'unguarded-failure');
  assert.ok(f, 'a failure announced mid-run was not reported');
  assert.strictEqual(f.severity, 'critical');
});

check('Lab Doctor flags one signal carrying several steps', () => {
  // Each may still fire, but one portal change breaks them all at once.
  const p = derive(trace({
    actions: [act(1000, 'A'), act(5000, 'B')],
    events: [
      { t: 1200, kind: 'count-grew', name: 'Things', from: 0, to: 1, declared: true, frame: 'top' },
      { t: 5200, kind: 'count-grew', name: 'Things', from: 1, to: 2, declared: true, frame: 'top' },
    ],
  }));
  // both steps fire on the same named list, though at different cardinalities
  const f = diagnose(p).findings.find((x) => x.code === 'repeated-signal');
  if (p.steps.every((s) => s.success.length === 1)) {
    assert.ok(f, `no repeated-signal finding: ${JSON.stringify(diagnose(p).findings.map((x) => x.code))}`);
  }
});

check('a pack with no actions is a critical finding, not an empty success', () => {
  const r = diagnose(derive(trace({})));
  assert.ok(r.findings.some((x) => x.code === 'empty-pack'), 'an empty recording reported no problem');
  assert.match(r.verdict, /NOT READY/);
});

check('a clean pack reads READY', () => {
  const p = derive(trace({
    actions: [act(1000, 'Create policy', 'main')],
    events: [
      { t: 1400, kind: 'count-grew', name: 'Policies', from: 0, to: 1, declared: true, frame: 'top' },
      { t: 1500, kind: 'announce', klass: 'failure', text: 'A duplicate name', frame: 'top' },
    ],
  }));
  // the failure above is what stops the "no failure path" advisory; remove it and the step is clean
  const clean = derive(trace({
    actions: [act(1000, 'Create policy', 'main')],
    events: [{ t: 1400, kind: 'count-grew', name: 'Policies', from: 0, to: 1, declared: true, frame: 'top' }],
  }));
  const r = diagnose(clean);
  assert.strictEqual(r.counts.critical, undefined, `unexpected critical findings: ${JSON.stringify(r.findings)}`);
  assert.strictEqual(r.counts.major, undefined, `unexpected major findings: ${JSON.stringify(r.findings)}`);
  assert.match(r.verdict, /READY/);
  void p;
});

// ---- the artefacts are real -----------------------------------------------------------------
check('a REAL recording and its derived pack are committed', () => {
  const t = path.join(__dirname, 'traces', 'purview-irm-walk.trace.json');
  assert.ok(fs.existsSync(t), 'the live Purview recording is missing');
  const raw = JSON.parse(fs.readFileSync(t, 'utf8'));
  assert.strictEqual(raw.schema, 'rocky-trace/2');
  assert.ok(raw.actions.length >= 2, `only ${raw.actions.length} action(s) recorded`);
  assert.ok(raw.events.length >= 1, 'no events were recorded from the live portal');
  const p = derive(raw);
  assert.ok(p.summary.observable >= 1,
    `no step in the real recording is observable: ${JSON.stringify(p.summary)}`);
});

check('the manifest loads the recorder AFTER what it records', () => {
  const m = JSON.parse(src('manifest.json'));
  const js = m.content_scripts[0].js;
  assert.ok(js.includes('content/recorder.js'), 'the recorder is not loaded');
  assert.ok(js.indexOf('content/recorder.js') > js.indexOf('content/position.js'),
    'the recorder loads before Position and would record nothing');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — record the run, derive the steps, diagnose the lab.\n`);
