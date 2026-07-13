const { test } = require('node:test');
const assert = require('node:assert');
const { Conversation } = require('../src/conversation');

test('assistance level escalates and caps at answer; fades back', () => {
  const c = new Conversation();
  assert.equal(c.level, 'hint');
  assert.equal(c.escalate(), 'guided');
  assert.equal(c.escalate(), 'answer');
  assert.equal(c.escalate(), 'answer'); // capped
  assert.equal(c.fade(), 'guided');
});

test('struggle escalates support after 2 signals (ZPD)', () => {
  const c = new Conversation();
  c.registerStruggle();
  assert.equal(c.level, 'hint');     // 1st: still a hint
  c.registerStruggle();
  assert.equal(c.level, 'guided');   // 2nd: step in
});

test('progress fades support and resets struggle', () => {
  const c = new Conversation();
  c.registerStruggle(); c.registerStruggle(); // -> guided
  c.registerProgress();
  assert.equal(c.struggle, 0);
  assert.equal(c.level, 'hint');
});

test('remembers what was already explained', () => {
  const c = new Conversation();
  c.markTold('region-mismatch');
  assert.ok(c.wasTold('region-mismatch'));
  assert.ok(!c.wasTold('quota-exceeded'));
});

test('long history is trimmed and summarized to control tokens', () => {
  const c = new Conversation({ maxRecent: 4 });
  for (let i = 0; i < 10; i++) { c.addUser('q' + i); c.addAssistant('a' + i); }
  assert.ok(c.history.length <= 4, 'recent history capped');
  assert.ok(c.summary.length > 0, 'older turns summarized');
  assert.ok(c.messagesForModel()[0].content.startsWith('(Earlier in this session'));
});
