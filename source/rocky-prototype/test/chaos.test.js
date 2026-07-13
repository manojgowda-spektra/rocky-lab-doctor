// Chaos hardening: the adapter must survive the failure modes production will actually throw at it —
// rate-limit storms, transient 5xx, malformed payloads, and mid-ingest token expiry. Each mode is
// injected deterministically by the twin; assertions check both survival AND data integrity.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ingestCatalog } = require('../adapter/cloudlabs-ingest');
const { analyzeLab } = require('../labdoctor/analyze');

const TOKEN = 'sim-token';
const PG = 'SIM-PARTNER-0001';
const TWIN = path.join(__dirname, '..', 'sim', 'twin-server.js');

async function withTwin(port, chaos, fn) {
  const proc = spawn(process.execPath, [TWIN, String(port), '42', chaos], { stdio: 'ignore' });
  try {
    const base = `http://localhost:${port}`;
    const deadline = Date.now() + 15000;
    for (;;) {
      try { const r = await fetch(`${base}/sim/ground-truth`, { headers: { Authorization: `Bearer ${TOKEN}` } }); if (r.ok || r.status === 401) break; } catch {}
      if (Date.now() > deadline) throw new Error('twin did not start');
      await new Promise((r) => setTimeout(r, 250));
    }
    return await fn(base);
  } finally { try { proc.kill(); } catch {} }
}

// small filter to keep chaos runs fast: only labs SIM-0001..SIM-0012
const few = (l) => Number(l.onDemandLabGuid.split('-')[1]) <= 12;

test('429 storm (20%): ingest completes, loss is bounded AND visible, diagnosis unchanged', async () => {
  await withTwin(5981, '429:0.2', async (base) => {
    const { labs, errors, authDied } = await ingestCatalog({ baseUrl: base, token: TOKEN, partnerGuid: PG, labFilter: few, retries: 5 });
    assert.equal(authDied, false);
    assert.equal(errors.length, 0, `no lab may fail outright, got: ${errors.map((e) => e.error).join('; ')}`);
    assert.equal(labs.length, 12, 'every lab ingests despite the storm');
    // The contract is bounded-and-VISIBLE loss, not perfection: with p=0.2 and 5 retries the odds of
    // exhausting retries are 0.0064% per request — at most a stray learner, and it must be recorded.
    const skipped = labs.reduce((s, l) => s + l._provenance.skipped.length, 0);
    assert.ok(skipped <= 1, `storm loss must be bounded, skipped=${skipped}`);
    assert.ok(labs.every((l) => l._provenance.complete === (l._provenance.skipped.length === 0)), 'partial ingests must self-report');
    const gt = (await (await fetch(`${base}/sim/ground-truth`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).groundTruth;
    for (const lab of labs) for (const cls of (gt[lab.labId] || [])) {
      if (cls === 'drift') assert.ok(analyzeLab(lab).findings.some((f) => f.type === 'drift'), `${lab.labId} diagnosis must survive chaos`);
    }
  });
});

test('flaky 5xx (15%): retries absorb it, loss bounded and visible', async () => {
  await withTwin(5982, '500:0.15', async (base) => {
    const { labs, errors } = await ingestCatalog({ baseUrl: base, token: TOKEN, partnerGuid: PG, labFilter: few, retries: 5 });
    assert.equal(errors.length, 0);
    const skipped = labs.reduce((s, l) => s + l._provenance.skipped.length, 0);
    assert.ok(skipped <= 1, `flake loss must be bounded, skipped=${skipped}`);
    assert.ok(labs.every((l) => l._provenance.complete === (l._provenance.skipped.length === 0)), 'partial ingests must self-report');
  });
});

test('malformed payloads (20% of validation-results): skipped + recorded, ingest never crashes', async () => {
  await withTwin(5983, 'malformed:0.2', async (base) => {
    const { labs, errors } = await ingestCatalog({ baseUrl: base, token: TOKEN, partnerGuid: PG, labFilter: few });
    assert.equal(errors.length, 0, 'malformed learner payloads must not fail labs');
    const skippedTotal = labs.reduce((s, l) => s + l._provenance.skipped.length, 0);
    assert.ok(skippedTotal > 0, 'chaos guarantees some malformed payloads — they must be recorded');
    assert.ok(labs.some((l) => !l._provenance.complete), 'partial labs must be marked incomplete, not silently complete');
    assert.ok(labs.every((l) => l._provenance.skipped.every((s) => s.reason === 'malformed payload')));
  });
});

test('slow endpoints (30% @ 1.5s) with a tight 900ms timeout: timeouts retry and the run completes', async () => {
  await withTwin(5984, 'slow:0.3@1500', async (base) => {
    const { labs, errors } = await ingestCatalog({ baseUrl: base, token: TOKEN, partnerGuid: PG, labFilter: (l) => Number(l.onDemandLabGuid.split('-')[1]) <= 6, timeoutMs: 900, retries: 4 });
    // a retried slow request has a fresh chaos roll each time — with 4 retries at p=0.3, failure odds per request are ~0.24%
    assert.ok(labs.length >= 5, `nearly all labs must complete, got ${labs.length} (errors: ${errors.map((e) => e.error).join('; ')})`);
  });
});

test('token expiry mid-ingest: fail fast with an actionable auth error, no retry hammering', async () => {
  await withTwin(5985, 'auth-expire:30', async (base) => {
    const t0 = Date.now();
    const { labs, errors, authDied } = await ingestCatalog({ baseUrl: base, token: TOKEN, partnerGuid: PG, labFilter: few });
    const elapsed = Date.now() - t0;
    assert.equal(authDied, true, 'auth death must be surfaced');
    assert.ok(errors.some((e) => /auth|token/i.test(e.error)), 'error must name the auth cause');
    assert.ok(elapsed < 15000, `must fail fast, took ${elapsed}ms`);
    assert.ok(labs.length < 12, 'ingest stops rather than pretending to finish');
  });
});
