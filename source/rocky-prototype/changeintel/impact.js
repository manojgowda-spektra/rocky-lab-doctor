// Change Intelligence — impact assessment: join candidate changes against the real lab corpus.
// "35 labs reference a service retiring in 90 days" = candidates × inverted content index.
// Deterministic word-boundary matching with the scanner's hardening lessons (code fences kept —
// impact analysis WANTS code references too; a retiring runtime in a code sample still breaks labs).

const fs = require('fs');
const path = require('path');

// vendor/generated content is NOT lab content — a "Python 2.6" comment inside an installed pip
// package says nothing about the lab (first live run taught this: .venv noise drowned real signal)
const SKIP_DIRS = new Set(['.git', 'node_modules', '.devcontainer', '.vscode', '.github', '.storybook', 'dist', 'build', '__pycache__', 'archived', 'archive', '.venv', 'venv', 'env', 'site-packages', 'vendor', 'bin', 'obj']);
const SCAN_EXT = /\.(md|json|ya?ml|tf|bicep|ps1|sh|py|js|ts|cs|ipynb|txt)$/i;
const MAX_FILE = 512 * 1024;
const MAX_LINE = 400; // minified single-line files produce unreadable evidence — skip those lines

function* walk(dir) {
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(path.join(dir, e.name)); }
    else if (e.isFile() && SCAN_EXT.test(e.name)) yield path.join(dir, e.name);
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Assess candidates against a root of lab repos. Returns per-candidate hits with file:line evidence.
function assessImpact(candidates, labsRoot, { maxHitsPerCandidate = 50 } = {}) {
  const repos = fs.readdirSync(labsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const withTokens = candidates.filter((c) => (c.tokens || []).length);
  const matchers = withTokens.map((c) => ({ c, res: c.tokens.map((t) => new RegExp('\\b' + escapeRe(t) + '\\b', 'i')) }));
  const hits = new Map(); // candidate.id -> [{repo,file,line,evidence,token}]

  for (const repo of repos) {
    for (const file of walk(path.join(labsRoot, repo))) {
      let content; try { if (fs.statSync(file).size > MAX_FILE) continue; content = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const rel = path.relative(path.join(labsRoot, repo), file).replace(/\\/g, '/');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > MAX_LINE) continue;
        for (const { c, res } of matchers) {
          const list = hits.get(c.id) || [];
          if (list.length >= maxHitsPerCandidate) continue;
          const idx = res.findIndex((re) => re.test(lines[i]));
          if (idx === -1) continue;
          list.push({ repo, file: rel, line: i + 1, token: c.tokens[idx], evidence: lines[i].trim().slice(0, 180) });
          hits.set(c.id, list);
        }
      }
    }
  }

  return withTokens
    .map((c) => {
      const h = hits.get(c.id) || [];
      const reposAffected = [...new Set(h.map((x) => x.repo))];
      return { ...c, affectedRepos: reposAffected, affectedRepoCount: reposAffected.length, referenceCount: h.length, references: h };
    })
    .filter((r) => r.referenceCount > 0)
    .sort((a, b) => (a.daysUntil ?? 9e9) - (b.daysUntil ?? 9e9) || b.referenceCount - a.referenceCount);
}

function renderReport(impacts, { totalCandidates }) {
  const lines = [`CHANGE INTELLIGENCE — IMPACT REPORT`, `candidates checked: ${totalCandidates} · with catalog impact: ${impacts.length}`, ''];
  for (const r of impacts) {
    const when = r.status === 'already-eol' ? `EOL ${r.date} (ALREADY PASSED)` : r.date ? `${r.type} ${r.date} (${r.daysUntil} days)` : r.type;
    lines.push(`⚠ ${r.affectedRepoCount} repo(s), ${r.referenceCount} reference(s) → ${r.product}${r.cycle ? ' ' + r.cycle : ''} — ${when}`);
    lines.push(`    source: ${r.source} · ${r.citation}`);
    for (const h of r.references.slice(0, 3)) lines.push(`    ${h.repo}/${h.file}:${h.line}  "${h.evidence.slice(0, 90)}"`);
    if (r.referenceCount > 3) lines.push(`    … and ${r.referenceCount - 3} more`);
    lines.push('');
  }
  if (!impacts.length) lines.push('No candidate changes currently touch the catalog. (That is a real answer, not a failure.)');
  return lines.join('\n');
}

module.exports = { assessImpact, renderReport };
