// End-to-end pipeline proof: Digital Twin API (per-learner rows, bearer auth) → ingestion adapter
// (grouping + normalization) → diagnosis engine → verdicts compared against the twin's ground truth.
// This is the exact dataflow of a production integration, minus only the base URL and a real token.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ingestCatalog } = require('../adapter/cloudlabs-ingest');
const { runAudit } = require('../audit/expected-state-audit');
const { analyzeLab } = require('../labdoctor/analyze');

const PORT = 5977;
const BASE = `http://localhost:${PORT}`;
const TOKEN = 'sim-token';
const PG = 'SIM-PARTNER-0001';
let proc;

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'sim', 'twin-server.js'), String(PORT), '42'], { stdio: 'ignore' });
  const deadline = Date.now() + 15000;
  for (;;) {
    try { const r = await fetch(`${BASE}/api/partners/${PG}/labs`, { headers: { Authorization: `Bearer ${TOKEN}` } }); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('twin server did not start');
    await new Promise((r) => setTimeout(r, 250));
  }
});
after(() => { try { proc.kill(); } catch {} });

test('twin rejects unauthenticated requests (bearer-auth assumption is exercised, not skipped)', async () => {
  const r = await fetch(`${BASE}/api/partners/${PG}/labs`);
  assert.equal(r.status, 401);
});

test('adapter ingests the twin catalog and the engine reproduces ground truth over the API path', async () => {
  const { labs } = await ingestCatalog({ baseUrl: BASE, token: TOKEN, partnerGuid: PG, labFilter: (l) => !l.title.includes('(') || true });
  assert.ok(labs.length >= 40, `expected full catalog, got ${labs.length}`);
  const gt = (await (await fetch(`${BASE}/sim/ground-truth`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).groundTruth;

  const CHECK = {
    drift: (rep) => rep.findings.some((f) => f.type === 'drift'),
    'false-fail': (rep) => rep.findings.some((f) => f.type === 'validation-bug' && f.subtype !== 'false-pass'),
    'false-pass': (rep) => rep.findings.some((f) => f.subtype === 'false-pass'),
    env: (rep) => rep.findings.some((f) => f.type === 'env-permission'),
    flake: (rep) => rep.findings.some((f) => f.type === 'transient'),
    clarity: (rep) => rep.findings.some((f) => f.type === 'guide-clarity'),
  };
  const misses = [];
  for (const lab of labs) {
    const seeded = (gt[lab.labId] || []).filter((c) => c !== 'deprecated-content');
    const rep = analyzeLab(lab);
    for (const cls of seeded) if (!CHECK[cls](rep)) misses.push(`${lab.labId} missed ${cls} via API path`);
    if (!seeded.length && lab.telemetry.cohorts.length) {
      const loud = rep.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
      if (loud.length) misses.push(`${lab.labId} (healthy) falsely flagged via API path: ${loud.map((f) => f.type).join(',')}`);
    }
  }
  assert.deepEqual(misses, [], 'API-path detection must match direct-path ground truth');
  // provenance must mark these as ingested, and cohort grouping must have compressed learners
  assert.ok(labs.every((l) => l._provenance.source === 'api-ingest'));
  const one = labs.find((l) => l.telemetry.cohorts.length);
  assert.ok(one.telemetry.cohorts.length < one._provenance.learners, 'identical learners must group into cohorts');
});

test('expected-state audit runs over the twin and yields the designed richness spread', async () => {
  const audit = await runAudit({ baseUrl: BASE, token: TOKEN, partnerGuid: PG });
  assert.ok(audit.labCount >= 40);
  assert.ok(audit.avgCoveragePct > 40 && audit.avgCoveragePct < 100, `coverage spread expected, got ${audit.avgCoveragePct}%`);
  assert.ok(audit.existenceOnlyTotal > 0, 'twin seeds existence-only checks — the audit must find them');
  assert.ok(audit.rows.every((r) => r.coveragePct >= 0 && r.richnessPct >= 0));
  console.log(`    audit over twin: coverage ${audit.avgCoveragePct}% · richness ${audit.avgRichnessPct}% · groundable ${audit.groundablePct}% · existence-only ${audit.existenceOnlyTotal}`);
});
