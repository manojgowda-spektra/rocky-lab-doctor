/*
 * bench-dom.js — the same measurement as bench-uia.ps1, but inside the browser.
 *
 * UIA on a Chrome window measured 736 ms for a bare tree walk, and 319 ms even filtered hard
 * to onscreen interactive controls. If the DOM answers the same question in single-digit
 * milliseconds then, for browser labs, the accessibility tree is simply the wrong tool — and
 * that decides a large part of the architecture.
 *
 * Reuses the repo's dependency-free CDP client so the numbers come from real Edge.
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
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      if (!/101/.test(buf.slice(0, i).toString())) { reject(new Error('upgrade failed')); return; }
      sock.removeListener('data', onData);
      resolve(makeClient(sock, buf.slice(i + 4)));
    };
    sock.on('data', onData); sock.on('error', reject);
  });
}
function makeClient(sock, rest) {
  const pending = new Map(); let id = 0; let buf = rest;
  function frame(payload) {
    const data = Buffer.from(payload); const mask = crypto.randomBytes(4); const len = data.length;
    let head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(len), 2); }
    const m = Buffer.alloc(len);
    for (let i = 0; i < len; i++) m[i] = data[i] ^ mask[i % 4];
    return Buffer.concat([head, mask, m]);
  }
  function read() {
    while (buf.length >= 2) {
      const l0 = buf[1] & 0x7f; let off = 2; let len = l0;
      if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
      try { const msg = JSON.parse(payload);
        if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id);
          msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
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
const getJSON = (url) => new Promise((res, rej) => {
  http.get(url, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- what a guidance engine actually needs from a screen ---------------------------------
const EXTRACT = `(() => {
  const t0 = performance.now();
  const SEL='a,button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=combobox],[role=option],[role=treeitem],[onclick],[tabindex]:not([tabindex="-1"])';
  const out=[]; const seen=new Set();
  for (const el of document.querySelectorAll(SEL)) {
    if (seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width<2||r.height<2) continue;
    if (r.bottom<0||r.top>innerHeight) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility==='hidden'||cs.display==='none'||cs.opacity==='0') continue;
    out.push({n:(el.getAttribute('aria-label')||el.innerText||el.value||el.title||'').trim().slice(0,80),
      r:el.getAttribute('role')||el.tagName.toLowerCase(),
      id:el.id||el.getAttribute('data-testid')||el.name||'',
      x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});
  }
  return {ms:performance.now()-t0, n:out.length, payload:JSON.stringify(out).length};
})()`;

const SIGNATURE = `(() => { const t0=performance.now();
  const s = location.href+'|'+document.title+'|'+document.querySelectorAll('a,button,input,[role]').length;
  let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h+s.charCodeAt(i))|0;
  return {ms:performance.now()-t0,sig:h}; })()`;

const HOVER = `(() => { const t0=performance.now();
  const el=document.elementFromPoint(900,400);
  const info= el?{tag:el.tagName,n:(el.getAttribute('aria-label')||el.innerText||'').slice(0,40)}:null;
  return performance.now()-t0; })()`;

const stats = (xs) => { xs = xs.slice().sort((a, b) => a - b); return { med: xs[Math.floor(xs.length / 2)], min: xs[0], max: xs[xs.length - 1] }; };

(async () => {
  const PAGE = process.argv[2] || 'https://learn.microsoft.com/en-us/azure/virtual-machines/';
  const port = 9400 + Math.floor(Math.random() * 400);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rockybench-'));
  const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
  if (!edge) { console.error('Edge not found'); process.exit(1); }

  const child = spawn(edge, [`--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--window-size=1920,1080', PAGE],
    { detached: true, stdio: 'ignore' });

  let client, targets;
  try {
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      try { targets = await getJSON(`http://127.0.0.1:${port}/json/list`); if (targets.some((t) => t.type === 'page')) break; } catch (e) {}
    }
    const page = targets.find((t) => t.type === 'page');
    client = await wsConnect(page.webSocketDebuggerUrl);
    await sleep(3500);   // let the page settle

    const ev = async (expr) => (await client.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

    console.log('');
    console.log('=== BROWSER DOM: MEASURED COST ===');
    console.log('');
    console.log('  page: ' + (await ev('document.title')).slice(0, 70));

    const ex = []; let last;
    for (let i = 0; i < 12; i++) { last = await ev(EXTRACT); ex.push(last.ms); }
    const e1 = stats(ex);
    console.log(`  ${last.n} interactive controls extracted`);
    console.log(`  1. full interactive extraction               median ${e1.med.toFixed(2)} ms   min ${e1.min.toFixed(2)}   max ${e1.max.toFixed(2)}`);

    const sg = []; for (let i = 0; i < 20; i++) sg.push((await ev(SIGNATURE)).ms);
    const e2 = stats(sg);
    console.log(`  2. change signature (cheap poll)             median ${e2.med.toFixed(3)} ms  min ${e2.min.toFixed(3)}`);

    const hv = []; for (let i = 0; i < 20; i++) hv.push(await ev(HOVER));
    const e3 = stats(hv);
    console.log(`  3. elementFromPoint (Explore hover)          median ${e3.med.toFixed(3)} ms  min ${e3.min.toFixed(3)}`);

    console.log(`  4. payload for a model: ${(last.payload / 1024).toFixed(1)} KB  (~${Math.round(last.payload / 4)} tokens)`);

    const t0 = Date.now();
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    const shotMs = Date.now() - t0;
    console.log(`  5. screenshot via CDP (comparison)           ${shotMs} ms, ${(Buffer.from(shot.data, 'base64').length / 1024).toFixed(0)} KB`);
    console.log(`     a vision model also spends ~1.1k-1.5k tokens just to SEE 1920x1080`);
    console.log('');
  } catch (e) {
    console.error('bench failed: ' + e.message);
  } finally {
    if (client) client.close();
    try { process.kill(-child.pid); } catch (e) {}
    killEdgeTree(prof); await sleep(500); rmQuiet(prof);
  }
})();
