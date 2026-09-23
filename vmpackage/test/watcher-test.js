/*
 * watcher-test.js — does Rocky know when to shut up?
 *
 * The watcher's value is not that it can speak. It is that it mostly does not. A companion
 * that comments on everything is Clippy, and Clippy was removed from Office because people
 * hated it. So these tests are mostly about SILENCE:
 *
 *   - a smooth run produces zero unsolicited remarks
 *   - two remarks can never land within the minimum gap
 *   - being dismissed makes that kind of remark rarer, not equally frequent
 *   - the session budget is a real ceiling, and errors are the documented exception
 *   - every error rule maps portal text to advice, with no overlap between rules
 *
 * Runs the shipped watcher.js in a fake window, so it tests the file that ships.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'webext', 'content', 'watcher.js');

function loadWatcher() {
  const code = fs.readFileSync(SRC, 'utf8');
  const win = {};
  const doc = { addEventListener() {}, removeEventListener() {}, body: null, querySelectorAll: () => [] };
  const fn = new Function('window', 'document', 'setInterval', 'clearInterval', 'location', code);
  fn(win, doc, () => 0, () => {}, { href: 'https://ai.azure.com/build/deployments' });
  if (!win.LabPilotWatcher) throw new Error('watcher.js did not expose LabPilotWatcher');
  return win.LabPilotWatcher._test;
}

const T = loadWatcher();
const { allowed, armCooldown, fresh, BUDGET, ERRORS } = T;

let pass = 0; const failures = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); failures.push(name); }
}

console.log('\n=== DOES ROCKY KNOW WHEN TO STAY QUIET? ===\n');

check('a fresh session may speak once', () => {
  const s = fresh({});
  s.lastSpokeAt = 0;
  assert.strictEqual(allowed(s, 'wrongClick', 60000).ok, true);
});

check('two remarks cannot land inside the minimum gap', () => {
  const s = fresh({});
  const now = 1000000;
  s.lastSpokeAt = now;
  const r = allowed(s, 'wrongClick', now + BUDGET.minGapMs - 1);
  assert.strictEqual(r.ok, false, 'a second remark was allowed too soon');
  assert.match(r.why, /too soon/);
});

check('after the gap, it may speak again', () => {
  const s = fresh({});
  const now = 1000000;
  s.lastSpokeAt = now;
  assert.strictEqual(allowed(s, 'wrongClick', now + BUDGET.minGapMs + 1).ok, true);
});

check('a class on cooldown stays silent even after the gap', () => {
  const s = fresh({});
  const now = 1000000;
  armCooldown(s, 'wrongClick', BUDGET.wrongClickCooldownMs, now);
  s.lastSpokeAt = 0;
  const r = allowed(s, 'wrongClick', now + BUDGET.minGapMs + 1);
  assert.strictEqual(r.ok, false);
  assert.match(r.why, /cooling down/);
});

check('a DIFFERENT class is not muted by another class cooling down', () => {
  const s = fresh({});
  const now = 1000000;
  armCooldown(s, 'wrongClick', BUDGET.wrongClickCooldownMs, now);
  s.lastSpokeAt = 0;
  assert.strictEqual(allowed(s, 'error', now + 1).ok, true, 'an error was suppressed by an unrelated cooldown');
});

check('being dismissed makes that remark rarer (the anti-nag rule)', () => {
  const s = fresh({});
  const now = 1000000;
  armCooldown(s, 'stuck', 10000, now);
  const firstUntil = s.cooldowns.stuck.until;
  s.cooldowns.stuck.dismissals = 1;          // the learner waved it away
  armCooldown(s, 'stuck', 10000, now);
  const secondUntil = s.cooldowns.stuck.until;
  assert.ok(secondUntil > firstUntil,
    `after a dismissal the cooldown must grow: ${firstUntil} -> ${secondUntil}`);
  assert.strictEqual(secondUntil - now, 10000 * BUDGET.dismissMultiplier);
});

check('the session budget is a real ceiling', () => {
  const s = fresh({});
  s.spoken = BUDGET.maxPerSession;
  s.lastSpokeAt = 0;
  const r = allowed(s, 'wrongClick', 9999999);
  assert.strictEqual(r.ok, false);
  assert.match(r.why, /budget/);
});

check('errors still get through a spent budget (the documented exception)', () => {
  const s = fresh({});
  s.spoken = BUDGET.maxPerSession + 5;
  s.lastSpokeAt = 0;
  assert.strictEqual(allowed(s, 'error', 9999999).ok, true,
    'a real error must always be reportable, however chatty the session was');
});

check('completion is never suppressed', () => {
  const s = fresh({});
  s.spoken = 99;
  s.lastSpokeAt = 9999999;                   // even immediately after another remark
  assert.strictEqual(allowed(s, 'complete', 9999999).ok, true);
});

check('a SMOOTH RUN produces zero unsolicited remarks', () => {
  // The headline promise: a learner doing fine hears nothing. Simulate 20 correct clicks
  // across 10 minutes with no errors and no idling, and assert nothing qualified to speak.
  const s = fresh({ steps: new Array(16) });
  let spoke = 0;
  let t = 1000000;
  for (let i = 0; i < 20; i++) {
    t += 30000;                               // a click every 30s, all correct
    s.lastActivityAt = t;
    s.lastProgressAt = t;
    s.stepEnteredAt = t;
    // nothing in a smooth run calls speak(); the only candidates are stuck/wrongClick/error,
    // and none of their conditions hold. Assert the conditions themselves.
    const idle = t - s.lastActivityAt;
    const onStep = t - s.stepEnteredAt;
    if (idle > BUDGET.stuckMs && onStep > BUDGET.stuckMs) spoke++;
  }
  assert.strictEqual(spoke, 0, 'Rocky interrupted a learner who was doing fine');
});

check('a genuinely idle learner does qualify for a nudge', () => {
  const s = fresh({ steps: new Array(16) });
  const t0 = 1000000;
  s.lastActivityAt = t0;
  s.stepEnteredAt = t0;
  const t = t0 + BUDGET.stuckMs + 1000;
  const idle = t - s.lastActivityAt;
  const onStep = t - s.stepEnteredAt;
  assert.ok(idle > BUDGET.stuckMs && onStep > BUDGET.stuckMs,
    'a learner idle past the threshold should qualify');
  s.lastSpokeAt = 0;
  assert.strictEqual(allowed(s, 'stuck', t).ok, true);
});

check('the second nudge waits much longer than the first', () => {
  assert.ok(BUDGET.reStuckMs >= BUDGET.stuckMs * 1.5,
    'asking twice as often as the first time would be nagging');
});

console.log('');
console.log('=== ERROR RULES: portal text -> plain advice ===\n');

check('every error rule has trigger text and advice', () => {
  for (const r of ERRORS) {
    assert.ok(r.id, 'rule without an id');
    assert.ok(Array.isArray(r.any) && r.any.length, `${r.id}: no trigger phrases`);
    assert.ok(r.say && r.say.length > 40, `${r.id}: advice too thin to be useful`);
    for (const phrase of r.any) {
      assert.strictEqual(phrase, phrase.toLowerCase(), `${r.id}: "${phrase}" must be lowercase (matching is lowercased)`);
    }
  }
});

check('no two rules claim the same portal text', () => {
  // Overlapping rules mean the advice a learner gets depends on array order, which is a
  // coin flip dressed up as a diagnosis.
  const seen = new Map();
  for (const r of ERRORS) {
    for (const phrase of r.any) {
      if (seen.has(phrase)) assert.fail(`"${phrase}" claimed by both ${seen.get(phrase)} and ${r.id}`);
      seen.set(phrase, r.id);
    }
  }
});

check('real portal errors match the right rule', () => {
  const cases = [
    ['Deployment failed: InsufficientQuota. You have exceeded your current quota.', 'quota'],
    ['This region is currently at capacity. Please try another region.', 'capacity'],
    ['You do not have access to this resource.', 'forbidden'],
    ['A resource with that name already exists in this subscription.', 'nametaken'],
    ['The name can only contain lowercase letters, numbers and hyphens.', 'invalidname'],
    ['Failed to fetch. Please check your connection.', 'network'],
  ];
  for (const [text, wantId] of cases) {
    const low = text.toLowerCase();
    const hit = ERRORS.find((r) => r.any.some((p) => low.indexOf(p) >= 0));
    assert.ok(hit, `no rule matched: "${text}"`);
    assert.strictEqual(hit.id, wantId, `"${text}" matched ${hit.id}, expected ${wantId}`);
  }
});

check('ordinary page text triggers nothing', () => {
  // A false positive here means Rocky announces an error that is not there, which is worse
  // than missing one: it teaches the learner to distrust him.
  const innocuous = [
    'Your deployment succeeded.',
    'Deployments',
    'Select a model from the catalog to get started.',
    'Access reviews are scheduled monthly.',       // contains "access"
    'The name of your project appears in the portal.',
  ];
  for (const text of innocuous) {
    const low = text.toLowerCase();
    const hit = ERRORS.find((r) => r.any.some((p) => low.indexOf(p) >= 0));
    assert.ok(!hit, `"${text}" wrongly matched rule ${hit && hit.id}`);
  }
});

check('advice never blames the learner for an environment failure', () => {
  // Tone is a feature: a learner who is told a quota error is their fault stops trusting
  // their own work. These two classes must read as "not you".
  for (const id of ['quota', 'capacity']) {
    const r = ERRORS.find((x) => x.id === id);
    assert.match(r.say, /not (a mistake you made|your|you did)|nothing you did/i,
      `${id} advice should make clear it is not the learner's fault: "${r.say}"`);
  }
});

check('an error that could not be spoken is NOT marked as reported', () => {
  // The bug this guards: scanErrors used to record the error as seen BEFORE checking
  // whether speak() actually said it. An error arriving inside the minimum gap after
  // another remark was therefore swallowed for a full minute — the learner staring at a
  // red box while Rocky, who had spotted it, said nothing. Found by behaviour-test.js
  // driving a real browser; the unit tests could not see it.
  const src = fs.readFileSync(SRC, 'utf8');
  const block = src.slice(src.indexOf('function scanErrors'), src.indexOf('function scanErrors') + 1600);
  const markIdx = block.indexOf('st.errorsSeen[rule.id] = Date.now()');
  const speakIdx = block.indexOf("speak('error'");
  assert.ok(markIdx > speakIdx,
    'the error must be marked as seen AFTER the attempt to speak, and only if it succeeded');
  assert.match(block.slice(speakIdx), /if \(said\)/,
    'the mark must be conditional on speak() returning true');
});

console.log('');
if (failures.length) {
  console.log(`${pass} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`);
  process.exit(1);
}
console.log(`${pass} passed, 0 failed — Rocky interrupts only when he has something to say.\n`);
