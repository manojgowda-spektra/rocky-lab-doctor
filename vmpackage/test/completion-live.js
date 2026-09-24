/*
 * completion-live.js — does the Completion Engine read the real portals?
 *
 * Unit tests prove the engine behaves as its author expected on screens its author wrote. This
 * asks the only question that settles it: attached to the actual Purview and Azure pages, in
 * every frame, does snapshot() find the signals that were measured there by hand?
 *
 *   Purview policies page, measured by hand:  grid aria-rowcount=1, role=status "0 items",
 *                                             role=status "List loaded No data available",
 *                                             empty-state copy "get started" / "you don't have"
 *   Azure Resource groups blade (child frame): grid aria-rowcount="4", role=status "3 results
 *                                             found", aria-live "Showing 1 - 3 of 3"
 *
 * It reads the engine from the ISOLATED WORLD, which is the only place window.LabPilotCompletion
 * exists. Asking the page world returns undefined whether or not the engine is there.
 *
 *   node test/completion-live.js [port]
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

const ASK = `(() => {
  var C = window.LabPilotCompletion;
  if (!C) return { engine: false, frame: window.LabPilotFrame ? (window.LabPilotFrame.isTop ? 'top' : 'child') : '?' };
  var s = C.snapshot();
  var said = C.announcements(600000);
  return {
    engine: true,
    frame: window.LabPilotFrame ? (window.LabPilotFrame.isTop ? 'top' : 'child') : '?',
    url: (location.href || '').slice(0, 70),
    ms: s.ms,
    lists: s.lists,
    empty: s.empty,
    dialogs: s.dialogs,
    heading: s.heading,
    heard: said.map(function (a) { return { kind: a.kind, assertive: a.assertive, text: a.text.slice(0, 64) }; }).slice(-8),
    heardTotal: said.length,
  };
})()`;

(async () => {
  const port = process.argv[2] || '9600';
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const targets = list.filter((x) => (x.type === 'page' || x.type === 'iframe') && /purview|azure|cloudlabs/.test(x.url || ''));

  console.log('\n=== THE COMPLETION ENGINE, ON THE REAL PORTALS ===\n');
  let engines = 0, withLists = 0, withHeard = 0;

  for (const t of targets) {
    const c = await connect(t.webSocketDebuggerUrl);
    await c.send('Runtime.enable');
    await wait(500);
    const ctxs = c.events.filter((e) => e.method === 'Runtime.executionContextCreated').map((e) => e.params.context);
    const iso = ctxs.filter((x) => x.auxData && x.auxData.type === 'isolated');
    let got = null;
    for (const ctx of iso) {
      const r = await c.send('Runtime.evaluate', { expression: ASK, contextId: ctx.id, returnByValue: true });
      const v = r.result && r.result.result && r.result.result.value;
      if (v && v.engine) { got = v; break; }
      if (v && !got) got = v;
    }
    c.close();
    if (!got) continue;

    const where = (t.url || '').replace(/^https?:\/\/([^/]+).*/, '$1');
    if (!got.engine) { console.log(`  [no engine] ${t.type} ${where}  (frame role ${got.frame})`); continue; }
    engines++;
    const listKeys = Object.keys(got.lists);
    if (listKeys.length) withLists++;
    if (got.heardTotal) withHeard++;

    console.log(`  ${where}   [${got.frame} frame]   snapshot ${got.ms} ms`);
    console.log(`     heading     ${JSON.stringify(got.heading)}`);
    console.log(`     lists       ${listKeys.length ? listKeys.map((k) => `${JSON.stringify(k.slice(0, 26))} declared=${got.lists[k].declared} rendered=${got.lists[k].rendered}`).join('; ') : 'none'}`);
    console.log(`     empty state ${got.empty.length ? got.empty.join(', ') : 'none'}`);
    console.log(`     dialogs     ${got.dialogs.length ? got.dialogs.join(', ') : 'none'}`);
    console.log(`     heard (${got.heardTotal})`);
    got.heard.forEach((h) => console.log(`        ${h.kind.padEnd(8)}${h.assertive ? ' ASSERTIVE' : '          '} ${JSON.stringify(h.text)}`));
    console.log('');
  }

  console.log('  ' + '-'.repeat(70));
  console.log(`  frames running the engine        ${engines}`);
  console.log(`  frames that found a list         ${withLists}`);
  console.log(`  frames that heard an announcement ${withHeard}`);
})().catch((e) => console.log('ERR ' + e.message));
