/*
 * guide-test.js — can Rocky read a real lab guide and work out what to point at?
 *
 * Every line below is VERBATIM from the Microsoft IQ workshop guide — the lab that will be
 * on screen for the demo. Not invented examples: if the parser handles these, it handles
 * the real thing, and if it does not, the demo fails in front of people.
 *
 * What is being tested is the CLAIM that makes Rocky worth having next to CloudLabs Copilot:
 * that he can work out the click targets for a lab nobody captured in advance. Copilot reads
 * the guide because the platform hands it over; this reads the same guide off the screen.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadReader() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'guide-reader.js'), 'utf8');
  const win = {};
  const doc = {
    readyState: 'complete',
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  new Function('window', 'document', 'setInterval', code)(win, doc, () => 0);
  if (!win.LabPilotGuide) throw new Error('guide-reader.js did not expose LabPilotGuide');
  return win.LabPilotGuide._test;
}

const G = loadReader();
let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

console.log('\n=== CAN ROCKY READ A REAL LAB GUIDE? ===\n');
console.log('Source: Microsoft IQ workshop guide, verbatim\n');

// ---- the ordered multi-click instructions, which are most of this lab -------------------
check('"Select File (1) and then Open Folder (2)" -> two targets, in order', () => {
  const r = G.parseLine('Select File (1) and then Open Folder (2).');
  assert.ok(r, 'nothing parsed');
  assert.strictEqual(r.targets.length, 2, `got ${r.targets.length} targets`);
  // "Select File" (a menu named File) and "Open Folder" (a button named Open Folder) both
  // start with a verb, and the text alone cannot distinguish them. The parser offers both
  // readings; the resolver picks whichever actually exists on the page, or refuses.
  const reading = (t) => [t.label].concat(t.alt || []);
  assert.ok(reading(r.targets[0]).includes('File'), `no 'File' reading: ${JSON.stringify(reading(r.targets[0]))}`);
  assert.ok(reading(r.targets[1]).includes('Open Folder'), `no 'Open Folder' reading: ${JSON.stringify(reading(r.targets[1]))}`);
});

check('"Click Auto (1) and then set the model to Claude Sonnet 5 (2)"', () => {
  const r = G.parseLine('Click Auto (1) and then set the model to Claude Sonnet 5 (2).');
  assert.ok(r);
  assert.strictEqual(r.targets[0].label, 'Auto');
  assert.match(r.targets[1].label, /Claude Sonnet 5/);
});

check('a three-step instruction keeps all three, in author order', () => {
  const r = G.parseLine('Navigate to C:\\Files (1), then select MicrosoftIQAccelerator (2) zip file and then Open (3).');
  assert.ok(r);
  assert.strictEqual(r.targets.length, 3, `got ${r.targets.length}`);
  assert.deepStrictEqual(r.targets.map((t) => t.n), [1, 2, 3]);
});

check('"Click on the elipses (1) and then Remove (2)" — typo and all', () => {
  const r = G.parseLine('Click on the elipses (1) and then Remove (2).');
  assert.ok(r);
  assert.strictEqual(r.targets.length, 2);
  assert.strictEqual(r.targets[1].label, 'Remove');
});

check('"Select Add data (1) drop down and then Data source (2)"', () => {
  const r = G.parseLine('Select Add data (1) drop down and then Data source (2).');
  assert.ok(r);
  assert.strictEqual(r.targets.length, 2);
});

// ---- plain single instructions -------------------------------------------------------------
check('"Click on Continue with GitHub to sign in to GitHub Copilot."', () => {
  const r = G.parseLine('Click on Continue with GitHub to sign in to GitHub Copilot.');
  assert.ok(r, 'nothing parsed');
  assert.strictEqual(r.targets.length, 1);
  assert.match(r.targets[0].label, /Continue with GitHub/);
});

check('"Select Authorize Visual Studio Code."', () => {
  const r = G.parseLine('Select Authorize Visual Studio Code.');
  assert.ok(r);
  assert.match(r.targets[0].label, /Authorize Visual Studio Code/);
});

check('"Click on Publish."', () => {
  const r = G.parseLine('Click on Publish.');
  assert.ok(r);
  assert.strictEqual(r.targets[0].label, 'Publish');
});

// ---- the honest refusals: prose is not an instruction ---------------------------------------
check('narrative prose produces no targets', () => {
  // A parser that turns every sentence into a click target would have Rocky hunting for
  // controls that do not exist, which is how "finding this step" becomes permanent.
  const prose = [
    'Whiteboarding helps technical teams to quickly align on business goals.',
    'This workshop helps technical teams design and deliver integrated Microsoft IQ solutions.',
    'Wait for the deployment to complete. This may take approximately 20-30 minutes.',
    'Typical execution time: 30 seconds to 2 minutes.',
  ];
  for (const line of prose) {
    const r = G.parseLine(line);
    assert.strictEqual(r, null, `prose was parsed as an instruction: "${line}"`);
  }
});

check('a vague reference is not treated as a control label', () => {
  // "the provided GitHub username" names no control; glowing something for it would be a guess.
  assert.strictEqual(G.plausibleLabel('provided GitHub username'), false);
  assert.strictEqual(G.plausibleLabel('following'), false);
  assert.strictEqual(G.plausibleLabel('newly created Resource Group'), false);
  assert.strictEqual(G.plausibleLabel('Get Started'), true);
});

// ---- surfaces Rocky cannot see -----------------------------------------------------------------
check('a VS Code step is flagged, not hunted for in the browser', () => {
  const r = G.parseLine('Click on the Visual Studio Code from the VM desktop.');
  assert.ok(r);
  assert.strictEqual(r.surface, 'VS Code', `classified as ${r.surface}`);
});

check('a Windows file dialog is flagged as outside the page', () => {
  const r = G.parseLine('Select File (1) and then Open Folder (2).');
  assert.ok(r);
  assert.notStrictEqual(r.surface, 'browser', 'a native Open Folder dialog was treated as a web control');
});

check('an ordinary portal step stays on the browser surface', () => {
  const r = G.parseLine('Click on Publish.');
  assert.strictEqual(r.surface, 'browser');
});

// ---- the OTHER real idiom: bold as the target marker -------------------------------------
// Verbatim from Know Your Data (SMB), template 15549 — the lab actually being demoed. Its
// instructions carry NO (1)(2) markers, so the original parser managed 4% of them: one target
// out of 27 instructions. The authors mark what you click in **bold** instead, left to right.
check('a breadcrumb path yields each hop in order', () => {
  const r = G.parseLine('Open **Data loss prevention** > **Settings** > **Endpoint DLP settings**.');
  assert.ok(r, 'nothing parsed');
  const labels = r.targets.map((t) => t.label);
  assert.deepStrictEqual(labels, ['Data loss prevention', 'Settings', 'Endpoint DLP settings'],
    `got ${JSON.stringify(labels)}`);
});

check('a compound instruction yields both actions', () => {
  const r = G.parseLine('Select **Create or customize advanced DLP rules**, then create a rule named **Zava Discovery Sensitive Data Rule**.');
  assert.ok(r);
  assert.strictEqual(r.targets.length, 2, `got ${r.targets.length}`);
  assert.strictEqual(r.targets[0].label, 'Create or customize advanced DLP rules');
});

check('a value to TYPE is not treated as a control to find', () => {
  // Backticked values are things the learner invents and types. Glowing one would be a wrong
  // glow at a control that does not exist yet.
  const r = G.parseLine('Choose **Common rules** and create the rule `Zava High-Risk Identity Data Rule`.');
  assert.ok(r);
  const labels = r.targets.map((t) => t.label);
  assert.deepStrictEqual(labels, ['Common rules'], `a typed value became a target: ${JSON.stringify(labels)}`);
});

check('most of the REAL demo lab now yields targets', () => {
  // Verbatim instruction lines from the four challenge files.
  const page = [
    'Open **OneDrive**, create a folder named **Zava Discovery Documents**, and confirm that the folder opens successfully.',
    'Select **Create or customize advanced DLP rules**, then create a rule named **Zava Discovery Sensitive Data Rule**.',
    'Select **Custom** > **Custom policy**, then enter the policy name `Zava Auto-Label Policy`.',
    'Select `Zava Highly Confidential` as the label to auto-apply. Keep the administrative-unit scope at **Full directory**.',
    'Choose **Common rules** and create the rule `Zava High-Risk Identity Data Rule`.',
    'Open **Settings** > **Device onboarding** > **Device report**.',
    'Set **Service domains** to **Block**.',
    'Open **Data loss prevention** > **Settings** > **Endpoint DLP settings** > **Browser and domain restrictions to sensitive data**.',
  ];
  const steps = G.parseGuide(page);
  const ratio = steps.length / page.length;
  const targets = steps.reduce((n, s) => n + s.targets.length, 0);
  console.log(`         ${steps.length}/${page.length} lines (${Math.round(ratio * 100)}%), ${targets} click targets`);
  assert.ok(ratio >= 0.7, `only ${Math.round(ratio * 100)}% of the demo lab parsed`);
});

// ---- the whole-guide measurement ---------------------------------------------------------------
check('most of a real guide page yields targets', () => {
  const page = [
    'Click on Continue with GitHub to sign in to GitHub Copilot.',
    'On the Sign in to GitHub tab, enter the provided GitHub username (1) in the input field, and click on Sign in with your identity provider to continue (2).',
    'Click on Continue on the Single sign-on to CloudLabs Organizations page to proceed.',
    'Click on Accept.',
    'Select Continue to Authorize Visual Studio Code.',
    'Select Authorize Visual Studio Code.',
    'Select Open.',
    'Once the Visual Studio code opens, choose any desired theme (1) and then click Get Started (2).',
    'Select File (1) and then Open Folder (2).',
    'From the GitHub Copilot Chat, select Models (1) and then select Trust Workspace to enable models (2).',
    'Click on Default permission (1) and then set it to Allow all (2).',
    'Click on the App launcher (1) and select Microsoft fabric icon.',
    'Click on Publish.',
    'Go to Solutions (1) and then select Import solution (2).',
  ];
  const steps = G.parseGuide(page);
  const ratio = steps.length / page.length;
  console.log(`         ${steps.length}/${page.length} lines yielded targets (${Math.round(ratio * 100)}%)`);
  const targets = steps.reduce((n, s) => n + s.targets.length, 0);
  console.log(`         ${targets} click targets in total`);
  assert.ok(ratio >= 0.7, `only ${Math.round(ratio * 100)}% parsed — Rocky would be silent on most of the lab`);
  assert.ok(targets >= page.length, 'fewer targets than instructions — the ordered ones were lost');
});

check('the purpose clause the guide wrote is KEPT, not thrown away', () => {
  // dropPurpose() strips it off the control name — correct — and used to discard it. It is the
  // author saying why, and on a parsed lab it is the only such sentence there is.
  const r = G.parseLine('Click on Continue with GitHub to sign in to GitHub Copilot.');
  assert.strictEqual(r.why, 'to sign in to GitHub Copilot', JSON.stringify(r.why));
  assert.strictEqual(r.targets[0].label, 'Continue with GitHub', 'keeping the why must not cost the target');
});

check('a contentless purpose ("to proceed") is not a why', () => {
  // The extractor on its own, then on a line the rules parse. "to proceed" explains nothing and
  // would have Rocky say "this step is here to proceed".
  assert.strictEqual(G.purposeOf('Click on Continue to proceed.'), null);
  assert.strictEqual(G.purposeOf('Select Next to continue.'), null);
  assert.strictEqual(G.purposeOf('Click Continue with GitHub to sign in to GitHub Copilot.'), 'to sign in to GitHub Copilot');
  const r = G.parseLine('Click on Continue to proceed.');
  assert.ok(r, 'the line should still parse to a target');
  assert.strictEqual(r.why, null, 'Rocky would say "this step is here to proceed": ' + JSON.stringify(r.why));
});

check('a purpose clause is never taken from a sentence that says NOT to', () => {
  /*
   * MEASURED, and it was the failure this project exists to prevent. On the 136 real Zava lines
   * the first purposeOf() produced five clauses; three were false positives and two of those
   * INVERTED the guide. Every one of the five is pinned here, verbatim.
   */
  // Inverted: the guide says do NOT do this for that reason.
  assert.strictEqual(G.purposeOf(
    'Preserve any indicators that were already enabled. Do not disable unrelated tenant settings merely to make the page contain only four selections.'),
    null, 'Rocky would say "this step is here to make the page contain only four selections" — the opposite of the guide');
  // A page name read as a verb.
  assert.strictEqual(G.purposeOf('Correct any mismatch with Edit, return to Review, and select Submit.'), null,
    '"to Review" is a page, not a purpose');
  // A control being described, inside a negated sentence.
  assert.strictEqual(G.purposeOf(
    'Use the operator-provided removable-storage test device. Do not select the option to allow an override.'),
    null, 'a described option became a purpose');
  // The instruction itself, in the "Use <tool> to <do it>" form.
  assert.strictEqual(G.purposeOf('Use Word for the web to create Zava-Customer-Payments.docx in that folder.'), null,
    'the action was restated as its own purpose');
  // The one genuine clause on the corpus survives every guard.
  assert.strictEqual(G.purposeOf(
    'Open one SharePoint document and the OneDrive document to confirm that the uploads are readable and retain their synthetic values.'),
    'to confirm that the uploads are readable and retain their synthetic values');
});

check('MEASURED: no why on the real corpus comes from a negated sentence', () => {
  // The general form of the guard, over every real line, so a new false positive cannot creep
  // back in through a wording the five cases above do not cover.
  const Z = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-zava-guide.json'), 'utf8'));
  const lines = [].concat(...Object.values(Z));
  let produced = 0;
  for (const l of lines) {
    const w = G.purposeOf(l);
    if (!w) continue;
    produced++;
    assert.ok(!/\b(do not|don['’]t|never|merely)\b/i.test(l), 'a why from a negated line: ' + JSON.stringify(w) + ' <- ' + l.slice(0, 100));
    assert.ok(!/^\s*use\b/i.test(l), 'a "Use … to …" instruction became a why: ' + JSON.stringify(w));
  }
  console.log(`         ${produced} purpose clause(s) from ${lines.length} real lines`);
  assert.ok(produced >= 1, 'the extractor has gone silent on the corpus');
  assert.ok(produced <= 4, `${produced} clauses from a corpus that measured five before the guards — a guard has been lost`);
});

check('a task heading attaches to every step under it, and the objective is kept', () => {
  const lines = [
    'In this challenge, you will enable four Office indicators and create the custom policy.',
    'Task 1: Enable the four required global indicators',
    'Open **Settings** > **Policy indicators**.',
    'Select **Save** and wait for the success notification.',
    'Task 2: Create the custom departing-user policy',
    'Select **Create policy** > **Custom policy**.',
  ];
  const out = G.parseLines(lines);
  assert.strictEqual(out.objective, 'enable four Office indicators and create the custom policy.');
  const tasks = out.steps.map((s) => s.task);
  assert.ok(tasks.slice(0, -1).every((t) => t === 'Enable the four required global indicators'),
    'task 1 steps carry the wrong task: ' + JSON.stringify(tasks));
  assert.strictEqual(tasks[tasks.length - 1], 'Create the custom departing-user policy');
  // The heading and the objective are context, not steps to point at — and not lines to send
  // to the AI assist either, which would hand them back as bogus steps. A mutation sweep showed
  // the first assertion alone did not isolate this: the heading never parsed as a step anyway,
  // so the guard's real job is keeping it out of the unparsed bucket.
  assert.ok(out.steps.every((s) => !/^Task \d/.test(s.text)), 'a Task heading became a step');
  assert.ok(out.unparsed.every((l) => !/^Task \d/.test(l)), 'a Task heading was queued for the AI assist: ' + JSON.stringify(out.unparsed));
  assert.ok(out.unparsed.every((l) => !/^In this challenge/.test(l)), 'the objective was queued for the AI assist');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky can work out the steps of a lab nobody captured.\n`);
