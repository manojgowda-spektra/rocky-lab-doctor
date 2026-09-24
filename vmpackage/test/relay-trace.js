/*
 * relay-trace.js — where exactly does a child-frame event die?
 *
 * The live check said the hop was lost. There are four places it can die and guessing between
 * them wastes a browser restart each time, so this walks the path and reports each leg:
 *
 *   1. can the child frame reach the extension at all?          chrome.runtime.sendMessage
 *   2. is the service worker alive and listening?               a round-trip with a response
 *   3. does the worker forward to the top frame?                chrome.tabs.sendMessage frameId 0
 *   4. is the top frame listening for it?                       chrome.runtime.onMessage
 *
 *   node test/relay-trace.js [port]
 */
'use strict';
const http = require('http');
const net = require('net');
const crypto = require('crypto');

function getJSON(u) {
  return new Promise((res, rej) => {
    http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}
function connect(url) {
  return new Promise((res, rej) => {
    const m = url.match(/^ws:\/\/([^/]+)(\/.*)$/);
    const [h, p] = m[1].split(':');
    const key = crypto.randomBytes(16).toString('base64');
    const s = net.connect(+p, h, () => s.write(
      `GET ${m[2]} HTTP/1.1\r\nHost: ${m[1]}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    let buf = Buffer.alloc(0), up = false, id = 0;
    const waits = new Map(); const events = [];
    s.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      if (!up) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; up = true; buf = buf.slice(i + 4); res({ send, events, close: () => s.destroy() }); }
      while (buf.length >= 2) {
        const l0 = buf[1] & 127; let off = 2, len = l0;
        if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const pay = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
        let msg; try { msg = JSON.parse(pay); } catch (e) { continue; }
        if (msg.id && waits.has(msg.id)) { waits.get(msg.id)(msg); waits.delete(msg.id); }
        else if (msg.method) events.push(msg);
      }
    });
    s.on('error', rej);
    function send(method, params) {
      return new Promise((r) => {
        const i = ++id; waits.set(i, r);
        const j = Buffer.from(JSON.stringify({ id: i, method, params: params || {} }));
        const mask = crypto.randomBytes(4); const out = Buffer.alloc(j.length);
        for (let k = 0; k < j.length; k++) out[k] = j[k] ^ mask[k % 4];
        let hdr; const L = j.length;
        if (L < 126) hdr = Buffer.from([0x81, 0x80 | L]);
        else if (L < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x81; hdr[1] = 0x80 | 126; hdr.writeUInt16BE(L, 2); }
        else { hdr = Buffer.alloc(10); hdr[0] = 0x81; hdr[1] = 0x80 | 127; hdr.writeBigUInt64BE(BigInt(L), 2); }
        s.write(Buffer.concat([hdr, mask, out]));
      });
    }
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function iso(c) {
  await c.send('Runtime.enable');
  await wait(500);
  return c.events.filter((e) => e.method === 'Runtime.executionContextCreated')
    .map((e) => e.params.context).filter((x) => x.auxData && x.auxData.type === 'isolated');
}
async function evalIn(c, expr, awaitPromise) {
  for (const ctx of await iso(c)) {
    const r = await c.send('Runtime.evaluate', {
      expression: expr, contextId: ctx.id, returnByValue: true, awaitPromise: !!awaitPromise,
    });
    const v = r.result && r.result.result && r.result.result.value;
    if (v && v.here) return v;
  }
  return null;
}

// Leg 1+2: can the child reach the worker, and does the worker answer?
const PING = `(async () => {
  if (!window.LabPilotFrame) return { here: false };
  const out = { here: true, isTop: !!window.LabPilotFrame.isTop, origin: location.origin };
  out.hasChrome = typeof chrome !== 'undefined';
  out.hasRuntime = out.hasChrome && !!chrome.runtime;
  out.hasSend = out.hasRuntime && typeof chrome.runtime.sendMessage === 'function';
  out.extId = out.hasRuntime ? (chrome.runtime.id || null) : null;
  if (!out.hasSend) return out;
  out.ping = await new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ reply: null, err: 'TIMEOUT 3s' }); } }, 3000);
    try {
      chrome.runtime.sendMessage({ type: 'lp-get-state' }, (reply) => {
        if (done) return; done = true; clearTimeout(t);
        resolve({ reply: reply === undefined ? null : 'ok', err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null });
      });
    } catch (e) { done = true; clearTimeout(t); resolve({ reply: null, err: 'THREW ' + e.message }); }
  });
  return out;
})()`;

// Leg 3+4: fire a probe and report any error the send itself produced.
const FIRE = (nonce) => `(async () => {
  if (!window.LabPilotRelay) return { here: false };
  const ev = { kind: 'relay-probe', frame: location.origin + '/trace', text: '${nonce}', t: Date.now() };
  const res = await new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ err: 'TIMEOUT 3s' }); } }, 3000);
    try {
      chrome.runtime.sendMessage({ type: 'lp-frame-event', event: ev }, () => {
        if (done) return; done = true; clearTimeout(t);
        resolve({ err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null });
      });
    } catch (e) { done = true; clearTimeout(t); resolve({ err: 'THREW ' + e.message }); }
  });
  return { here: true, sent: true, sendErr: res.err };
})()`;

const HEARD = (nonce) => `(() => {
  if (!window.LabPilotRelay) return { here: false };
  const hit = window.LabPilotRelay.events().filter(e => e.kind === 'relay-probe' && e.text === '${nonce}');
  return { here: true, heard: hit.length };
})()`;

(async () => {
  const port = process.argv[2] || '9600';
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  console.log('\n=== WHERE DOES A CHILD EVENT DIE? ===\n');

  const sw = list.filter((x) => x.type === 'service_worker' || /background|service_worker/.test(x.url || ''));
  console.log(`  service worker targets visible: ${sw.length}${sw.length ? '  ' + sw.map((s) => (s.url || '').slice(-40)).join(', ') : '   <- the worker may be asleep or evicted'}`);

  const frames = list.filter((x) => (x.type === 'page' || x.type === 'iframe') && /portal\.azure|purview|reactblade/.test(x.url || ''));
  const info = [];
  for (const t of frames) {
    const c = await connect(t.webSocketDebuggerUrl);
    const v = await evalIn(c, PING, true);
    c.close();
    if (!v) continue;
    info.push({ t, v });
    console.log(`\n  ${v.isTop ? 'TOP  ' : 'child'} ${v.origin}`);
    console.log(`         chrome ${v.hasChrome} · runtime ${v.hasRuntime} · sendMessage ${v.hasSend} · id ${v.extId ? 'present' : 'MISSING'}`);
    if (v.ping) console.log(`         worker round-trip: reply=${v.ping.reply} err=${v.ping.err || 'none'}`);
  }

  const child = info.find((x) => !x.v.isTop);
  const tops = info.filter((x) => x.v.isTop);
  if (!child || !tops.length) { console.log('\n  no child/top pair to trace'); return; }

  const nonce = 'trace-' + crypto.randomBytes(4).toString('hex');
  const cc = await connect(child.t.webSocketDebuggerUrl);
  const fired = await evalIn(cc, FIRE(nonce), true);
  cc.close();
  console.log(`\n  fired from ${child.v.origin}`);
  console.log(`         send error: ${fired ? (fired.sendErr || 'none') : 'could not fire'}`);

  await wait(1500);
  for (const top of tops) {
    const tc = await connect(top.t.webSocketDebuggerUrl);
    const h = await evalIn(tc, HEARD(nonce));
    tc.close();
    console.log(`         heard by ${top.v.origin}: ${h ? h.heard : '?'}`);
  }
})().catch((e) => console.log('ERR ' + e.message));
