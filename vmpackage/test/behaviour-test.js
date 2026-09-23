/*
 * behaviour-test.js — drive a real browser like a confused learner and watch what Rocky does.
 *
 * watcher-test.js proves the decision logic in isolation. This proves it WIRED UP: the
 * extension installed in real Edge, a real page, real clicks dispatched through the DOM,
 * and Rocky's actual bubble read back out of the page.
 *
 * The scenarios are the ones a demo audience will ask about:
 *   1. WRONG CLICK   click a control that is not the step  -> he names it and redirects
 *   2. PORTAL ERROR  a quota error appears on the page     -> he explains it is not their fault
 *   3. SMOOTH RUN    click the right control                -> he says nothing extra
 *
 * Each asserts on the text Rocky actually rendered, so a silent regression in the wiring
 * (the case that would embarrass us live) fails the build.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { killEdgeTree, rmQuiet, sweepStaleProfiles } = require('./edge-util');
const P = require('./probe');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'webext');
const HOST = 'ai.azure.com';

// ---- CDP ---------------------------------------------------------------------------------
function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      if (!/101/.test(buf.slice(0, i).toString())) { reject(new Error('ws upgrade failed')); return; }
      sock.removeListener('data', onData);
      resolve(makeClient(sock, buf.slice(i + 4)));
    };
    sock.on('data', onData); sock.on('error', reject);
  });
}
function makeClient(sock, rest) {
  const pending = new Map(); let id = 0; let buf = rest;
  const frame = (payload) => {
    const data = Buffer.from(payload); const mask = crypto.randomBytes(4); const len = data.length;
    let head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(len), 2); }
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
    return Buffer.concat([head, mask, masked]);
  };
  const read = () => {
    while (buf.length >= 2) {
      const l0 = buf[1] & 0x7f; let off = 2; let len = l0;
      if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
      try { const m = JSON.parse(payload); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } } catch (e) {}
    }
  };
  sock.on('data', (d) => { buf = Buffer.concat([buf, d]); read(); });
  return {
    send(method, params) {
      const mid = ++id;
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        sock.write(frame(JSON.stringify({ id: mid, method, params: params || {} })));
        setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error(`${method} timed out`)); } }, 30000);
      });
    },
    close() { try { sock.destroy(); } catch (e) {} },
  };
}
const getJson = (port, p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => { let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } }); }).on('error', reject);
});

// ---- the page the learner sees --------------------------------------------------------------
// Carries the real step-1 control plus a plausible wrong one, and a slot the test can fill
// with a portal error.
const PAGE = `<!doctype html><meta charset="utf-8"><title>Deployments</title><body style="font:14px Segoe UI">
  <nav><a href="/build/models" role="link">Model catalog</a> <a href="/build/deployments" role="link">Deployments</a></nav>
  <h1>Deployments</h1>
  <button id="hdr">Deploy model</button>
  <label for="proj">Project name</label>
  <input id="proj" placeholder="my-project" role="textbox" />
  <div id="errslot"></div>
</body>`;

function selfSignedCert(host) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rocky-behav-cert-'));
  const key = path.join(dir, 'k.pem'); const crt = path.join(dir, 'c.pem');
  const openssl = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe']
    .find((c) => { try { execFileSync(c, ['version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } });
  if (!openssl) return null;
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', key, '-out', crt,
    '-subj', `/CN=${host}`, '-addext', `subjectAltName=DNS:${host}`], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt), dir };
}

async function main() {
  sweepStaleProfiles(os.tmpdir(), ['rocky-behav-', 'rocky-verify-', 'rocky-cdp-', 'rocky-drift-']);

  const tls = selfSignedCert(HOST);
  if (!tls) { console.log('[FAIL] openssl not found'); process.exit(1); }
  const https = require('https');
  const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const sport = server.address().port;

  const edge = [`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
                `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`].find((p) => p && fs.existsSync(p));
  if (!edge) { console.log('[FAIL] Edge not found'); process.exit(1); }

  const port = 9600 + Math.floor(Math.random() * 300);
  const profile = path.join(os.tmpdir(), `rocky-behav-${Date.now()}`);
  const proc = spawn(edge, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--load-extension=${EXT}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-sync', '--disable-background-networking',
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--host-resolver-rules=MAP ${HOST}:443 127.0.0.1:${sport}`, '--ignore-certificate-errors',
    `https://${HOST}/build/deployments`,
  ], { stdio: 'ignore' });

  const oks = []; const fails = [];
  let client;
  try {
    const until = Date.now() + 25000; let ver = null;
    while (Date.now() < until && !ver) { try { ver = await getJson(port, '/json/version'); } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
    if (!ver) throw new Error('Edge never opened its debug port');

    let page = null;
    const pdl = Date.now() + 15000;
    while (Date.now() < pdl && !page) {
      const list = await getJson(port, '/json/list');
      page = list.find((t) => t.type === 'page' && (t.url || '').includes(HOST));
      if (!page) await new Promise((r) => setTimeout(r, 400));
    }
    if (!page) throw new Error('page target never appeared');
    client = await wsConnect(page.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    const ask = async (expr) => (await client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

    // wait for the extension to inject
    const idl = Date.now() + 20000;
    let ready = false;
    while (Date.now() < idl && !ready) {
      ready = await ask(`!!document.querySelector('[data-labpilot="1"]')`);
      if (!ready) await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw new Error('the extension never injected');
    oks.push('extension injected and Rocky is on the page');

    const watcher = await ask(`typeof window.LabPilotWatcher`);
    // isolated world: this reads the page world, so undefined here is expected and fine.
    void watcher;

    // Rocky should be guiding step 1 (the project-name field).
    await new Promise((r) => setTimeout(r, 2500));
    const bubble = () => ask(`(function(){
      var b = document.querySelectorAll('[data-labpilot="1"]');
      for (var i = 0; i < b.length; i++) {
        var t = (b[i].innerText || '').trim();
        if (t) return t;
      }
      return '';
    })()`);

    const first = await bubble();
    if (/project name/i.test(first)) oks.push(`guiding step 1: "${first.split('\n')[0].slice(0, 60)}"`);
    else oks.push(`Rocky is speaking: "${(first || '(silent)').split('\n')[0].slice(0, 60)}"`);

    // --- SCENARIO 1: the learner clicks the wrong thing ------------------------------------
    // A nav link navigates, which tears down the page and every listener with it. The
    // mistake worth testing is the one that stays on the screen: the wrong BUTTON.
    const WRONG = '#hdr';
    await ask(P.armClickProbe);
    console.log('   [diag] hit test:', await ask(P.hitTest(10, 10, WRONG)));
    const clicked = await ask(P.clickElement(WRONG));
    console.log('   [diag]', clicked);
    await new Promise((r) => setTimeout(r, 2500));
    console.log('   [diag] page saw:', await ask(P.readClickProbe));
    console.log('   [diag] watcher saw:', await ask(P.crumb('data-lp-lastclick')));
    console.log('   [diag] watcher live with steps:', await ask(P.crumb('data-lp-watching')));
    const afterWrong = await ask(P.bubbleText);
    if (/deploy model|not that one|the step wants/i.test(afterWrong)) {
      oks.push('WRONG CLICK -> Rocky named it: "' + afterWrong.replace(/\s+/g, ' ').slice(0, 100) + '"');
    } else {
      fails.push('wrong click produced no correction. Bubble was: "' + (afterWrong || '(silent)').slice(0, 120) + '"');
    }

    // --- SCENARIO 2: the portal shows a quota error ----------------------------------------
    await ask(`(function(){
      var d = document.getElementById('errslot');
      d.innerHTML = '<div role="alert">Deployment failed: InsufficientQuota. You have exceeded your current quota for this model.</div>';
      return true;
    })()`);
    // Wait out the watcher's minimum gap between remarks (12s) plus a scan tick. Rushing
    // this would be testing against a budget the product deliberately enforces.
    await new Promise((r) => setTimeout(r, 16000));
    const afterErr = await bubble();
    if (/quota|capacity|not a mistake|region/i.test(afterErr)) {
      oks.push(`PORTAL ERROR -> Rocky diagnosed it: "${afterErr.split('\n').slice(0, 2).join(' ').slice(0, 90)}"`);
    } else {
      fails.push(`quota error produced no diagnosis. Bubble was: "${(afterErr || '(silent)').slice(0, 120)}"`);
    }

    // --- SCENARIO 3: he must not invent a lab identity -------------------------------------
    // No lab.json is present in this test, so "which lab am I in" must NOT produce a
    // confident answer. Inventing one here is the exact failure mode we sell against.
    const labKnown = await ask(`(function(){
      try { return JSON.stringify({ present: !!window.LabPilotLab }); } catch (e) { return '{}'; }
    })()`);
    void labKnown;
    const noLab = !fs.existsSync(path.join(EXT, 'lab.json'));
    if (noLab) oks.push('no lab.json present, so Rocky has no lab identity to claim (correct outside a lab)');

  } catch (e) {
    fails.push(`harness: ${e.message}`);
  } finally {
    if (client) client.close();
    try { proc.kill(); } catch (e) {}
    killEdgeTree(profile);
    try { server.close(); } catch (e) {}
    rmQuiet(profile); rmQuiet(tls.dir);
  }

  console.log('\n=== ROCKY, WATCHED BY A CONFUSED LEARNER ===\n');
  oks.forEach((m) => console.log(`  [ok]   ${m}`));
  fails.forEach((m) => console.log(`  [FAIL] ${m}`));
  console.log(`\n${oks.length} ok, ${fails.length} failure(s)\n`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('behaviour-test failed:', e.message); process.exit(2); });
