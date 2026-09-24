/*
 * frame-reach.js — does Rocky actually reach inside the frames that hold the lab?
 *
 * THE THING THIS PROVES OR DISPROVES. The Azure portal renders every blade control and every
 * grid row inside a cross-origin iframe on portal.azure.net. With all_frames:false and no host
 * pattern for that origin, Rocky saw the portal shell and nothing else — the command bar, the
 * list, the thing every Azure lab step is about, all invisible.
 *
 * Two manifest changes were made. This asks the browser whether they worked, which is the only
 * authority that counts. For every frame it reports whether a Rocky content script is running
 * there, which role frame.js assigned it, and how much of the lab surface that frame holds.
 *
 * WHY IT LOOKS FOR AN ISOLATED WORLD. A content script runs in an isolated world, so
 * window.LabPilotFrame is invisible from the page's own context. Asking the page world returns
 * undefined whether or not Rocky is there, which reads as "not injected" and has caused four
 * misdiagnoses on this project. The isolated world is found by its auxData.type — 'isolated',
 * not 'isolatedWorld'.
 *
 *   node test/frame-reach.js [port]
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
  var F = window.LabPilotFrame;
  var t = function (e) { return ((e && (e.innerText || e.textContent)) || '').replace(/\\s+/g, ' ').trim(); };
  var SEL = 'a[href],button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="gridcell"],[role="row"]';
  var vis = Array.prototype.slice.call(document.querySelectorAll(SEL)).filter(function (e) {
    try { var r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; } catch (x) { return false; }
  });
  return {
    rockyHere: !!F,
    role: F ? (F.ownsUI ? 'TOP — owns the UI' : (F.tiny ? 'child (too small to observe)' : 'child — observes only')) : null,
    href: (location.href || '').slice(0, 70),
    visibleControls: vis.length,
    rows: document.querySelectorAll('[role="row"]').length,
    gridcells: document.querySelectorAll('[role="gridcell"]').length,
    sample: vis.slice(0, 6).map(function (e) { return (((e.getAttribute && e.getAttribute('aria-label')) || t(e)) || '').slice(0, 26); }).filter(Boolean),
    hasUI: !!document.getElementById('labpilot-rocky'),
    perception: !!window.LabPilotPerception,
    world: !!window.LabPilotWorld,
  };
})()`;

(async () => {
  const port = process.argv[2] || '9600';
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const targets = list.filter((x) => (x.type === 'page' || x.type === 'iframe') && /^https?:/.test(x.url || ''));

  console.log('\n=== DOES ROCKY REACH THE FRAMES THAT HOLD THE LAB? ===\n');
  let reached = 0, missed = 0, uiCount = 0;
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
      if (v && v.rockyHere) { got = v; break; }
    }
    if (!got) {
      // measure the frame anyway, so "missed" says how much was lost
      const r = await c.send('Runtime.evaluate', { expression: ASK, returnByValue: true });
      got = (r.result && r.result.result && r.result.result.value) || null;
    }
    c.close();
    if (!got) continue;
    const tag = got.rockyHere ? 'REACHED' : 'NOT REACHED';
    if (got.rockyHere) reached++; else if (got.visibleControls > 3) missed++;
    if (got.hasUI) uiCount++;
    console.log(`  [${tag}] ${t.type.padEnd(6)} ${got.href}`);
    console.log(`            role ${got.role || '—'}   controls ${got.visibleControls}   rows ${got.rows}   cells ${got.gridcells}   UI mounted ${got.hasUI}`);
    if (got.sample.length) console.log(`            sees: ${got.sample.join(' | ')}`);
  }
  console.log('\n  ' + '-'.repeat(70));
  console.log(`  frames Rocky reaches           ${reached}`);
  console.log(`  content-bearing frames MISSED  ${missed}${missed ? '   <- still blind here' : ''}`);
  console.log(`  frames that mounted the UI     ${uiCount}${uiCount > 1 ? '   <- MORE THAN ONE ROCKY, this is a bug' : ''}`);
})().catch((e) => console.log('ERR ' + e.message));
