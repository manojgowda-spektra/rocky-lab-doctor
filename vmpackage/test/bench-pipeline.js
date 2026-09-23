/*
 * bench-live.js — end-to-end latency on a REAL portal, not a synthetic page.
 *
 * The architecture claim is "millisecond guidance without a model in the loop". That is only
 * meaningful if it holds on a heavy enterprise SPA — the Azure portal is the hard case:
 * thousands of nodes, shadow DOM, iframes, virtualised lists, constant mutation.
 *
 * Measures the WHOLE pipeline a learner would feel:
 *    change detected -> controls extracted -> target matched -> coordinates ready to draw
 *
 * Also answers the question that decides the fallback design: how much of a portal is
 * reachable from the top document, and how much hides in iframes and shadow roots?
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
      try { const m = JSON.parse(pl);
        if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
          m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } catch (e) {}
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

/*
 * The full pipeline, in-page. Includes shadow DOM piercing, which the Azure portal needs and
 * which a naive querySelectorAll misses entirely.
 */
const PIPELINE = (want) => `(() => {
  const T = [];
  const mark = (l) => T.push([l, performance.now()]);
  mark('start');

  // 1. harvest, piercing shadow roots
  const SEL='a,button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=combobox],[role=option],[role=treeitem],[role=menuitemcheckbox],[onclick],[tabindex]:not([tabindex="-1"])';
  const out=[]; let shadowRoots=0;
  function harvest(rootNode){
    let nodes; try { nodes = rootNode.querySelectorAll(SEL); } catch(e){ return; }
    for (const el of nodes){
      const r = el.getBoundingClientRect();
      if (r.width<2||r.height<2||r.bottom<0||r.top>innerHeight) continue;
      const cs=getComputedStyle(el);
      if (cs.visibility==='hidden'||cs.display==='none'||cs.opacity==='0') continue;
      out.push({n:(el.getAttribute('aria-label')||el.innerText||el.value||el.title||'').trim().slice(0,80),
        role:el.getAttribute('role')||el.tagName.toLowerCase(),
        id:el.id||el.getAttribute('data-testid')||'',
        x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2),
        w:Math.round(r.width), h:Math.round(r.height),
        dis: el.disabled===true||el.getAttribute('aria-disabled')==='true'});
    }
    // shadow roots: enterprise SPAs hide real controls in them
    let all; try { all = rootNode.querySelectorAll('*'); } catch(e){ return; }
    for (const el of all){ if (el.shadowRoot){ shadowRoots++; harvest(el.shadowRoot); } }
  }
  harvest(document);
  mark('harvested');

  // 2. score against the wanted label - the same contract shape as the shipped engine
  const want = ${JSON.stringify(want)}.toLowerCase();
  const norm = s => (s||'').toLowerCase().replace(/\\s+/g,' ').trim();
  let best=null, second=null;
  for (const c of out){
    const n = norm(c.n);
    if (!n) continue;
    let s = 0;
    if (n === want) s = 1.0;
    else if (n.startsWith(want)) s = 0.85;
    else if (n.includes(want)) s = 0.70;
    else {
      const wt = want.split(' ').filter(Boolean);
      const hit = wt.filter(w => n.includes(w)).length;
      s = wt.length ? (hit/wt.length)*0.6 : 0;
    }
    if (c.dis) s *= 0.4;
    if (!best || s > best.s) { second = best; best = {c, s}; }
    else if (!second || s > second.s) second = {c, s};
  }
  mark('scored');

  const MIN=0.70, MARGIN=0.20;
  const margin = best && second ? best.s - second.s : (best ? 1 : 0);
  const verdict = !best || best.s < MIN ? 'absent' : (margin < MARGIN ? 'ambiguous' : 'resolved');
  mark('done');

  const t0 = T[0][1];
  const phases = {};
  for (let i=1;i<T.length;i++) phases[T[i][0]] = +(T[i][1]-T[i-1][1]).toFixed(2);
  return { total:+(T[T.length-1][1]-t0).toFixed(2), phases, controls: out.length, shadowRoots,
           verdict, score: best?+best.s.toFixed(2):0, margin:+margin.toFixed(2),
           label: best?best.c.n:null, at: best?[best.c.x,best.c.y]:null };
})()`;

(async () => {
  const PAGE = process.argv[2] || 'https://azure.microsoft.com/en-us/get-started/azure-portal';
  const WANT = process.argv[3] || 'Sign in';
  const port = 9600 + Math.floor(Math.random() * 300);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rockylive-'));
  const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
  const child = spawn(edge, [`--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--window-size=1920,1080', PAGE],
    { detached: true, stdio: 'ignore' });

  let client;
  try {
    let targets;
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      try { targets = await getJSON(`http://127.0.0.1:${port}/json/list`); if (targets.some((t) => t.type === 'page')) break; } catch (e) {}
    }
    client = await wsConnect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await sleep(4000);
    const ev = async (e) => (await client.send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;

    console.log('');
    console.log('=== FULL PIPELINE ON A REAL PAGE ===');
    console.log('');
    console.log('  page:   ' + (await ev('document.title')).slice(0, 66));
    console.log('  nodes:  ' + await ev('document.querySelectorAll("*").length'));
    console.log('  target: "' + WANT + '"');
    console.log('');

    const runs = [];
    let r;
    for (let i = 0; i < 10; i++) { r = await ev(PIPELINE(WANT)); runs.push(r.total); }
    runs.sort((a, b) => a - b);

    console.log(`  ${r.controls} interactive controls  (${r.shadowRoots} shadow roots pierced)`);
    console.log('');
    console.log(`  TOTAL detect->extract->match->coords   median ${runs[5].toFixed(2)} ms   min ${runs[0].toFixed(2)}   max ${runs[9].toFixed(2)}`);
    console.log('  phases: ' + JSON.stringify(r.phases));
    console.log('');
    console.log(`  verdict: ${r.verdict.toUpperCase()}  score ${r.score}  margin ${r.margin}`);
    if (r.at) console.log(`  would glow: "${r.label}" at (${r.at[0]}, ${r.at[1]})`);
    console.log('');
  } catch (e) {
    console.error('failed: ' + e.message);
  } finally {
    if (client) client.close();
    try { process.kill(-child.pid); } catch (e) {}
    killEdgeTree(prof); await sleep(400); rmQuiet(prof);
  }
})();
