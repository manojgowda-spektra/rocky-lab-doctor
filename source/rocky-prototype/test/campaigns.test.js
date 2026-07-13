// Campaign planner semantics: registry-driven findings batch by upstream cause ACROSS repos;
// broken asset links stay per-repo (no fake shared cause); cross-repo campaigns outrank bigger
// single-repo cleanups; coverage math is honest.
const { test } = require('node:test');
const assert = require('node:assert');
const { buildCampaignPlan } = require('../labdoctor/campaigns');

const F = (type, token, file, extra = {}) => ({ type, token, file, line: 1, evidence: `uses ${token}`, replacement: null, note: null, ...extra });

const SCAN = {
  scannedAt: '2026-07-05', root: 'X',
  repos: [
    { name: 'repo-a', findings: [
      F('DEPRECATED_DEPENDENCY', 'old-model', 'a1.md', { replacement: 'new-model' }),
      F('DEPRECATED_DEPENDENCY', 'old-model', 'a2.md', { replacement: 'new-model' }),
      F('BROKEN_ASSET_LINK', './img/x.png', 'a1.md'),
      F('BROKEN_ASSET_LINK', './img/y.png', 'a1.md'),
      F('BROKEN_ASSET_LINK', './img/z.png', 'a3.md'),
    ] },
    { name: 'repo-b', findings: [
      F('DEPRECATED_DEPENDENCY', 'old-model', 'b1.md', { replacement: 'new-model' }),
      F('BROKEN_ASSET_LINK', './img/q.png', 'b1.md'),
    ] },
    { name: 'repo-clean', findings: [] },
  ],
};

test('one upstream cause = one campaign across repos; asset links stay per-repo', () => {
  const plan = buildCampaignPlan(SCAN);
  assert.equal(plan.stats.findings, 7, 'every finding lands in exactly one campaign');

  const dep = plan.campaigns.find((c) => c.cause.kind === 'upstream-change' && c.cause.token === 'old-model');
  assert.equal(dep.repoCount, 2, 'the registry change batches across both repos');
  assert.equal(dep.findings, 3);
  assert.equal(dep.fileCount, 3);

  const assetCampaigns = plan.campaigns.filter((c) => c.type === 'BROKEN_ASSET_LINK');
  assert.equal(assetCampaigns.length, 2, 'asset links form one campaign PER repo, never cross-repo');
  assert.ok(assetCampaigns.every((c) => c.repoCount === 1));
  const aAssets = assetCampaigns.find((c) => c.cause.repo === 'repo-a');
  assert.equal(aAssets.findings, 3);
  assert.equal(aAssets.fileCount, 2, 'distinct files counted, not findings');
});

test('ranking amortizes decisions: cross-repo campaign outranks a bigger single-repo cleanup', () => {
  const plan = buildCampaignPlan(SCAN);
  assert.equal(plan.campaigns[0].cause.token, 'old-model', 'the 2-repo campaign ranks first despite fewer findings than repo-a assets');
  assert.equal(plan.stats.crossRepoCampaigns, 1);
  assert.ok(plan.campaigns[0].campaignId === 'CAMP-01');
});

test('coverage and provenance are honest', () => {
  const plan = buildCampaignPlan(SCAN);
  const top3 = plan.campaigns.slice(0, 3).reduce((n, c) => n + c.findings, 0);
  assert.equal(plan.stats.top3CoveragePct, Math.round((100 * top3) / 7));
  assert.match(plan.source.provenance, /REAL repository scan/);
  for (const c of plan.campaigns) for (const r of c.repos) {
    assert.match(r.owner, /LABOWNERS pending/, 'owners are never invented');
    assert.ok(r.samples.length <= 3 && r.samples.every((s) => s.file), 'evidence samples are bounded and cited');
  }
  assert.deepEqual(buildCampaignPlan({ repos: [] }).stats, { campaigns: 0, findings: 0, crossRepoCampaigns: 0, top3CoveragePct: 0 }, 'empty scan yields an empty, non-crashing plan');
});
