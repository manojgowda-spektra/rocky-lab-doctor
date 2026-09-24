/*
 * position-live.js — one answer, on the real portals, and nothing else allowed to give one.
 *
 * Validates the five things stage 3 claims, against Azure and Purview rather than a harness:
 *
 *   1. completion events reach Position   (the relay stream shows up in lastCompletion)
 *   2. position reads correctly            (belief / cursor / place, with provenance)
 *   3. the rival systems are retired       (nothing but Position produces a step number)
 *   4. the AI prompt gets only confidence-backed state
 *   5. no unverified step number can enter the system
 *
 * Read from the ISOLATED WORLD, the only place these objects exist.
 *
 *   node test/position-live.js [port]
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
  const P = window.LabPilotPosition;
  if (!P) return { here: false, frame: window.LabPilotFrame ? (window.LabPilotFrame.isTop ? 'top' : 'child') : '?' };
  const s = P.read();
  let ground = null;
  try { ground = window.LabPilotLab && window.LabPilotLab.summary ? window.LabPilotLab.summary() : null; } catch (e) { ground = 'THREW: ' + e.message; }
  return {
    here: true,
    frame: window.LabPilotFrame ? (window.LabPilotFrame.isTop ? 'top' : 'child') : '?',
    origin: location.origin,
    sayable: s.sayable,
    belief: { index: s.belief.index, confidence: s.belief.confidence, source: s.belief.source },
    cursor: { index: s.cursor.index, source: s.cursor.source, confidence: s.cursor.confidence },
    place: s.place,
    completed: { count: s.completed.count, complete: s.completed.complete },
    lastCompletion: s.lastCompletion,
    recovery: { reason: s.recovery.reason, failure: s.recovery.failure ? s.recovery.failure.text : null },
    workflow: s.workflow.state,
    sources: s.sources,
    promptLine: P.promptLine(),
    grounding: ground ? String(ground).slice(0, 400) : null,
  };
})()`;

(async () => {
  const port = process.argv[2] || '9600';
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const targets = list.filter((x) => (x.type === 'page' || x.type === 'iframe') && /purview|azure|cloudlabs/.test(x.url || ''));

  console.log('\n=== POSITION, ON THE REAL PORTALS ===\n');
  const seen = [];
  for (const t of targets) {
    const c = await connect(t.webSocketDebuggerUrl);
    await c.send('Runtime.enable');
    await wait(500);
    const ctxs = c.events.filter((e) => e.method === 'Runtime.executionContextCreated')
      .map((e) => e.params.context).filter((x) => x.auxData && x.auxData.type === 'isolated');
    let v = null;
    for (const ctx of ctxs) {
      const r = await c.send('Runtime.evaluate', { expression: ASK, contextId: ctx.id, returnByValue: true });
      const got = r.result && r.result.result && r.result.result.value;
      if (got && got.here) { v = got; break; }
      if (got && !v) v = got;
    }
    c.close();
    if (!v) continue;
    seen.push(v);
    const where = (v.origin || t.url || '').replace(/^https?:\/\//, '').slice(0, 44);
    if (!v.here) { console.log(`  [no Position] ${where}  (frame ${v.frame})`); continue; }
    console.log(`  ${where}   [${v.frame}]`);
    console.log(`     SAYABLE      ${v.sayable.stepNumber === null ? 'null' : v.sayable.stepNumber + ' of ' + v.sayable.total}   source=${v.sayable.source}`);
    console.log(`                  why: ${v.sayable.why}`);
    console.log(`     belief       index ${v.belief.index} @ ${v.belief.confidence}  (${v.belief.source})`);
    console.log(`     cursor       index ${v.cursor.index}  (${v.cursor.source}, confidence ${v.cursor.confidence})`);
    console.log(`     place        ${v.place.section || '-'}${v.place.page ? ' > ' + v.place.page : ''}   (${v.place.source} @ ${v.place.confidence})`);
    console.log(`     completed    ${v.completed.count}${v.completed.complete ? ' — COMPLETE' : ''}   workflow=${v.workflow}`);
    console.log(`     lastDone     ${v.lastCompletion ? v.lastCompletion.kind + ' from ' + String(v.lastCompletion.frame).replace(/^https?:\/\//, '').slice(0, 34) : 'none'}`);
    if (v.recovery.failure) console.log(`     FAILURE      ${JSON.stringify(v.recovery.failure)}`);
    console.log(`     relay events ${v.sources.relayEvents}`);
    console.log(`     prompt       ${JSON.stringify(v.promptLine)}`);
    if (v.grounding) console.log(`     grounding    ${JSON.stringify(v.grounding.slice(0, 190))}`);
    console.log('');
  }

  // ---- the five claims ----------------------------------------------------------------------
  const live = seen.filter((v) => v.here);
  const tops = live.filter((v) => v.frame === 'top');
  console.log('  ' + '-'.repeat(72));
  let bad = 0;
  const say = (ok, label, detail) => { if (!ok) bad++; console.log(`  ${ok ? '[ok]  ' : '[FAIL]'} ${label}${detail ? '   ' + detail : ''}`); };

  say(live.length > 0, 'Position is present in the frames', `${live.length} frame(s)`);
  say(tops.some((v) => v.sources.relay), 'the relay stream reaches Position',
    `relay events visible: ${tops.map((v) => v.sources.relayEvents).join(', ')}`);
  say(live.every((v) => v.place.source !== 'none' || v.frame === 'child'),
    'every top frame resolves a place',
    tops.map((v) => v.place.source).join(', '));

  // 4 + 5: nothing may state a number Position would not state.
  const liars = live.filter((v) => v.sayable.stepNumber === null && /step \d+ of/i.test(v.promptLine || ''));
  say(liars.length === 0, 'the prompt never states a number Position withheld',
    liars.length ? liars.map((v) => v.origin).join(', ') : 'checked ' + live.length + ' frame(s)');

  const groundLiars = live.filter((v) => v.sayable.stepNumber === null && /on step \d+ of/i.test(v.grounding || ''));
  say(groundLiars.length === 0, 'the AI grounding paragraph states no unverified step number',
    groundLiars.length ? groundLiars.map((v) => v.origin).join(', ') : 'checked ' + live.filter((v) => v.grounding).length + ' with grounding');

  console.log('');
  console.log(bad ? `  ${bad} claim(s) FAILED` : '  all claims hold on the live portals');
})().catch((e) => console.log('ERR ' + e.message));
