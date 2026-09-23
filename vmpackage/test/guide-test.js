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

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky can work out the steps of a lab nobody captured.\n`);
