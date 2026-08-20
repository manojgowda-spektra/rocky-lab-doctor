// Guide Checkup — the engine behind the guided demo's central beat (/api/checkup).
// Covers the three demo arcs (broken / needs-a-human / clean) with synthetic inputs,
// plus the honesty rules: skipped-not-guessed, wrapper stripping, de-dup, unreadable files.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { checkupScan } = require('../labdoctor/checkup');

test('broken arc: a planted deprecated token is found at its exact line', () => {
  const rep = checkupScan([
    { path: 'guide.md', content: 'Intro line\nDeploy the text-embedding-ada-002 model now.\nOutro.\n' },
  ]);
  assert.equal(rep.mdFiles, 1);
  assert.ok(rep.findingCount >= 1, 'expected at least one finding');
  const f = rep.findings.find((x) => /text-embedding-ada-002/i.test(x.token));
  assert.ok(f, 'the planted token is flagged');
  assert.equal(f.line, 2, 'flagged at the exact line');
  assert.ok(f.replacement, 'token findings carry a draft replacement');
});

test('clean arc: an innocent guide yields zero findings (never invented)', () => {
  const rep = checkupScan([
    { path: 'clean.md', content: '# A lab\nCreate a resource group and deploy the app.\nVerify it responds.\n' },
  ]);
  assert.equal(rep.findingCount, 0);
  // and the honesty ledger says what did NOT run, instead of silently passing it
  assert.ok(rep.skipped.some((s) => /asset/i.test(s)), 'asset checks reported as skipped for a guides-only upload');
});

test('needs-a-human arc: EN→JA translation that drops inject tokens is flagged, with counts', () => {
  const en = 'Sign in as <inject key="AzureAdUserEmail"/> with <inject key="AzureAdUserPassword"/>.\n';
  const ja = 'サインインしてください。\n'; // both tokens lost in translation
  const rep = checkupScan([
    { path: 'English/Labguide/lab-1.md', content: en },
    { path: 'Japanese/Labguide/lab-1.md', content: ja },
  ]);
  const f = rep.findings.find((x) => x.type === 'INJECT_TOKEN_LOSS');
  assert.ok(f, 'token loss detected');
  assert.equal(f.file, 'Japanese/Labguide/lab-1.md', 'the TRANSLATION is flagged, not the source');
  assert.match(f.note, /2 <inject> token\(s\)/, 'note carries the English token count');
  assert.ok(!f.replacement || /restore/.test(f.replacement), 'fix is a suggestion for a human, not a rewrite');
});

test('wrapper stripping: picking the parent folder still pairs English/Japanese', () => {
  const rep = checkupScan([
    { path: 'RTIAD-mini/English/Labguide/lab-1.md', content: 'Use <inject key="A"/>\n' },
    { path: 'RTIAD-mini/Japanese/Labguide/lab-1.md', content: 'トークンなし\n' },
  ]);
  assert.ok(rep.findings.some((x) => x.type === 'INJECT_TOKEN_LOSS'), 'pairing survives a common wrapper folder');
});

test('asset honesty: guides-only upload never claims a broken image; a real folder upload does', () => {
  const md = { path: 'Labguide/lab.md', content: '![shot](../media/missing.png)\n' };
  const alone = checkupScan([md]);
  assert.ok(!alone.findings.some((x) => x.type === 'BROKEN_ASSET_LINK'), 'no asset claim without the folder');
  const withStructure = checkupScan([md, { path: 'media/present.png' }]);
  assert.ok(withStructure.findings.some((x) => x.type === 'BROKEN_ASSET_LINK'), 'with real structure the missing image IS flagged');
});

test('de-dup: a token repeated 50 times keeps at most 3 findings per (file|type|token)', () => {
  const rep = checkupScan([
    { path: 'g.md', content: Array(50).fill('use text-embedding-ada-002 here').join('\n') },
  ]);
  const hits = rep.findings.filter((x) => /text-embedding-ada-002/i.test(x.token));
  assert.ok(hits.length <= 3, 'capped at 3, got ' + hits.length);
});

test('unreadable guides are reported, never silently treated as clean', () => {
  const rep = checkupScan([{ path: 'locked.md', unreadable: true }]);
  assert.equal(rep.mdFiles, 0);
  assert.ok(rep.skipped.some((s) => /could not be read/.test(s)));
});

// The staged demo samples themselves — the exact arcs the presenter clicks. Skipped (not failed)
// if the staging folder is absent on this machine, so CI elsewhere stays green.
const STAGED = path.join(__dirname, '..', '..', '..', 'Demo-Uploads');
test('staged demo samples reproduce the three arcs end-to-end', { skip: !fs.existsSync(STAGED) && 'Demo-Uploads staging not present' }, () => {
  const read = (p) => ({ path: p, content: fs.readFileSync(path.join(STAGED, p), 'utf8') });
  const broken = checkupScan([read('Challenge-05.md')]);
  assert.ok(broken.findingCount >= 1, 'Challenge-05 yields findings, got ' + broken.findingCount);
  const rtiad = checkupScan([
    read('RTIAD-mini/English/Labguide/Lab-1---April-2026.md'),
    read('RTIAD-mini/Japanese/Labguide/Lab-1---April-2026.md'),
  ]);
  assert.ok(rtiad.findings.some((x) => x.type === 'INJECT_TOKEN_LOSS'), 'RTIAD pair yields the token-loss finding');
  const clean = checkupScan([read('clean-lab-guide.md')]);
  assert.equal(clean.findingCount, 0, 'the clean sample stays clean');
});
