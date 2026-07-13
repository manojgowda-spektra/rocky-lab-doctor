// Localization & Rendering Integrity checks, proven on a synthetic repo that mirrors the REAL defects
// verified in production content (RTIAD): translations that drop <inject> credential tokens, image refs
// whose casing only works on Windows, and a masterdoc pinning languages to different release branches.
// Restraint is asserted too: clean structures produce zero findings.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { scanRepo } = require('../labdoctor/scan-real');

function mkRepo(spec) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rocky-locale-'));
  for (const [rel, content] of Object.entries(spec)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return root;
}

test('INJECT_TOKEN_LOSS: translation missing inject keys fires once per file, names the keys', () => {
  const root = mkRepo({
    'English/Labguide/Lab-1.md': 'Enter **User<inject key="DeploymentID" enableCopy="false"></inject>** then <inject key="AzurePassword"></inject> twice: <inject key="AzurePassword"></inject>',
    'Japanese/Labguide/Lab-1.md': 'ユーザー名 **RTI_username** を入力します。パスワード: <inject key="AzurePassword"></inject>',
    'French/Labguide/Lab-1.md': 'Entrez **User<inject key="DeploymentID" enableCopy="false"></inject>** puis <inject key="AzurePassword"></inject> deux fois : <inject key="AzurePassword"></inject>',
  });
  const { findings } = scanRepo(root);
  const loss = findings.filter((f) => f.type === 'INJECT_TOKEN_LOSS');
  assert.equal(loss.length, 1, 'only the Japanese file lost tokens — French parity is clean');
  assert.equal(loss[0].file, 'Japanese/Labguide/Lab-1.md');
  assert.match(loss[0].token, /DeploymentID/);
  assert.match(loss[0].evidence, /carries 3 <inject> token\(s\); this Japanese translation carries 1/);
  assert.match(loss[0].evidence, /AzurePassword \(1\/2\)/, 'short counts are reported per key, not just missing keys');
  fs.rmSync(root, { recursive: true, force: true });
});

test('ASSET_CASE_MISMATCH: mis-cased dir aggregates to ONE finding per file; exact case and true missing stay distinct', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const root = mkRepo({
    'German/Labguide/Lab-2.md': '![](../media/a.png)\n![](../media/b.png)\n![](../Media/c.png)\n![](../media/gone.png)',
    'German/Media/a.png': png, 'German/Media/b.png': png, 'German/Media/c.png': png,
  });
  const { findings } = scanRepo(root);
  const cases = findings.filter((f) => f.type === 'ASSET_CASE_MISMATCH');
  const broken = findings.filter((f) => f.type === 'BROKEN_ASSET_LINK');
  assert.equal(cases.length, 1, 'one root cause (media→Media) = one finding, not one per link');
  assert.match(cases[0].evidence, /^2 image ref\(s\)/, 'counts only the mis-cased refs (a,b) — c.png is exact-case');
  assert.match(cases[0].token, /media→Media/);
  assert.equal(broken.length, 1, 'gone.png is genuinely missing — reported as broken, never as a case issue');
  assert.match(broken[0].token, /gone\.png/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('LOCALE_POINTER_DRIFT: masterdoc mixing release branches fires; single-branch masterdoc is silent', () => {
  const drift = mkRepo({
    'English/Labguide/Combined-masterdoc.json': JSON.stringify({ docs: [
      { raw: 'https://raw.githubusercontent.com/x/y/refs/heads/April-2026/English/Lab-1.md' },
      { raw: 'https://raw.githubusercontent.com/x/y/refs/heads/February-2026/French/Lab-1.md' },
      { raw: 'https://raw.githubusercontent.com/x/y/refs/heads/February-2026/German/Lab-1.md' },
    ]}),
  });
  const d = scanRepo(drift).findings.filter((f) => f.type === 'LOCALE_POINTER_DRIFT');
  assert.equal(d.length, 1);
  assert.match(d[0].evidence, /2 different release branches/);
  assert.match(d[0].evidence, /February-2026×2/);
  fs.rmSync(drift, { recursive: true, force: true });

  const clean = mkRepo({
    'English/Labguide/Combined-masterdoc.json': JSON.stringify({ docs: [
      { raw: 'https://raw.githubusercontent.com/x/y/refs/heads/April-2026/English/Lab-1.md' },
      { raw: 'https://raw.githubusercontent.com/x/y/refs/heads/April-2026/French/Lab-1.md' },
    ]}),
  });
  assert.equal(scanRepo(clean).findings.filter((f) => f.type === 'LOCALE_POINTER_DRIFT').length, 0);
  fs.rmSync(clean, { recursive: true, force: true });
});

test('restraint: repos without locale structure, and locale files missing entirely, produce no locale findings', () => {
  // no English baseline dir -> no inject comparison at all
  const noLocale = mkRepo({ 'docs/guide.md': 'plain guide, no injects, no locales' });
  assert.equal(scanRepo(noLocale).findings.length, 0);
  fs.rmSync(noLocale, { recursive: true, force: true });

  // locale file absent -> structural drift is NOT claimed as token loss (separate concern, don't double-claim)
  const missingFile = mkRepo({
    'English/Labguide/Lab-1.md': 'Enter <inject key="DeploymentID"></inject>',
    'Spanish/Labguide/other.md': 'sin inyecciones aquí',
  });
  assert.equal(scanRepo(missingFile).findings.filter((f) => f.type === 'INJECT_TOKEN_LOSS').length, 0);
  fs.rmSync(missingFile, { recursive: true, force: true });
});
