/*
 * completion-probe.js — is "the thing was actually created" OBSERVABLE from a content script?
 *
 * THE QUESTION. Completion detection rests on one assumption: that when a learner finishes a
 * step, the browser shows something Rocky can check. "The policy appears in the policy list" is
 * the canonical example. If that is readable, completion becomes a predicate. If it is not,
 * completion stays a guess wearing a predicate's clothes, and the honest thing is to say so
 * before building three layers on top of it.
 *
 * A MISTAKE WORTH KEEPING IN THE FILE. The first version navigated a blank tab and waited seven
 * seconds. Purview was still rendering — a live region literally read "Loading Navigation" — so
 * it reported zero lists and a null h1 on a page that plainly has both. That would have been
 * recorded as "completion is not observable" when the truth was "I measured a page that had not
 * arrived yet". A portal this slow must be measured after it settles. So this attaches to tabs
 * that are ALREADY OPEN and already settled, and navigates nothing.
 *
 * WHAT IT LOOKS FOR, AND WHY EACH IS A DIFFERENT KIND OF EVIDENCE.
 *
 *   grids         role=grid / role=table / table / role=list, WITH aria-rowcount. Fluent
 *                 virtualises long lists — only visible rows exist in the DOM — so counting
 *                 rendered rows is wrong and aria-rowcount is the only honest total. Get this
 *                 wrong and a 40-row list reads as 12, and scrolling looks like a deletion.
 *   liveRegions   aria-live / role=status / role=alert. Where a portal ANNOUNCES success, and
 *                 it announces precisely because screen readers require it — the same reason
 *                 aria-current is dependable.
 *   emptyState    "No policies yet" copy. Empty-state -> populated is the cleanest creation
 *                 signal there is and needs no row counting at all.
 *   counters      "12 policies" badges, which some portals keep even when the grid virtualises.
 *
 *   node test/completion-probe.js [port]
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
    const waits = new Map();
    s.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      if (!up) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; up = true; buf = buf.slice(i + 4); res({ send, close: () => s.destroy() }); }
      while (buf.length >= 2) {
        const l0 = buf[1] & 127; let off = 2, len = l0;
        if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const pay = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
        let msg; try { msg = JSON.parse(pay); } catch (e) { continue; }
        if (msg.id && waits.has(msg.id)) { waits.get(msg.id)(msg); waits.delete(msg.id); }
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

const PROBE = `(() => {
  var t0 = performance.now();
  function txt(el) { return ((el && (el.innerText || el.textContent)) || '').replace(/[ \\t\\n\\r]+/g, ' ').trim(); }
  function nm(el) {
    var a = el.getAttribute && el.getAttribute('aria-label');
    return (a && a.trim()) ? a.trim().slice(0, 50) : txt(el).slice(0, 50);
  }
  function big(el) { try { var r = el.getBoundingClientRect(); return r.width > 120 && r.height > 40; } catch (e) { return false; } }

  var grids = [];
  var GRID_SEL = '[role="grid"],[role="table"],[role="treegrid"],table,[role="list"],[role="listbox"],[data-automationid*="ist"],[class*="DetailsList"],[class*="etailsRow"]';
  Array.prototype.forEach.call(document.querySelectorAll(GRID_SEL), function (g) {
    if (!big(g)) return;
    grids.push({
      how: g.getAttribute('role') || g.tagName.toLowerCase(),
      name: nm(g),
      rowsInDom: g.querySelectorAll('[role="row"],tr,[role="listitem"],[role="option"]').length,
      ariaRowCount: g.getAttribute('aria-rowcount') === null ? null : Number(g.getAttribute('aria-rowcount')),
    });
  });

  var live = [];
  Array.prototype.forEach.call(document.querySelectorAll('[aria-live],[role="status"],[role="alert"],[role="alertdialog"]'), function (e) {
    live.push({
      how: e.getAttribute('role') || ('aria-live=' + e.getAttribute('aria-live')),
      politeness: e.getAttribute('aria-live') || '',
      text: txt(e).slice(0, 60),
    });
  });

  var body = (document.body ? txt(document.body) : '').slice(0, 30000);
  var lower = body.toLowerCase();
  var empties = [];
  ['no policies', 'no items', 'nothing to show', 'no results', 'no alerts', 'no cases',
   'create your first', 'get started', 'you don\\'t have'].forEach(function (p) {
    if (lower.indexOf(p) >= 0) empties.push(p);
  });
  var counters = (body.match(/\\b\\d+\\s+(polic|alert|case|user|item|result)\\w*/gi) || []).slice(0, 6);

  return {
    url: location.href.slice(0, 90),
    h1: (function () { var h = document.querySelector('main h1,[role="main"] h1,h1'); return h ? txt(h).slice(0, 45) : null; })(),
    controls: document.querySelectorAll('a[href],button,[role="button"]').length,
    grids: grids.slice(0, 6), gridCount: grids.length,
    liveRegions: live.slice(0, 6), liveRegionCount: live.length,
    emptyStatePhrases: empties,
    counters: counters,
    costMs: Math.round((performance.now() - t0) * 100) / 100,
  };
})()`;

function report(label, p) {
  console.log(`  ${label}`);
  console.log(`    url               ${p.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60)}`);
  console.log(`    h1 / controls     ${JSON.stringify(p.h1)} / ${p.controls}`);
  console.log(`    list-shaped nodes ${p.gridCount}`);
  p.grids.forEach((g) => console.log(
    `       ${String(g.how).padEnd(8)} "${g.name}"  rows in DOM ${g.rowsInDom}  aria-rowcount ${g.ariaRowCount === null ? 'ABSENT' : g.ariaRowCount}`));
  console.log(`    live regions      ${p.liveRegionCount}`);
  p.liveRegions.forEach((l) => console.log(
    `       ${String(l.how).padEnd(20)} ${l.text ? JSON.stringify(l.text) : '(empty — waiting for an announcement)'}`));
  console.log(`    empty-state copy  ${p.emptyStatePhrases.length ? p.emptyStatePhrases.join(', ') : 'none'}`);
  console.log(`    counters in text  ${p.counters.length ? p.counters.join(', ') : 'none'}`);
  console.log(`    cost              ${p.costMs} ms`);
  console.log('');
}

(async () => {
  const port = process.argv[2] || '9600';
  console.log('\n=== IS "IT WAS ACTUALLY CREATED" OBSERVABLE? ===');
  console.log('    (attaching to tabs already open and settled; nothing navigated, nothing clicked)\n');
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const pages = list.filter((x) => x.type === 'page' && /purview|azure|cloudlabs|office/.test(x.url || ''));
  if (!pages.length) { console.log('  no portal tabs open'); return; }
  for (const t of pages) {
    const c = await connect(t.webSocketDebuggerUrl);
    await c.send('Runtime.enable');
    const r = await c.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    c.close();
    const p = r.result && r.result.result && r.result.result.value;
    if (p) report((t.title || '(untitled)').slice(0, 40), p);
  }
})().catch((e) => console.log('ERR ' + e.message));
