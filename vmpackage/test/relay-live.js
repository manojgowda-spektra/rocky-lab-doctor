/*
 * relay-live.js — does the child frame's news actually reach the top frame, on the real portals?
 *
 * The unit tests prove the relay behaves as designed against a stubbed completion engine and a
 * stubbed chrome.runtime. This asks the question that settles it: with the real extension in a
 * real browser, does an event raised inside the Azure blade frame — a cross-origin child on
 * portal.azure.net — arrive in the top frame on portal.azure.com?
 *
 * It also answers the survey the mission asked for, from measurement rather than inference:
 * how many frames exist, which produce events, which produce noise, and which carry the
 * completion signals.
 *
 * Read from the ISOLATED WORLD, the only place window.LabPilotRelay exists.
 *
 *   node test/relay-live.js [port]
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

async function isolated(c) {
  await c.send('Runtime.enable');
  await wait(500);
  return c.events.filter((e) => e.method === 'Runtime.executionContextCreated')
    .map((e) => e.params.context)
    .filter((x) => x.auxData && x.auxData.type === 'isolated');
}
async function inFrame(c, expr) {
  for (const ctx of await isolated(c)) {
    const r = await c.send('Runtime.evaluate', { expression: expr, contextId: ctx.id, returnByValue: true, awaitPromise: true });
    const v = r.result && r.result.result && r.result.result.value;
    if (v && v.here) return v;
  }
  return null;
}

const ROLE = `(() => {
  const F = window.LabPilotFrame, R = window.LabPilotRelay;
  if (!F) return { here: false };
  return {
    here: true,
    isTop: !!F.isTop,
    origin: location.origin,
    path: location.pathname.slice(0, 40),
    relay: !!R,
    completion: !!window.LabPilotCompletion,
    events: R ? R.events().length : 0,
    frames: R ? R.frames() : [],
    kinds: R ? R.events().slice(-12).map(e => e.kind + '@' + String(e.frame).replace(/^https?:\\/\\//, '').slice(0, 28)) : [],
  };
})()`;

// Raise a synthetic event in a CHILD frame and see whether the TOP frame hears it. The event
// carries a nonce so it cannot be confused with anything the portal happens to be doing.
const FIRE = (nonce) => `(() => {
  const R = window.LabPilotRelay, F = window.LabPilotFrame;
  if (!R || !F) return { here: false };
  R.publish({ kind: 'relay-probe', frame: location.origin + '/probe', text: '${nonce}', t: Date.now() });
  return { here: true, sentFrom: F.isTop ? 'top' : 'child', origin: location.origin };
})()`;

const HEARD = (nonce) => `(() => {
  const R = window.LabPilotRelay;
  if (!R) return { here: false };
  const hit = R.events().filter(e => e.kind === 'relay-probe' && e.text === '${nonce}');
  return { here: true, heard: hit.length, total: R.events().length };
})()`;

(async () => {
  const port = process.argv[2] || '9600';
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const targets = list.filter((x) => (x.type === 'page' || x.type === 'iframe') && /^https?:/.test(x.url || ''));

  console.log('\n=== THE FRAME SURVEY, AND DOES THE RELAY CARRY? ===\n');

  // ---- 1. survey ----------------------------------------------------------------------------
  const seen = [];
  for (const t of targets) {
    const c = await connect(t.webSocketDebuggerUrl);
    const v = await inFrame(c, ROLE);
    c.close();
    if (!v) { console.log(`  [no rocky] ${t.type.padEnd(6)} ${(t.url || '').slice(0, 68)}`); continue; }
    seen.push({ t, v });
    console.log(`  ${v.isTop ? 'TOP  ' : 'child'}  ${v.origin}${v.path}`);
    console.log(`         relay ${v.relay} · completion ${v.completion} · events held ${v.events}`);
    if (v.kinds.length) console.log(`         recent: ${v.kinds.join(', ')}`);
    if (v.frames.length) {
      v.frames.forEach((f) => console.log(`         from ${String(f.frame).replace(/^https?:\/\//, '').slice(0, 40)}  ${JSON.stringify(f.kinds)}`));
    }
  }

  // ---- 2. does a child event reach the top frame? -----------------------------------------
  const children = seen.filter((s) => !s.v.isTop && s.v.relay);
  const tops = seen.filter((s) => s.v.isTop && s.v.relay);
  console.log('\n  ' + '-'.repeat(70));
  if (!children.length || !tops.length) {
    console.log(`  cannot test the hop: ${children.length} child frame(s), ${tops.length} top frame(s) with the relay`);
    return;
  }

  let hops = 0;
  for (const child of children) {
    const nonce = 'probe-' + crypto.randomBytes(4).toString('hex');
    const cc = await connect(child.t.webSocketDebuggerUrl);
    const fired = await inFrame(cc, FIRE(nonce));
    cc.close();
    if (!fired) continue;

    await wait(1200);                       // the worker may have been asleep

    let landed = false, where = '';
    for (const top of tops) {
      const tc = await connect(top.t.webSocketDebuggerUrl);
      const h = await inFrame(tc, HEARD(nonce));
      tc.close();
      if (h && h.heard > 0) { landed = true; where = top.v.origin; break; }
    }
    if (landed) hops++;
    console.log(`  ${landed ? 'ARRIVED' : 'LOST   '}  ${child.v.origin.replace(/^https?:\/\//, '').slice(0, 42)}  ->  ${landed ? where.replace(/^https?:\/\//, '') : '(nothing heard)'}`);
  }

  console.log('\n  child frames with the relay      ' + children.length);
  console.log('  top frames with the relay        ' + tops.length);
  console.log('  child -> top hops that ARRIVED   ' + hops + ' of ' + children.length);
})().catch((e) => console.log('ERR ' + e.message));
