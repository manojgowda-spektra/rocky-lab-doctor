// False-FAIL Amnesty invariants, proven on the twin: eligibility requires ALL gates (fleet case +
// regression + per-learner state proof), execution requires a named human, and the reversion guard
// halts on a single contradicted pair. The never-events are asserted, not hoped: wrong work is never
// amnestied, born-broken validators are never amnestied, false-pass learners are never touched.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { generateWorld, injectScenario } = require('../sim/fleetgen');
const { createMonitor } = require('../monitor/sweeper');
const { createCaseLedger } = require('../ledger/ledger');
const { buildAmnestyPacket, executeAmnesty, reconcileAmnesty } = require('../action/amnesty');
const { ingestCatalog, fetchLearnerRows, makeVerdictWriter } = require('../adapter/cloudlabs-ingest');
const { analyzeLab } = require('../labdoctor/analyze');

function sweepInto(world, mon, led, sweepId) {
  const snap = mon.sweep(world.labs, sweepId);
  led.record(snap);
  return snap;
}

test('amnesty pipeline: fleet-confirmed regression -> state-proven pairs -> human gate -> reversion guard', async () => {
  const world = generateWorld({ healthy: 8 }, { seed: 91, coverageGapChance: 0 });
  const ids = world.labs.map((l) => l.labId);
  const mon = createMonitor();
  const led = createCaseLedger();

  sweepInto(world, mon, led, 1);
  sweepInto(world, mon, led, 2);
  injectScenario(world, ids[0], 'falseFail', 300);
  sweepInto(world, mon, led, 3);
  assert.equal(led.cases.length, 1, 'the regression is fleet-confirmed as a case');

  const lab = world.labs.find((l) => l.labId === ids[0]);
  const learners = world.learnersByLab[ids[0]];
  const vid = led.cases[0].validationIds[0];

  // Tamper two learners to prove per-learner gating: one with WRONG work, one with NO evidence
  const failing = learners.filter((u) => (u.validationResults || []).some((r) => r.validationId === vid && r.status === 'failed'));
  assert.ok(failing.length >= 4, 'scenario yields a fleet-sized victim cohort');
  const wrongWork = failing[0], noEvidence = failing[1];
  const wrongRow = wrongWork.validationResults.find((r) => r.validationId === vid);
  wrongRow.observed = Object.fromEntries(Object.keys(wrongRow.observed).map((k) => [k, '__wrong__']));
  delete noEvidence.validationResults.find((r) => r.validationId === vid).observed;

  const packet = buildAmnestyPacket({ lab, learners, ledgerCases: led.cases, monitorHistory: mon.history });
  assert.equal(packet.draft, true, 'a packet is never self-executing');
  assert.equal(packet.cases.length, 1);
  assert.equal(packet.cases[0].regression, true);
  assert.equal(packet.cases[0].lastCleanSweep, 2, 'regression evidence names the last clean sweep');
  assert.equal(packet.eligible.length, failing.length - 2, 'exactly the state-proven victims are eligible');
  assert.ok(packet.ineligible.some((x) => x.eventUserId === wrongWork.eventUserId && x.reason === 'state-mismatch'), 'wrong work is excluded as a GENUINE failure');
  assert.ok(packet.ineligible.some((x) => x.eventUserId === noEvidence.eventUserId && x.reason === 'no-evidence'), 'missing observed state is excluded — absence of evidence is not evidence of correctness');
  for (const pair of packet.eligible) {
    assert.equal(pair.previousStatus, 'failed');
    assert.ok(pair.evidence.observed && pair.evidence.expected && pair.evidence.fleetCase, 'every pair carries its full evidence chain');
  }

  // G4: no human, no writes — and the writer is never even called
  let writes = [];
  const writer = async (w) => { writes.push(w); return { ok: true }; };
  await assert.rejects(() => executeAmnesty(packet, writer), /authorizedBy/, 'execution without a named human is refused');
  assert.equal(writes.length, 0);

  const exec = await executeAmnesty(packet, writer, { authorizedBy: 'manoj@spektrasystems.com' });
  assert.equal(exec.written, packet.eligible.length);
  assert.equal(exec.failed, 0);
  for (const w of writes) {
    assert.equal(w.previousStatus, 'failed');
    assert.match(w.reason, /fleet case CASE-/, 'every write names its fleet case');
    assert.equal(w.writtenBy, 'manoj@spektrasystems.com');
  }

  // G5: post-fix re-validation confirms all -> no halt
  const fixedLearners = learners.map((u) => ({ ...u, validationResults: u.validationResults.map((r) => (r.validationId === vid && packet.eligible.some((p) => p.eventUserId === u.eventUserId) ? { ...r, status: 'passed' } : { ...r })) }));
  const clean = reconcileAmnesty(exec, fixedLearners);
  assert.equal(clean.contradicted.length, 0);
  assert.equal(clean.halt, false);
  assert.equal(clean.confirmed.length, exec.written);

  // ONE contradicted pair halts everything; a vanished seat is unknown, never silently confirmed
  const victim = packet.eligible[0].eventUserId, vanished = packet.eligible[1].eventUserId;
  const badLearners = fixedLearners
    .filter((u) => u.eventUserId !== vanished)
    .map((u) => (u.eventUserId === victim ? { ...u, validationResults: u.validationResults.map((r) => (r.validationId === vid ? { ...r, status: 'failed' } : r)) } : u));
  const dirty = reconcileAmnesty(exec, badLearners);
  assert.equal(dirty.contradicted.length, 1);
  assert.equal(dirty.halt, true, 'a single contradicted amnesty halts the pipeline');
  assert.ok(dirty.unknown.some((x) => x.eventUserId === vanished), 'expired seats are unknown, not confirmed');
});

test('never-events: born-broken validators and false-pass learners are structurally un-amnestiable', () => {
  // Born broken: the defect existed at the very first observation — nothing was taken away
  const w1 = generateWorld({ falseFail: 2, healthy: 2 }, { seed: 92, coverageGapChance: 0 });
  const mon1 = createMonitor(), led1 = createCaseLedger();
  sweepInto(w1, mon1, led1, 1);
  sweepInto(w1, mon1, led1, 2);
  const brokenLab = w1.labs.find((l) => led1.cases.some((c) => c.labId === l.labId && c.type === 'validation-bug' && !c.subtype));
  assert.ok(brokenLab, 'a born-broken false-fail lab exists');
  const p1 = buildAmnestyPacket({ lab: brokenLab, learners: w1.learnersByLab[brokenLab.labId], ledgerCases: led1.cases, monitorHistory: mon1.history });
  assert.equal(p1.eligible.length, 0, 'born-broken: zero pairs, regardless of learner state');
  assert.ok(p1.ineligible.some((x) => x.reason === 'no-prior-clean-state'));

  // False-pass: a validator fault, but amnesty must not even see the case (G1 filters the subtype)
  const w2 = generateWorld({ healthy: 6 }, { seed: 93, coverageGapChance: 0 });
  const ids2 = w2.labs.map((l) => l.labId);
  const mon2 = createMonitor(), led2 = createCaseLedger();
  sweepInto(w2, mon2, led2, 1);
  injectScenario(w2, ids2[0], 'falsePass', 200);
  sweepInto(w2, mon2, led2, 2);
  assert.ok(led2.cases.some((c) => c.subtype === 'false-pass'), 'the false-pass case exists in the ledger');
  const lab2 = w2.labs.find((l) => l.labId === ids2[0]);
  const p2 = buildAmnestyPacket({ lab: lab2, learners: w2.learnersByLab[ids2[0]], ledgerCases: led2.cases, monitorHistory: mon2.history });
  assert.equal(p2.cases.length, 0, 'false-pass cases never enter an amnesty packet');
  assert.equal(p2.eligible.length, 0);

  // Sub-threshold (nearMiss): no case in the ledger at all -> nothing to build from (restraint holds)
  injectScenario(w2, ids2[1], 'nearMiss', 300);
  sweepInto(w2, mon2, led2, 3);
  const lab3 = w2.labs.find((l) => l.labId === ids2[1]);
  const p3 = buildAmnestyPacket({ lab: lab3, learners: w2.learnersByLab[ids2[1]], ledgerCases: led2.cases, monitorHistory: mon2.history });
  assert.equal(p3.cases.length + p3.eligible.length, 0, 'below fleet threshold: no case, no amnesty — individual judgment never triggers writes');
});

// ---- twin WRITE endpoint e2e: the simulated mirror of the unused production endpoint ----
const PORT = 5978;
const BASE = `http://localhost:${PORT}`;
const AUTH = { Authorization: 'Bearer sim-token' };
const PG = 'SIM-PARTNER-0001';
let proc;

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'sim', 'twin-server.js'), String(PORT), '42'], { stdio: 'ignore' });
  const deadline = Date.now() + 15000;
  for (;;) {
    try { const r = await fetch(`${BASE}/api/partners/${PG}/labs`, { headers: AUTH }); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('twin server did not start');
    await new Promise((r) => setTimeout(r, 250));
  }
});
after(() => { try { proc.kill(); } catch {} });

test('twin WRITE endpoint: provenance enforced, write persists, audit trail records it', async () => {
  const labs = await (await fetch(`${BASE}/api/partners/${PG}/labs`, { headers: AUTH })).json();
  const labId = labs[0].onDemandLabGuid;
  const users = await (await fetch(`${BASE}/api/partners/${PG}/labs/${labId}/users`, { headers: AUTH })).json();
  const eu = users[0].eventUserId;
  const rows = await (await fetch(`${BASE}/api/partners/${PG}/labs/${labId}/users/${eu}/validation-results`, { headers: AUTH })).json();
  const vid = rows[0].validationId;
  const putUrl = `${BASE}/api/partners/${PG}/labs/${labId}/users/${eu}/validation-results/${vid}`;
  const put = (body) => fetch(putUrl, { method: 'PUT', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  // provenance is not optional: no reason/writtenBy -> rejected
  assert.equal((await put({ status: 'passed' })).status, 400);
  // bad status -> rejected
  assert.equal((await put({ status: 'maybe', reason: 'x', writtenBy: 'y' })).status, 400);

  const r = await put({ status: 'passed', reason: 'amnesty e2e test', writtenBy: 'amnesty.test.js' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.written, true);
  assert.equal(body.newStatus, 'passed');
  assert.equal(body.previousStatus, rows[0].status);

  // A-W1: the write PERSISTS on subsequent reads, with write-back provenance visible
  const rows2 = await (await fetch(`${BASE}/api/partners/${PG}/labs/${labId}/users/${eu}/validation-results`, { headers: AUTH })).json();
  assert.equal(rows2.find((x) => x.validationId === vid).status, 'passed');

  // A-W2: the audit oracle recorded exactly this write
  const audit = await (await fetch(`${BASE}/sim/write-audit`, { headers: AUTH })).json();
  assert.equal(audit.writes.length, 1);
  assert.deepEqual(
    { labId: audit.writes[0].labId, eventUserId: audit.writes[0].eventUserId, validationId: audit.writes[0].validationId, writtenBy: audit.writes[0].writtenBy },
    { labId, eventUserId: eu, validationId: vid, writtenBy: 'amnesty.test.js' }
  );

  // unauthenticated writes are refused outright
  assert.equal((await fetch(putUrl, { method: 'PUT', body: '{}' })).status, 401);
});

test('full wire path: ingest -> case -> packet -> PUT writes -> learners restored, but the defect is NOT masked', async () => {
  // pick a healthy lab (not labs[0] — the previous test wrote into it)
  const gt = (await (await fetch(`${BASE}/sim/ground-truth`, { headers: AUTH })).json()).groundTruth;
  const labId = Object.keys(gt).filter((id) => (gt[id] || []).length === 0)[1];
  assert.ok(labId, 'a pristine healthy lab exists in the twin');
  const cfg = { baseUrl: BASE, token: 'sim-token', partnerGuid: PG };
  const ingestOne = async () => (await ingestCatalog({ ...cfg, labFilter: (l) => l.onDemandLabGuid === labId })).labs[0];

  const mon = createMonitor(), led = createCaseLedger();
  led.record(mon.sweep([await ingestOne()], 1));
  led.record(mon.sweep([await ingestOne()], 2));
  assert.equal(led.cases.length, 0, 'healthy over the wire: no cases');

  // the validator regresses mid-run
  const inj = await fetch(`${BASE}/sim/inject`, { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify({ labId, scenario: 'falseFail', seed: 777 }) });
  assert.equal(inj.status, 200);
  const lab3 = await ingestOne();
  led.record(mon.sweep([lab3], 3));
  const c = led.cases.find((x) => x.labId === labId && x.type === 'validation-bug' && !x.subtype);
  assert.ok(c, 'the regression is fleet-confirmed over the wire');

  // packet from adapter-fetched per-learner rows
  const { learners, complete } = await fetchLearnerRows({ ...cfg, labId });
  assert.equal(complete, true);
  const packet = buildAmnestyPacket({ lab: lab3, learners, ledgerCases: led.cases, monitorHistory: mon.history });
  assert.ok(packet.eligible.length >= 4, `fleet-sized eligible set, got ${packet.eligible.length}`);

  // execute through the production-shaped writer
  const exec = await executeAmnesty(packet, makeVerdictWriter(cfg), { authorizedBy: 'wire-e2e' });
  assert.equal(exec.written, packet.eligible.length);
  assert.equal(exec.failed, 0);
  const audit = await (await fetch(`${BASE}/sim/write-audit`, { headers: AUTH })).json();
  assert.equal(audit.writes.filter((w) => w.labId === labId).length, exec.written, 'every write is in the audit trail');

  // learner-facing verdicts are restored...
  const after = await fetchLearnerRows({ ...cfg, labId });
  for (const p of packet.eligible) {
    const row = after.learners.find((u) => u.eventUserId === p.eventUserId).validationResults.find((r) => r.validationId === p.validationId);
    assert.equal(row.status, 'passed');
    assert.equal(row.writtenBack.previousStatus, 'failed', 'the machine verdict is preserved under the override');
  }
  // ...and re-running the packet finds nothing left to amnesty (idempotent by construction)
  const packet2 = buildAmnestyPacket({ lab: lab3, learners: after.learners, ledgerCases: led.cases, monitorHistory: mon.history });
  assert.equal(packet2.eligible.length, 0, 'amnesty never double-writes');

  // THE invariant: amnesty must not mask the defect it compensated for. Diagnosis still sees the
  // false-fail (machine verdicts), the monitor sees NO recovery, and the case stays open.
  const lab4 = await ingestOne();
  assert.equal(lab4._provenance.writtenBackRows, exec.written, 'ingest provenance counts the human overrides');
  assert.ok(analyzeLab(lab4).findings.some((f) => f.type === 'validation-bug' && f.subtype !== 'false-pass'), 'the false-fail finding survives the write-backs');
  const s4 = mon.sweep([lab4], 4);
  led.record(s4);
  assert.ok(!s4.alerts.some((a) => a.type === 'recovery'), 'no fake recovery: compensating learners is not fixing the validator');
  assert.equal(led.cases.find((x) => x.caseId === c.caseId).closedSweep, null, 'the case stays open until the validator is actually fixed');
});
