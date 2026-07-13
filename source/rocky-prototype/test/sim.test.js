// Digital-twin ground-truth validation: generate seeded fleets with KNOWN defect classes, run the
// engine, and score detection per class. This is the engine's report card — recall on seeded defects,
// restraint on healthy/near-miss labs, and a documented answer to "which classifiers survive a
// pass/fail-only payload world" (the unverified-production worst case).
const { test } = require('node:test');
const assert = require('node:assert');
const { generateWorld } = require('../sim/fleetgen');
const { analyzeLab } = require('../labdoctor/analyze');
const { probeLab } = require('../labdoctor/intel');

const MIX = { healthy: 6, nearMiss: 4, drift: 6, falseFail: 6, falsePass: 6, envQuota: 6, flake: 6, clarity: 6, newDeprecated: 3, compound: 3 };

const hasFinding = (rep, pred) => rep.findings.some(pred);
const CLASS_CHECK = {
  drift: (rep) => hasFinding(rep, (f) => f.type === 'drift' && f.severity === 'critical'),
  'false-fail': (rep) => hasFinding(rep, (f) => f.type === 'validation-bug' && f.subtype !== 'false-pass'),
  'false-pass': (rep) => hasFinding(rep, (f) => f.subtype === 'false-pass'),
  env: (rep) => hasFinding(rep, (f) => f.type === 'env-permission'),
  flake: (rep) => hasFinding(rep, (f) => f.type === 'transient') && rep.status !== 'broken',
  clarity: (rep) => hasFinding(rep, (f) => f.type === 'guide-clarity'),
};

test('ground truth: every seeded defect class is detected; healthy labs stay quiet (seed 42)', () => {
  const world = generateWorld(MIX, { seed: 42 });
  const score = {}; const misses = [];
  for (const lab of world.labs) {
    const gt = world.groundTruth[lab.labId];
    const rep = lab.telemetry.cohorts.length ? analyzeLab(lab) : null;

    if (lab._scenario === 'healthy' || lab._scenario === 'nearMiss') {
      const loud = rep.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
      if (loud.length) misses.push(`${lab.labId} (${lab._scenario}) falsely flagged: ${loud.map((f) => f.type).join(',')}`);
      score.restraint = (score.restraint || { hit: 0, total: 0 }); score.restraint.total++;
      if (!loud.length) score.restraint.hit++;
      continue;
    }
    for (const cls of gt) {
      if (cls === 'deprecated-content') continue; // scored separately via probeLab
      score[cls] = score[cls] || { hit: 0, total: 0 }; score[cls].total++;
      if (CLASS_CHECK[cls](rep)) score[cls].hit++;
      else misses.push(`${lab.labId} (${lab._scenario}) missed ${cls}: found [${rep.findings.map((f) => f.subtype || f.type).join(',')}]`);
    }
  }
  console.log('    per-class scorecard (seed 42):');
  for (const [cls, s] of Object.entries(score)) console.log(`      ${cls.padEnd(12)} ${s.hit}/${s.total}`);
  assert.deepEqual(misses, [], 'every seeded defect must be detected and no healthy lab flagged');
});

test('ground truth holds across 5 different seeds (no fixture-overfitting)', () => {
  for (const seed of [7, 99, 1234, 20260705, 31337]) {
    const world = generateWorld({ drift: 3, falseFail: 3, falsePass: 3, envQuota: 3, flake: 3, clarity: 3, healthy: 3, nearMiss: 2 }, { seed });
    for (const lab of world.labs) {
      const rep = analyzeLab(lab);
      const gt = world.groundTruth[lab.labId];
      if (!gt.length) {
        assert.equal(rep.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length, 0, `seed ${seed}: ${lab.labId} (${lab._scenario}) must not be flagged`);
      } else {
        for (const cls of gt) assert.ok(CLASS_CHECK[cls](rep), `seed ${seed}: ${lab.labId} must yield ${cls}`);
      }
    }
  }
});

test('compound labs: drift is detected AND the false-pass is not masked by it', () => {
  const world = generateWorld({ compound: 5 }, { seed: 42 });
  for (const lab of world.labs) {
    const rep = analyzeLab(lab);
    assert.ok(CLASS_CHECK.drift(rep), `${lab.labId} compound must detect drift`);
    assert.ok(CLASS_CHECK['false-pass'](rep), `${lab.labId} compound must ALSO detect the false-pass`);
  }
});

test('drift absorption: the downstream symptom validation does not create a second loud finding', () => {
  const world = generateWorld({ drift: 6 }, { seed: 8 });
  for (const lab of world.labs) {
    const rep = analyzeLab(lab);
    const loud = rep.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
    assert.equal(loud.length, 1, `${lab.labId}: exactly one loud finding (drift), got ${loud.map((f) => f.type).join(',')}`);
  }
});

test('new labs with deprecated content: engine abstains (status new), pre-launch lint catches the token', async () => {
  const world = generateWorld({ newDeprecated: 4 }, { seed: 5 });
  for (const lab of world.labs) {
    const rep = analyzeLab(lab);
    assert.equal(rep.status, 'new');
    assert.equal(rep.score, null);
    const probe = await probeLab(lab);
    assert.ok(probe.findings.some((f) => f.type === 'DEPRECATED_DEPENDENCY'), `${lab.labId} lint must catch the deprecated model`);
  }
});

test('pass/fail-only payload world (production worst case): documents which classifiers survive', () => {
  const world = generateWorld({ drift: 4, falseFail: 4, falsePass: 4, envQuota: 4, flake: 4, clarity: 4 }, { seed: 42, payloadRichness: 'passfail' });
  const survives = {}, dies = {};
  for (const lab of world.labs) {
    const rep = analyzeLab(lab);
    for (const cls of world.groundTruth[lab.labId]) {
      const ok = CLASS_CHECK[cls](rep);
      (ok ? survives : dies)[cls] = ((ok ? survives : dies)[cls] || 0) + 1;
    }
  }
  console.log('    pass/fail-only world → survive:', JSON.stringify(survives), ' die:', JSON.stringify(dies));
  // Documented expectation: observed{}-dependent classes (drift/false-fail/false-pass) need payload
  // richness; env/flake/clarity ride on errors, retry markers, and timings, so they must survive.
  assert.ok((survives.env || 0) === 4 && (survives.flake || 0) === 4 && (survives.clarity || 0) === 4, 'env/flake/clarity must survive pass/fail-only payloads');
  assert.ok(!survives['false-pass'], 'false-pass detection requires observed{} — must be documented as payload-gated');
});

test('simulated tickets correlate with seeded defects and never come from false-pass (silent by definition)', () => {
  const world = generateWorld(MIX, { seed: 42 });
  assert.ok(world.tickets.length > 0);
  assert.ok(world.tickets.every((t) => t.simulated === true), 'every ticket is labeled simulated');
  assert.ok(!world.tickets.some((t) => t.class_hint === 'false-pass'), 'false-pass generates no tickets — that is the point of the class');
});
