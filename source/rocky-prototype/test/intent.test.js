const { test } = require('node:test');
const assert = require('node:assert');
const { parseInput, classify, detectStruggle } = require('../src/intent');

test('parses slash commands', () => {
  assert.deepEqual(parseInput('/hint').action, 'set-level');
  assert.equal(parseInput('/hint').command, 'hint');
  assert.equal(parseInput('/check').action, 'check');
  assert.equal(parseInput('/why how does this work').arg, 'how does this work');
  assert.equal(parseInput('/quit').action, 'quit');
  assert.equal(parseInput('/bogus').action, 'unknown');
});

test('classifies free-form intent', () => {
  assert.equal(classify('did I do it right?'), 'check');
  assert.equal(classify('why does this keep failing'), 'why');
  assert.equal(classify('just give me the answer'), 'answer-request');
  assert.equal(classify("I'm stuck and confused"), 'stuck');
  assert.equal(classify('create a virtual network'), 'general');
});

test('detects struggle signals', () => {
  assert.ok(detectStruggle("I'm stuck"));
  assert.ok(detectStruggle('idk'));
  assert.ok(detectStruggle('this makes no sense'));
  assert.ok(!detectStruggle('I created the resource group in West US 2'));
});

test('message parse returns intent + struggling flag', () => {
  const p = parseInput('I have no idea what is happening');
  assert.equal(p.kind, 'message');
  assert.equal(p.intent, 'stuck');
  assert.equal(p.struggling, true);
});
