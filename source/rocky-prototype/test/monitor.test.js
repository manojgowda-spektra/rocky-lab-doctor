// Continuous-monitoring scored against a scripted fleet timeline: regressions detected on the very
// next sweep (MTTD = 1 sweep interval), multi-lab platform events collapse to ONE incident, recoveries
// detected, and — critically — a steady state produces total silence (no alert churn).
const { test } = require('node:test');
const assert = require('node:assert');
const { generateWorld, injectScenario, healLab } = require('../sim/fleetgen');
const { createMonitor } = require('../monitor/sweeper');

test('fleet timeline: break → detect next sweep → platform incident folds N labs → recovery → silence', () => {
  const world = generateWorld({ healthy: 10 }, { seed: 77, coverageGapChance: 0 });
  const mon = createMonitor();
  const ids = world.labs.map((l) => l.labId);

  // Sweeps 1-2: steady healthy fleet
  const s1 = mon.sweep(world.labs, 1);
  const s2 = mon.sweep(world.labs, 2);
  assert.equal(s1.alerts.length, 0, 'first sweep of a healthy fleet: silence');
  assert.equal(s2.alerts.length, 0, 'unchanged fleet: silence (idempotent)');

  // Sweep 3: one lab silently develops a false-pass
  injectScenario(world, ids[0], 'falsePass', 301);
  const s3 = mon.sweep(world.labs, 3);
  const fpAlert = s3.alerts.find((a) => a.labId === ids[0]);
  assert.ok(fpAlert && fpAlert.classes.includes('false-pass'), 'the silent failure is caught on the very next sweep');
  assert.equal(s3.alerts.length, 1, 'exactly one alert — no churn from the 9 unchanged labs');
  assert.equal(mon.detectionSweep(ids[0], 'false-pass'), 3, 'MTTD = the sweep right after the break');

  // Sweep 4: platform event — ONE region/SKU change hits 4 labs that share the same region pair
  // (that shared pair is what makes it a platform event rather than four coincidences)
  for (const id of ids.slice(1, 5)) {
    const lab = world.labs.find((l) => l.labId === id);
    lab.expectedRegion = 'westus2'; lab.wrongRegion = 'eastus'; lab.sku = 'Standard_D4s_v5';
    injectScenario(world, id, 'drift', 400);
  }
  const s4 = mon.sweep(world.labs, 4);
  const incident = s4.alerts.find((a) => a.type === 'platform-incident');
  assert.ok(incident, 'multi-lab same-signature break must raise a platform incident');
  assert.equal(incident.labIds.length, 4, `ONE incident must group all 4 labs, got ${incident && incident.labIds}`);
  assert.ok(s4.alerts.filter((a) => a.labId === ids[0]).length === 0, 'the sweep-3 false-pass lab is unchanged — no re-alert');
  const folded = s4.alerts.filter((a) => a.foldedInto);
  assert.ok(folded.length >= 2, 'per-lab alerts are folded into the incident, not duplicated');

  // Sweep 5: nothing changed — silence again, even with a broken fleet (steady state != new news)
  const s5 = mon.sweep(world.labs, 5);
  assert.equal(s5.alerts.length, 0, 'steady broken state produces no new alerts');

  // Sweep 6: one drifted lab gets fixed
  healLab(world, ids[1], 600);
  const s6 = mon.sweep(world.labs, 6);
  const rec = s6.alerts.find((a) => a.type === 'recovery' && a.labId === ids[1]);
  assert.ok(rec, 'recovery is detected and reported');
  assert.ok(rec.scoreAfter > rec.scoreBefore, 'recovery alert carries the score improvement');
});

test('same-signature drift arriving in DIFFERENT sweeps stays per-lab (no false platform incident)', () => {
  const world = generateWorld({ healthy: 6 }, { seed: 88, coverageGapChance: 0 });
  const ids = world.labs.map((l) => l.labId);
  const mon = createMonitor();
  mon.sweep(world.labs, 1);
  injectScenario(world, ids[0], 'drift', 100);
  const s2 = mon.sweep(world.labs, 2);
  injectScenario(world, ids[1], 'drift', 200);
  const s3 = mon.sweep(world.labs, 3);
  assert.ok(!s2.alerts.some((a) => a.type === 'platform-incident'), 'one lab drifting is not a platform incident');
  assert.ok(!s3.alerts.some((a) => a.type === 'platform-incident'), 'staggered arrivals are separate lab events, not one incident');
});

test('monitor never alerts on a fleet that was born broken and stays broken (baseline, then silence)', () => {
  const world = generateWorld({ drift: 4, healthy: 4 }, { seed: 99 });
  const mon = createMonitor();
  const s1 = mon.sweep(world.labs, 1);
  assert.ok(s1.alerts.length >= 4, 'first sweep baselines existing breakage as new findings');
  const s2 = mon.sweep(world.labs, 2);
  const s3 = mon.sweep(world.labs, 3);
  assert.equal(s2.alerts.length + s3.alerts.length, 0, 'known-broken steady state: silence until something CHANGES');
});
