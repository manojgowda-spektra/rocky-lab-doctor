/*
 * source-integrity-test.js — no shipped file may carry a stray control character.
 *
 * WHY THIS GATE EXISTS. Four times now, a PowerShell string literal written through a shell
 * heredoc has had its escapes eaten before the file was saved:
 *
 *     'webext\ai.json'            ->  'webext<BEL>i.json'      (BEL, 0x07)
 *     'agent\rocky-agent.ps1'     ->  'agent<CR>ocky-agent.ps1'(CR,  0x0D)
 *     '\bthen\b'                  ->  '<BS>then<BS>'           (BS,  0x08)
 *
 * The CR one reached a learner's VM and failed with "Test-Path : Illegal characters in path".
 * The BS ones were worse: no error at all, the guide parser simply matched nothing and Rocky
 * stayed stuck on "finding the step". A silent regex failure is exactly the kind of defect
 * that survives a demo rehearsal and shows up in front of an audience.
 *
 * None of the existing gates could catch this. They exercise behaviour through Node and Edge;
 * a mangled path inside a PowerShell installer is never executed by any of them. So this gate
 * reads the bytes instead of running the code.
 *
 * Tab, CR and LF are legitimate. Everything else below 0x20 is a defect, with no exceptions:
 * none of these files has any reason to contain one, so there is nothing to whitelist.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PKG = path.join(__dirname, '..');
const REPO = path.join(PKG, '..');

// Everything that ships to a VM or runs the install.
const EXTENSIONS = ['.ps1', '.js', '.json', '.html', '.css', '.cmd', '.bat'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.playwright-mcp']);

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (EXTENSIONS.includes(path.extname(e.name).toLowerCase())) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

console.log('\n=== SOURCE INTEGRITY ===\n');

const files = walk(PKG, []).concat(walk(path.join(REPO, 'deploy'), []));
console.log(`Scanning ${files.length} shipped files\n`);

check('no shipped file carries a stray control character', () => {
  const bad = [];
  for (const f of files) {
    const buf = fs.readFileSync(f);
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
        // line number, so the failure names a place rather than a byte offset
        let line = 1;
        for (let j = 0; j < i; j++) if (buf[j] === 0x0a) line++;
        bad.push(`${path.relative(REPO, f)}:${line} 0x${b.toString(16).padStart(2, '0')}`);
        break;
      }
    }
  }
  assert.deepStrictEqual(bad, [], `mangled escape sequences:\n         ${bad.join('\n         ')}`);
});

check('no CR appears anywhere except as part of a CRLF line ending', () => {
  // 'agent\rocky-agent.ps1' produces a CR in the MIDDLE of a line, which looks like a normal
  // line ending to every tool that splits on \r\n and is therefore invisible until it runs.
  const bad = [];
  for (const f of files) {
    const buf = fs.readFileSync(f);
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 0x0d && buf[i + 1] !== 0x0a) {
        let line = 1;
        for (let j = 0; j < i; j++) if (buf[j] === 0x0a) line++;
        bad.push(`${path.relative(REPO, f)}:${line}`);
        break;
      }
    }
  }
  assert.deepStrictEqual(bad, [], `bare CR inside a line:\n         ${bad.join('\n         ')}`);
});

check('the installer points at a path that actually exists', () => {
  // The specific defect that reached a VM. Assert the real file, not just clean bytes: a
  // typo'd-but-printable path would pass the scans above and fail identically in the lab.
  const src = fs.readFileSync(path.join(PKG, 'bin', 'Install-Rocky.ps1'), 'utf8');
  const m = /\$agent\s*=\s*(.+)/.exec(src);
  assert.ok(m, 'the installer no longer sets $agent — has it been renamed?');
  assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(m[1]), `\$agent line is mangled: ${JSON.stringify(m[1])}`);
  assert.ok(fs.existsSync(path.join(PKG, 'agent', 'rocky-agent.ps1')), 'agent/rocky-agent.ps1 is missing');
  assert.match(m[1], /rocky-agent\.ps1/, `\$agent does not reference rocky-agent.ps1: ${m[1]}`);
});

check('the agent\'s regex word boundaries survived', () => {
  // These three matched nothing while they were backspaces, and nothing errored.
  const src = fs.readFileSync(path.join(PKG, 'agent', 'rocky-agent.ps1'), 'utf8');
  for (const needed of ['\\bthen\\b', '\\band\\b', '(?:Module|Step|Task|Exercise|Part)\\b']) {
    assert.ok(src.includes(needed), `lost from the guide parser: ${needed}`);
  }
});

check('every PowerShell file has a UTF-8 BOM', () => {
  // PS 5.1 reads a BOM-less UTF-8 file as ANSI and mangles every non-ASCII character.
  const bad = [];
  for (const f of files.filter((x) => x.toLowerCase().endsWith('.ps1'))) {
    const buf = fs.readFileSync(f);
    if (!(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)) bad.push(path.relative(REPO, f));
  }
  assert.deepStrictEqual(bad, [], `missing BOM:\n         ${bad.join('\n         ')}`);
});

check('lab.json is written without a BOM', () => {
  // The mirror image: a BOM here breaks JSON.parse in the browser and Rocky silently forgets
  // which lab he is in. Both halves of this have bitten already, in opposite directions.
  const boot = fs.readFileSync(path.join(PKG, 'bin', 'rocky-bootstrap.ps1'), 'utf8');
  assert.match(boot, /UTF8Encoding\(\s*\$false\s*\)/, 'lab.json is no longer written BOM-free');
});

check('the manifest injects on the hosts the demo lab actually uses', () => {
  // Rocky not injecting looks like a broken product, not a config gap - and it is invisible
  // until someone opens the lab. The Purview demo lab runs on purview.microsoft.com, which
  // was NOT in the match list; Rocky would simply have been absent for the whole demo.
  const m = JSON.parse(fs.readFileSync(path.join(PKG, 'webext', 'manifest.json'), 'utf8'));
  const matches = m.content_scripts[0].matches.join(' ');
  const NEEDED = [
    'purview.microsoft.com',      // the Purview lab itself
    'portal.azure.com',           // Azure portal labs
    'login.microsoftonline.com',  // sign-in, which every lab passes through
    'cloudlabs.ai',               // the lab shell and guide pane
  ];
  const missing = NEEDED.filter((h) => matches.indexOf(h) < 0);
  assert.deepStrictEqual(missing, [], `the extension would not inject on: ${missing.join(', ')}`);

  // A host in content_scripts but not in web_accessible_resources means lab.json, ai.json and
  // the knowledge base are unreadable there - Rocky loads but forgets which lab he is in.
  const war = (m.web_accessible_resources || []).map((w) => (w.matches || []).join(' ')).join(' ');
  const notShared = m.content_scripts[0].matches.filter((p2) => war.indexOf(p2) < 0);
  assert.deepStrictEqual(notShared, [],
    `injected but cannot read its own resources on: ${notShared.join(', ')}`);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — nothing mangled ships.\n`);
