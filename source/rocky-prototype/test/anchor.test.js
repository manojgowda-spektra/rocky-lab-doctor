// Rocky Copilot — the accuracy contract, asserted.
//
// The Copilot's central claim is "never a wrong glow": Rocky either points at the right
// control or it points at nothing and says so. That is not a hope about tuning, it is three
// rules in anchor.js — hard-fail on contradiction, a confidence floor, and an ambiguity
// margin. These tests are what make the claim checkable rather than rhetorical.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const A = require('../../../webext/anchor.js');

const el = (o = {}) => ({ tag: 'button', role: 'button', text: '', name: '', testId: null, containerText: '', disabled: false, hidden: false, ...o });

test('resolves a confident, unambiguous match', () => {
  const r = A.resolve([
    el({ text: 'Deploy', testId: 'deploy-btn' }),
    el({ text: 'Cancel' }),
  ], { text: 'Deploy', testId: 'deploy-btn', role: 'button' });
  assert.equal(r.state, 'resolved');
  assert.equal(r.target.testId, 'deploy-btn');
  assert.ok(r.score >= A.MIN_SCORE);
});

test('a contradicted attribute is a HARD fail, never merely a low score', () => {
  // Same visible text, but the step names a test id and the candidate carries a different one.
  const r = A.resolve([el({ text: 'Deploy', testId: 'delete-btn' })], { text: 'Deploy', testId: 'deploy-btn' });
  assert.notEqual(r.state, 'resolved', 'must never resolve onto a contradicting element');
  assert.equal(r.state, 'absent');
});

test('absent information is NOT a contradiction — a sparse page still resolves', () => {
  // The candidate simply has no test id. That is missing evidence, not conflicting evidence.
  const r = A.resolve([el({ text: 'Deploy' }), el({ text: 'Documentation', tag: 'a', role: 'link' })],
    { text: 'Deploy', testId: 'deploy-btn', role: 'button' });
  assert.equal(r.state, 'resolved');
  assert.equal(r.target.text, 'Deploy');
});

test('two near-identical controls are refused, not guessed between', () => {
  const r = A.resolve([
    el({ text: 'Deploy', name: 'Deploy' }),
    el({ text: 'Deploy', name: 'Deploy' }),
  ], { text: 'Deploy', role: 'button' });
  assert.equal(r.state, 'ambiguous');
  assert.match(r.reason, /too close/);
});

test('a weak partial match is refused by the confidence floor', () => {
  const r = A.resolve([el({ text: 'Deployment history', tag: 'a', role: 'link' })],
    { textExact: 'Deploy', role: 'button', tag: 'button', testId: 'deploy-btn' });
  assert.notEqual(r.state, 'resolved');
});

test('a disabled control is never glowed unless the step allows it', () => {
  const spec = { text: 'Deploy', testId: 'deploy-btn' };
  assert.notEqual(A.resolve([el({ text: 'Deploy', testId: 'deploy-btn', disabled: true })], spec).state, 'resolved');
  assert.equal(A.resolve([el({ text: 'Deploy', testId: 'deploy-btn', disabled: true })],
    { ...spec, allowDisabled: true }).state, 'resolved');
});

test('a hidden control is never glowed', () => {
  const r = A.resolve([el({ text: 'Deploy', testId: 'deploy-btn', hidden: true })], { text: 'Deploy', testId: 'deploy-btn' });
  assert.notEqual(r.state, 'resolved');
});

test('missing control reports absent, so the UI can say so honestly', () => {
  const r = A.resolve([el({ text: 'Cancel' }), el({ text: 'Help' })], { text: 'Deploy', testId: 'deploy-btn' });
  assert.equal(r.state, 'absent');
});

test('empty page is absent, never a crash', () => {
  assert.equal(A.resolve([], { text: 'Deploy' }).state, 'absent');
  assert.equal(A.resolve(null, { text: 'Deploy' }).state, 'absent');
});

test('container text disambiguates two identical buttons on different cards', () => {
  // THE canonical case in the live flow: every model card has its own "Deploy" button, and the
  // surrounding card text is the only thing that tells them apart. `near` is weighted as a real
  // disambiguator for exactly this reason — if Rocky refused here it could not run the demo.
  const r = A.resolve([
    el({ text: 'Deploy', containerText: 'gpt-4o-mini  Base model' }),
    el({ text: 'Deploy', containerText: 'gpt-5  Base model' }),
  ], { text: 'Deploy', near: 'gpt-5' });
  assert.equal(r.state, 'resolved');
  assert.match(r.target.containerText, /gpt-5/, 'must land on the gpt-5 card, not the neighbour');
  assert.ok(r.score - r.runnerUp >= A.MARGIN, 'and it must win by a real margin, not a hair');
});

test('but with NOTHING to tell them apart, identical controls are still refused', () => {
  // The safety half of the same rule: remove the distinguishing container and Rocky must abstain.
  const r = A.resolve([
    el({ text: 'Deploy', containerText: 'Base model' }),
    el({ text: 'Deploy', containerText: 'Base model' }),
  ], { text: 'Deploy', near: 'gpt-5' });
  assert.equal(r.state, 'ambiguous');
});

test('exact-text steps refuse a superstring match', () => {
  const r = A.resolve([el({ text: 'Deploy all models', testId: 'deploy-btn' })], { textExact: 'Deploy', testId: 'deploy-btn' });
  assert.notEqual(r.state, 'resolved');
});

test('scoring is deterministic — same input, same output, every time', () => {
  const cands = [el({ text: 'Deploy', testId: 'deploy-btn' }), el({ text: 'Deploys' })];
  const spec = { text: 'Deploy', testId: 'deploy-btn', role: 'button' };
  const runs = Array.from({ length: 25 }, () => JSON.stringify(A.resolve(cands, spec)));
  assert.equal(new Set(runs).size, 1, 'the resolver must have no randomness anywhere');
});

test('the published thresholds are the ones actually enforced', () => {
  // The submission and the UI both quote these numbers; if they drift, this fails.
  assert.equal(A.MIN_SCORE, 0.7);
  assert.equal(A.MARGIN, 0.2);
});

test('every step in the shipped Foundry bundle is well-formed', () => {
  const bundle = require('../../../webext/steps/foundry.json');
  assert.ok(bundle.steps.length >= 10, 'bundle should carry the full demo flow');
  const seen = new Set();
  for (const [i, s] of bundle.steps.entries()) {
    assert.ok(s.id, `step ${i} needs an id`);
    assert.ok(!seen.has(s.id), `duplicate step id: ${s.id}`);
    seen.add(s.id);
    assert.ok(s.say && s.say.length > 3, `step ${s.id} needs spoken text`);
    assert.ok(s.match || s.await === 'url', `step ${s.id} needs a match spec`);
    if (s.match) {
      const keys = Object.keys(s.match);
      assert.ok(keys.some((k) => ['text', 'textExact', 'name', 'testId'].includes(k)),
        `step ${s.id} must identify the control by text, name or testId`);
    }
  }
});
