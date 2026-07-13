const { test } = require('node:test');
const assert = require('node:assert');
const { redact, redactString } = require('../src/redact');

test('strips passwords, api keys, connection strings, bearer tokens', () => {
  const s = "Server=tcp:db;Password=Sup3rSecret!; ApiKey: sk-live-abcd1234; Authorization: Bearer eyJabc.def";
  const out = redactString(s);
  assert.doesNotMatch(out, /Sup3rSecret/);
  assert.doesNotMatch(out, /sk-live-abcd1234/);
  assert.doesNotMatch(out, /eyJabc\.def/);
  assert.match(out, /REDACTED/);
});

test('strips email addresses', () => {
  assert.match(redactString('contact learner@example.com now'), /REDACTED_EMAIL/);
});

test('preserves non-secret technical text (region names survive)', () => {
  const s = "not available in location 'eastus'";
  assert.match(redactString(s), /eastus/);
});

test('deep-redacts nested objects and arrays', () => {
  const obj = { a: { b: ["Password=hunter2", "ok"] }, c: 'plain' };
  const out = redact(obj);
  assert.doesNotMatch(JSON.stringify(out), /hunter2/);
  assert.equal(out.c, 'plain');
});

test('non-string values pass through unchanged', () => {
  assert.equal(redact(42), 42);
  assert.equal(redact(true), true);
  assert.equal(redact(null), null);
});
