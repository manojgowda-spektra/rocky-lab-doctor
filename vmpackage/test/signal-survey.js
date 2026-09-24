/*
 * signal-survey.js — MEASURE which signals actually discriminate, on the real portal.
 *
 * WHY. The position redesign turns on empirical claims: that aria-current states where you are,
 * that roughly half a Microsoft page's controls live in navigation, that the appeared/
 * disappeared diff separates furniture from target, that breadcrumbs are reliable. Every one of
 * those is checkable on the live portal in a second, and a design built on the literature's
 * version of them rather than on Purview's version of them is a design built on hope.
 *
 * It takes two samples a few seconds apart so the DIFF between observations can be measured too,
 * which is the one signal the current model approximates statistically over three page loads.
 *
 * Reads only structure — names, roles, attributes, counts. No values, no keystrokes.
 *
 *   node test/signal-survey.js [port]        default 9600
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SURVEY = `(() => {
  var SEL = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="checkbox"],[role="radio"],[role="combobox"],[role="textbox"],[role="switch"]';
  function name(el) {
    var a = el.getAttribute && el.getAttribute('aria-label');
    if (a && a.trim()) return a.trim().slice(0, 80);
    var t = (el.innerText || el.textContent || '').replace(/[ \\t\\n\\r]+/g, ' ').trim();
    return t.slice(0, 80);
  }
  function scope(el) {
    if (!el.closest) return 'main';
    if (el.closest('[role="dialog"],[role="alertdialog"],dialog')) return 'dialog';
    if (el.closest('[role="menu"],[role="listbox"],[role="menubar"]')) return 'menu';
    if (el.closest('[role="tablist"]')) return 'tab';
    if (el.closest('nav,[role="navigation"]')) return 'nav';
    if (el.closest('[role="banner"],header')) return 'banner';
    return 'main';
  }
  var t0 = performance.now();
  var els = Array.prototype.slice.call(document.querySelectorAll(SEL));
  var vis = els.filter(function (e) {
    try {
      var r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom < 0 || r.top > innerHeight) return false;
      var cs = getComputedStyle(e);
      return !(cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0');
    } catch (x) { return false; }
  });
  var harvestMs = performance.now() - t0;

  // scope distribution
  var byScope = {};
  vis.forEach(function (e) { var s = scope(e); byScope[s] = (byScope[s] || 0) + 1; });

  // aria-current: how many, what values, are any "false"
  var cur = [];
  Array.prototype.forEach.call(document.querySelectorAll('[aria-current]'), function (e) {
    cur.push({ value: e.getAttribute('aria-current'), name: name(e), scope: scope(e) });
  });
  var sel = [];
  Array.prototype.forEach.call(document.querySelectorAll('[aria-selected="true"]'), function (e) {
    sel.push({ name: name(e), scope: scope(e) });
  });
  var exp = document.querySelectorAll('[aria-expanded="true"]').length;

  // breadcrumbs
  var crumbs = [];
  Array.prototype.forEach.call(document.querySelectorAll('nav,[role="navigation"]'), function (n) {
    var lab = (n.getAttribute('aria-label') || '');
    if (/breadcrumb/i.test(lab)) {
      crumbs.push({ label: lab, trail: (n.innerText || '').replace(/[ \\t\\n\\r]+/g, ' > ').trim().slice(0, 120) });
    }
  });

  // duplicate accessible names — the false-positive generators
  var counts = {};
  vis.forEach(function (e) { var n = name(e).toLowerCase(); if (n) counts[n] = (counts[n] || 0) + 1; });
  var dupes = Object.keys(counts).filter(function (k) { return counts[k] > 1; })
    .sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 12)
    .map(function (k) { return k.slice(0, 40) + ' x' + counts[k]; });

  // superstring names: a container whose name swallows its children
  var longNames = vis.map(name).filter(function (n) { return n.length > 60; }).length;

  // headings and the main landmark
  var h = document.querySelector('main h1, [role="main"] h1, h1');
  var mainCount = document.querySelectorAll('main,[role="main"]').length;

  return {
    url: location.href.slice(0, 110),
    title: document.title.slice(0, 80),
    harvestMs: Math.round(harvestMs * 10) / 10,
    controlsTotal: els.length,
    controlsVisible: vis.length,
    byScope: byScope,
    navShare: vis.length ? Math.round(100 * (byScope.nav || 0) / vis.length) : 0,
    ariaCurrent: cur,
    ariaSelectedTrue: sel,
    ariaExpandedTrue: exp,
    breadcrumbs: crumbs,
    mainLandmarks: mainCount,
    h1: h ? (h.innerText || '').replace(/[ \\t\\n\\r]+/g, ' ').trim().slice(0, 60) : null,
    duplicateNames: dupes,
    namesOver60Chars: longNames,
    // the raw visible name list, for the diff between samples
    _names: vis.map(function (e) { return scope(e) + '|' + name(e); }),
  };
})()`;

(async () => {
  const port = process.argv[2] || '9600';
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const pages = list.filter((t) => t.type === 'page' && /purview|azure|cloudlabs/.test(t.url || ''));

  for (const t of pages) {
    const c = await connect(t.webSocketDebuggerUrl);
    await c.send('Runtime.enable');
    const one = await c.send('Runtime.evaluate', { expression: SURVEY, returnByValue: true });
    const a = one.result && one.result.result && one.result.result.value;
    if (!a) { c.close(); continue; }
    await wait(2500);
    const two = await c.send('Runtime.evaluate', { expression: SURVEY, returnByValue: true });
    const b = (two.result && two.result.result && two.result.result.value) || a;
    c.close();

    const setA = new Set(a._names), setB = new Set(b._names);
    const appeared = [...setB].filter((n) => !setA.has(n));
    const vanished = [...setA].filter((n) => !setB.has(n));

    console.log('\n' + '='.repeat(78));
    console.log(a.title);
    console.log(a.url);
    console.log('-'.repeat(78));
    console.log(`  harvest cost          ${a.harvestMs} ms for ${a.controlsTotal} controls (${a.controlsVisible} visible)`);
    console.log(`  scope split           ${JSON.stringify(a.byScope)}`);
    console.log(`  IN NAVIGATION         ${a.navShare}% of visible controls`);
    console.log(`  main landmarks        ${a.mainLandmarks}${a.mainLandmarks !== 1 ? '   <- not exactly one; scoping to "main" is unreliable here' : ''}`);
    console.log(`  h1                    ${a.h1 === null ? 'NONE' : JSON.stringify(a.h1)}`);
    console.log(`  breadcrumbs           ${a.breadcrumbs.length ? JSON.stringify(a.breadcrumbs) : 'none'}`);
    console.log(`  aria-current          ${a.ariaCurrent.length} element(s) ${JSON.stringify(a.ariaCurrent)}`);
    console.log(`  aria-selected=true    ${a.ariaSelectedTrue.length} ${JSON.stringify(a.ariaSelectedTrue.slice(0, 4))}`);
    console.log(`  aria-expanded=true    ${a.ariaExpandedTrue}`);
    console.log(`  duplicate names       ${a.duplicateNames.length ? a.duplicateNames.join(', ') : 'none'}`);
    console.log(`  names over 60 chars   ${a.namesOver60Chars}  (container names that swallow their children)`);
    console.log(`  DIFF over 2.5s idle   +${appeared.length} appeared / -${vanished.length} vanished`);
    if (appeared.length) console.log(`     appeared: ${appeared.slice(0, 6).join(' | ').slice(0, 200)}`);
    if (vanished.length) console.log(`     vanished: ${vanished.slice(0, 6).join(' | ').slice(0, 200)}`);
    if (!appeared.length && !vanished.length) {
      console.log('     an idle page is STABLE — so a diff is a real event, not churn');
    }
  }
})().catch((e) => console.log('ERR ' + e.message));
