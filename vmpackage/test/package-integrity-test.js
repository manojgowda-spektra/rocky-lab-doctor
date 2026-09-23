/*
 * package-integrity-test.js — the bytes a learner actually installs.
 *
 * WHY THIS IS SEPARATE FROM source-integrity-test.js. That gate reads the SOURCE tree, and
 * its SKIP_DIRS contains 'dist'. So the one artefact that reaches a learner's VM —
 * dist/rocky-package.zip — was the only thing never inspected. Its header says it "reads the
 * bytes instead of running the code", and it does; but not these bytes.
 *
 * That gap is not hypothetical. The defect that reached a learner's VM was a mangled path
 * inside a PowerShell installer, and an installer is exactly the kind of file that is copied
 * into the package by a build step rather than edited in place. A package can be stale, can
 * be missing a file the manifest declares, or can be assembled by a script that re-encodes
 * what it copies. None of those are visible from the source tree.
 *
 * WHAT THIS CHECKS, on the extracted package and nothing else:
 *   1. every file the manifest declares is actually present
 *   2. no stray control character in any shipped text file (the 0x07/0x08/0x0D class)
 *   3. .ps1 files carry a UTF-8 BOM; lab.json and ai.json do not
 *   4. the packaged content scripts match the source tree, ignoring line endings only
 *
 * ON LINE ENDINGS. The package is built with LF; a Windows working copy has CRLF because of
 * git's autocrlf. Comparing raw bytes reports every file as different, which is noise that
 * trains you to ignore this gate. We normalise newlines and compare the real content — a
 * change in what the code SAYS still fails, which is the thing worth knowing.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..');
const ZIP = path.join(PKG, 'dist', 'rocky-package.zip');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

console.log('\n=== PACKAGE INTEGRITY ===\n');

if (!fs.existsSync(ZIP)) {
  // A missing package is not a pass. If there is nothing to ship, say so and fail: a silent
  // skip here would recreate exactly the blind spot this file exists to close.
  console.log(`  [FAIL] no package at ${ZIP}`);
  console.log('         nothing to verify — build the package before the release gate\n');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rockypkg-'));
try {
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${ZIP.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force`],
    { stdio: 'ignore', timeout: 120000 });
} catch (e) {
  console.log(`  [FAIL] could not extract the package: ${e.message}\n`);
  process.exit(1);
}

const zipExt = path.join(tmp, 'webext');
const srcExt = path.join(PKG, 'webext');

// ---- 1. every declared file is present -----------------------------------------------------
const manifestPath = path.join(zipExt, 'manifest.json');
check('the package contains a manifest', () => {
  assert(fs.existsSync(manifestPath), 'no webext/manifest.json in the package');
});

let declared = [];
if (fs.existsSync(manifestPath)) {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const cs = (m.content_scripts && m.content_scripts[0]) || {};
  declared = [].concat(cs.js || [], cs.css || []);
  if (m.background && m.background.service_worker) declared.push(m.background.service_worker);
  for (const w of m.web_accessible_resources || []) {
    for (const r of w.resources || []) if (!r.includes('*')) declared.push(r);
  }
  if (m.action && m.action.default_popup) declared.push(m.action.default_popup);
}

check('every file the manifest declares is in the package', () => {
  assert(declared.length > 0, 'the manifest declared no files — parsed wrongly?');
  const missing = declared.filter((f) => !fs.existsSync(path.join(zipExt, f)));
  assert(missing.length === 0,
    `declared but absent from the package: ${missing.join(', ')}`);
});

// ---- 2. no mangled escapes in the shipped bytes ---------------------------------------------
const TEXT = ['.ps1', '.js', '.json', '.html', '.css', '.cmd', '.bat', '.txt'];
// A shipped file is either inside the extracted package or loose in dist/. Name it the way
// a person would recognise it, rather than as a temp path.
const rel = (f) => f.startsWith(tmp) ? path.relative(tmp, f) : 'dist/' + path.basename(f);

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (TEXT.includes(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}
// The package is not the only thing published. dist/ also holds the loose installers a
// person downloads and runs by hand, and those are published ALONGSIDE the zip rather than
// inside it — so extracting the zip alone still leaves them unread. dist/Install-Rocky.ps1
// was a stale pre-fix copy carrying the exact agent<CR>ocky-agent.ps1 defect long after
// bin/ had been fixed, precisely because nothing looked here.
const loose = fs.readdirSync(path.join(PKG, 'dist'), { withFileTypes: true })
  .filter((e) => e.isFile() && TEXT.includes(path.extname(e.name).toLowerCase()))
  .map((e) => path.join(PKG, 'dist', e.name));

const shipped = walk(tmp, []).concat(loose);
console.log(`Inspecting ${shipped.length} text files (package + loose dist/ installers)\n`);

check('no shipped file carries a stray control character', () => {
  // Tab (0x09), LF (0x0A) and CR (0x0D) are legitimate. Everything else below 0x20 is the
  // signature of an escape eaten before the file was written: \a -> 0x07, \b -> 0x08.
  const bad = [];
  for (const f of shipped) {
    const b = fs.readFileSync(f);
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      if (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) {
        const line = b.slice(0, i).toString('utf8').split('\n').length;
        bad.push(`${rel(f)}:${line} contains 0x${c.toString(16).padStart(2, '0')}`);
        break;
      }
    }
  }
  assert(bad.length === 0, `mangled bytes in the shipped package:\n         ${bad.join('\n         ')}`);
});

check('no bare CR inside a line — the agent\\rocky-agent.ps1 defect', () => {
  // The defect that reached a learner's VM was 'agent\rocky-agent.ps1' becoming
  // 'agent<CR>ocky-agent.ps1'. A blanket "CR is legitimate" rule misses it, because CR IS
  // legitimate — as the first half of a CRLF line ending. A CR followed by anything else is
  // a backslash that was eaten, and PowerShell fails with "Illegal characters in path".
  // This distinction matters: checking only for 0x07/0x08 would let the original defect ship
  // again, which is exactly what it did.
  const bad = [];
  for (const f of shipped) {
    const b = fs.readFileSync(f);
    for (let i = 0; i < b.length; i++) {
      if (b[i] === 0x0D && b[i + 1] !== 0x0A) {
        const line = b.slice(0, i).toString('utf8').split('\n').length;
        const ctx = b.slice(Math.max(0, i - 28), i + 18).toString('utf8').replace(/\r/g, '<CR>');
        bad.push(`${rel(f)}:${line}  ...${ctx}...`);
        break;
      }
    }
  }
  assert(bad.length === 0,
    `a backslash was eaten into a carriage return:\n         ${bad.join('\n         ')}`);
});

// ---- 3. BOMs, in both directions -------------------------------------------------------------
const hasBOM = (p) => { const b = fs.readFileSync(p); return b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF; };

check('every shipped .ps1 carries a UTF-8 BOM', () => {
  const ps1 = shipped.filter((f) => f.toLowerCase().endsWith('.ps1'));
  assert(ps1.length > 0, 'no .ps1 in the package — the installer is missing');
  const noBom = ps1.filter((f) => !hasBOM(f)).map((f) => rel(f));
  assert(noBom.length === 0,
    `PowerShell mis-parses a non-BOM file with non-ASCII in it: ${noBom.join(', ')}`);
});

check('lab.json and ai.json ship without a BOM', () => {
  const withBom = [];
  for (const n of ['lab.json', 'ai.json']) {
    const p = path.join(zipExt, n);
    if (fs.existsSync(p) && hasBOM(p)) withBom.push(n);
  }
  assert(withBom.length === 0,
    `a BOM breaks JSON.parse in the extension: ${withBom.join(', ')}`);
});

// ---- 4. the package is built from current source ----------------------------------------------
const norm = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n').replace(/^﻿/, '');

check('the packaged content scripts match the source tree', () => {
  const drifted = [];
  const checked = [];
  for (const f of declared) {
    const a = path.join(srcExt, f), b = path.join(zipExt, f);
    if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
    checked.push(f);
    if (norm(fs.readFileSync(a)) !== norm(fs.readFileSync(b))) drifted.push(f);
  }
  assert(checked.length > 0, 'compared nothing — the paths did not line up');
  assert(drifted.length === 0,
    `the package is stale; these differ from source: ${drifted.join(', ')}\n` +
    '         (newline differences are ignored, so this is a real content change)');
});

console.log('');
if (try_rm(tmp), fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  process.exit(1);
}
console.log(`${pass} passed, 0 failed — the bytes that ship are the bytes we meant to ship.\n`);

function try_rm(d) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch (e) {} }
