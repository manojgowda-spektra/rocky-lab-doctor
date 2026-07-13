#!/usr/bin/env node
// Lab Doctor — content-freshness CI gate for lab-guide repositories.
// Self-contained (Node >=18 stdlib only). Deterministic: token registry + word-boundary matching
// + code-fence awareness + broken relative image links. Exits non-zero when NEW findings appear
// versus the committed baseline, so rot cannot merge — while pre-existing findings don't block.
//
// Usage:
//   node labdoctor-scan.js [repoRoot=.]                      # report all findings, exit 0
//   node labdoctor-scan.js --check [repoRoot=.]              # fail (exit 1) on findings NEW vs baseline
//   node labdoctor-scan.js --update-baseline [repoRoot=.]    # accept current findings as the baseline
//
// Baseline file: .labdoctor-baseline.json at repo root (commit it).
// Registry: registry.json next to this script (curated, reviewable, versioned).

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const UPDATE = args.includes('--update-baseline');
const ROOT = path.resolve(args.filter((a) => !a.startsWith('--'))[0] || '.');
const BASELINE_FILE = path.join(ROOT, '.labdoctor-baseline.json');
const REGISTRY = JSON.parse(fs.readFileSync(path.join(__dirname, 'registry.json'), 'utf8'));

const SKIP_DIRS = new Set(['.git', 'node_modules', '.devcontainer', '.vscode', '.github', '.storybook', 'dist', 'build', '__pycache__', 'archived', 'archive']);
const MEDIA_EXT = /\.(png|jpg|jpeg|gif|svg|webp)$/i;

const TOKENS = [
  ...(REGISTRY.retiredSkus || []).map((s) => ({ token: s.token, type: 'RETIRED_SKU', replacement: s.replacement, note: s.note })),
  ...(REGISTRY.deprecatedCommands || []).map((c) => ({ token: c.token, type: 'DEPRECATED_DEPENDENCY', replacement: c.replacement, note: c.note })),
  ...(REGISTRY.renamedProducts || []).map((r) => ({ token: r.token, type: 'RENAMED_PRODUCT', replacement: r.replacement, note: r.note })),
  ...(REGISTRY.eolRuntimes || []).map((e) => ({ token: e.token, type: 'EOL_RUNTIME', replacement: e.replacement, note: e.note })),
].map((t) => ({ ...t, re: new RegExp('\\b' + t.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') }));

function* walkMd(dir) {
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walkMd(path.join(dir, e.name)); }
    else if (e.isFile() && /\.md$/i.test(e.name)) yield path.join(dir, e.name);
  }
}

const IMG_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function scan() {
  const findings = [];
  let files = 0;
  for (const file of walkMd(ROOT)) {
    files++;
    let content; try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const fileDir = path.dirname(file);
    let inFence = false;
    content.split(/\r?\n/).forEach((line, i) => {
      if (/^\s*```/.test(line)) inFence = !inFence;
      for (const t of TOKENS) {
        if (!t.re.test(line)) continue;
        if (t.type === 'RENAMED_PRODUCT' && t.replacement && line.toLowerCase().includes(t.replacement.toLowerCase())) continue; // self-aware line
        findings.push({ type: t.type, token: t.token, file: rel, line: i + 1, evidence: line.trim().slice(0, 200), replacement: t.replacement, note: t.note });
      }
      if (!inFence) {
        let m;
        while ((m = IMG_RE.exec(line)) !== null) {
          const target = m[1];
          if (/^(https?:)?\/\//i.test(target) || target.startsWith('data:') || /[{}]/.test(target)) continue;
          const clean = decodeURIComponent(target.split('#')[0].split('?')[0]);
          if (!MEDIA_EXT.test(clean)) continue;
          const abs = path.resolve(fileDir, clean);
          if (!abs.startsWith(ROOT)) continue;
          if (!fs.existsSync(abs)) findings.push({ type: 'BROKEN_ASSET_LINK', token: target, file: rel, line: i + 1, evidence: line.trim().slice(0, 200), replacement: null, note: 'Referenced image does not exist in the repo — learners see a broken image.' });
        }
      }
    });
  }
  return { files, findings };
}

// Stable key: type+token+file (NOT line — edits above a finding must not make it "new")
const keyOf = (f) => `${f.type}|${f.token}|${f.file}`;

const { files, findings } = scan();

if (UPDATE) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), keys: [...new Set(findings.map(keyOf))].sort() }, null, 1));
  console.log(`baseline updated: ${findings.length} existing finding(s) across ${files} md files accepted (${BASELINE_FILE})`);
  process.exit(0);
}

let baseline = new Set();
if (fs.existsSync(BASELINE_FILE)) {
  try { baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).keys || []); } catch {}
}
const fresh = findings.filter((f) => !baseline.has(keyOf(f)));
const known = findings.length - fresh.length;

const label = { RETIRED_SKU: 'retired SKU', DEPRECATED_DEPENDENCY: 'deprecated dependency', RENAMED_PRODUCT: 'renamed product', BROKEN_ASSET_LINK: 'broken image link', EOL_RUNTIME: 'EOL runtime version' };
for (const f of (CHECK ? fresh : findings)) {
  console.log(`::${CHECK ? 'error' : 'warning'} file=${f.file},line=${f.line}::[${label[f.type] || f.type}] "${f.token}"${f.replacement ? ` -> ${f.replacement}` : ''} | ${f.note || ''}`);
  console.log(`   ${f.file}:${f.line}  ${f.evidence.slice(0, 140)}`);
}

console.log(`\nLab Doctor scan: ${files} md files, ${findings.length} finding(s) total, ${known} baselined, ${fresh.length} NEW`);
if (CHECK && fresh.length) {
  console.log('FAIL: new content-freshness findings — fix them or (if intentional) run: node .github/labdoctor/labdoctor-scan.js --update-baseline');
  process.exit(1);
}
console.log(CHECK ? 'PASS: no new findings vs baseline' : 'report mode (use --check in CI)');
