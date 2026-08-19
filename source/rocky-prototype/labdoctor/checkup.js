// Guide Checkup — run the SAME deterministic checks as the repo scan, but against files a user
// UPLOADS (demo: "hand me any lab guide and watch"). One engine, two entry points: the token
// checks, media/skip rules and de-dup are scan-real.js's own exports/semantics; the asset checks
// mirror trueCaseOf against the uploaded path inventory instead of the disk; the localization
// comparison mirrors checkLocalization (English baseline, per-key have<n). Honesty rule: any
// check that cannot run on what was uploaded is SKIPPED and reported as skipped — never guessed.
'use strict';
const { checkTokens, IMG_RE, MEDIA_EXT, injectCounts, SKIP_DIRS } = require('./scan-real');

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
const inSkipDir = (p) => p.split('/').some((seg) => SKIP_DIRS.has(seg));

// Strip the wrapper folder(s) the user picked: if EVERY path shares the same first segment,
// that segment is the container (e.g. picking "RTIAD-mini" yields RTIAD-mini/English/…),
// and the repo-equivalent root is one level down. Repeat while a common wrapper remains.
function stripCommonRoot(paths) {
  let ps = paths.slice();
  while (true) {
    const firsts = new Set(ps.map((p) => p.split('/')[0]));
    if (firsts.size !== 1 || ps.some((p) => !p.includes('/'))) return ps;
    ps = ps.map((p) => p.slice(p.indexOf('/') + 1));
  }
}

// Resolve a relative image ref against the md file's virtual directory (posix semantics).
// Backslash refs (Windows-authored guides) are normalized exactly like the disk scan resolves them.
function vResolve(fileDir, target) {
  let clean;
  try { clean = decodeURIComponent(target.replace(/\\/g, '/').split('#')[0].split('?')[0]); }
  catch { return null; } // malformed %-sequence — refuse to claim rather than crash
  const joined = fileDir ? fileDir + '/' + clean : clean;
  const segs = [];
  for (const s of joined.split('/')) {
    if (!s || s === '.') continue;
    if (s === '..') { if (!segs.length) return null; segs.pop(); continue; }
    segs.push(s);
  }
  return segs.join('/');
}

function vTrueCase(abs, exact, lower) {
  if (exact.has(abs)) return { state: 'exact' };
  const hit = lower.get(abs.toLowerCase());
  if (hit) return { state: 'case-mismatch', actual: hit };
  return { state: 'missing' };
}

function checkupScan(input) {
  const t0 = Date.now();
  // Normalize + apply the scanner's own SKIP_DIRS exclusions, then strip the wrapper folder.
  const raw = input.map((f) => ({ ...f, path: norm(f.path) })).filter((f) => f.path && !inSkipDir(f.path));
  const stripped = stripCommonRoot(raw.map((f) => f.path));
  const files = raw.map((f, i) => ({ path: stripped[i], content: f.content, unreadable: !!f.unreadable }));

  const mds = files.filter((f) => /\.(md|markdown)$/i.test(f.path) && typeof f.content === 'string' && !f.unreadable);
  const unreadableMds = files.filter((f) => /\.(md|markdown)$/i.test(f.path) && (f.unreadable || typeof f.content !== 'string'));
  const allPaths = files.map((f) => f.path);
  const exact = new Set(allPaths);
  const lower = new Map(allPaths.map((p) => [p.toLowerCase(), p]));
  // Asset checks only when the upload contains actual ASSET FILES with directory structure
  // (a real folder upload). Guides alone — even with folder paths — can't prove an image is
  // missing (the images may simply not have been uploaded), so we refuse to claim.
  const hasStructure = raw.some((f) => !/\.(md|markdown)$/i.test(f.path) && f.path.includes('/'));
  const findings = [];
  const skipped = [];

  for (const f of mds) {
    const rel = f.path;
    const fileDir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const lines = f.content.split(/\r?\n/);
    const caseAgg = new Map();
    let inFence = false; // same rule as the repo scan: fenced code isn't rendered to learners
    lines.forEach((line, i) => {
      if (/^\s*```/.test(line)) inFence = !inFence;
      // 1) token families — the exact same checkTokens() the repo scan uses (fences included, same as scanRepo)
      for (const t of checkTokens(line)) {
        findings.push({ type: t.type, file: rel, line: i + 1, token: t.token,
          replacement: t.replacement || null, note: t.note || '', when: t.when || null,
          excerpt: line.trim().slice(0, 160) });
      }
      // 2) asset refs — outside fences, and only when the upload has real structure
      if (hasStructure && !inFence) {
        let m; IMG_RE.lastIndex = 0;
        while ((m = IMG_RE.exec(line)) !== null) {
          const target = m[1];
          if (/^(https?:)?\/\//i.test(target) || target.startsWith('data:')) continue;
          if (/[{}]/.test(target)) continue;
          let clean;
          try { clean = decodeURIComponent(target.replace(/\\/g, '/').split('#')[0].split('?')[0]); }
          catch { continue; }
          if (!MEDIA_EXT.test(clean)) continue;
          const abs = vResolve(fileDir, target);
          if (abs === null) continue; // escapes the uploaded tree — can't judge
          const res = vTrueCase(abs, exact, lower);
          if (res.state === 'missing') findings.push({ type: 'BROKEN_ASSET_LINK', file: rel, line: i + 1, token: target, replacement: null,
            note: 'Image referenced by the guide is not in the uploaded folder — learners would see a broken image.', excerpt: line.trim().slice(0, 160) });
          else if (res.state === 'case-mismatch') {
            const a = abs.split('/'), b = res.actual.split('/');
            let badSeg = norm(target), actualSeg = res.actual;
            for (let s = 0; s < Math.min(a.length, b.length); s++) {
              if (a[s] !== b[s]) { badSeg = a[s]; actualSeg = b[s]; break; }
            }
            const k = badSeg + '→' + actualSeg;
            const cur = caseAgg.get(k) || { count: 0, line: i + 1, token: badSeg, actual: actualSeg };
            cur.count++; caseAgg.set(k, cur);
          }
        }
      }
    });
    for (const [, v] of caseAgg) {
      findings.push({ type: 'ASSET_CASE_MISMATCH', file: rel, line: v.line, token: v.token,
        replacement: v.actual, note: `Path case doesn't match the actual file (${v.count} ref${v.count > 1 ? 's' : ''}) — works on Windows, 404s on case-sensitive hosting like GitHub.`,
        excerpt: '' });
    }
  }

  // 3) localization inject-token loss — mirrors checkLocalization: sibling top-level language
  //    dirs each containing a Labguide folder, English is the baseline, per-key have<n comparison.
  const topDirs = new Map(); // lowercased top segment → canonical
  for (const f of mds) {
    if (!f.path.includes('/')) continue;
    const segs = f.path.split('/');
    if (segs.length >= 2 && /^labguide$/i.test(segs[1])) topDirs.set(segs[0].toLowerCase(), segs[0]);
  }
  const english = topDirs.get('english');
  let localePairs = 0;
  if (english && topDirs.size >= 2) {
    const mdByPath = new Map(mds.map((f) => [f.path.toLowerCase(), f]));
    for (const f of mds) {
      if (!f.path.toLowerCase().startsWith(english.toLowerCase() + '/')) continue;
      const relInside = f.path.slice(english.length + 1);
      const engCounts = injectCounts(f.content);
      const engTotal = [...engCounts.values()].reduce((a, b) => a + b, 0);
      if (engTotal === 0) continue; // nothing to lose
      for (const [, loc] of topDirs) {
        if (loc === english) continue;
        const locF = mdByPath.get((loc + '/' + relInside).toLowerCase());
        if (!locF) continue; // structural drift is a separate concern — don't double-claim
        localePairs++;
        const locCounts = injectCounts(locF.content);
        const missing = [];
        for (const [key, n] of engCounts) { const have = locCounts.get(key) || 0; if (have < n) missing.push(`${key} (${have}/${n})`); }
        if (!missing.length) continue;
        const locTotal = [...locCounts.values()].reduce((a, b) => a + b, 0);
        findings.push({ type: 'INJECT_TOKEN_LOSS', file: locF.path, line: 1,
          token: missing.map((s) => s.split(' ')[0]).join(', '),
          replacement: 'restore the <inject key="…"> tokens from the English source',
          note: `English "${relInside}" carries ${engTotal} <inject> token(s); this translation carries ${locTotal}. Missing/short keys: ${missing.join(', ')} — learners see literal placeholder text instead of their credentials.`,
          excerpt: '' });
      }
    }
  }

  // de-dup: same rule as the published pipeline — ≤3 occurrences per (file|type|token)
  const seen = new Map(); const kept = [];
  for (const fd of findings) {
    const k = `${fd.file}|${fd.type}|${fd.token}`;
    const n = (seen.get(k) || 0) + 1; seen.set(k, n);
    if (n <= 3) kept.push(fd);
  }

  if (!hasStructure) skipped.push('Asset existence & path-case checks skipped — upload the whole lab folder (with its images) to include them.');
  if (localePairs === 0) skipped.push('Localization comparison skipped — upload a lab folder with an English + translated Labguide structure to compare inject tokens.');
  if (unreadableMds.length) skipped.push(`${unreadableMds.length} guide file(s) could not be read (locked or still syncing) and were NOT scanned: ${unreadableMds.slice(0, 3).map((f) => f.path).join(', ')}${unreadableMds.length > 3 ? '…' : ''}`);

  const byType = {};
  for (const fd of kept) byType[fd.type] = (byType[fd.type] || 0) + 1;
  return { files: files.length, mdFiles: mds.length, findings: kept, findingCount: kept.length, byType, skipped, ms: Date.now() - t0 };
}

module.exports = { checkupScan };
