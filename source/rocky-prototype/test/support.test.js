// Support Intelligence v1 scored against the twin's ground truth: ticket classification accuracy,
// ledger integrity, N→1 incident collapse, and packet assembly with redaction + honest provenance.
const { test } = require('node:test');
const assert = require('node:assert');
const { generateWorld } = require('../sim/fleetgen');
const { analyzeLab } = require('../labdoctor/analyze');
const { buildLedger, collapseIncidents, buildPacket } = require('../support/intel');

const world = generateWorld({ healthy: 6, drift: 6, falseFail: 6, envQuota: 6, clarity: 6, falsePass: 4 }, { seed: 42 });
const reportsByLab = Object.fromEntries(world.labs.map((l) => [l.labId, analyzeLab(l)]));

test('ticket classification matches the twin ground truth (class_hint used ONLY as the oracle)', () => {
  const ledger = buildLedger(world.tickets, reportsByLab);
  const misses = [];
  let defectTickets = 0, correct = 0;
  for (const row of ledger) {
    const t = world.tickets.find((x) => x.ticketId === row.ticketId);
    if (t.class_hint === 'noise') {
      if (row.disposition !== 'not-lab-related' && row.disposition !== 'learner-support') misses.push(`${row.ticketId} noise ticket got ${row.disposition}`);
      continue;
    }
    defectTickets++;
    if (row.class === t.class_hint && (row.disposition === 'lab-defect' || row.disposition === 'likely-lab-defect')) correct++;
    else misses.push(`${row.ticketId} expected ${t.class_hint}, got ${row.class}/${row.disposition}`);
  }
  console.log(`    ticket triage: ${correct}/${defectTickets} defect tickets correctly attributed`);
  assert.deepEqual(misses, [], 'every defect ticket must attribute to the seeded class; noise must not become a defect');
});

test('incident collapse: many tickets fold into few root-cause incidents', () => {
  const ledger = buildLedger(world.tickets, reportsByLab);
  const { incidents, stats } = collapseIncidents(ledger, reportsByLab);
  console.log(`    collapse: ${stats.tickets} tickets → ${stats.incidents} incidents (ratio ${stats.collapseRatio}:1)`);
  assert.ok(stats.incidents > 0 && stats.incidents < stats.attachedToRootCause, 'collapse must reduce volume');
  assert.ok(incidents[0].tickets.length >= 2, 'the top incident should aggregate multiple tickets');
  assert.ok(incidents.every((i) => i.draftFix), 'every incident carries the drafted fix summary');
});

test('support packet: evidence-backed, redacted, honest about simulation provenance', () => {
  const driftLab = world.labs.find((l) => l._scenario === 'drift');
  const ticket = world.tickets.find((t) => t.labId === driftLab.labId && t.class_hint === 'drift');
  const learner = world.learnersByLab[driftLab.labId].find((u) => u.deploymentLog.length);
  const packet = buildPacket(ticket, reportsByLab[driftLab.labId], learner);
  assert.equal(packet.triage.disposition, 'lab-defect');
  assert.ok(packet.finding && packet.finding.evidence.length, 'packet carries finding evidence');
  assert.ok(packet.learner.deploymentErrors.some((e) => /SkuNotAvailable/.test(e)), "packet carries the learner's own error");
  assert.ok(/not their error/i.test(packet.suggestedResponse), 'suggested response exonerates the learner when the lab is at fault');
  assert.equal(packet.provenance.dataSource, 'SIMULATED (digital twin)', 'simulation provenance must be explicit');
});

test('healthy-lab ticket does not get blamed on the lab', () => {
  const healthy = world.labs.find((l) => l._scenario === 'healthy');
  const fake = { ticketId: 'T-X', labId: healthy.labId, text: 'I am stuck and confused by everything', simulated: true };
  const packet = buildPacket(fake, reportsByLab[healthy.labId], null);
  assert.notEqual(packet.triage.disposition, 'lab-defect', 'no fleet finding => never assert a lab defect');
});
