/*
 * drift-test.js — what does Rocky do when the portal has changed?
 *
 * This is the claim we make to a room full of people: "when the portal changes, Rocky says
 * so instead of pointing at the wrong thing." A claim like that is worth nothing until it
 * has been made to fail on purpose. So this test breaks the page deliberately, three ways,
 * and asserts Rocky's behaviour in each:
 *
 *   1. RENAMED   the control the step wants is gone, a differently-named one took its place
 *                -> expect: no glow, honest card. NOT a glow on the new control.
 *   2. DUPLICATED a second identical control appears (the portal added a row)
 *                -> expect: no glow. Ambiguity must beat a coin flip.
 *   3. DISABLED  the control is there but greyed out (deprecated model)
 *                -> expect: never an inviting click-me glow.
 *
 * A failure here is not a cosmetic bug. It means Rocky would point a learner at the wrong
 * control on a portal build we have not seen, which is the one thing he must never do.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { killEdgeTree, rmQuiet, sweepStaleProfiles } = require('./edge-util');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'webext');

// ---- CDP (shared shape with the other tests) -------------------------------------------
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
      try { const msg = JSON.parse(payload); if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); } } catch (e) {}
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

// A throwaway https server that serves whichever page variant the test has selected.
function selfSignedCert(host) {
  const { execFileSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rocky-drift-cert-'));
  const key = path.join(dir, 'k.pem'); const crt = path.join(dir, 'c.pem');
  const openssl = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe']
    .find((c) => { try { execFileSync(c, ['version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } });
  if (!openssl) return null;
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
    '-keyout', key, '-out', crt, '-subj', `/CN=${host}`, '-addext', `subjectAltName=DNS:${host}`], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt), dir };
}

function serveMutable(host) {
  const https = require('https');
  const tls = selfSignedCert(host);
  if (!tls) return null;
  let variant = 'baseline';
  const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><body>' + PAGES[variant] + '</body>');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server, port: server.address().port, dir: tls.dir,
      setVariant: (v) => { variant = v; },
    }));
  });
}

// ---- the three ways a portal breaks a step ------------------------------------------------
const PAGES = {
  baseline: `
    <h1>Deployments</h1>
    <button id="hdr">Deploy model</button>
    <input placeholder="my-project" role="textbox" />`,

  renamed: `
    <h1>Deployments</h1>
    <!-- the portal renamed it; the step still asks for "Deploy model" -->
    <button id="hdr">Create deployment</button>
    <input placeholder="project-name" role="textbox" />`,

  duplicated: `
    <h1>Deployments</h1>
    <!-- a second identical control appeared -->
    <button id="hdr">Deploy model</button>
    <div><button>Deploy model</button></div>
    <input placeholder="my-project" role="textbox" />`,

  disabled: `
    <h1>Deployments</h1>
    <button id="hdr" disabled>Deploy model</button>
    <input placeholder="my-project" role="textbox" disabled />`,
};

// The step selectors taken verbatim from the shipped bundle, so this tests OUR steps.
const bundle = JSON.parse(fs.readFileSync(path.join(EXT, 'bundle', 'test-bundle.json'), 'utf8'));
const stepOne = bundle.labs[0].tasks[0].steps[0];
const nameSel = stepOne.targets[0].selectors[0].attrs;
const deploySel = { text: 'Deploy model', role: 'button' };

const CASES = [
  { page: 'baseline',   sel: nameSel,   want: 'resolved',     note: 'control present and unique — must glow' },
  { page: 'baseline',   sel: deploySel, want: 'resolved',     note: 'control present and unique — must glow' },
  { page: 'renamed',    sel: nameSel,   want: 'not-resolved', note: 'placeholder changed — must NOT glow the new field' },
  { page: 'renamed',    sel: deploySel, want: 'not-resolved', note: 'button renamed — must NOT glow "Create deployment"' },
  { page: 'duplicated', sel: deploySel, want: 'not-resolved', note: 'two identical buttons — must refuse, not guess' },
  { page: 'disabled',   sel: deploySel, want: 'no-click-me',  note: 'disabled control must not be offered as clickable' },
];



async function main() {
  const edge = [`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
                `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`].find((p) => p && fs.existsSync(p));
  if (!edge) { console.log('[FAIL] Edge not found'); process.exit(1); }

  // Step selectors gate on urlPattern, so these pages must be served from the origin the
  // bundle names. On about:blank every resolve is (correctly) a url-mismatch and the test
  // would prove nothing.
  const host = 'ai.azure.com';
  const mock = await serveMutable(host);
  if (!mock) { console.log('[FAIL] openssl not found — cannot serve the https origin these selectors require'); process.exit(1); }

  const port = 9500 + Math.floor(Math.random() * 400);
  const profile = path.join(os.tmpdir(), `rocky-drift-${Date.now()}`);
  const proc = spawn(edge, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-sync', '--disable-background-networking',
    `--host-resolver-rules=MAP ${host}:443 127.0.0.1:${mock.port}`, '--ignore-certificate-errors',
    `https://${host}/build/deployments`], { stdio: 'ignore' });

  const engine = fs.readFileSync(path.join(EXT, 'content', 'anchor-engine.js'), 'utf8');
  let client; let pass = 0; let fail = 0;
  try {
    const until = Date.now() + 20000; let ver = null;
    while (Date.now() < until && !ver) { try { ver = await getJson(port, '/json/version'); } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
    if (!ver) throw new Error('Edge did not open its debug port');
    const targets = await getJson(port, '/json/list');
    client = await wsConnect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await client.send('Runtime.enable');

    console.log('\n=== WHAT ROCKY DOES WHEN THE PORTAL CHANGES ===');
    console.log(`step under test: ${stepOne.id} — "${stepOne.text}"\n`);

    let lastPage = null;
    for (const c of CASES) {
      if (c.page !== lastPage) {
        mock.setVariant(c.page);
        await client.send('Page.enable');
        await client.send('Page.navigate', { url: `https://${host}/build/deployments?v=${c.page}` });
        await new Promise((r) => setTimeout(r, 700));
        await client.send('Runtime.evaluate', { expression: engine + ';true', returnByValue: true });
        lastPage = c.page;
      }
      const r = await client.send('Runtime.evaluate', {
        expression: `(function(){
          try {
            var r = window.LabPilotAnchor.resolve(${JSON.stringify(c.sel)});
            var el = r.element;
            return JSON.stringify({ status: r.status, disabled: el ? !!el.disabled : null,
              text: el ? (el.innerText || el.getAttribute('placeholder') || '').trim() : null });
          } catch (e) { return JSON.stringify({ status: 'ERROR', text: e.message }); }
        })()`, returnByValue: true });
      const res = JSON.parse(r.result.value);

      // A CRASH IS NOT A REFUSAL. The probe's catch returns status 'ERROR', and 'ERROR' is
      // not 'resolved' — so a plain `!== 'resolved'` test passed every non-resolution case
      // even if the anchor engine threw on absolutely everything. Four of the six cases here
      // were green whether the engine worked or was completely broken.
      // The contract is "resolve the unique, REFUSE the ambiguous". Refusing is a decision the
      // engine makes; throwing is the engine failing to make one. They are not the same, and
      // only one of them is acceptable.
      let ok;
      if (res.status === 'ERROR') ok = false;
      else if (c.want === 'resolved') ok = res.status === 'resolved';
      else if (c.want === 'not-resolved') ok = res.status !== 'resolved';
      else ok = res.status !== 'resolved' || res.disabled === true; // resolved-but-disabled is reported, never a click-me glow

      const detail = res.status === 'resolved' ? `"${res.text}"${res.disabled ? ' [disabled]' : ''}` : '';
      console.log(`  ${ok ? '[ok]  ' : '[FAIL]'} ${c.page.padEnd(11)} ${res.status.padEnd(10)} ${detail}`);
      console.log(`         ${c.note}`);
      ok ? pass++ : fail++;
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    if (!fail) console.log('Rocky degrades honestly: he refuses rather than guessing when the portal moves.\n');
  } catch (e) {
    console.error('drift-test failed:', e.message); fail++;
  } finally {
    if (client) client.close();
    try { proc.kill(); } catch (e) {}
    killEdgeTree(profile);   // the launcher exits; the browser tree does not
    if (mock) { try { mock.server.close(); } catch (e) {} setTimeout(() => { try { fs.rmSync(mock.dir, { recursive: true, force: true }); } catch (e) {} }, 400); }
    rmQuiet(profile);
  }
  process.exit(fail ? 1 : 0);
}

main();
