const { test } = require('node:test');
const assert = require('node:assert');
const { analyze, respond, genericBaseline, validateContext, ContextError } = require('../src/rocky');

const baseCtx = () => ({
  lab: { title: 'Demo Lab', objective: 'do x', expectedRegion: 'westus2' },
  learner: { eventUserId: 'EU-1' },
  currentStep: { stepGuid: 'S-03', title: 'create vnet', instruction: '...', expectedOutcome: '...' },
  validations: [
    { validationId: 'V-006', stepGuid: 'S-02', description: 'rg in westus2', status: 'failed', expected: { region: 'westus2' }, observed: { region: 'eastus' } },
  ],
  deploymentActivityLog: [
    { ts: 't', stage: 'compute', level: 'error', code: 'SkuNotAvailable', message: "VM size 'X' is not available in location 'eastus'." },
  ],
  learnerQuestion: 'should I pick a smaller VM?',
});

// ---- Smoke ----
test('smoke: respond returns a non-empty grounded string', () => {
  const out = respond(baseCtx(), 'hint');
  assert.match(out, /Grounded in:/);
  assert.ok(out.length > 40);
});

// ---- Core correlation (regression for the regionMiss.actual bug) ----
test('region mismatch + SKU error correlate to root cause = wrong region', () => {
  const { findings } = analyze(baseCtx());
  const region = findings.find((f) => f.type === 'region-mismatch');
  const sku = findings.find((f) => f.type === 'sku-not-available');
  assert.ok(region, 'region-mismatch finding present');
  assert.equal(sku.correlatedWith, 'region-mismatch');
  assert.equal(sku.severity, 'symptom-of-region');
});

test('grounded answer tells learner NOT to change VM size, and names the region', () => {
  const out = respond(baseCtx(), 'hint');
  assert.match(out, /westus2/);
  assert.match(out, /Don't change the VM size/i);
});

test('hint and answer levels differ', () => {
  const ctx = baseCtx();
  assert.notEqual(respond(ctx, 'hint'), respond(ctx, 'answer'));
  assert.match(respond(ctx, 'answer'), /Fix:/);
});

// ---- Other finding types ----
test('quota error is detected as root cause', () => {
  const ctx = baseCtx();
  ctx.validations = [];
  ctx.deploymentActivityLog = [{ level: 'error', code: 'QuotaExceeded', message: 'exceeding approved quota' }];
  const { findings } = analyze(ctx);
  assert.equal(findings[0].type, 'quota-exceeded');
  assert.match(respond(ctx, 'answer'), /quota/i);
});

test('authorization error detected', () => {
  const ctx = baseCtx();
  ctx.validations = [];
  ctx.deploymentActivityLog = [{ level: 'error', code: 'AuthorizationFailed', message: 'does not have authorization' }];
  assert.equal(analyze(ctx).findings[0].type, 'authorization-failed');
});

test('license issue detected and flagged reportable', () => {
  const ctx = baseCtx();
  ctx.validations = [];
  ctx.deploymentActivityLog = [{ level: 'error', code: 'MarketplacePurchaseRequired', message: 'license terms must be accepted' }];
  const f = analyze(ctx).findings[0];
  assert.equal(f.type, 'license-issue');
  assert.equal(f.reportable, true);
  assert.match(respond(ctx, 'answer'), /licens/i);
});

// ---- Edge / failure scenarios ----
test('no findings → graceful fallback, no crash', () => {
  const ctx = baseCtx();
  ctx.validations = [];
  ctx.deploymentActivityLog = [];
  const out = respond(ctx, 'hint');
  assert.match(out, /don't see a failed validation/i);
});

test('failed validation without a specific category yields generic finding', () => {
  const ctx = baseCtx();
  ctx.validations = [{ validationId: 'V-009', status: 'failed', description: 'app responds' }];
  ctx.deploymentActivityLog = [];
  assert.equal(analyze(ctx).findings[0].type, 'validation-failed');
});

test('missing arrays are tolerated', () => {
  const ctx = { lab: { title: 'L' } };
  const { findings } = analyze(ctx);
  assert.deepEqual(findings, []);
});

test('malformed context (no lab) is handled gracefully by respond', () => {
  const out = respond({}, 'hint');
  assert.match(out, /couldn't read the lab context/i);
});

test('validateContext throws ContextError on bad input', () => {
  assert.throws(() => validateContext(null), ContextError);
  assert.throws(() => validateContext({}), ContextError);
});

// ---- Baseline contrast (the proof) ----
test('generic baseline gives the lab-breaking advice (shrink VM)', () => {
  assert.match(genericBaseline(), /smaller/i);
});
