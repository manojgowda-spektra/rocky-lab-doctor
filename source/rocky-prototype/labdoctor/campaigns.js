// Fix Campaign Planner — the DRY-RUN layer of fleet fix campaigns. Groups real-scan findings into
// batched work units so merge-constrained humans see "6 campaigns" instead of "104 findings".
// Deliberately does NOT open PRs: detection already outruns merge capacity (2 fix PRs sat unmerged
// while 4 more were possible); piling on more PRs is the failure mode, a ranked plan is the fix.
//
// Grouping semantics follow the cause, not the symptom:
//  - registry-driven types (DEPRECATED_DEPENDENCY / RENAMED_PRODUCT / RETIRED_SKU / EOL_RUNTIME):
//    ONE upstream change = ONE campaign across every repo it touches (the Dependabot shape)
//  - BROKEN_ASSET_LINK: per-repo campaigns — each broken path is local hygiene with no shared
//    upstream cause, so batching across repos would be a fake unit of work
//
// Owner routing: production uses a LABOWNERS file per repo; until those exist the repo itself is
// the routing unit and owners are honestly 'repo maintainer', never invented.

const fs = require('fs');
const path = require('path');

const REGISTRY_TYPES = new Set(['DEPRECATED_DEPENDENCY', 'RENAMED_PRODUCT', 'RETIRED_SKU', 'EOL_RUNTIME']);

// Plain-English titles for per-repo campaigns, keyed by finding type. Without this, every per-repo
// campaign inherited "Fix broken asset links" — which mislabelled four of thirteen campaigns,
// including the translated-guide credential losses that are the most serious findings in the set.
const REPO_CAMPAIGN_TITLES = {
  BROKEN_ASSET_LINK: 'Fix broken image links',
  ASSET_CASE_MISMATCH: 'Fix path capitalisation (works on Windows, 404s on GitHub)',
  INJECT_TOKEN_LOSS: 'Restore lost credential tokens in translated guides',
  LOCALE_POINTER_DRIFT: 'Realign translated guides to one release branch',
};

function buildCampaignPlan(scan) {
  const groups = new Map();
  for (const repo of scan.repos || []) {
    for (const f of repo.findings || []) {
      const key = REGISTRY_TYPES.has(f.type) ? `${f.type}|${f.token}` : `${f.type}|${repo.name}`;
      if (!groups.has(key)) {
        groups.set(key, {
          type: f.type,
          cause: REGISTRY_TYPES.has(f.type)
            ? { kind: 'upstream-change', token: f.token, replacement: f.replacement || null, note: f.note || null }
            : { kind: 'repo-hygiene', repo: repo.name, note: 'broken asset paths local to this repo' },
          repos: new Map(),
          findings: 0,
        });
      }
      const g = groups.get(key);
      g.findings++;
      if (!g.repos.has(repo.name)) g.repos.set(repo.name, { repo: repo.name, owner: 'repo maintainer (LABOWNERS pending)', findings: 0, files: new Set(), samples: [] });
      const r = g.repos.get(repo.name);
      r.findings++;
      r.files.add(f.file);
      if (r.samples.length < 3) r.samples.push({ file: f.file, line: f.line, evidence: (f.evidence || '').slice(0, 120) });
    }
  }

  let seq = 0;
  const campaigns = [...groups.values()]
    .map((g) => {
      const repos = [...g.repos.values()].map((r) => ({ ...r, files: r.files.size })).sort((a, b) => b.findings - a.findings);
      return {
        type: g.type, cause: g.cause,
        // Per-repo campaigns are NOT all broken images: inject-token loss, path-case mismatch and
        // stale locale pointers all group per-repo too, and calling them "broken asset links" made
        // four campaigns lie about what they contain. Title from the finding TYPE, not the grouping.
        title: g.cause.kind === 'upstream-change'
          ? `Replace "${g.cause.token}"${g.cause.replacement ? ` with "${g.cause.replacement}"` : ''} fleet-wide`
          : `${REPO_CAMPAIGN_TITLES[g.type] || 'Fix ' + g.type.toLowerCase().replace(/_/g, ' ')} — ${g.cause.repo}`,
        repos, repoCount: repos.length,
        fileCount: repos.reduce((n, r) => n + r.files, 0),
        findings: g.findings,
      };
    })
    // one upstream cause touching many repos outranks a bigger single-repo cleanup: the whole point
    // of a campaign is amortizing ONE decision across the fleet
    .sort((a, b) => b.repoCount - a.repoCount || b.findings - a.findings)
    .map((c) => ({ campaignId: `CAMP-${String(++seq).padStart(2, '0')}`, ...c }));

  const totalFindings = campaigns.reduce((n, c) => n + c.findings, 0);
  const top3 = campaigns.slice(0, 3).reduce((n, c) => n + c.findings, 0);
  return {
    source: { scannedAt: scan.scannedAt || null, root: scan.root || null, provenance: 'REAL repository scan (labdoctor/scan-real.js)' },
    campaigns,
    stats: {
      campaigns: campaigns.length,
      findings: totalFindings,
      crossRepoCampaigns: campaigns.filter((c) => c.repoCount >= 2).length,
      top3CoveragePct: totalFindings ? Math.round((100 * top3) / totalFindings) : 0,
    },
  };
}

module.exports = { buildCampaignPlan };

// CLI: node labdoctor/campaigns.js [scan-results.json] [out.json]
if (require.main === module) {
  const src = process.argv[2] || path.join(__dirname, 'real-scan-results.json');
  const out = process.argv[3] || path.join(__dirname, 'campaign-plan.json');
  const plan = buildCampaignPlan(JSON.parse(fs.readFileSync(src, 'utf8')));
  fs.writeFileSync(out, JSON.stringify(plan, null, 1));
  console.log(`${plan.stats.campaigns} campaign(s) cover ${plan.stats.findings} finding(s); top 3 cover ${plan.stats.top3CoveragePct}%  →  ${out}\n`);
  for (const c of plan.campaigns) {
    console.log(`${c.campaignId}  ${c.title}`);
    console.log(`         ${c.repoCount} repo(s) · ${c.fileCount} file(s) · ${c.findings} finding(s)  [${c.repos.map((r) => r.repo).join(', ')}]`);
  }
}
