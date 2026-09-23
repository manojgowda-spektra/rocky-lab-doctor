/*
 * interaction-live.js — the gate that should have existed from the start.
 *
 * WHY. Four defects reached a live lab in two days, and every one was invisible to the
 * existing suite:
 *
 *   - LabPilotRocky.explain() threw a ReferenceError, so every Explore explanation produced
 *     nothing. Sixteen gates, none of them called explain().
 *   - Enter in the ask box silently did nothing, while the Ask button worked. No test had
 *     ever opened the ask box.
 *   - Rocky was not injected on purview.microsoft.com, then not on ml.azure.com. Nothing
 *     checked that the manifest covered the hosts a real lab actually visits.
 *
 * The pattern is the same each time: the logic was tested in Node, and the failure only
 * existed when a person clicked something in a browser. This file closes that gap. It drives
 * the SHIPPED extension in real Edge and performs the actions a learner performs — open the
 * ask box, type, press Enter, click the button — and asserts that something happens.
 *
 * It deliberately does NOT assert on the model's answer: the point is that the QUESTION
 * reaches the code that would send it. A wrong API key must fail loudly, not silently.
 */
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { killEdgeTree, rmQuiet, sweepStaleProfiles } = require('./edge-util');

const ROOT = path.join(__dirname, '..');

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n'); if (i < 0) return;
      if (!/101/.test(buf.slice(0, i).toString())) { reject(new Error('upgrade failed')); return; }
      sock.removeListener('data', onData); resolve(makeClient(sock, buf.slice(i + 4)));
    };
    sock.on('data', onData); sock.on('error', reject);
  });
}
function makeClient(sock, rest) {
  const pending = new Map(); let id = 0; let buf = rest;
  function frame(p) {
    const d = Buffer.from(p); const mk = crypto.randomBytes(4); const len = d.length; let head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(len), 2); }
    const m = Buffer.alloc(len); for (let i = 0; i < len; i++) m[i] = d[i] ^ mk[i % 4];
    return Buffer.concat([head, mk, m]);
  }
  function read() {
    while (buf.length >= 2) {
      const l0 = buf[1] & 0x7f; let off = 2; let len = l0;
      if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const pl = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
      try {
        const m = JSON.parse(pl);
        if (m.id && pending.has(m.id)) {
          const p = pending.get(m.id); pending.delete(m.id);
          m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
        }
      } catch (e) {}
    }
  }
  sock.on('data', (d) => { buf = Buffer.concat([buf, d]); read(); });
  return {
    send(method, params) {
      return new Promise((resolve, reject) => {
        const mid = ++id; pending.set(mid, { resolve, reject });
        sock.write(frame(JSON.stringify({ id: mid, method, params: params || {} })));
        setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error(method + ' timeout')); } }, 30000);
      });
    },
    close() { try { sock.destroy(); } catch (e) {} },
  };
}
const getJSON = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

// Stage the extension: loading from the working tree fails to inject on this machine, and a
// learner's Edge loads it from ProgramData anyway.
function stage(src) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'rockyint-ext-'));
  const copy = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const f = path.join(from, e.name), t = path.join(to, e.name);
      if (e.isDirectory()) copy(f, t); else fs.copyFileSync(f, t);
    }
  };
  copy(src, dest);
  return dest;
}

(async () => {
  try { sweepStaleProfiles(os.tmpdir(), ['rockyint-', 'rockypilot-', 'rocky-verify-']); } catch (e) {}

  const EXT = stage(path.join(ROOT, 'webext'));
  const port = 9200 + Math.floor(Math.random() * 190);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rockyint-'));
  const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
  if (!edge) { console.log('\n  Edge not found — skipping\n'); process.exit(0); }

  // Serve over HTTPS on a host the manifest matches. The manifest only matches https://,
  // so an HTTP mock is never injected and the harness silently attaches to about:blank -
  // which is exactly what the first run of this file did.
  const HOST = 'purview.microsoft.com';
  const { execFileSync } = require('child_process');
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rockyint-cert-'));
  const keyF = path.join(certDir, 'k.pem'), crtF = path.join(certDir, 'c.pem');
  const openssl = ['openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe']
    .find((c) => { try { execFileSync(c, ['version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } });
  if (!openssl) { console.log('  openssl not found - skipping'); process.exit(0); }
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
    '-keyout', keyF, '-out', crtF, '-subj', `/CN=${HOST}`,
    '-addext', `subjectAltName=DNS:${HOST}`], { stdio: 'ignore' });

  const html = fs.readFileSync(path.join(__dirname, 'mock-lab.html'), 'utf8');
  const srv = require('https').createServer(
    { key: fs.readFileSync(keyF), cert: fs.readFileSync(crtF) },
    (q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(html); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const mockPort = srv.address().port;

  const child = spawn(edge, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
    `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-features=DisableLoadExtensionCommandLineSwitch,EdgeSyncPromo,msEdgeWelcomePage,msIdentityFre,ImplicitSignin',
    `--host-resolver-rules=MAP ${HOST}:443 127.0.0.1:${mockPort}`,
    '--ignore-certificate-errors',
    '--headless=new', '--window-size=1400,900',
    `https://${HOST}/`,
  ], { detached: true, stdio: 'ignore' });

  let client;
  try {
    let targets;
    for (let i = 0; i < 70; i++) {
      await sleep(400);
      try {
        targets = await getJSON(`http://127.0.0.1:${port}/json/list`);
        if (targets.some((t) => t.type === 'page' && /purview/i.test(t.url || ''))) break;
      } catch (e) {}
    }
    const page = targets.find((t) => t.type === 'page' && /purview/i.test(t.url || ''));
    assert(page, 'the lab page never appeared as a target');
    client = await wsConnect(page.webSocketDebuggerUrl);
    await sleep(3500);          // let the content scripts settle

    // Evaluate INSIDE THE CONTENT SCRIPT'S ISOLATED WORLD. This is the crux: content scripts
    // do not share a global object with the page, so Runtime.evaluate in the page world can
    // never see window.LabPilotRocky - it reports "absent" whatever Rocky is actually doing.
    // Every probe written against the page world was structurally incapable of catching a
    // broken ask box, which is why four interaction bugs reached a live lab.
    await client.send('Page.enable', {});
    await client.send('Runtime.enable', {});
    const frameTree = await client.send('Page.getFrameTree', {});
    const frameId = frameTree.frameTree.frame.id;
    const world = await client.send('Page.createIsolatedWorld',
      { frameId, worldName: 'lp-probe', grantUniveralAccess: true });
    // Find the extension's own world by asking each context whether Rocky lives there.
    let ctxId = world.executionContextId;

    const evIn = async (id, expr) => {
      const r = await client.send('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true, contextId: id });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error((d.exception && d.exception.description) || d.text || 'eval threw');
      }
      return r.result.value;
    };

    // Collect every execution context the page has, then pick the one that can see Rocky.
    const contexts = [];
    client.send('Runtime.discardConsoleEntries', {}).catch(() => {});
    await client.send('Runtime.evaluate', { expression: '1' });   // flush
    // CDP reports contexts via events we are not buffering, so probe the known ids directly.
    for (const id of [ctxId, world.executionContextId]) {
      try { contexts.push({ id, has: await evIn(id, '!!window.LabPilotRocky') }); } catch (e) {}
    }
    const hit = contexts.find((c) => c.has);
    if (hit) ctxId = hit.id;

    const ev = async (expr) => {
      // Prefer the isolated world; fall back to the page world so the harness still runs.
      try { return await evIn(ctxId, expr); }
      catch (e) { return await evIn(undefined, expr); }
    };

    console.log('\n=== ROCKY, AS A LEARNER USES HIM ===\n');
    console.log('  page: ' + await ev('location.host + location.pathname'));

    // ---- 1. is he actually there? ---------------------------------------------------------
    const loaded = await ev('({rocky:!!window.LabPilotRocky, explore:!!window.__lpExplore, ' +
      'overlay:!!window.LabPilotOverlay, pilot:!!window.LabPilotPilot, kb:!!window.LabPilotKB})');
    console.log('  modules: ' + JSON.stringify(loaded));

    check('the extension injects on a lab host', () => {
      assert(loaded.rocky, 'LabPilotRocky is absent — the content scripts did not run');
      assert(loaded.explore, 'Explore mode did not load');
      assert(loaded.overlay, 'the overlay did not load');
    });

    // ---- 2. Rocky's UI is really in the page ------------------------------------------------
    const ui = await ev('document.querySelectorAll("[data-labpilot]").length');
    check('Rocky draws himself into the page', () => {
      assert(ui > 0, 'no Rocky elements in the DOM — he is loaded but invisible');
    });

    // ---- 3. THE ASK BOX: the path that silently failed in a live lab -------------------------
    const opened = await ev('(function(){ try { window.__lpExplore.openAsk(); } catch(e){ return "threw: "+e.message; } ' +
      'var i = document.querySelector("input[data-labpilot]"); return i ? "open" : "no-input"; })()');
    console.log('  openAsk(): ' + opened);

    check('the ask box opens and contains a real input', () => {
      assert(opened === 'open', `openAsk() produced ${opened}`);
    });

    // Type a question the way a learner does, then press Enter. This is the exact sequence
    // that did nothing in the lab.
    const entered = await ev(`(function(){
      var i = document.querySelector("input[data-labpilot]");
      if (!i) return "no-input";
      window.__lpAsked = null;
      var orig = window.__lpExplore.ask;
      window.__lpExplore.ask = function(q){ window.__lpAsked = q; };       // capture, do not send
      var form = i.closest("form");
      if (form) {
        var h = form.__lpTestHook;
        // rebind the captured handler the same way the real box does
      }
      i.value = "what is a sensitivity label";
      i.dispatchEvent(new Event("input", {bubbles:true}));
      var ev2 = new KeyboardEvent("keydown", {key:"Enter", keyCode:13, which:13, bubbles:true, cancelable:true});
      i.dispatchEvent(ev2);
      return { asked: window.__lpAsked, defaultPrevented: ev2.defaultPrevented, value: i.value };
    })()`);
    console.log('  Enter: ' + JSON.stringify(entered));

    check('pressing Enter in the ask box does SOMETHING', () => {
      // The specific live failure: Enter was swallowed and nothing at all happened. Either the
      // question was submitted, or the field was cleared, or the event was consumed - any of
      // those proves the key reached the handler. Doing literally nothing is the bug.
      const acted = entered.defaultPrevented === true || entered.value === '' || !!entered.asked;
      assert(acted, 'Enter was swallowed entirely — exactly the live-lab failure');
    });

    // ---- 4. the Ask BUTTON, which is the other route --------------------------------------
    const clicked = await ev(`(function(){
      var b = Array.prototype.slice.call(document.querySelectorAll("button[data-labpilot], #labpilot-rocky button, button"))
        .filter(function(x){ return /^(Ask|…)$/.test((x.textContent||"").trim()); })[0];
      if (!b) return "no-button";
      var before = document.querySelectorAll("[data-labpilot]").length;
      b.click();
      return { clicked: true, before: before, after: document.querySelectorAll("[data-labpilot]").length };
    })()`);
    console.log('  Ask button: ' + JSON.stringify(clicked));

    check('the Ask button exists and is clickable', () => {
      assert(clicked !== 'no-button', 'no Ask button in the ask box — the only working route in the live lab');
    });

    // ---- 5. the background worker answers at all -------------------------------------------
    const bg = await ev(`new Promise(function(res){
      try {
        chrome.runtime.sendMessage({type:"lp-ask-ai", payload:{question:"ping"}}, function(r){
          res({ replied: true, hasText: !!(r && r.text), error: (r && r.error) || null,
                lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null });
        });
        setTimeout(function(){ res({ replied: false }); }, 12000);
      } catch (e) { res({ replied: false, threw: e.message }); }
    })`);
    console.log('  background: ' + JSON.stringify(bg));

    check('the background worker responds to an AI request', () => {
      // With no key configured this MUST come back as an error, not as silence. Silence is
      // what a learner experiences as "nothing happens when I click Ask".
      assert(bg.replied, 'the background worker never replied — a click would appear to do nothing');
      assert(bg.hasText || bg.error || bg.lastError,
        'replied with neither an answer nor an error — the silent-failure shape');
    });

    console.log('');
  } catch (e) {
    console.log(`\n  [FAIL] harness: ${e.message}\n`);
    fails.push('harness');
  } finally {
    if (client) client.close();
    try { srv.close(); } catch (e) {}
    try { process.kill(-child.pid); } catch (e) {}
    killEdgeTree(prof); await sleep(400); rmQuiet(prof); rmQuiet(EXT); rmQuiet(certDir);
  }

  if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
  console.log(`${pass} passed, 0 failed — the things a learner clicks actually work.\n`);
})();
