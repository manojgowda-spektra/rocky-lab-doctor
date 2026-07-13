const { test } = require('node:test');
const assert = require('node:assert');

const { handleTurn } = require('../src/agent');
const { Conversation } = require('../src/conversation');

// Force deterministic mode so tests never call (or bill) a live model.
// MUST run AFTER require — llm.js re-loads .env.local on require, so deleting
// before require would just be re-populated. isConfigured() reads env live.
delete process.env.AZURE_OPENAI_ENDPOINT;
delete process.env.AZURE_OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const ctx = () => ({
  lab: { title: 'Demo Lab', objective: 'do x', expectedRegion: 'westus2' },
  learner: { eventUserId: 'EU-1' },
  currentStep: { stepGuid: 'S-03', title: 'create vnet', expectedOutcome: '...' },
  validations: [{ validationId: 'V-006', description: 'rg in westus2', status: 'failed', expected: { region: 'westus2' }, observed: { region: 'eastus' } }],
  deploymentActivityLog: [{ level: 'error', code: 'SkuNotAvailable', message: "VM size 'X' not available in location 'eastus'." }],
});

test('free-form failure question → grounded deterministic answer (no model)', async () => {
  const convo = new Conversation();
  const r = await handleTurn({ input: 'why does it keep failing?', ctx: ctx(), convo });
  assert.equal(r.usedLLM, false);
  assert.match(r.text, /westus2|region/i);
  assert.equal(convo.history.length, 2); // user + assistant recorded
});

test('/check returns grounded state report', async () => {
  const convo = new Conversation();
  const r = await handleTurn({ input: '/check', ctx: ctx(), convo });
  assert.match(r.text, /Grounded in:/);
});

test('/answer sets level to answer and gives the fix', async () => {
  const convo = new Conversation();
  const r = await handleTurn({ input: '/answer', ctx: ctx(), convo });
  assert.equal(convo.level, 'answer');
  assert.match(r.text, /Fix:/);
});

test('stuck message increments struggle (drives ZPD escalation)', async () => {
  const convo = new Conversation();
  await handleTurn({ input: "I'm completely stuck and confused", ctx: ctx(), convo });
  assert.ok(convo.struggle >= 1);
});

test('progress signal fades support', async () => {
  const convo = new Conversation();
  convo.registerStruggle(); convo.registerStruggle(); // guided
  await handleTurn({ input: 'it worked now, thanks!', ctx: ctx(), convo });
  assert.equal(convo.struggle, 0);
});
