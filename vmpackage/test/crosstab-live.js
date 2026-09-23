/*
 * crosstab-live.js — two real tabs in real Edge: the guide on one, the controls on the other.
 *
 * test/crosstab-test.js proves the publish / subscribe / ingest logic against a mocked
 * chrome.storage. This proves the part a mock cannot: that in the shipped extension, loaded by
 * Edge, chrome.storage.onChanged actually carries the guide from the CloudLabs tab to the
 * Purview tab, the pilot starts there as a FOLLOWER, and the glow lands on a control on the
 * page where the learner works.
 *
 * The ORDER is the hard one: the work tab opens FIRST, with nothing to follow, and must pick
 * the guide up when the guide tab publishes it. Then a DOM mutation on the work tab must not
 * wipe the glow (content.js used to O.hide() on every mutation once it had no steps).
 *
 *   experience.cloudlabs.ai  ->  test/mock-lab.html     (the guide, and its own controls)
 *   purview.microsoft.com    ->  test/mock-portal.html  (controls, no guide)
 *
 * Both hosts are served from one local https server with a throwaway self-signed certificate
 * and mapped with --host-resolver-rules, so the extension matches the SAME origins it matches
 * in the lab. The extension is staged to a temp directory and given an empty ai.local.json
 * there, because the manifest declares that gitignored file as a web-accessible resource and
 * Edge refuses to load an extension whose declared resources are missing.
 *
 * Same plumbing as interaction-live.js: raw CDP, no dependencies, the extension's isolated
 * world found by enumerating Runtime.executionContextCreated, no fallback to the page world.
 *
 *   node test/crosstab-live.js                # the gate
 *   node test/crosstab-live.js --server-only  # stand up the https mock and fetch both hosts, no Edge
 */
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { killEdgeTree, rmQuiet, sweepStaleProfiles } = require('./edge-util');

const ROOT = path.join(__dirname, '..');
const GUIDE_HOST = 'experience.cloudlabs.ai';
const WORK_HOST = 'purview.microsoft.com';

// ---------- minimal CDP client, buffering events (see interaction-live.js) --------------------
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
  const pending = new Map(); let id = 0; let buf = rest; const events = [];
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
        } else if (m.method) { events.push(m); }
      } catch (e) { /* ignore */ }
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
    eventsOf(method) { return events.filter((e) => e.method === method); },
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

// ---------- the extension, staged, with the resource the manifest insists on -----------------
function stage(src) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'rockyxtab-ext-'));
  const copy = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const f = path.join(from, e.name), t = path.join(to, e.name);
      if (e.isDirectory()) copy(f, t); else fs.copyFileSync(f, t);
    }
  };
  copy(src, dest);
  // gitignored and absent in a fresh checkout; declared in the manifest, so Edge needs it to exist
  const local = path.join(dest, 'ai.local.json');
  if (!fs.existsSync(local)) fs.writeFileSync(local, '{}');
  return dest;
}

// ---------- one https server, two hosts ------------------------------------------------------
async function serveBoth() {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rockyxtab-cert-'));
  const keyF = path.join(certDir, 'k.pem'), crtF = path.join(certDir, 'c.pem');
  const openssl = ['openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe']
    .find((c) => { try { execFileSync(c, ['version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } });
  if (!openssl) return null;
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
    '-keyout', keyF, '-out', crtF, '-subj', `/CN=${GUIDE_HOST}`,
    '-addext', `subjectAltName=DNS:${GUIDE_HOST},DNS:${WORK_HOST}`], { stdio: 'ignore' });

  const guideHtml = fs.readFileSync(path.join(__dirname, 'mock-lab.html'), 'utf8');
  const workHtml = fs.readFileSync(path.join(__dirname, 'mock-portal.html'), 'utf8');
  const srv = https.createServer({ key: fs.readFileSync(keyF), cert: fs.readFileSync(crtF) }, (q, s) => {
    const host = String(q.headers.host || '').split(':')[0];
    s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    s.end(host === WORK_HOST ? workHtml : guideHtml);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, port: srv.address().port, certDir };
}

// Fetch one host from the mock over TLS, exactly as the browser will.
function fetchHost(port, host) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: '127.0.0.1', port, path: '/', headers: { Host: host }, rejectUnauthorized: false, servername: host },
      (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => resolve(d)); });
    req.on('error', reject); req.end();
  });
}

(async () => {
  const serverOnly = process.argv.includes('--server-only');
  try { sweepStaleProfiles(os.tmpdir(), ['rockyxtab-', 'rockyint-', 'rockypilot-', 'rocky-verify-']); } catch (e) {}

  const mock = await serveBoth();
  if (!mock) { console.log('\n  openssl not found - cannot serve an https mock. Skipping.\n'); process.exit(0); }

  console.log('\n=== TWO TABS: THE GUIDE ON ONE, THE WORK ON THE OTHER ===\n');

  // The mock itself, before a browser touches it: both hosts, right page each.
  const gHtml = await fetchHost(mock.port, GUIDE_HOST);
  const wHtml = await fetchHost(mock.port, WORK_HOST);
  check('the mock serves the guide page on the CloudLabs host and the portal on the Purview host', () => {
    assert(/Deploy a Virtual Machine - CloudLabs/.test(gHtml), 'guide host did not serve mock-lab.html');
    assert(/Microsoft Purview \(mock\)/.test(wHtml), 'work host did not serve mock-portal.html');
    assert(!/<ol>/.test(wHtml), 'the portal mock carries instruction prose - the guide reader would find a guide there');
  });
  if (serverOnly) { mock.srv.close(); rmQuiet(mock.certDir); finish(); return; }

  const EXT = stage(path.join(ROOT, 'webext'));
  const port = 9600 + Math.floor(Math.random() * 190);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rockyxtab-'));
  const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
  if (!edge) { console.log('\n  Edge not found - skipping\n'); mock.srv.close(); process.exit(0); }

  const child = spawn(edge, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
    `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-features=DisableLoadExtensionCommandLineSwitch,EdgeSyncPromo,msEdgeWelcomePage,msIdentityFre,ImplicitSignin',
    `--host-resolver-rules=MAP ${GUIDE_HOST}:443 127.0.0.1:${mock.port}, MAP ${WORK_HOST}:443 127.0.0.1:${mock.port}`,
    '--ignore-certificate-errors',
    '--headless=new', '--window-size=1400,900',
    'about:blank',
  ], { detached: true, stdio: 'ignore' });

  const clients = [];
  try {
    // ---- attach to the first (work) tab BEFORE navigating, so its contexts announce themselves
    let targets = null, first = null;
    for (let i = 0; i < 70; i++) {
      await sleep(400);
      try {
        targets = await getJSON(`http://127.0.0.1:${port}/json/list`);
        first = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (first) break;
      } catch (e) { /* not up yet */ }
    }
    assert(first, 'no debuggable page target appeared - Edge did not start');

    // A second tab, opened through the DevTools HTTP endpoint (PUT /json/new). It comes back
    // already debuggable, as about:blank, so we can enable Runtime BEFORE navigating it.
    function newTab() {
      return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: '/json/new?about:blank', method: 'PUT' }, (r) => {
          let d = ''; r.on('data', (c) => d += c);
          r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('PUT /json/new returned ' + d.slice(0, 120))); } });
        });
        req.on('error', reject); req.end();
      });
    }

    async function openTab(existingTarget) {
      let t = existingTarget;
      if (!t) {
        const created = await newTab();
        for (let i = 0; i < 40 && !(t && t.webSocketDebuggerUrl); i++) {
          const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
          t = list.find((x) => x.id === created.id);
          if (!(t && t.webSocketDebuggerUrl)) await sleep(250);
        }
        assert(t && t.webSocketDebuggerUrl, 'the second tab never became debuggable');
      }
      const c = await wsConnect(t.webSocketDebuggerUrl);
      clients.push(c);
      await c.send('Page.enable', {});
      await c.send('Runtime.enable', {});
      return c;
    }

    // The extension's own world: the context that can see window.LabPilotPilot. No fallback.
    async function findWorld(c, label) {
      const deadline = Date.now() + 45000;
      const evIn = async (id, expr) => {
        const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, contextId: id });
        if (r.exceptionDetails) {
          const d = r.exceptionDetails;
          throw new Error((d.exception && d.exception.description) || d.text || 'eval threw');
        }
        return r.result.value;
      };
      let ctxId = null;
      while (Date.now() < deadline && ctxId === null) {
        const ctxs = c.eventsOf('Runtime.executionContextCreated').map((e) => e.params.context)
          .sort((a, b) => ((a.auxData && a.auxData.type === 'isolatedWorld') ? 0 : 1) - ((b.auxData && b.auxData.type === 'isolatedWorld') ? 0 : 1));
        for (const x of ctxs) {
          try { if (await evIn(x.id, '!!window.LabPilotPilot')) { ctxId = x.id; break; } } catch (e) { /* destroyed mid-probe */ }
        }
        if (ctxId === null) await sleep(500);
      }
      const worlds = c.eventsOf('Runtime.executionContextCreated').map((e) => `${e.params.context.id}:${(e.params.context.auxData && e.params.context.auxData.type) || '?'}`);
      assert(ctxId !== null, `could not find the extension isolated world on the ${label} tab. Contexts: [${worlds.join(', ')}]`);
      return (expr) => evIn(ctxId, expr);
    }

    // Poll the PRODUCT's state from the harness until a condition holds. This is the test
    // waiting, not the product polling.
    async function until(ev, expr, ms, what) {
      const deadline = Date.now() + ms;
      let v;
      while (Date.now() < deadline) {
        try { v = await ev(expr); if (v) return v; } catch (e) { /* context may be mid-navigation */ }
        await sleep(300);
      }
      throw new Error(`timed out waiting for ${what}: last value ${JSON.stringify(v)}`);
    }

    const STATUS = '(function(){ var s = window.LabPilotPilot.status(); var o = window.LabPilotOverlay; ' +
      'return { on: s.on, role: s.role, sourceUrl: s.sourceUrl, total: s.world && s.world.total, index: s.world && s.world.index, ' +
      'act: s.lastDecision && s.lastDecision.act, why: s.lastDecision && s.lastDecision.why, ' +
      'stepText: s.world && s.world.step && s.world.step.text, glowing: s.glowing, ' +
      'tracked: o && o.tracked ? (o.tracked.id || o.tracked.tagName) : null, guideFound: !!window.LabPilotGuide.read().found }; })()';

    // ================================ TAB 1: the work tab, first ===============================
    const work = await openTab(first);
    await work.send('Page.navigate', { url: `https://${WORK_HOST}/home` });
    const evW = await findWorld(work, 'work');
    console.log(`  work tab:  ${await evW('location.host + location.pathname')}`);

    await sleep(2500);        // give content.js its start() attempt and its bundle fallback
    const before = await evW(STATUS);
    console.log('             before the guide exists: ' + JSON.stringify(before));

    check('the work tab has no guide, so the pilot does NOT start there on its own', () => {
      assert(before.guideFound === false, 'the guide reader found a guide on the portal mock');
      assert(before.on === false, `pilot started with nothing to follow: ${JSON.stringify(before)}`);
    });

    // ================================ TAB 2: the guide tab ====================================
    const guide = await openTab(null);
    await guide.send('Page.navigate', { url: `https://${GUIDE_HOST}/#/lab/guide` });
    const evG = await findWorld(guide, 'guide');
    console.log(`  guide tab: ${await evG('location.host + location.pathname')}`);

    const owner = await until(evG, '(function(){ var s = window.LabPilotPilot.status(); return s.on ? ' + STATUS + ' : null; })()', 20000, 'the pilot to start on the guide tab');
    console.log('             ' + JSON.stringify(owner));

    check('the guide tab starts the pilot as OWNER from the guide on its screen', () => {
      assert(owner.role === 'owner', `role ${owner.role}`);
      assert(owner.total >= 4, `only ${owner.total} steps`);
    });

    const rec = await evG('new Promise(function(r){ chrome.storage.local.get(["lpSharedGuide"], function(v){ ' +
      'var g = v && v.lpSharedGuide; r(g ? { title: g.title, steps: g.steps.length, role: g.role, sourceUrl: g.sourceUrl, age: Date.now() - g.updatedAt, bytes: JSON.stringify(g).length } : null); }); })');
    console.log('             shared record: ' + JSON.stringify(rec));

    check('the guide is in chrome.storage.local under lpSharedGuide, small and fresh', () => {
      assert(rec, 'no record');
      assert(rec.steps >= 4, `record has ${rec.steps} steps`);
      assert(rec.sourceUrl && rec.sourceUrl.indexOf(GUIDE_HOST) >= 0, `sourceUrl ${rec.sourceUrl}`);
      assert(rec.age < 60000, `record is ${rec.age} ms old`);
      assert(rec.bytes < 8192, `record is ${rec.bytes} bytes`);
    });

    // ============================ back to TAB 1: did it follow? ================================
    const follower = await until(evW, '(function(){ var s = window.LabPilotPilot.status(); return s.on ? ' + STATUS + ' : null; })()', 20000, 'the work tab to pick up the shared guide');
    console.log('             work tab now: ' + JSON.stringify(follower));

    check('the work tab picks the guide up through chrome.storage and starts as FOLLOWER', () => {
      assert(follower.role === 'follower', `role ${follower.role}`);
      assert(follower.total >= 4, `follower has ${follower.total} steps`);
      assert(follower.sourceUrl && follower.sourceUrl.indexOf(GUIDE_HOST) >= 0, `sourceUrl ${follower.sourceUrl}`);
    });

    check('the follower resolves the current step against ITS page and glows the real control', () => {
      assert(follower.act === 'POINT', `decision was ${follower.act} (${follower.why})`);
      assert(follower.tracked === 'btn-create-resource', `glow is on ${follower.tracked}`);
    });

    // A DOM change on the work tab. content.js used to O.hide() on every mutation once it had
    // no steps of its own, which would wipe this glow within a second on a real portal.
    await evW('(function(){ var b = document.createElement("button"); b.id = "btn-late"; b.textContent = "Freshly Added"; document.body.appendChild(b); return 1; })()');
    await sleep(1200);
    const after = await evW(STATUS);
    console.log('             after a DOM mutation: ' + JSON.stringify({ tracked: after.tracked, act: after.act, on: after.on }));

    check('a DOM mutation on the work tab does not wipe the follower\'s glow', () => {
      assert(after.on, 'the pilot stopped');
      assert(after.tracked === 'btn-create-resource', `glow after mutation is on ${after.tracked}`);
    });

    // mock-lab.html carries the same controls beside the guide, so the owner glows there too.
    const g2 = await evG(STATUS);
    console.log('             guide tab now: ' + JSON.stringify({ role: g2.role, on: g2.on, tracked: g2.tracked, act: g2.act }));
    check('each tab keeps its own glow - the owner is still the owner after the follower published back', () => {
      assert(g2.role === 'owner' && g2.on, JSON.stringify(g2));
      assert(g2.tracked === 'btn-create-resource', `owner glow is on ${g2.tracked}`);
    });

    console.log('');
  } catch (e) {
    console.error('\n  harness error: ' + e.message + '\n');
    fails.push('harness');
  } finally {
    for (const c of clients) c.close();
    try { process.kill(-child.pid); } catch (e) {}
    killEdgeTree(prof); await sleep(400); rmQuiet(prof);
    try { rmQuiet(EXT); } catch (e) {}
    try { mock.srv.close(); } catch (e) {}
    rmQuiet(mock.certDir);
  }
  finish();
})();

function finish() {
  if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
  console.log(`${pass} passed, 0 failed - the glow follows the learner to the tab where the work is.\n`);
  process.exit(0);
}
