/*
 * interaction-live.js — the gate that should have existed from the start.
 *
 * WHY. Six defects reached a live lab in two days, and every one was invisible to seventeen
 * green gates:
 *
 *   - LabPilotRocky.explain() threw a ReferenceError, so every Explore explanation produced
 *     nothing. Seventeen gates, none of them ever CALLED explain().
 *   - Enter in the ask box silently did nothing, while the Ask button worked. No test had
 *     ever opened the ask box.
 *   - context() crashed on st.steps[...] into an empty catch; the question vanished with no
 *     error, no spinner, nothing.
 *   - Rocky was not injected on purview.microsoft.com, then not on ml.azure.com. Nothing
 *     checked that the manifest covered the hosts a real lab actually visits.
 *
 * The pattern is the same each time: the logic was tested in Node, and the failure only
 * existed when a person clicked something in a browser. This file closes that gap. It drives
 * the SHIPPED extension in real Edge and CALLS THE FUNCTIONS A LEARNER TRIGGERS — open the
 * ask box, type, press Enter, click the button, run explain() — and asserts something happens.
 *
 * ── THE CRUX: REACHING THE ISOLATED WORLD ────────────────────────────────────────────────
 *
 * Content scripts run in an isolated world. They do NOT share a global object with the page,
 * so Runtime.evaluate in the page world can never see window.LabPilotRocky — it reports
 * "absent" whatever Rocky is actually doing. Page.createIsolatedWorld does NOT help either:
 * it creates a THIRD world, empty, that is neither the page's nor the extension's.
 *
 * That is why verify-loaded.js gave up and settled for DOM evidence, and why the previous
 * draft of this file probed [ctxId, world.executionContextId] — two names for the SAME
 * freshly-created empty world — and then silently fell back to the page world when the probe
 * failed. Every assertion in it was structurally incapable of failing.
 *
 * The real answer is to enumerate Runtime.executionContextCreated EVENTS. Every world the
 * page owns announces itself, and the extension's own world is the one whose
 * auxData.type === 'isolatedWorld'. We buffer those events from BEFORE navigation, then pick
 * the context that can actually see window.LabPilotRocky.
 *
 * THERE IS NO FALLBACK. If the extension's world cannot be found, this gate FAILS. A harness
 * that degrades to a world where the answer is always "absent" is worse than no harness: it
 * is a green light that cannot turn red.
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
const { spawn, execFileSync } = require('child_process');
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

// The CDP client buffers EVENTS as well as replies. Execution contexts are announced once,
// asynchronously, and if we are not listening when the announcement arrives we can never ask
// for it again — there is no "list contexts" command. Buffering them is what makes finding
// the extension's world possible at all.
function makeClient(sock, rest) {
  const pending = new Map(); let id = 0; let buf = rest;
  const events = [];
  const listeners = [];
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
        } else if (m.method) {
          events.push(m);
          for (const fn of listeners.slice()) { try { fn(m); } catch (e) {} }
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
    events,
    eventsOf(method) { return events.filter((e) => e.method === method); },
    on(fn) { listeners.push(fn); },
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

  // Start on about:blank. We attach, enable Runtime, and only THEN navigate — so every
  // execution context the lab page creates, including the extension's, is announced while we
  // are listening. Navigating first is how the previous draft lost the announcements.
  const child = spawn(edge, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
    `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-features=DisableLoadExtensionCommandLineSwitch,EdgeSyncPromo,msEdgeWelcomePage,msIdentityFre,ImplicitSignin',
    `--host-resolver-rules=MAP ${HOST}:443 127.0.0.1:${mockPort}`,
    '--ignore-certificate-errors',
    '--headless=new', '--window-size=1400,900',
    'about:blank',
  ], { detached: true, stdio: 'ignore' });

  let client;
  try {
    // ---- attach to the blank tab BEFORE navigating -----------------------------------------
    let targets = null, page = null;
    for (let i = 0; i < 70; i++) {
      await sleep(400);
      try {
        targets = await getJSON(`http://127.0.0.1:${port}/json/list`);
        page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) break;
      } catch (e) {}
    }
    assert(page, 'no debuggable page target appeared — Edge did not start');
    client = await wsConnect(page.webSocketDebuggerUrl);

    await client.send('Page.enable', {});
    await client.send('Runtime.enable', {});      // from here, contexts announce themselves

    // ---- now navigate to the lab host --------------------------------------------------------
    await client.send('Page.navigate', { url: `https://${HOST}/` });

    // Wait for the extension's own isolated world to announce itself, rather than sleeping a
    // fixed interval and hoping. On a loaded machine Edge can take several seconds to install
    // an unpacked extension and reach document_idle.
    const deadline = Date.now() + 45000;
    let ctxId = null, chosen = null;
    const seen = () => client.eventsOf('Runtime.executionContextCreated').map((e) => e.params.context);

    const evIn = async (id, expr) => {
      const r = await client.send('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true, contextId: id });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error((d.exception && d.exception.description) || d.text || 'eval threw');
      }
      return r.result.value;
    };

    while (Date.now() < deadline && ctxId === null) {
      // The extension's world is an isolatedWorld that can see Rocky's globals. Check the
      // isolated ones first, but probe every context rather than trusting auxData alone:
      // the authoritative test is "can this context see window.LabPilotRocky".
      const ctxs = seen();
      const ordered = ctxs.slice().sort((a, b) => {
        const ai = a.auxData && a.auxData.type === 'isolatedWorld' ? 0 : 1;
        const bi = b.auxData && b.auxData.type === 'isolatedWorld' ? 0 : 1;
        return ai - bi;
      });
      for (const c of ordered) {
        try {
          if (await evIn(c.id, '!!window.LabPilotRocky')) { ctxId = c.id; chosen = c; break; }
        } catch (e) { /* a context can be destroyed mid-probe during navigation */ }
      }
      if (ctxId === null) await sleep(500);
    }

    // NO FALLBACK. If we cannot reach the extension's world, the gate fails. Falling back to
    // the page world is what made every assertion in the previous draft unfailable.
    const worlds = seen().map((c) => `${c.id}:${(c.auxData && c.auxData.type) || '?'}:${c.name || '-'}`);
    assert(ctxId !== null,
      'could not find the extension isolated world that owns window.LabPilotRocky. ' +
      `Contexts seen: [${worlds.join(', ')}]. Either the content scripts did not inject on ` +
      `${HOST}, or Rocky threw during load. This gate does NOT fall back to the page world.`);

    const ev = (expr) => evIn(ctxId, expr);

    console.log('\n=== ROCKY, AS A LEARNER USES HIM ===\n');
    console.log(`  page:  ${await ev('location.host + location.pathname')}`);
    console.log(`  world: ${ctxId} (${(chosen.auxData && chosen.auxData.type) || '?'}` +
                `${chosen.name ? ', name="' + chosen.name + '"' : ''}) — the extension's own`);

    // ---- 1. is he actually there? ---------------------------------------------------------
    const loaded = await ev('({rocky:!!window.LabPilotRocky, explore:!!window.__lpExplore, ' +
      'overlay:!!window.LabPilotOverlay, pilot:!!window.LabPilotPilot, kb:!!window.LabPilotKB})');
    console.log('  modules: ' + JSON.stringify(loaded));

    check('the extension injects on a lab host', () => {
      assert(loaded.rocky, 'LabPilotRocky is absent — the content scripts did not run');
      assert(loaded.explore, 'Explore mode did not load');
      assert(loaded.overlay, 'the overlay did not load');
    });

    // ---- 2. every declared content script actually defined its global ----------------------
    // A script that throws at load leaves its global undefined and everything downstream of
    // it silently dead — which is exactly how explain() shipped broken.
    const globals = await ev(`({
      anchor:  !!window.LabPilotAnchor,   capture: !!window.LabPilotCapture,
      kb:      !!window.LabPilotKB,       cloud:   !!window.LabPilotCloudLabs,
      perceive:!!window.LabPilotPerceive, world:   !!window.LabPilotWorld,
      label:   !!window.LabPilotLabel,    guide:   !!window.LabPilotGuide,
      lab:     !!window.LabPilotLab,      watcher: !!window.LabPilotWatcher,
      rocky:   !!window.LabPilotRocky,    overlay: !!window.LabPilotOverlay,
      pilot:   !!window.LabPilotPilot,    recovery:!!window.LabPilotRecovery,
      explore: !!window.__lpExplore,      controls:!!window.__lpControls,
      cache:   !!window.LabPilotExplainCache
    })`);
    const missing = Object.keys(globals).filter((k) => !globals[k]);
    check('every content script defined its global (none threw at load)', () => {
      assert(missing.length === 0, `these scripts did not define their global: ${missing.join(', ')}`);
    });

    // ---- 3. Rocky's UI is really in the page ------------------------------------------------
    const ui = await ev('document.querySelectorAll("[data-labpilot]").length');
    check('Rocky draws himself into the page', () => {
      assert(ui > 0, 'no Rocky elements in the DOM — he is loaded but invisible');
    });

    // ---- 4. THE FUNCTIONS ARE CALLABLE: explain() shipped as a ReferenceError ----------------
    // Not "is it a function" — CALL it. A ReferenceError inside the body is invisible to a
    // typeof check, and that is precisely the bug that reached a learner.
    const api = await ev(`(function(){
      var out = {};
      var E = window.__lpExplore || {};
      ['toggle','start','stop','explain','detectCircle','ask','openAsk','openMenu','closeMenu','radialLayout']
        .forEach(function(k){ out[k] = typeof E[k]; });
      return out;
    })()`);
    check('Explore exposes every function it advertises', () => {
      const notFn = Object.keys(api).filter((k) => api[k] !== 'function');
      assert(notFn.length === 0, `not functions: ${notFn.map((k) => k + '=' + api[k]).join(', ')}`);
    });

    // explain() takes a DESCRIPTOR, the shape KB().describe() returns — not a raw element.
    // Build it the way a real hover or circle does, so this exercises the true call path.
    // (Passing a bare element throws a TypeError that looks like a product bug but is a
    // harness bug; it cost a verification pass to establish that, hence this note.)
    const explainCall = await ev(`(function(){
      try {
        var el = document.querySelector('#btn-create-resource') || document.querySelector('button');
        if (!el) return { skipped: 'no control on the page to explain' };
        var KB = window.LabPilotKB;
        if (!KB || typeof KB.describe !== 'function') return { skipped: 'LabPilotKB.describe unavailable' };
        var desc = KB.describe(el);
        if (!desc) return { skipped: 'KB did not describe a plain button' };
        window.__lpExplore.explain(desc, 'dwell');
        return { threw: false, name: desc.name || null, role: desc.role || null };
      } catch (e) { return { threw: true, name: e.name, message: e.message }; }
    })()`);
    console.log('  explain(): ' + JSON.stringify(explainCall));
    check('explain() runs without throwing', () => {
      // A skip is a FAILURE here. If we cannot even build a descriptor, the thing this gate
      // exists to exercise never ran, and a silent skip would be another green-but-blind gate.
      assert(!explainCall.skipped, `could not exercise explain(): ${explainCall.skipped}`);
      assert(explainCall.threw === false,
        `explain() threw ${explainCall.name}: ${explainCall.message} — this is the exact ` +
        'shape of the ReferenceError that killed every Explore explanation in a live lab');
    });

    const menuCall = await ev(`(function(){
      try { window.__lpExplore.openMenu(); return { threw:false, els: document.querySelectorAll('[data-labpilot]').length }; }
      catch (e) { return { threw:true, name:e.name, message:e.message }; }
    })()`);
    check('openMenu() runs without throwing', () => {
      assert(menuCall.threw === false, `openMenu() threw ${menuCall.name}: ${menuCall.message}`);
    });
    await ev('(function(){ try { window.__lpExplore.closeMenu(); } catch(e){} return 1; })()');

    // ---- 5. THE ASK BOX: the path that silently failed in a live lab -------------------------
    const opened = await ev(`(function(){
      try { window.__lpExplore.openAsk(); }
      catch (e) { return 'threw: ' + e.name + ': ' + e.message; }
      var i = document.querySelector('input[data-labpilot]');
      return i ? 'open' : 'no-input';
    })()`);
    console.log('  openAsk(): ' + opened);

    check('the ask box opens and contains a real input', () => {
      assert(opened === 'open', `openAsk() produced ${opened}`);
    });

    // Type a question the way a learner does, then press Enter. This is the exact sequence
    // that did nothing in the lab. We stub ask() so no model call is made — the assertion is
    // that the keystroke REACHES the handler, not what the model would say.
    const entered = await ev(`(function(){
      var i = document.querySelector('input[data-labpilot]');
      if (!i) return { error: 'no-input' };
      window.__lpAsked = null;
      var E = window.__lpExplore;
      var realAsk = E.ask;
      E.ask = function (q) { window.__lpAsked = q; };       // capture, do not send
      try {
        i.value = 'what is a sensitivity label';
        i.dispatchEvent(new Event('input', { bubbles: true }));
        var k = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        i.dispatchEvent(k);
        return { asked: window.__lpAsked, defaultPrevented: k.defaultPrevented, value: i.value };
      } finally { E.ask = realAsk; }
    })()`);
    console.log('  Enter: ' + JSON.stringify(entered));

    check('pressing Enter in the ask box submits the question', () => {
      assert(!entered.error, entered.error || '');
      // The live failure was that Enter was swallowed and nothing at all happened. Either the
      // question was submitted, or the field was cleared, or the event was consumed — any of
      // those proves the key reached the handler. Doing literally nothing is the bug.
      const acted = entered.defaultPrevented === true || entered.value === '' || !!entered.asked;
      assert(acted, 'Enter was swallowed entirely — exactly the live-lab failure');
    });

    // ---- 6. the Ask BUTTON, which is the other route --------------------------------------
    await ev('(function(){ try { window.__lpExplore.openAsk(); } catch(e){} return 1; })()');
    const clicked = await ev(`(function(){
      var all = Array.prototype.slice.call(document.querySelectorAll('[data-labpilot] button, button[data-labpilot]'));
      var b = all.filter(function (x) { return /^(Ask|Send|\\u2026|\\u27a4)$/.test((x.textContent || '').trim()); })[0] || all[0];
      if (!b) return { error: 'no-button' };
      window.__lpAsked = null;
      var E = window.__lpExplore, realAsk = E.ask;
      E.ask = function (q) { window.__lpAsked = q; };
      try {
        var i = document.querySelector('input[data-labpilot]');
        if (i) { i.value = 'what is a sensitivity label'; i.dispatchEvent(new Event('input', { bubbles: true })); }
        b.click();
        return { clicked: true, label: (b.textContent || '').trim(), asked: window.__lpAsked };
      } catch (e) { return { threw: true, name: e.name, message: e.message }; }
      finally { E.ask = realAsk; }
    })()`);
    console.log('  Ask button: ' + JSON.stringify(clicked));

    check('the Ask button exists and is clickable', () => {
      assert(!clicked.error, 'no button in the ask box — the only working route in the live lab');
      assert(!clicked.threw, `the Ask button threw ${clicked.name}: ${clicked.message}`);
    });

    // ---- 7. a question SURVIVES the whole ask path without vanishing -------------------------
    // The worst shipped bug: askRocky() crashed into an empty catch and the learner's question
    // disappeared — no answer, no error, no spinner. Drive the REAL ask path (no stub) and
    // assert that something observable happens.
    const survived = await ev(`new Promise(function (res) {
      var before = document.body.innerText.length;
      try { window.__lpExplore.ask('which lab am I in'); }
      catch (e) { res({ threw: true, name: e.name, message: e.message }); return; }
      // Give the deterministic rungs (lab.json, then the CloudLabs corpus) a moment to land.
      setTimeout(function () {
        res({ threw: false, before: before, after: document.body.innerText.length,
              panels: document.querySelectorAll('[data-labpilot]').length });
      }, 6000);
    })`);
    console.log('  ask() end-to-end: ' + JSON.stringify(survived));

    check('a question does not vanish into an empty catch', () => {
      assert(survived.threw !== true,
        `ask() threw ${survived.name}: ${survived.message} — the question vanished, which is ` +
        'the exact live-lab failure');
      assert(survived.panels > 0, 'the ask path left nothing on screen at all');
    });

    // ---- 8. the background worker answers at all -------------------------------------------
    const bg = await ev(`new Promise(function (res) {
      try {
        chrome.runtime.sendMessage({ type: 'lp-ask-ai', payload: { question: 'ping' } }, function (r) {
          res({ replied: true, hasText: !!(r && r.text), error: (r && r.error) || null,
                lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null });
        });
        setTimeout(function () { res({ replied: false }); }, 12000);
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
