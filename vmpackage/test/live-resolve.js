/*
 * live-resolve.js — run the REAL anchor engine against a REAL page in REAL Edge.
 *
 * The offline audit (resolve-bundle.js) can only say a selector is well formed. This says
 * what actually happens: it launches headless Edge over the DevTools protocol, loads a
 * page, injects the shipped anchor-engine.js unmodified, and asks it to resolve each
 * selector — reporting resolved / ambiguous / absent exactly as the learner would see it.
 *
 * Default page is test/mock-foundry.html, which is built to be hostile: duplicate "Deploy"
 * buttons, a disabled deprecated one, Fluent volatile ids, a nav link and a breadcrumb with
 * the same text. A resolver that passes this has earned some trust; one that glows the
 * wrong Deploy here would have done it in front of a learner.
 *
 *   node test/live-resolve.js                       # mock page, expectation checks
 *   node test/live-resolve.js --url https://...     # any page (e.g. the live portal)
 *   node test/live-resolve.js --bundle path.json    # audit a bundle's steps against a page
 *   node test/live-resolve.js --keep                # leave the browser open
 *
 * No dependencies: raw CDP over a WebSocket implemented here (~80 lines).
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
const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);

// ---------- a very small CDP client (connect, send, await result) ----------------------
function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    let buf = Buffer.alloc(0);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      if (!/101/.test(buf.slice(0, i).toString())) { reject(new Error('websocket upgrade failed')); return; }
      sock.removeListener('data', onData);
      resolve(makeClient(sock, buf.slice(i + 4)));
    };
    sock.on('data', onData);
    sock.on('error', reject);
  });
}

function makeClient(sock, rest) {
  const pending = new Map();
  let id = 0;
  let buf = rest;

  function frame(payload) {                       // client frames must be masked
    const data = Buffer.from(payload);
    const mask = crypto.randomBytes(4);
    const len = data.length;
    let head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(len), 2); }
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
    return Buffer.concat([head, mask, masked]);
  }

  function read() {
    while (buf.length >= 2) {
      const len0 = buf[1] & 0x7f;
      let off = 2; let len = len0;
      if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len).toString();
      buf = buf.slice(off + len);
      try {
        const msg = JSON.parse(payload);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        }
      } catch (e) { /* events we do not care about */ }
    }
  }
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
  http.get({ host: '127.0.0.1', port, path: p }, (res) => {
    let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
  }).on('error', reject);
});

function findEdge() {
  const c = [
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  const hit = c.find((p) => p && fs.existsSync(p));
  if (!hit) throw new Error('Microsoft Edge not found');
  return hit;
}

async function waitPort(port, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { return await getJson(port, '/json/version'); } catch (e) { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error('Edge did not open its debug port');
}

// ---------- the checks ------------------------------------------------------------------
// Each expectation is a claim about what SHOULD happen, including the ones that must NOT
// resolve. A resolver is only trustworthy if its refusals are as reliable as its hits.
const EXPECTATIONS = [
  { name: 'nav "Deployments" link (text+role+href, nav scope)',
    attrs: { text: 'Deployments', role: 'link', hrefSuffix: '/deployments', scope: 'nav' },
    expect: 'resolved', expectText: 'Deployments' },

  { name: 'header "Deploy model" button',
    attrs: { text: 'Deploy model', role: 'button' },
    expect: 'resolved', expectText: 'Deploy model' },

  { name: 'bare "Deploy" with no other evidence (TWO on the page)',
    attrs: { text: 'Deploy', role: 'button' },
    expect: 'not-resolved', why: 'two Deploy buttons — must refuse rather than guess' },

  // dataAttrs matches the element CARRYING the attribute, so it selects the row itself.
  // That is correct engine behaviour; the authoring lesson is that a row-scoped button
  // needs its own evidence, not its parent's.
  { name: 'the model row itself, by its test id',
    attrs: { dataAttrs: { 'data-testid': 'model-row-gpt5' } },
    expect: 'resolved', expectText: 'gpt-5' },

  { name: 'DISABLED Deploy on the retired model is never offered as click-me',
    attrs: { text: 'Deploy', role: 'button', inLandmark: 'MAIN' },
    expect: 'not-resolved',
    why: 'two Deploys in MAIN, one disabled — ambiguity must win over either' },

  { name: 'the gpt-5 card by its descendant title (childText)',
    attrs: { childText: 'gpt-5', role: 'button' },
    expect: 'resolved' },

  { name: 'catalogue search box by placeholder',
    attrs: { placeholder: 'Search models', role: 'searchbox' },
    expect: 'resolved' },

  { name: 'volatile Fluent id must be ignored, not scored',
    attrs: { id: 'field-_r_2p___control' },
    expect: 'not-resolved', why: 'blacklisted id carries no evidence' },

  { name: 'gpt-5 model card by aria-label',
    attrs: { ariaLabel: 'gpt-5 model card', role: 'button' },
    expect: 'resolved' },

  { name: 'a control that simply is not there',
    attrs: { text: 'Publish to production', role: 'button' },
    expect: 'not-resolved', why: 'absent must be absent' },
];



async function main() {
  const edge = findEdge();
  const port = 9300 + Math.floor(Math.random() * 400);
  const profile = path.join(os.tmpdir(), `rocky-cdp-${Date.now()}`);
  const url = argOf('--url', 'file:///' + path.join(__dirname, 'mock-foundry.html').replace(/\\/g, '/'));

  const proc = spawn(edge, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter', 'about:blank',
  ], { stdio: 'ignore' });

  let client;
  try {
    await waitPort(port, 20000);
    const targets = await getJson(port, '/json/list');
    const page = targets.find((t) => t.type === 'page');
    client = await wsConnect(page.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    await client.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 1200));

    // inject the SHIPPED engine, unmodified — this is the whole point
    const engine = fs.readFileSync(path.join(ROOT, 'webext', 'content', 'anchor-engine.js'), 'utf8');
    const inj = await client.send('Runtime.evaluate', { expression: engine + '\n;typeof window.LabPilotAnchor', returnByValue: true });
    if (inj.result.value !== 'object') throw new Error('engine did not attach: ' + JSON.stringify(inj.result));

    console.log(`\npage:   ${url}`);
    console.log(`engine: anchor-engine.js (shipped, unmodified)\n`);

    let pass = 0; let fail = 0;
    const bundlePath = argOf('--bundle', null);
    const cases = [];

    if (bundlePath) {
      const b = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
      for (const lab of b.labs || []) for (const t of lab.tasks || []) for (const s of t.steps || []) {
        if (s.surface && s.surface !== 'browser') continue;
        const sel = ((s.targets || [])[0] || {}).selectors || [];
        if (sel[0]) cases.push({ name: `${s.id}: ${s.text}`, attrs: sel[0].attrs || {}, expect: 'any' });
      }
    } else {
      cases.push(...EXPECTATIONS);
    }

    for (const c of cases) {
      const expr = `(function(){
        try {
          var r = window.LabPilotAnchor.resolve(${JSON.stringify(c.attrs)});
          var el = r && r.element;
          return JSON.stringify({
            status: r && r.status,
            score: r && r.score,
            runnerUp: r && r.runnerUp,
            text: el ? (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 60) : null,
            tag: el ? el.tagName : null,
            disabled: el ? !!el.disabled : null,
            reason: r && (r.reason || r.why)
          });
        } catch (e) { return JSON.stringify({ status: 'ERROR', reason: String(e && e.message || e) }); }
      })()`;
      const res = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      const r = JSON.parse(res.result.value);

      // A CRASH IS NOT A REFUSAL. The probe's catch returns status 'ERROR', which is not
      // 'resolved', so `!resolved` passed every not-resolved case even when the engine threw.
      // Four of the expectations here were green whether the engine worked or not. Refusing is
      // a decision; throwing is a failure to make one. An 'any' case still tolerates ERROR,
      // because that is what 'any' means — it asserts nothing either way.
      const resolved = r.status === 'resolved';
      let ok = true;
      if (r.status === 'ERROR' && c.expect !== 'any') ok = false;
      else if (c.expect === 'resolved') ok = resolved && (!c.expectText || (r.text || '').includes(c.expectText));
      else if (c.expect === 'not-resolved') ok = !resolved;

      const score = r.score !== undefined && r.score !== null ? ` score=${Number(r.score).toFixed(2)}` : '';
      const runner = r.runnerUp !== undefined && r.runnerUp !== null ? ` runnerUp=${Number(r.runnerUp).toFixed(2)}` : '';
      const what = resolved ? `<${r.tag}> "${r.text}"${r.disabled ? ' [disabled]' : ''}` : (r.reason || '');
      const tag = c.expect === 'any' ? '[info]' : ok ? '[ok]  ' : '[FAIL]';
      if (c.expect !== 'any') { ok ? pass++ : fail++; }
      console.log(`  ${tag} ${c.name}`);
      console.log(`         -> ${r.status}${score}${runner} ${what}`);
      if (!ok && c.why) console.log(`         expected ${c.expect}: ${c.why}`);
    }

    console.log(`\n${pass} passed, ${fail} failed${bundlePath ? ' (bundle mode: informational)' : ''}\n`);
    if (has('--keep')) { console.log('--keep: browser left running; ctrl-c to exit'); await new Promise(() => {}); }
    process.exitCode = fail ? 1 : 0;
  } finally {
    if (client) client.close();
    try { proc.kill(); } catch (e) {}
    killEdgeTree(profile);   // the launcher exits; the browser tree does not
    rmQuiet(profile);
  }
}

main().catch((e) => { console.error('live-resolve failed:', e.message); process.exit(2); });
