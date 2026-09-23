/*
 * bench-mutation.js — is an event-driven browser observer quiet, or a firehose?
 *
 * The architecture proposes MutationObserver as L0 in the browser: zero cost while idle,
 * fires only when the page changes. That is only true if a real SPA is actually quiet when
 * the learner is reading. Ad rotators, live regions and polling widgets can make a page
 * "change" hundreds of times a second while nothing meaningful happened.
 *
 * Measures on a real Microsoft SPA:
 *   1. raw mutation batches/sec while idle (learner reading)
 *   2. raw mutation batches/sec during a navigation click
 *   3. how many of those survive a 250 ms coalesce + "interactive controls changed" filter
 *
 * The third number is what the cortex would actually see. If it is single digits per
 * navigation and ~0 while idle, event-driven is right. If not, the design needs a damper.
 */
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PKG = path.join('C:', 'AI-Testing-Workspace', 'Cloudlabs - Rocky', 'vmpackage');
const { killEdgeTree, rmQuiet } = require(path.join(PKG, 'test', 'edge-util.js'));

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    const onData = (d) => { buf = Buffer.concat([buf, d]); const i = buf.indexOf('\r\n\r\n'); if (i < 0) return;
      if (!/101/.test(buf.slice(0, i).toString())) { reject(new Error('upgrade failed')); return; }
      sock.removeListener('data', onData); resolve(makeClient(sock, buf.slice(i + 4))); };
    sock.on('data', onData); sock.on('error', reject);
  });
}
function makeClient(sock, rest) {
  const pending = new Map(); let id = 0; let buf = rest;
  function frame(p) { const d = Buffer.from(p); const mk = crypto.randomBytes(4); const len = d.length; let head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(len), 2); }
    const m = Buffer.alloc(len); for (let i = 0; i < len; i++) m[i] = d[i] ^ mk[i % 4]; return Buffer.concat([head, mk, m]); }
  function read() { while (buf.length >= 2) { const l0 = buf[1] & 0x7f; let off = 2; let len = l0;
      if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return; const pl = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
      try { const m = JSON.parse(pl); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } catch (e) {} } }
  sock.on('data', (d) => { buf = Buffer.concat([buf, d]); read(); });
  return { send(method, params) { return new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject });
      sock.write(frame(JSON.stringify({ id: mid, method, params: params || {} })));
      setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error(method + ' timeout')); } }, 30000); }); },
    close() { try { sock.destroy(); } catch (e) {} } };
}
const getJSON = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Installs the observer the architecture proposes: raw batches counted, plus a coalesced
// stream that only emits when the SET OF INTERACTIVE CONTROLS changed.
const INSTALL = `(() => {
  if (window.__rockyObs) return 'already';
  const SEL='a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=combobox],[role=option],[role=treeitem]';
  const sig = () => { let h=0; const els=document.querySelectorAll(SEL); h=els.length;
    for (const el of els){ const s=(el.getAttribute('aria-label')||el.textContent||'').slice(0,20); for(let i=0;i<s.length;i++) h=((h<<5)-h+s.charCodeAt(i))|0; } return h; };
  const st = { raw:0, coalesced:0, meaningful:0, lastSig:sig(), pending:false, t0:performance.now() };
  const mo = new MutationObserver(() => {
    st.raw++;
    if (st.pending) return;
    st.pending = true;
    setTimeout(() => {                 // 250 ms coalesce window
      st.pending = false; st.coalesced++;
      const s = sig(); if (s !== st.lastSig) { st.lastSig = s; st.meaningful++; }
    }, 250);
  });
  mo.observe(document.documentElement, { childList:true, subtree:true, attributes:true, characterData:true });
  window.__rockyObs = st;
  return 'installed';
})()`;
const READ = `(() => { const s=window.__rockyObs; const dt=(performance.now()-s.t0)/1000; const r={sec:+dt.toFixed(1), raw:s.raw, coalesced:s.coalesced, meaningful:s.meaningful}; s.raw=0;s.coalesced=0;s.meaningful=0;s.t0=performance.now(); return r; })()`;

(async () => {
  const PAGE = process.argv[2] || 'https://learn.microsoft.com/en-us/training/browse/';
  const port = 9700 + Math.floor(Math.random() * 200);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rockymut-'));
  const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
  const child = spawn(edge, [`--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--window-size=1920,1080', PAGE], { detached: true, stdio: 'ignore' });
  let client;
  try {
    let targets;
    for (let i = 0; i < 60; i++) { await sleep(400); try { targets = await getJSON(`http://127.0.0.1:${port}/json/list`); if (targets.some((t) => t.type === 'page')) break; } catch (e) {} }
    client = await wsConnect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await sleep(4000);
    const ev = async (e) => (await client.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

    console.log('\n=== EVENT-DRIVEN BROWSER OBSERVER: QUIET OR FIREHOSE? ===\n');
    console.log('  page: ' + (await ev('document.title')).slice(0, 70));
    console.log('  install: ' + await ev(INSTALL));

    // 1. idle: the learner is reading
    await ev(READ);
    await sleep(10000);
    const idle = await ev(READ);
    console.log(`\n  IDLE ${idle.sec}s (learner reading)`);
    console.log(`    raw mutation batches   ${idle.raw}   (${(idle.raw / idle.sec).toFixed(1)}/s)`);
    console.log(`    coalesced @250ms       ${idle.coalesced}`);
    console.log(`    meaningful (controls changed)  ${idle.meaningful}   <- what the cortex sees`);

    // 2. interaction: click a real link, in-app navigation
    await ev(READ);
    const clicked = await ev(`(() => { const a=[...document.querySelectorAll('a[href]')].find(a=>/\\/training\\/(modules|paths)\\//.test(a.href)&&a.getBoundingClientRect().width>0); if(!a) return 'no link'; a.click(); return a.textContent.trim().slice(0,50); })()`);
    // a full navigation destroys the observer, exactly as it would destroy a content script;
    // reinstall and count the SETTLE churn the cortex would see on the new page
    await sleep(400);
    const re = await ev(INSTALL);
    await sleep(6000);
    const nav = await ev(READ);
    console.log(`  (observer after click: ${re})`);
    console.log(`\n  NAVIGATION click -> "${clicked}"  (${nav.sec}s window)`);
    console.log(`    raw mutation batches   ${nav.raw}`);
    console.log(`    coalesced @250ms       ${nav.coalesced}`);
    console.log(`    meaningful (controls changed)  ${nav.meaningful}   <- what the cortex sees`);

    // 3. idle again on the new page
    await ev(READ);
    await sleep(8000);
    const idle2 = await ev(READ);
    console.log(`\n  IDLE again ${idle2.sec}s on new page`);
    console.log(`    raw ${idle2.raw}  coalesced ${idle2.coalesced}  meaningful ${idle2.meaningful}`);
    console.log('');
  } catch (e) { console.error('failed: ' + e.message); }
  finally { if (client) client.close(); try { process.kill(-child.pid); } catch (e) {} killEdgeTree(prof); await sleep(400); rmQuiet(prof); }
})();
