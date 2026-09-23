/*
 * endpoint-test.js — does Rocky call the URL the user actually pasted?
 *
 * Azure hands people several different endpoint shapes depending on which blade they copy
 * from, and the portal's own instructions vary. Rocky silently rewriting one into another
 * is the worst possible failure: the request goes somewhere the user never asked for, fails
 * for a reason the error message does not explain, and looks like "the AI does not work".
 *
 * That is exactly what happened with a real endpoint:
 *   https://<res>.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview
 * The normaliser dropped the query string, and because the Responses branch only recognised
 * "/openai/v1/", the request was rerouted to the legacy chat-completions API instead.
 *
 * The rule these tests enforce: an endpoint with an explicit path is used AS GIVEN. Rewriting
 * is allowed only where the URL genuinely cannot serve a request (a Foundry project endpoint,
 * or a bare resource root with no path at all).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadBuilder() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'webext', 'background.js'), 'utf8');
  const mod = { exports: {} };
  const chromeStub = {
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
    storage: { local: { get() {}, set() {} } },
  };
  new Function('module', 'exports', 'chrome', 'fetch', 'self', src)(mod, mod.exports, chromeStub, () => {}, {});
  if (!mod.exports.buildAIRequest) throw new Error('background.js did not export buildAIRequest');
  return mod.exports.buildAIRequest;
}

const build = loadBuilder();
let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

const KEY = 'FAKE-KEY-FOR-TESTS';
const req = (endpoint, apiVersion) =>
  build({ endpoint, deployment: 'luna-6', apiKey: KEY, apiVersion }, { question: 'hi' });

console.log('\n=== DOES ROCKY CALL THE URL THE USER PASTED? ===\n');

check('an explicit /openai/responses path is used as given, query intact', () => {
  const ep = 'https://rockyintelligence.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview';
  const r = req(ep);
  assert.ok(!r.error, `unexpected error: ${r.error}`);
  assert.strictEqual(r.url, ep, 'the endpoint was rewritten');
  assert.strictEqual(r.kind, 'responses', 'routed to the wrong API');
});

check('the api-version in the URL is never dropped', () => {
  const r = req('https://x.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview');
  assert.match(r.url, /api-version=2025-04-01-preview/, 'the query string was lost');
});

check('a configured api-version is not appended twice', () => {
  const r = req('https://x.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview', 'preview');
  const n = (r.url.match(/api-version=/g) || []).length;
  assert.strictEqual(n, 1, `api-version appears ${n} times: ${r.url}`);
});

check('a bare resource root gets the v1 Responses path', () => {
  const r = req('https://x.services.ai.azure.com');
  assert.strictEqual(r.kind, 'responses');
  assert.match(r.url, /\/openai\/v1\/responses$/);
});

check('the v1 Responses endpoint is respected', () => {
  const ep = 'https://x.services.ai.azure.com/openai/v1/responses';
  const r = req(ep);
  assert.strictEqual(r.url, ep);
  assert.strictEqual(r.kind, 'responses');
});

check('a Foundry PROJECT endpoint is redirected - it cannot serve inference', () => {
  // The one rewrite that is correct: /api/projects/... is not an inference endpoint at all.
  const r = req('https://x.services.ai.azure.com/api/projects/myproject');
  assert.strictEqual(r.kind, 'responses');
  assert.match(r.url, /\/openai\/v1\/responses/);
  assert.ok(!/api\/projects/.test(r.url), 'the project path survived');
});

check('a legacy openai.azure.com resource uses chat completions', () => {
  const r = req('https://myres.openai.azure.com');
  assert.strictEqual(r.kind, 'chat');
  assert.match(r.url, /\/openai\/deployments\/luna-6\/chat\/completions/);
  assert.match(r.url, /api-version=/);
});

check('the deployment name reaches the request', () => {
  const r = req('https://x.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview');
  assert.strictEqual(r.body.model, 'luna-6', 'the model/deployment name was lost');
});

check('the key is sent as a header, never in the URL', () => {
  const r = req('https://x.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview');
  assert.ok(!r.url.includes(KEY), 'the key leaked into the URL, where it would be logged');
  assert.ok(r.headers['api-key'] === KEY || /Bearer/.test(r.headers.Authorization || ''), 'no auth header');
});

check('missing configuration is refused with a useful message, not a bad request', () => {
  const r = build({ endpoint: '', deployment: '', apiKey: '' }, { question: 'hi' });
  assert.ok(r.error, 'an unconfigured AI should not produce a request');
  assert.match(r.error, /configur/i);
});

check('an http endpoint is rejected - a key must never cross plain http', () => {
  const r = req('http://x.cognitiveservices.azure.com/openai/responses');
  assert.ok(r.error, 'http was accepted');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — the endpoint a user pastes is the endpoint Rocky calls.\n`);
