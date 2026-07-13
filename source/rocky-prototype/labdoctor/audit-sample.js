// FP audit helper: stratified sample of scanner findings with rendering-context checks.
// Flags suspects automatically (finding inside a code fence, or an image link that actually exists).
const fs = require('fs');
const path = require('path');
const R = require('./real-scan-results.json');
const ROOT = process.argv[2] || 'C:/Users/ManojGowda/OneDrive - Spektra Systems LLC/Desktop/Labs';

const all = R.repos.flatMap((r) => r.findings.map((f) => ({ ...f, repo: r.name })));
// stratified: up to N per type, deterministic order (no RNG — reproducible audit)
const byType = {};
for (const f of all) (byType[f.type] = byType[f.type] || []).push(f);
const sample = [];
for (const [t, arr] of Object.entries(byType)) {
  const step = Math.max(1, Math.floor(arr.length / Math.min(arr.length, 14)));
  for (let i = 0; i < arr.length && sample.filter((s) => s.type === t).length < 14; i += step) sample.push(arr[i]);
}

let suspects = 0;
for (const f of sample) {
  const full = path.join(ROOT, f.repo, f.file);
  let verdict = 'OK';
  try {
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    const upto = lines.slice(0, f.line);
    const fences = upto.filter((l) => /^\s*```/.test(l)).length;
    const inFence = fences % 2 === 1;
    if (inFence && f.type === 'BROKEN_ASSET_LINK') verdict = 'SUSPECT: inside code fence (not rendered)';
    const lineText = lines[f.line - 1] || '';
    if (!lineText.toLowerCase().includes(f.token.toLowerCase()) && f.type !== 'BROKEN_ASSET_LINK') verdict = 'SUSPECT: token not on quoted line';
    if (f.type === 'BROKEN_ASSET_LINK') {
      const clean = decodeURIComponent(f.token.split('#')[0].split('?')[0]);
      if (fs.existsSync(path.resolve(path.dirname(full), clean))) verdict = 'SUSPECT: target actually exists';
    }
  } catch { verdict = 'SUSPECT: source file unreadable'; }
  if (verdict !== 'OK') suspects++;
  console.log(`[${verdict}] ${f.type} ${f.repo}/${f.file}:${f.line}\n    ${f.evidence.slice(0, 130)}`);
}
console.log(`\nAUDIT: ${sample.length} sampled (stratified across ${Object.keys(byType).length} types), ${suspects} automatic suspects`);
