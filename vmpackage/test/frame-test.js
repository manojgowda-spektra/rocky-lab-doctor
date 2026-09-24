/*
 * frame-test.js — one Rocky per tab, and no blind frames.
 *
 * WHY THIS EXISTS. Measured on the live Azure portal: every blade control and every grid row
 * sits inside a cross-origin iframe on sandbox-1.reactblade.portal.azure.net. The top frame
 * holds only the shell — portal menu, search, Copilot, notifications, account. Rocky's manifest
 * declared all_frames:false and matched no *.azure.NET host, so on Azure he could see everything
 * except the thing every lab step is about.
 *
 * Fixing that turns on content scripts in every frame, and that is dangerous in a way the fix
 * itself can hide: without a top-frame guard the extension mounts a Rocky character, a bubble, a
 * control bar and an overlay root into EVERY frame, including invisible auth iframes, and the
 * learner sees several Rockys disagreeing. So the guard and the all_frames switch have to be
 * tested together, and that is what this file is for.
 *
 * THE CONTRACT:
 *   - the manifest runs in all frames and matches the Azure blade origin
 *   - every injected host can also READ the extension's own resources
 *   - frame.js loads FIRST, or a UI module runs before the guard exists
 *   - cross-origin window.top THROWS, and the throw means child, not top
 *   - every UI module refuses to run outside the top frame
 *   - ...and FAILS OPEN, so a missing frame.js degrades to "top frame only" rather than silence
 *   - every frame observes: no size heuristic, because the one that was tried excluded the
 *     Azure blade frame within the hour
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', 'webext');
const src = (f) => fs.readFileSync(path.join(root, 'content', f), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// Load frame.js against a fake window, so the top/child decision can be driven.
function frameFor(win) {
  new Function('window', src('frame.js'))(win);
  return win.LabPilotFrame;
}

const UI = ['rocky.js', 'overlay.js', 'controls.js', 'explore.js', 'pilot.js', 'progress.js', 'recovery.js', 'coach.js'];

console.log('\n=== ONE ROCKY PER TAB, AND NO BLIND FRAMES ===\n');

check('the manifest runs in every frame', () => {
  const cs = manifest.content_scripts[0];
  assert.strictEqual(cs.all_frames, true,
    'all_frames is false — the Azure blade renders in an iframe and Rocky cannot see any of it');
});

check('the manifest matches the Azure blade origin, which is .net and not .com', () => {
  const cs = manifest.content_scripts[0];
  const host = 'sandbox-1.reactblade.portal.azure.net';
  const hit = cs.matches.filter((p) => {
    const m = p.match(/^https:\/\/([^/]+)\//); if (!m) return false;
    const h = m[1];
    return h.startsWith('*.') ? (host.endsWith(h.slice(1)) || host === h.slice(2)) : host === h;
  });
  assert.ok(hit.length, `nothing matches ${host} — every azure pattern is .com: ${cs.matches.filter((p) => /azure/.test(p))}`);
});

check('the blade origin can also READ the extension resources it needs', () => {
  // Injected but unable to fetch lab.json or the knowledge files is a silent half-load.
  const host = 'https://*.portal.azure.net/*';
  const wars = manifest.web_accessible_resources || [];
  assert.ok(wars.some((w) => (w.matches || []).includes(host)),
    `${host} is injected but not in web_accessible_resources matches`);
});

check('frame.js loads FIRST, before anything that guards on it', () => {
  const js = manifest.content_scripts[0].js;
  assert.strictEqual(js[0], 'content/frame.js',
    `frame.js is at position ${js.indexOf('content/frame.js')}, so a UI module can run before the guard exists`);
});

// ---- the top/child decision ------------------------------------------------------------------
check('a page with no frame at all is TOP and owns the UI', () => {
  const win = {}; win.window = win; win.top = win; win.location = { href: 'https://portal.azure.com/' };
  const F = frameFor(win);
  assert.strictEqual(F.isTop, true);
  assert.strictEqual(F.ownsUI, true);
});

check('a same-origin child frame is CHILD and owns nothing', () => {
  const parent = {}; const win = { top: parent, location: { href: 'https://portal.azure.com/x' } };
  win.window = win;
  const F = frameFor(win);
  assert.strictEqual(F.isTop, false, 'a child frame believed it was the top frame');
  assert.strictEqual(F.ownsUI, false, 'a child frame would mount a second Rocky');
});

check('a CROSS-ORIGIN parent throws, and the throw means child — not top', () => {
  /*
   * Reading window.top across an origin boundary raises a SecurityError. Treating a throw as
   * "top" would put the UI in the cross-origin blade frame and nowhere else — which is the
   * Azure case exactly, so getting this backwards would be invisible until a demo.
   */
  const win = { location: { href: 'https://sandbox-1.reactblade.portal.azure.net/React/Index' } };
  Object.defineProperty(win, 'top', { get() { throw new Error('SecurityError: Blocked a frame'); } });
  win.window = win;
  const F = frameFor(win);
  assert.strictEqual(F.isTop, false, 'a cross-origin frame claimed to be the top frame');
  assert.strictEqual(F.ownsUI, false);
});

check('EVERY frame observes — no size heuristic', () => {
  // The heuristic that was tried ("smaller than ~200x200 is plumbing") excluded the Azure blade
  // frame on its first live run. An iframe has no dependable size at script time.
  const win = { top: {}, innerWidth: 0, innerHeight: 0, location: { href: 'https://x/' } };
  win.window = win;
  const F = frameFor(win);
  assert.strictEqual(F.observes, true,
    'a zero-sized frame was excluded from observation — this is how the blade frame was lost');
  assert.ok(!('tiny' in F), 'the size heuristic is back');
});

// ---- the guards ---------------------------------------------------------------------------
check('every UI module refuses to run outside the top frame', () => {
  for (const f of UI) {
    assert.ok(/LabPilotFrame\s*&&\s*!window\.LabPilotFrame\.ownsUI/.test(code(f)),
      `${f} has no top-frame guard — with all_frames:true it mounts a second Rocky`);
  }
});

check('the guard FAILS OPEN: a missing frame.js degrades to top-only, never to silence', () => {
  for (const f of UI) {
    const c = code(f);
    assert.ok(!/if\s*\(\s*!window\.LabPilotFrame\s*\|\|/.test(c),
      `${f} bails when LabPilotFrame is absent — if frame.js fails to load, Rocky disappears entirely`);
  }
});

check('perception is NOT guarded — a child frame must still observe', () => {
  // The whole point of entering frames is to see the blade. If perception were guarded too,
  // the manifest change would buy nothing.
  assert.ok(!/LabPilotFrame/.test(code('perception.js')),
    'perception.js is top-frame gated, so the Azure blade would still be invisible');
});

check('the frame role is readable by anything that needs it', () => {
  const win = {}; win.window = win; win.top = win; win.location = { href: 'https://x/' };
  const F = frameFor(win);
  for (const k of ['isTop', 'isChild', 'ownsUI', 'observes', 'href']) {
    assert.ok(k in F, `LabPilotFrame is missing ${k}`);
  }
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — one Rocky per tab, and the Azure blade is no longer invisible.\n`);
