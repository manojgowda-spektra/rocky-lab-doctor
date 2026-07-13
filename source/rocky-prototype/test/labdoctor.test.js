// Lab Doctor engine tests — the RCA layer is the value center, so it gets the coverage.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { analyzeLab, analyzeCatalog, applyApprovedFixes, simulatePostFixOutcome, computeRisk, labTags, observedMatchesExpected, hasKeys } = require('../labdoctor/analyze');
const { deterministicProbe, probeLab } = require('../labdoctor/intel');

const catalog = require('../fixtures/lab-catalog.json');
const labA = catalog.labs.find((l) => l.labId === 'ODL-DEMO-0001'); // deliberately broken (drift + false-fail + clarity)
const labB = catalog.labs.find((l) => l.labId === 'ODL-DEMO-0002'); // healthy
const labC = catalog.labs.find((l) => l.labId === 'ODL-DEMO-0003'); // transient — must NOT be flagged broken
const labD = catalog.labs.find((l) => l.labId === 'ODL-DEMO-0004'); // region drift (twin of A → fleet pattern)
const labE = catalog.labs.find((l) => l.labId === 'ODL-DEMO-0005'); // quota / env-permission
const labF = catalog.labs.find((l) => l.labId === 'ODL-DEMO-0006'); // false-PASS (silent validator bug)

test('observedMatchesExpected: all expected keys must be present and equal', () => {
  assert.equal(observedMatchesExpected({ region: 'westus2' }, { region: 'westus2' }), true);
  assert.equal(observedMatchesExpected({ region: 'eastus' }, { region: 'westus2' }), false);
  assert.equal(observedMatchesExpected({}, { region: 'westus2' }), false); // missing key
  assert.equal(observedMatchesExpected({ a: 1 }, {}), false); // empty expected never "matches"
});

test('Lab A is classified broken with a low completion rate', () => {
  const r = analyzeLab(labA);
  assert.equal(r.status, 'broken');
  assert.ok(r.score < 60, `score ${r.score} should be < 60`);
  assert.ok(r.completionRate < 0.2, `completion ${r.completionRate} should be low`);
});

test('Lab A detects region drift as a critical finding, with the SkuNotAvailable error correlated', () => {
  const r = analyzeLab(labA);
  const drift = r.findings.find((f) => f.type === 'drift');
  assert.ok(drift, 'expected a drift finding');
  assert.equal(drift.severity, 'critical');
  assert.ok(drift.evidence.some((e) => /SkuNotAvailable/.test(e)), 'drift should cite the correlated SKU error');
  assert.equal(drift.draftFix.target, 'guide');
});

test('Lab A does NOT double-report the VM-not-running symptom (V-008 is absorbed into drift)', () => {
  const r = analyzeLab(labA);
  const drift = r.findings.find((f) => f.type === 'drift');
  assert.ok(drift.validationIds.includes('V-008'), 'V-008 should be folded into the drift finding');
  const standaloneV008 = r.findings.filter((f) => f.type !== 'drift' && (f.validationIds || []).includes('V-008'));
  assert.equal(standaloneV008.length, 0, 'V-008 should not produce its own separate finding');
});

test('Lab A flags the validation bug: successful learners failing the check (the C3 signal)', () => {
  const r = analyzeLab(labA);
  const bug = r.findings.find((f) => f.type === 'validation-bug');
  assert.ok(bug, 'expected a validation-bug finding');
  assert.equal(bug.severity, 'critical');
  assert.deepEqual(bug.validationIds, ['V-009']);
  assert.ok(bug.confidence >= 0.85);
  assert.equal(bug.draftFix.target, 'validation', 'fix must target the CHECK, not the learner');
});

test('Lab A flags the confusing step as guide-clarity (medium, not broken)', () => {
  const r = analyzeLab(labA);
  const clarity = r.findings.find((f) => f.type === 'guide-clarity');
  assert.ok(clarity, 'expected a guide-clarity finding');
  assert.equal(clarity.severity, 'medium');
  assert.equal(clarity.stepGuid, 'S-04');
});

test('findings are ranked by fleet impact (severity, then learners affected)', () => {
  const r = analyzeLab(labA);
  const ranks = r.findings.map((f) => ['critical', 'high', 'medium', 'low', 'info'].indexOf(f.severity));
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i] >= ranks[i - 1], 'severity must be non-decreasing');
});

test('Lab B is healthy with no actionable (non-low) findings', () => {
  const r = analyzeLab(labB);
  assert.equal(r.status, 'healthy');
  assert.equal(r.findingCount, 0, 'a genuine minority learner-miss must not be flagged as a lab defect');
});

test('Lab C: a transient (retry-resolved) issue is downgraded, NOT flagged broken', () => {
  const r = analyzeLab(labC);
  assert.notEqual(r.status, 'broken', 'transient propagation delays must never mark a lab broken');
  const transient = r.findings.find((f) => f.type === 'transient');
  assert.ok(transient, 'expected the transient to be surfaced');
  assert.equal(transient.severity, 'low');
  assert.equal(r.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length, 0);
});

test('every finding carries evidence and a draft (never-silent, human-approved) fix', () => {
  for (const lab of catalog.labs) {
    for (const f of analyzeLab(lab).findings) {
      assert.ok(Array.isArray(f.evidence) && f.evidence.length, `${f.type} must carry evidence`);
      assert.ok(f.draftFix && f.draftFix.after, `${f.type} must carry a draft fix`);
      assert.ok(typeof f.confidence === 'number', `${f.type} must carry a confidence`);
    }
  }
});

test('catalog rolls up worst-first with an aggregate health score', () => {
  const c = analyzeCatalog(catalog);
  assert.equal(c.labCount, catalog.labs.length);
  assert.ok(c.broken >= 1);
  assert.equal(c.labs[0].labId, 'ODL-DEMO-0001', 'worst lab should sort first');
  assert.ok(c.catalogHealth > 0 && c.catalogHealth < 100);
});

test('hasKeys distinguishes "wrong value" from "not measured"', () => {
  assert.equal(hasKeys({ publicAccess: true }, { publicAccess: false }), true);
  assert.equal(hasKeys({ other: 1 }, { publicAccess: false }), false);
  assert.equal(hasKeys({}, {}), false);
});

test('false-PASS: a check silently passing wrong work is flagged critical (Lab F)', () => {
  const r = analyzeLab(labF);
  const fp = r.findings.find((f) => f.subtype === 'false-pass');
  assert.ok(fp, 'expected a false-pass finding');
  assert.equal(fp.type, 'validation-bug');
  assert.equal(fp.severity, 'critical');
  assert.equal(fp.draftFix.target, 'validation', 'the fix tightens the check');
  assert.equal(r.status, 'broken');
});

test('env/permission cluster (quota) is detected and carries a signature (Lab E)', () => {
  const r = analyzeLab(labE);
  const env = r.findings.find((f) => f.type === 'env-permission');
  assert.ok(env, 'expected an env-permission finding');
  assert.ok(String(env.signature).startsWith('env:'), 'env finding must carry a cross-lab signature');
});

test('preview-fix-impact: approving Lab A fixes models a healthy outcome with higher completion (a projection, not a test)', () => {
  const rv = simulatePostFixOutcome(labA);
  assert.equal(rv.before.status, 'broken');
  assert.equal(rv.after.status, 'healthy');
  assert.ok(rv.after.score >= 95, `after ${rv.after.score} should be ~100`);
  assert.ok(rv.after.completionRate > rv.before.completionRate, 'completion should climb');
  assert.equal(rv.after.findings.filter((f) => f.severity === 'critical').length, 0);
});

test('the impact-preview model never fabricates a false-PASS (flipping a check to pass also fixes observed state)', () => {
  const before = analyzeLab(labE);
  const ids = before.findings.filter((f) => f.severity !== 'low').map((f) => f.id);
  const after = analyzeLab(applyApprovedFixes(labE, ids));
  assert.ok(!after.findings.some((f) => f.subtype === 'false-pass'), 'healing must not create a false-pass');
  assert.ok(after.score >= before.score, 'healing must not lower the score');
});

test('cross-lab fleet pattern: two labs with the same region-drift root cause are correlated', () => {
  const c = analyzeCatalog(catalog);
  assert.ok(c.fleetPatterns.length >= 1, 'expected at least one fleet pattern');
  const drift = c.fleetPatterns.find((p) => p.signature.startsWith('platform-drift'));
  assert.ok(drift, 'expected a platform-drift fleet pattern');
  assert.ok(drift.labCount >= 2, 'a fleet pattern needs >= 2 labs');
  assert.ok(/platform-level change/i.test(drift.headline));
});

test('catalog reports a healed (projected) health above current', () => {
  const c = analyzeCatalog(catalog);
  assert.ok(c.healedCatalogHealth >= c.catalogHealth, 'projected healed health should be >= current');
});

// ---- proactive intelligence layer ----
const labNew = catalog.labs.find((l) => l.labId === 'ODL-DEMO-0012'); // zero telemetry
const labRisk = catalog.labs.find((l) => l.labId === 'ODL-DEMO-0011'); // healthy but at-risk

test('labTags derives SKU family and region-selectable from the spec text', () => {
  const t = labTags(labRisk);
  assert.equal(t.skuFamily, 'D-series');
  assert.equal(t.regionSelectable, true);
});

test('a zero-telemetry lab is "new" (never falsely "healthy") with a null score', () => {
  const r = analyzeLab(labNew);
  assert.equal(r.status, 'new');
  assert.equal(r.score, null);
  assert.equal(r.totalLearners, 0);
});

test('catalog excludes "new" labs from health average + counts them separately', () => {
  const c = analyzeCatalog(catalog);
  assert.ok(c.newCount >= 1);
  assert.ok(c.catalogHealth > 0 && c.catalogHealth <= 100);
});

test('risk radar predicts a healthy lab will break next (shares a drifting SKU family) — plain evidence flags, no score', () => {
  const c = analyzeCatalog(catalog);
  const hit = c.riskRadar.find((r) => r.labId === 'ODL-DEMO-0011');
  assert.ok(hit, 'expected the D-series lab on the risk radar');
  assert.ok(hit.flags.some((f) => f.type === 'shares-active-drift'), 'expected a shares-active-drift flag');
  assert.ok(/D-series/.test(hit.narrative));
  assert.ok(!('band' in hit) && !('riskScore' in hit) && !('horizon' in hit), 'no score/band/horizon — a complexity audit cut the guessed-weight formula');
});

test('risk radar only flags currently-HEALTHY labs (not ones already broken)', () => {
  const c = analyzeCatalog(catalog);
  const brokenIds = new Set(c.labs.filter((l) => l.status === 'broken').map((l) => l.labId));
  assert.ok(c.riskRadar.every((r) => !brokenIds.has(r.labId)), 'a broken lab must not appear on the "will break next" radar');
});

test('risk radar separates a verifiable fact (retired-dependency) from an observed-this-run inference (shares-active-drift)', () => {
  const c = analyzeCatalog(catalog);
  const hit = c.riskRadar.find((x) => x.labId === 'ODL-DEMO-0011');
  assert.ok(hit, 'expected the D-series lab on the radar');
  assert.ok(!hit.flags.some((f) => f.type === 'retired-dependency'), 'Lab 0011 itself hardcodes no retired token');
  assert.ok(hit.flags.some((f) => f.type === 'shares-active-drift'));
});

test('deterministic probe catches a retired SKU token (zero model risk) and anchors it verbatim', () => {
  const findings = deterministicProbe(labE); // Lab E hardcodes Standard_NC6s_v3 (retired 2025-09-30)
  const rip = findings.find((f) => f.type === 'RETIRED_SKU_TOKEN');
  assert.ok(rip, 'expected a retired-SKU finding');
  assert.equal(rip.evidenceType, 'PREDICTED');
  assert.ok(rip.confidence >= 0.85, 'deterministic token match is high-confidence');
  assert.equal(rip.quotedTrigger, 'Standard_NC6s_v3');
});

test('deterministic probe does not double-count a token that is a substring of a longer matched token', () => {
  const findings = deterministicProbe(labE).filter((f) => f.type === 'RETIRED_SKU_TOKEN');
  const tokens = findings.map((f) => f.quotedTrigger);
  assert.ok(tokens.includes('Standard_NC6s_v3'));
  assert.ok(!tokens.includes('Standard_NC6'), 'the substring token must be suppressed');
});

test('probeLab skips labs that already have telemetry — real evidence beats a lint pass', () => {
  return probeLab(labE).then((r) => {
    assert.equal(r.skipped, true);
    assert.equal(r.findings.length, 0);
  });
});

test('probeLab runs the lint for a zero-telemetry (new) lab', () => {
  const labNewLocal = catalog.labs.find((l) => l.labId === 'ODL-DEMO-0012');
  return probeLab(labNewLocal).then((r) => {
    assert.equal(r.skipped, undefined);
    assert.ok(Array.isArray(r.findings));
  });
});
