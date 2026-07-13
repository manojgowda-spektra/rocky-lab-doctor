// Reliability Ledger scored against scripted twin timelines: cases open on the detecting sweep and
// close on the recovering sweep; concurrent cases never double-count incident sweeps; the fix queue
// ranks by learner cost; validator trust tiers count ONLY the check's own confirmed faults; and
// precedent-adjusted confidence never counts a case as its own precedent.
const { test } = require('node:test');
const assert = require('node:assert');
const { generateWorld, injectScenario, healLab } = require('../sim/fleetgen');
const { createMonitor } = require('../monitor/sweeper');
const { createCaseLedger, parseKey } = require('../ledger/ledger');

function run(world, mon, led, sweepId) {
  const snap = mon.sweep(world.labs, sweepId);
  led.record(snap);
  return snap;
}

test('key parser round-trips the sweeper key format', () => {
  assert.deepEqual(parseKey('validation-bug:false-pass|V-01'), { type: 'validation-bug', subtype: 'false-pass', validationIds: ['V-01'] });
  assert.deepEqual(parseKey('drift|V-01,V-04'), { type: 'drift', subtype: null, validationIds: ['V-01', 'V-04'] });
  assert.deepEqual(parseKey('env-permission|'), { type: 'env-permission', subtype: null, validationIds: [] });
});

test('case lifecycle over the scripted fleet timeline: open on detection, link platform incident, close on recovery', () => {
  const world = generateWorld({ healthy: 10 }, { seed: 77, coverageGapChance: 0 });
  const ids = world.labs.map((l) => l.labId);
  const mon = createMonitor();
  const led = createCaseLedger();

  run(world, mon, led, 1);
  run(world, mon, led, 2);
  assert.equal(led.cases.length, 0, 'healthy steady fleet opens no cases');

  // Sweep 3: silent false-pass on lab 0
  injectScenario(world, ids[0], 'falsePass', 301);
  run(world, mon, led, 3);
  assert.equal(led.cases.length, 1, 'one defect -> one case');
  const fp = led.cases[0];
  assert.equal(fp.labId, ids[0]);
  assert.equal(fp.subtype, 'false-pass');
  assert.equal(fp.openedSweep, 3);
  assert.ok(fp.learners > 0, 'case carries the affected-learner count from the finding');
  assert.ok(fp.validationIds.length === 1, 'case names the offending validator');

  // Sweep 4: platform event — same region/SKU change hits 4 labs
  for (const id of ids.slice(1, 5)) {
    const lab = world.labs.find((l) => l.labId === id);
    lab.expectedRegion = 'westus2'; lab.wrongRegion = 'eastus'; lab.sku = 'Standard_D4s_v5';
    injectScenario(world, id, 'drift', 400);
  }
  run(world, mon, led, 4);
  const driftCases = led.cases.filter((c) => c.type === 'drift');
  assert.equal(driftCases.length, 4, 'four labs -> four cases (cases are per-lab even when folded)');
  const incidentIds = new Set(driftCases.map((c) => c.incidentId));
  assert.equal(incidentIds.size, 1, 'all four cases link to the SAME platform incident id');
  assert.ok([...incidentIds][0], 'incident id is set');

  // Sweep 5: steady broken state — no case churn
  run(world, mon, led, 5);
  assert.equal(led.cases.length, 5, 'steady state opens nothing new');
  assert.equal(led.cases.filter((c) => c.closedSweep !== null).length, 0, 'nothing closed yet');

  // Sweep 6: one drifted lab heals
  healLab(world, ids[1], 600);
  run(world, mon, led, 6);
  const healed = led.cases.find((c) => c.labId === ids[1]);
  assert.equal(healed.closedSweep, 6, 'case closes on the recovering sweep');
  assert.equal(led.cases.filter((c) => c.closedSweep === null).length, 4, 'the other four stay open');

  // SLI: distinct broken sweeps per lab, diagnosis-confirmed only
  const sli = led.computeSli({ sweepIntervalMinutes: 60 });
  const lab0 = sli.perLab.find((l) => l.labId === ids[0]);
  assert.equal(lab0.incidentSweeps, 4, 'lab0 broken sweeps 3..6 = 4 (case still open)');
  assert.equal(lab0.incidentMinutes, 240);
  const lab1 = sli.perLab.find((l) => l.labId === ids[1]);
  assert.equal(lab1.incidentSweeps, 2, 'healed lab broken sweeps 4..5 = 2 (sweep 6 was clean)');
  assert.ok(sli.fleet.labsWithIncidents === 5 && sli.fleet.incidentMinutes > 0);

  // Fix queue: only open cases, ranked by learners x age
  const q = led.fixQueue();
  assert.equal(q.length, 4, 'healed lab is out of the queue');
  assert.ok(!q.some((c) => c.labId === ids[1]));
  for (let i = 1; i < q.length; i++) assert.ok(q[i - 1].costLearnerSweeps >= q[i].costLearnerSweeps, 'queue is sorted by learner cost');
  assert.equal(q[0].costLearnerSweeps, q[0].learners * q[0].ageSweeps, 'cost is the honest product, not a vibe score');
});

test('validator trust tiers: repeat offender -> tier C, recurrence linked, precedent boosts labeled confidence', () => {
  const world = generateWorld({ healthy: 6 }, { seed: 55, coverageGapChance: 0 });
  const ids = world.labs.map((l) => l.labId);
  const mon = createMonitor();
  const led = createCaseLedger();

  run(world, mon, led, 1);

  // First offense: false-fail on lab0's validator
  injectScenario(world, ids[0], 'falseFail', 200);
  run(world, mon, led, 2);
  const first = led.cases[0];
  assert.equal(first.type, 'validation-bug');
  assert.equal(first.subtype, null, 'false-fail is validation-bug with no subtype');
  const vid = first.validationIds[0];
  let trust = led.computeTrust();
  assert.equal(trust[`${ids[0]}:${vid}`].tier, 'B', 'one confirmed fault = tier B');
  assert.equal(trust[`${ids[0]}:${vid}`].falseFail, 1);

  // No precedent for the first case (a case is never its own precedent)
  assert.equal(led.adjustedConfidence(0.9, ids[0], vid, first.openedSweep), null, 'first offense has no precedent boost');

  // Heal, then the SAME validator fails the same way again
  healLab(world, ids[0], 300);
  run(world, mon, led, 3);
  assert.equal(led.cases[0].closedSweep, 3);
  injectScenario(world, ids[0], 'falseFail', 400);
  run(world, mon, led, 4);

  assert.equal(led.cases.length, 2, 'recurrence opens a NEW case, never reopens the old one');
  const second = led.cases[1];
  assert.equal(second.recurrenceOf, first.caseId, 'recurrence is linked to its predecessor');
  assert.equal(second.validationIds[0], vid, 'same validator, same defect class');

  trust = led.computeTrust();
  assert.equal(trust[`${ids[0]}:${vid}`].tier, 'C', 'two confirmed faults = repeat offender');
  assert.equal(trust[`${ids[0]}:${vid}`].cases, 2);

  // Precedent-adjusted confidence for the SECOND case: exactly one prior, +0.04, labeled not overwritten
  const adj = led.adjustedConfidence(0.9, ids[0], vid, second.openedSweep);
  assert.deepEqual(adj, { base: 0.9, adjusted: 0.94, priorCases: 1 });
  assert.ok(led.adjustedConfidence(0.96, ids[0], vid, second.openedSweep).adjusted <= 0.97, 'boost is capped — never near-certainty by accumulation');
});

test('restraint: env/drift cases never count against validator trust; unaffected labs never enter the ledger', () => {
  const world = generateWorld({ healthy: 6 }, { seed: 66, coverageGapChance: 0 });
  const ids = world.labs.map((l) => l.labId);
  const mon = createMonitor();
  const led = createCaseLedger();

  run(world, mon, led, 1);
  injectScenario(world, ids[0], 'envQuota', 200);
  injectScenario(world, ids[1], 'drift', 201);
  run(world, mon, led, 2);

  assert.ok(led.cases.length >= 2, 'both defects produce cases');
  assert.equal(Object.keys(led.computeTrust()).length, 0, 'the validators REPORTED these faults — they are not blamed for them');
  const ledgerLabs = new Set(led.cases.map((c) => c.labId));
  for (const id of ids.slice(2)) assert.ok(!ledgerLabs.has(id), 'clean labs stay out of the ledger entirely');

  // Steady state after: still nothing new
  const before = led.cases.length;
  run(world, mon, led, 3);
  assert.equal(led.cases.length, before, 'steady state adds nothing');
});
