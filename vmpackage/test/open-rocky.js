/*
 * open-rocky.js — put a browser on screen with Rocky actually loaded in it.
 *
 * WHY THIS EXISTS AS A FILE. Launching Edge with an unpacked extension has two traps that have
 * each cost a session:
 *
 *   1. The repo path contains a space ("Cloudlabs - Rocky"). PowerShell's Start-Process
 *      -ArgumentList joins an array WITHOUT quoting, so --load-extension=<path with space> is
 *      split in two and Edge reports "We couldn't load that extension." Node's spawn passes
 *      argv as an array with no shell in between, so the space is simply a character.
 *
 *   2. Rocky is hidden until he has something to say — the anti-Clippy property — and the lab
 *      guide reaches the portal tab through extension storage, which is per BROWSER. Opening
 *      the guide in one window and the portal in another means the guide never arrives and
 *      Rocky correctly stays invisible. Both tabs therefore open in the SAME window here.
 *
 * The profile is a fixed directory rather than a fresh one, so a sign-in survives a relaunch.
 *
 *   node test/open-rocky.js                    lab + Purview
 *   node test/open-rocky.js <url> [<url> ...]  whatever you want instead
 *   node test/open-rocky.js --fresh            new profile: REQUIRED after editing background.js
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const EXT = path.resolve(__dirname, '..', 'webext');
/*
 * THE PROFILE, AND A TRAP THAT INVALIDATES TEST RESULTS SILENTLY.
 *
 * A persisted profile keeps the sign-in, which is why it is the default. But with
 * --load-extension, restarting the browser reloads the CONTENT SCRIPTS and does NOT reliably
 * reload the extension's SERVICE WORKER. Measured: after editing background.js and restarting,
 * the new content scripts were running while the worker was still the old build — it answered
 * the messages it had always answered and silently ignored the new ones. Nothing errors. The
 * feature simply does not work and every diagnostic points somewhere else.
 *
 * So: --fresh takes a brand new profile directory, which always loads the worker you just
 * wrote. Use it after ANY change to background.js. The cost is signing in again.
 */
const FRESH = process.argv.includes('--fresh');
const PROFILE = FRESH
  ? path.join(os.tmpdir(), 'rocky-fresh-' + Date.now())
  : path.join(os.tmpdir(), 'rocky-fresh');
const PORT = 9600;

// The lab this project is being tested against. Override by passing URLs on the command line.
const DEFAULT_URLS = [
  'https://experience.cloudlabs.ai/#/odl/environment/65666d6b-6ede-4dbb-a3fd-9e805df14959/8345a7db-3694-4fdf-9ec7-e03b3d35c804/61706B56766B61354551714F4B5175426F30454D63413D3D/5',
  'https://purview.microsoft.com/',
];

function main() {
  if (!EDGE) {
    console.error('Edge not found. Chrome 153 ignores --load-extension, so Edge is the one that works.');
    process.exit(1);
  }
  const manifest = path.join(EXT, 'manifest.json');
  if (!fs.existsSync(manifest)) {
    console.error(`no extension at ${EXT} — expected ${manifest}`);
    process.exit(1);
  }
  // Fail loudly here rather than letting Edge show its own useless dialog.
  let declared = [];
  try {
    declared = (JSON.parse(fs.readFileSync(manifest, 'utf8')).content_scripts || [])
      .flatMap((c) => c.js || []);
  } catch (e) {
    console.error(`manifest.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  const missing = declared.filter((f) => !fs.existsSync(path.join(EXT, f)));
  if (missing.length) {
    console.error(`the manifest declares files that are not there, so Edge will refuse the whole extension:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }

  const urls = process.argv.slice(2).filter((a) => /^https?:/.test(a));
  const open = urls.length ? urls : DEFAULT_URLS;

  console.log(`  edge       ${EDGE}`);
  console.log(`  extension  ${EXT}   (${declared.length} content scripts, all present)`);
  console.log(`  profile    ${PROFILE}`);
  console.log(FRESH
    ? '             BRAND NEW — the service worker is guaranteed fresh, and you will sign in again'
    : '             reused, so a sign-in survives. If you changed background.js, pass --fresh:');
  if (!FRESH) console.log('             a restart reloads content scripts but NOT the worker.');
  console.log(`  debugging  http://127.0.0.1:${PORT}`);
  open.forEach((u, i) => console.log(`  tab ${i + 1}      ${u.slice(0, 96)}`));
  console.log('');

  const child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    `--load-extension=${EXT}`,
    `--disable-extensions-except=${EXT}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-features=DisableLoadExtensionCommandLineSwitch,EdgeSyncPromo,msEdgeWelcomePage,msIdentityFre,ImplicitSignin',
    '--window-size=1600,980',
    ...open,
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  console.log(`  launched (pid ${child.pid}).`);
  console.log('');
  console.log('  Rocky stays hidden until he has something to say. With the lab tab open in');
  console.log('  THIS window he picks up the guide by himself; Alt+E summons him regardless,');
  console.log('  and Alt+A opens the ask box.');
}

main();
