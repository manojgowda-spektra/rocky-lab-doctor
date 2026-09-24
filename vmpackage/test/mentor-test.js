/*
 * mentor-test.js — Rocky answers the five questions, or says nothing.
 *
 * THE FIVE:
 *   1. Where am I?  2. What did I accomplish?  3. Why does it matter?
 *   4. What should I do next?  5. What happens if I don't?
 *
 * WHAT IS ACTUALLY AT RISK HERE, and it is not the happy path. A mentor layer's whole job is to
 * say more than Rocky said before, and the easiest way to say more is to make things up. So most
 * of what follows tests the NULLS: that an unobserved completion never enters the journey, that
 * a step with no dependents produces no consequence, that no step number is smuggled in through
 * a sentence about a later step.
 *
 * THE DEPENDENCY MEASUREMENT IS A GATE, not a demo. test/fixtures-zava-guide.json holds 136
 * VERBATIM instruction lines from the four real Zava challenge guides. The numbers asserted
 * below are the measured ones; if somebody loosens a filter to get better coverage, the false
 * positives come back and the artefact assertion fails. Precision is the thing being protected —
 * telling a learner that skipping step 3 breaks step 8 when it does not is worse than silence.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---- load mentor.js with just enough world around it ------------------------------------------
function load(overrides, doc) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'mentor.js'), 'utf8');
  const win = Object.assign({
    LabPilotFrame: { isTop: true, ownsUI: true },
  }, overrides || {});
  // A real `document` is needed to exercise the ask-box guard; without one mentor.js throws
  // inside its try and deliberately fails OPEN, so the guard would never actually be tested.
  new Function('window', 'document', code)(win, doc || { querySelector: () => null });
  if (!win.LabPilotMentor) throw new Error('mentor.js did not expose LabPilotMentor');
  return win.LabPilotMentor;
}

// A Position stand-in. Everything the mentor reads comes through read(), so this is the whole
// surface it depends on — which is the point of having one source of truth.
function position(o) {
  o = o || {};
  return {
    read: () => ({
      belief: { index: o.index == null ? -1 : o.index, confidence: o.confidence || 0, source: 'belief' },
      cursor: { index: -1, source: 'none', confidence: null },
      place: { section: o.section || null, page: o.page || null, source: o.placeSource || 'none', confidence: o.placeConf || null },
      completed: { count: 0, complete: false },
      next: { index: o.nextIndex == null ? -1 : o.nextIndex, text: o.nextText || null, source: 'done-ledger' },
      lastCompletion: o.lastCompletion || null,
      workflow: { state: o.workflow || 'guiding' },
      recovery: { reason: null, failure: null },
      sayable: { stepNumber: o.stepNumber || null, total: o.total || 0, source: o.sayableSource || 'none', why: o.why || 'position unknown' },
      sources: {},
    }),
    promptLine: () => o.promptLine || 'Rocky is NOT certain which step the learner is on.',
  };
}
const world = (steps) => ({ steps: () => steps || [] });

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

console.log('\n=== THE MENTOR LAYER ===\n');

/* ---- 1. the journey: only what Rocky actually watched ---------------------------------------- */

check('a world change Rocky watched becomes an accomplishment, in plain English', () => {
  const M = load({
    LabPilotPosition: position({
      lastCompletion: { kind: 'count-grew', from: 3, to: 4, at: 1000 },
      page: 'Policies', stepNumber: 4, total: 9, total_: 9,
    }),
  });
  M.note();
  const j = M.journey();
  assert.strictEqual(j.length, 1, 'the completion never reached the journey');
  assert.strictEqual(j[0].evidence, 'the list went from 3 to 4');
  assert.deepStrictEqual(j[0].step, { n: 4, of: 9 }, 'the accomplishment lost its step');
  assert.strictEqual(j[0].place, 'Policies');
});

check('nothing enters the journey without an observed completion', () => {
  // The governing rule of the whole project: an action is an attempt, a world change is proof.
  const M = load({ LabPilotPosition: position({ page: 'Policies', stepNumber: 2, total: 9 }) });
  M.note(); M.note(); M.note();
  assert.deepStrictEqual(M.journey(), [], 'Rocky invented an accomplishment out of nothing');
  assert.strictEqual(M.brief().did, null, 'brief claimed work that was never observed');
});

check('one completion is never counted twice', () => {
  // A portal that re-announces the same text gets a fresh timestamp. Congratulating a learner
  // twice for one thing reads as Rocky not paying attention.
  const pos = position({ lastCompletion: { kind: 'count-grew', from: 3, to: 4, at: 1000 }, page: 'P' });
  const M = load({ LabPilotPosition: pos });
  M.note();
  pos.read = ((orig) => () => {
    const s = orig();
    s.lastCompletion = { kind: 'count-grew', from: 3, to: 4, at: 2000 };  // same event, new stamp
    return s;
  })(pos.read);
  M.note();
  assert.strictEqual(M.journey().length, 1, 'the same completion was recorded twice');
});

check('a genuinely different completion IS recorded', () => {
  const pos = position({ lastCompletion: { kind: 'count-grew', from: 3, to: 4, at: 1000 }, page: 'P' });
  const M = load({ LabPilotPosition: pos });
  M.note();
  pos.read = ((orig) => () => {
    const s = orig();
    s.lastCompletion = { kind: 'count-grew', from: 4, to: 5, at: 2000 };
    return s;
  })(pos.read);
  M.note();
  assert.strictEqual(M.journey().length, 2, 'a real second accomplishment was swallowed');
});

check('an accomplishment is NOT pinned to a step Position will not name', () => {
  const M = load({
    LabPilotPosition: position({
      lastCompletion: { kind: 'list-grew', from: 0, to: 2, at: 1000 },
      page: 'P', stepNumber: null,
    }),
  });
  M.note();
  assert.strictEqual(M.journey()[0].step, null,
    'an accomplishment was pinned to a step number Position refused to state');
});

check('a change Rocky cannot put into words is not news', () => {
  const M = load({
    LabPilotPosition: position({ lastCompletion: { kind: 'something-odd', at: 1000 }, page: 'P' }),
  });
  M.note();
  assert.deepStrictEqual(M.journey(), [], 'an untranslatable event became an accomplishment');
});

/* ---- 2. where am I ----------------------------------------------------------------------------- */

check('where: the place and the step, when both are known', () => {
  const M = load({ LabPilotPosition: position({ page: 'Insider risk management', stepNumber: 3, total: 9 }) });
  const b = M.brief();
  assert.match(b.where.text, /You are on Insider risk management\./);
  assert.match(b.where.text, /step 3 of 9/);
});

check('where: no step number means no step number, and a reason why', () => {
  const M = load({ LabPilotPosition: position({ page: 'Home', stepNumber: null, why: 'confidence 0.31 is below 0.8' }) });
  const b = M.brief();
  assert.match(b.where.text, /You are on Home\./);
  assert.ok(!/step \S+ of/i.test(b.where.text), `a number leaked in: "${b.where.text}"`);
});

check('where: knowing nothing says nothing, and explains itself', () => {
  const M = load({ LabPilotPosition: position({ page: null, section: null, stepNumber: null, why: 'position unknown' }) });
  const b = M.brief();
  assert.strictEqual(b.where.text, null, 'Rocky claimed a place he does not know');
  assert.strictEqual(b.where.why, 'position unknown');
});

/* ---- 3. the dependency derivation, against the REAL guides ------------------------------------ */

const ZAVA = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-zava-guide.json'), 'utf8'));
const CORPUS = [].concat(...Object.values(ZAVA)).map((text) => ({ text, targets: [] }));

// guide-reader gives the real targets; without them the UI-control filter cannot run, so the
// measurement below would be measuring a different algorithm than the one that ships.
function withRealTargets(lines) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'guide-reader.js'), 'utf8');
  const win = {};
  // setInterval MUST be stubbed — guide-reader starts a poll loop and node hangs without it.
  new Function('window', 'document', 'setInterval', code)(
    win, { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null },
    () => 0);
  return win.LabPilotGuide._test.parseGuide(lines.map((s) => s.text));
}

check('the real Zava corpus is present and is the real thing', () => {
  assert.strictEqual(CORPUS.length, 136, `fixture has ${CORPUS.length} lines, expected 136`);
  assert.ok(CORPUS.some((s) => /Zava-Customer-Payments\.docx/.test(s.text)), 'not the real guide');
});

check('MEASURED: every extracted artefact is a thing the learner really makes', () => {
  /*
   * PRECISION, measured over all 136 raw guide lines — the pure extractor's own domain.
   *
   * Every name below is something the learner creates. The junk list is what v1 of this rule
   * produced before the filters: file extensions, field labels, synthetic test values and
   * portal controls. `Credit card number` was the dangerous one — it would have told a learner
   * that skipping the document step broke a step that merely opens a built-in sensitive info
   * type of the same name.
   */
  const M = load({});
  const parsed = withRealTargets(CORPUS);
  const controls = {};
  parsed.forEach((s) => (s.targets || []).forEach((t) => {
    if (t && t.label) controls[String(t.label).toLowerCase().trim()] = 1;
  }));
  const names = new Set();
  CORPUS.forEach((s) => M._artefacts(s.text, controls).forEach((n) => names.add(n)));
  const got = [...names].sort();

  const JUNK = ['.docx', 'Credit card number', 'Social Security Number', 'Custom', 'Custom policy',
                'Documents', 'True', 'Full directory', '4532 0151 1283 0366', '12/2032', '078-05-1120'];
  for (const j of JUNK) {
    assert.ok(!got.includes(j), `"${j}" is not something a learner creates — a filter has been lost`);
  }
  for (const real of ['Zava Public', 'Zava Highly Confidential', 'Zava Auto-Label Policy',
                      'Zava Block Removable Storage', 'Zava Unsanctioned Cloud Storage']) {
    assert.ok(got.includes(real), `lost a real artefact: ${real}`);
  }
  console.log(`         ${got.length} artefact names from 136 raw guide lines, no junk`);
});

check('MEASURED: the consequence rule fires on the steps Rocky actually tracks', () => {
  /*
   * COVERAGE, measured over what SHIPS — and it is much lower than the raw corpus suggests.
   *
   * guide-reader keeps only lines it can find a click target in: 79 of the 136 real instruction
   * lines become steps at all, and the other 57 (including "Create `Zava Public` with these
   * exact settings:") are never tracked, so their artefacts cannot be reasoned about. Measured
   * end to end through the production parser: 5 of 79 steps get a concrete consequence.
   *
   * That is one step in sixteen, not the one in nine the raw lines implied. It is still worth
   * shipping — a real, quotable consequence on 5 steps beats a plausible invented one on 79 —
   * but the honest number belongs here rather than in a slide.
   */
  const M = load({});
  const steps = withRealTargets(CORPUS);
  const map = M._deps(steps);
  const answerable = Object.keys(map).length;
  const edges = Object.values(map).reduce((n, v) => n + v.length, 0);
  console.log(`         ${answerable}/${steps.length} tracked steps answerable, ${edges} edges ` +
              `(${Math.round((answerable / steps.length) * 100)}%; ${CORPUS.length} raw lines in)`);
  // A floor that catches the rule going silent — which is exactly what happened when the
  // author's ** mark-up was being stripped before this code ever saw it — and a ceiling that
  // catches the filters collapsing into "everything depends on everything".
  assert.ok(answerable >= 4, `only ${answerable} steps answerable — the rule has gone quiet`);
  assert.ok(answerable <= steps.length * 0.35,
    `${answerable} of ${steps.length} is implausibly many — the filters are letting junk through`);
  assert.ok(edges >= answerable, 'every answerable step should have at least one edge');
});

check('the derivation reads the author mark-up, not the stripped display text', () => {
  /*
   * THE REGRESSION THAT NEARLY SHIPPED SILENTLY. guide-reader sets `text` with ** removed,
   * because that is what a learner should read, and for a while that was the only text the
   * derivation could see — so it found bold artefacts in a markdown file during development and
   * nothing whatsoever at run time. `raw` now carries the mark-up through.
   */
  const M = load({});
  const stripped = [
    { text: 'Create a rule named Zava Discovery Sensitive Data Rule.', targets: [] },
    { text: 'Select Zava Discovery Sensitive Data Rule and review it.', targets: [] },
  ];
  assert.deepStrictEqual(M._deps(stripped), {},
    'an unmarked name was treated as an artefact — precision depends on the author marking it');

  const withRaw = [
    { text: 'Create a rule named Zava Discovery Sensitive Data Rule.',
      raw: 'Create a rule named **Zava Discovery Sensitive Data Rule**.', targets: [] },
    { text: 'Select Zava Discovery Sensitive Data Rule and review it.',
      raw: 'Select **Zava Discovery Sensitive Data Rule** and review it.', targets: [] },
  ];
  const map = M._deps(withRaw);
  assert.ok(map[0] && map[0].length === 1, 'the mark-up carried in `raw` was ignored');
});

check('guide-reader carries the author mark-up through parsing', () => {
  // The other half of the same regression: if `raw` stops being set, the test above still
  // passes on its hand-built fixture while production goes silent again.
  const parsed = withRealTargets(CORPUS);
  const bolded = parsed.filter((s) => /\*\*/.test(s.raw || ''));
  assert.ok(bolded.length > 20,
    `only ${bolded.length} parsed steps kept their mark-up — guide-reader has stopped setting raw`);
});

/*
 * EACH FILTER, ON ITS OWN.
 *
 * A mutation sweep found four of the artefact filters could be deleted with the corpus gate
 * still green, because on the Zava guides every name they catch is ALSO caught by another
 * filter — the card number by the field-label rule, "Credit card number" by the UI-control
 * rule. That makes them redundant here, not useless: a guide that prints a test value it never
 * asks you to click would sail straight through. So each one gets a case only it can stop,
 * rather than being deleted because one corpus did not happen to need it.
 */

check('FILTER: a synthetic test value is not an artefact', () => {
  const M = load({});
  // No click target anywhere, so the UI-control filter cannot help: IS_VALUE is the only guard.
  const got = M._artefacts('Add the new account number **9999 8888 7777 6666** to the record.', {});
  assert.deepStrictEqual(got, [], `a bare value became an artefact: ${JSON.stringify(got)}`);
});

check('FILTER: a field label is not an artefact', () => {
  const M = load({});
  const got = M._artefacts('Add a heading, then the field label **Passport Number**, and save.', {});
  assert.deepStrictEqual(got, [], `a field label became an artefact: ${JSON.stringify(got)}`);
  // The same words WITHOUT the "field label" framing are a legitimate creation.
  assert.deepStrictEqual(
    M._artefacts('Create a rule named **Passport Number Rule**.', {}),
    ['Passport Number Rule']);
});

check('FILTER: a menu path is navigation even when the line also creates something', () => {
  /*
   * The creation verb must come FIRST in this line, or the verb filter rejects the breadcrumb
   * before the breadcrumb filter is ever consulted — which is what an earlier version of this
   * test did, leaving the breadcrumb rule deletable with the suite still green.
   */
  const M = load({});
  const got = M._creates(
    'Create a new policy from **Settings** > **Data loss prevention**, and name it **Zava Endpoint Group**.');
  assert.ok(!got.includes('Settings'), `a breadcrumb head became an artefact: ${JSON.stringify(got)}`);
  assert.ok(!got.includes('Data loss prevention'), `a breadcrumb tail became an artefact: ${JSON.stringify(got)}`);
  assert.ok(got.includes('Zava Endpoint Group'), 'the real artefact on the same line was lost');
});

check('FILTER: a name before the creation verb is not what is being created', () => {
  const M = load({});
  // "Zava Discovery Site" is where you go; "Zava Quarterly Report" is what you make there.
  const got = M._creates('From **Zava Discovery Site**, create a document named **Zava Quarterly Report**.');
  assert.ok(!got.includes('Zava Discovery Site'),
    `a name preceding the verb was treated as created: ${JSON.stringify(got)}`);
  assert.deepStrictEqual(got, ['Zava Quarterly Report']);
});

check('a file the learner creates survives the UI-control filter', () => {
  // The exemption that rescued the whole of challenge 1: guide-reader parses
  // "upload **C:\...\Zava-Customer-Payments.docx**" as a click target, so without it the
  // documents the learner makes were discarded as furniture.
  const M = load({});
  const controls = { 'zava-customer-payments.docx': 1 };
  const got = M._artefacts('Use Word for the web to create **Zava-Customer-Payments.docx** in that folder.', controls);
  assert.deepStrictEqual(got, ['Zava-Customer-Payments.docx'], 'a created file was filtered out as a control');
});

check('a breadcrumb is navigation, never an artefact', () => {
  const M = load({});
  const got = M._creates('Open **Settings** > **Device onboarding** > **Device report**, then create a new report.');
  assert.ok(!got.includes('Settings') && !got.includes('Device onboarding'),
    `a menu path became an artefact: ${JSON.stringify(got)}`);
});

check('a step with no dependents produces NO consequence', () => {
  const M = load({
    LabPilotPosition: position({ index: 0, stepNumber: 1, total: 2 }),
    LabPilotWorld: world([{ text: 'Select **Save** and wait for the success notification.', targets: [] },
                          { text: 'Confirm the page reloads.', targets: [] }]),
  });
  assert.strictEqual(M.brief().ifNot, null, 'Rocky invented a consequence with no evidence for one');
});

check('a consequence quotes the later step and names what it needs', () => {
  const steps = [
    { text: 'Select **Custom policy**, then enter the policy name `Zava Auto-Label Policy`.', targets: [] },
    { text: 'Review the settings and continue.', targets: [] },
    { text: 'Open `Zava Auto-Label Policy` and turn on simulation mode.', targets: [] },
  ];
  const M = load({
    LabPilotPosition: position({ index: 0, stepNumber: 1, total: 3, sayableSource: 'belief' }),
    LabPilotWorld: world(steps),
  });
  const c = M.brief().ifNot;
  assert.ok(c, 'no consequence found for a step whose artefact a later step names');
  assert.match(c.text, /Zava Auto-Label Policy/);
  assert.match(c.text, /simulation mode/, 'the later step is not quoted');
  assert.strictEqual(c.name, 'Zava Auto-Label Policy');
});

check('a consequence does NOT smuggle in a step number Position withheld', () => {
  /*
   * The leak this closes: the upcoming-steps list was caught doing exactly this — numbering
   * later steps in a prompt from which the current step number had been deliberately withheld.
   * "Step 3 needs X" tells a model where the learner is standing just as plainly as saying so.
   */
  const steps = [
    { text: 'Create a rule named `Zava Discovery Sensitive Data Rule`.', targets: [] },
    { text: 'Select `Zava Discovery Sensitive Data Rule` and review it.', targets: [] },
  ];
  const M = load({
    LabPilotPosition: position({ index: 0, stepNumber: null, why: 'position unknown' }),
    LabPilotWorld: world(steps),
  });
  const c = M.brief().ifNot;
  assert.ok(c, 'the dependency itself should still be reported');
  assert.ok(!/Step \S+ needs/i.test(c.text), `a step number leaked: "${c.text}"`);
  assert.match(c.text, /A later step needs/);
});

/* ---- 3b. the rendered pane: no mark-up at all ------------------------------------------------ */

/*
 * THE ASSUMPTION THAT COULD HAVE KILLED THIS FEATURE SILENTLY.
 *
 * guide-reader reads `pane.innerText` — RENDERED text. The ** and backticks that the marked-name
 * rule keys on exist in the guide's markdown SOURCE, and a lab shell that renders markdown strips
 * them. Nobody has checked a live CloudLabs guide pane, so the marked path is unverified in
 * production and may match nothing at all.
 *
 * These tests pin the half that works either way: a filename is self-delimiting, needs no
 * mark-up, never collides with a portal control label, and on the real corpus carries most of the
 * downstream references. If the markers turn out not to survive, this is the feature.
 */

const RENDERED = [
  'Open OneDrive, create a folder named Zava Discovery Documents, and confirm that the folder opens successfully.',
  'Use Word for the web to create Zava-Customer-Payments.docx in that folder. Add a heading that identifies the content as synthetic training data.',
  'Create Zava-Employee-Records.docx in the same folder. Save and close the document.',
  'Download the three documents to C:\\Users\\Public\\Documents\\ZavaDiscovery. Create the local folder first if it does not exist.',
  'Search for and open Credit Card Number. Select Test, upload C:\\Users\\Public\\Documents\\ZavaDiscovery\\Zava-Customer-Payments.docx, start the test, and review the match result.',
  'Search for and open U.S. Social Security Number. Select Test, upload Zava-Employee-Records.docx and review the match result.',
].map((text) => ({ text, targets: [] }));

check('RENDERED: a created filename is found with no mark-up whatsoever', () => {
  const M = load({});
  assert.deepStrictEqual(
    M._bare('Use Word for the web to create Zava-Customer-Payments.docx in that folder.'),
    ['Zava-Customer-Payments.docx']);
});

check('RENDERED: the dependency edges survive a pane with the markers stripped', () => {
  const M = load({});
  const map = M._deps(RENDERED);
  const edges = Object.values(map).reduce((n, v) => n + v.length, 0);
  assert.ok(Object.keys(map).length >= 2,
    `only ${Object.keys(map).length} answerable steps on rendered text — the feature dies if ** does not survive`);
  assert.ok(edges >= 2, `only ${edges} edges on rendered text`);
  // The specific real one: the document created in step 2 is uploaded in step 5.
  assert.ok(map[1] && map[1].some((d) => d.index === 4),
    'the .docx created in step 2 was not linked to the step that uploads it');
  console.log(`         ${Object.keys(map).length} answerable, ${edges} edges with NO mark-up present`);
});

check('RENDERED: a file only UPLOADED is never treated as one the learner created', () => {
  // The verb-order guard doing the work that mark-up cannot: "upload X.docx" must not read as
  // creating X.docx, or every consumer of a file becomes its producer.
  const M = load({});
  assert.deepStrictEqual(
    M._bare('Select Test, upload C:\\Users\\Public\\Documents\\Zava-Customer-Payments.docx and review it.'),
    []);
});

check('RENDERED: a bare word is still never an artefact without mark-up', () => {
  // The line that keeps precision honest once mark-up is gone: only self-delimiting names
  // (files and paths) are trusted. A Title-Case run would produce "Zava Discovery Documents and".
  const M = load({});
  assert.deepStrictEqual(M._bare('Open OneDrive and create a folder named Zava Discovery Documents.'), []);
  assert.deepStrictEqual(M._artefacts('Open OneDrive and create a folder named Zava Discovery Documents.', {}), []);
});

/* ---- 3c. the teaching moment ------------------------------------------------------------------ */

check('the moment cites the evidence and never claims a step finished', () => {
  const M = load({});
  const t = M._momentText({ kind: 'count-grew', evidence: 'the list went from 3 to 4' },
                          { next: { text: 'Select Save and wait for the confirmation.' } });
  assert.match(t, /the list went from 3 to 4/, 'the evidence is missing');
  assert.ok(!/step \d/i.test(t), `the moment claimed a step number: "${t}"`);
  assert.ok(!/completed|finished|done/i.test(t),
    `the moment claimed completion rather than an observed change: "${t}"`);
  assert.match(t, /Next, select Save/, 'the next step is not offered');
});

check('an announced success is quoted in the portal\'s own words', () => {
  const M = load({});
  const t = M._momentText({ kind: 'announce', evidence: 'Policy created successfully' }, {});
  assert.match(t, /The portal says/, t);
  assert.match(t, /Policy created successfully/, t);
});

check('the moment says nothing when there is no next step to offer', () => {
  const M = load({});
  const t = M._momentText({ kind: 'list-grew', evidence: 'the list got longer' }, { next: { text: null } });
  assert.match(t, /the list got longer/);
  assert.ok(!/Next,/.test(t), `invented a next step: "${t}"`);
});

check('Rocky speaks each moment once, and not twice inside the rate limit', () => {
  const said = [];
  const rocky = { announce: (text) => said.push(text) };
  let box = null;
  const pos = position({ lastCompletion: { kind: 'count-grew', from: 3, to: 4, at: 100000 }, page: 'Policies' });
  const M = load({
    LabPilotPosition: pos, LabPilotRocky: rocky,
    document: { querySelector: () => box },
  });
  // mentor.js reads `document` from its own scope, so drive the guard through the global the
  // loader gave it. Without a box, the moment is spoken.
  M.note();
  assert.strictEqual(said.length, 1, `expected one spoken moment, got ${said.length}`);
  assert.match(said[0], /the list went from 3 to 4/);

  // A second, different completion inside the gap must NOT produce a second sentence.
  pos.read = ((orig) => () => {
    const st = orig();
    st.lastCompletion = { kind: 'count-grew', from: 4, to: 5, at: 100000 + 2000 };
    return st;
  })(pos.read);
  M.note();
  assert.strictEqual(said.length, 1, 'Rocky talked over himself inside the rate limit');
  assert.strictEqual(M.journey().length, 2, 'the second accomplishment should still be RECORDED');
});

check('an open ask box silences the teaching moment', () => {
  /*
   * Someone typing a question is the least stuck a learner ever is. Interrupting that is the
   * Clippy failure in its purest form, and recovery.js already follows this exact rule.
   * The accomplishment is still RECORDED — only the interruption is withheld.
   */
  const said = [];
  const M = load(
    { LabPilotPosition: position({ lastCompletion: { kind: 'count-grew', from: 3, to: 4, at: 100000 }, page: 'P' }),
      LabPilotRocky: { announce: (t) => said.push(t) } },
    { querySelector: (sel) => (sel === 'input[data-labpilot]' ? { id: 'ask' } : null) });
  M.note();
  assert.deepStrictEqual(said, [], 'Rocky talked over a learner who was typing a question');
  assert.strictEqual(M.journey().length, 1, 'the accomplishment should still be recorded');
});

/* ---- 4. why it matters ------------------------------------------------------------------------- */

check('why: the guide author\'s own note wins', () => {
  const M = load({});
  const w = M.why({ text: 'Select Save.', learn: { why: 'Auditing must be on before anything is logged.', what: '' } }, 0);
  assert.strictEqual(w.source, 'guide-notes');
  assert.match(w.text, /Auditing must be on/);
});

check('why: falls back to the knowledge base, then to what it unlocks, then to nothing', () => {
  const kb = { lookup: () => ({ what: 'the button that saves the policy.', does: 'It commits your changes.' }) };
  const M = load({ LabPilotKB: kb });
  const w = M.why({ text: 'Select Save.', targets: [{ n: 1, label: 'Save' }] }, 0);
  assert.strictEqual(w.source, 'knowledge-base');
  assert.match(w.text, /saves the policy/);

  const bare = load({});
  assert.strictEqual(bare.why({ text: 'Do a thing.', targets: [] }, 0), null,
    'Rocky invented a reason with no source for one');
});

check('why: a knowledge base that throws costs Rocky nothing', () => {
  const M = load({ LabPilotKB: { lookup: () => { throw new Error('boom'); } } });
  assert.doesNotThrow(() => M.why({ text: 'Select Save.', targets: [{ n: 1, label: 'Save' }] }, 0));
});

/* ---- 5. the model's grounding ------------------------------------------------------------------- */

check('the prompt block tells the model plainly when NOTHING has been accomplished', () => {
  /*
   * The single most valuable line in the block. Asked "what have I done so far?" with no
   * accomplishments in context, a model will produce a confident, plausible, invented summary —
   * observed. Being told explicitly that there is nothing is what stops it.
   */
  const M = load({ LabPilotPosition: position({ page: 'Home' }) });
  const p = M.promptBlock();
  assert.match(p, /OBSERVED ACCOMPLISHMENTS: none yet/);
  assert.match(p, /Do NOT tell the learner they have completed anything/);
});

check('the prompt block lists real accomplishments with their evidence', () => {
  const M = load({
    LabPilotPosition: position({
      lastCompletion: { kind: 'count-grew', from: 3, to: 4, at: 1000 }, page: 'Policies',
    }),
  });
  M.note();
  const p = M.promptBlock();
  assert.match(p, /OBSERVED ACCOMPLISHMENTS/);
  assert.match(p, /the list went from 3 to 4/);
  assert.match(p, /on Policies/);
  assert.ok(!/none yet/.test(p), 'claimed nothing had happened when something had');
});

check('the prompt block forbids inventing a consequence when there is none', () => {
  const M = load({ LabPilotPosition: position({ page: 'Home' }) });
  assert.match(M.promptBlock(), /do not claim a consequence for skipping it/);
});

check('the prompt block still carries Position\'s own grounding sentence', () => {
  const M = load({ LabPilotPosition: position({ promptLine: 'The learner is on step 2 of 7.' }) });
  assert.match(M.promptBlock(), /The learner is on step 2 of 7\./);
});

/* ---- 6. it does not run where it must not ------------------------------------------------------- */

check('a child frame gets no mentor at all', () => {
  // One mentor per frame would mean several journeys, none of them whole.
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'mentor.js'), 'utf8');
  const win = { LabPilotFrame: { isTop: false, ownsUI: false } };
  new Function('window', code)(win);
  assert.strictEqual(win.LabPilotMentor, undefined, 'the mentor loaded in a child frame');
});

check('no Position means an honest empty brief, not a crash', () => {
  const M = load({});
  const b = M.brief();
  assert.strictEqual(b.ready, false);
  assert.strictEqual(b.where, null);
  assert.strictEqual(b.did, null);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky teaches from evidence, and stays quiet without it.\n`);
