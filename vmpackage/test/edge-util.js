/*
 * edge-util.js — shared browser-test plumbing.
 *
 * killEdgeTree is the important one. Edge's launcher process exits immediately and leaves a
 * detached browser process tree behind, so child.kill() on the spawned process is NOT
 * enough: every test run leaked a full browser and its profile directory. After enough runs
 * the machine is loaded enough that extension installation misses any deadline, which made
 * the browser checks look intermittently broken when the real fault was our own litter.
 *
 * We match on the unique --user-data-dir each test generates, so this can never touch the
 * user's own Edge windows.
 */
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');

function killEdgeTree(profileDir) {
  if (!profileDir) return;
  try {
    // Single-quoted PowerShell string: the only character needing escaping is the quote.
    const needle = String(profileDir).replace(/'/g, "''");
    const ps = "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | " +
      `Where-Object { $_.CommandLine -like '*${needle}*' } | ` +
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 20000 });
  } catch (e) { /* best effort: a leaked process must never fail a passing test */ }
}

function rmQuiet(dir) {
  if (!dir) return;
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch (e) {}
}

// Clean up anything earlier runs left behind, so a loaded machine does not masquerade as a
// product failure. Only ever touches our own temp directories.
function sweepStaleProfiles(tmpdir, prefixes) {
  let swept = 0;
  for (const name of fs.readdirSync(tmpdir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    if (!prefixes.some((p) => name.name.startsWith(p))) continue;
    const full = require('path').join(tmpdir, name.name);
    killEdgeTree(full);
    const before = fs.existsSync(full);
    rmQuiet(full);
    if (before && !fs.existsSync(full)) swept++;
  }
  return swept;
}

module.exports = { killEdgeTree, rmQuiet, sweepStaleProfiles };
