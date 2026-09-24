/*
 * place-probe.js — can the portal TELL us where the learner is, without matching any control?
 *
 * THE QUESTION THIS ANSWERS. The whole position redesign turns on one bet: that "where am I in
 * this workflow" is something the portal already declares, and Rocky has simply never read it.
 * If that is true, position stops being an inference over control names — which is the thing
 * that has failed repeatedly — and becomes a reading. If it is false, no filter saves us and
 * the honest answer is that browser position tracking has a ceiling.
 *
 * So this walks a real portal and extracts, per page, a PLACE SIGNATURE built ONLY from the
 * portal's own statements about itself:
 *
 *   ariaCurrentPath   every aria-current whose VALUE is not "false" — Fluent v9 puts
 *                     aria-current="false" on unselected items and "false" is a truthy string,
 *                     so a presence check silently marks every nav item as current.
 *   breadcrumb        nav[aria-label*="breadcrumb"], the portal's own trail
 *   h1                what the page calls itself
 *   activeTab         aria-selected="true" inside a tablist
 *   dialog            an open modal/wizard and its accessible name
 *   route             the URL, minus tenant ids and other volatile parts
 *   listCounts        row counts per grid/table — how "the policy appears in the list" is seen
 *
 * A signature is only useful if it is STABLE while nothing happens and CHANGES when the learner
 * moves. Both are measured here: each page is sampled twice, and signatures are compared across
 * pages. A signal that differs between two idle samples is noise; a signal identical on two
 * different pages carries no position information. Either failing disqualifies it.
 *
 *   node test/place-probe.js [port] [--stay]
 *
 * It opens its OWN tab, visits read-only routes, and closes the tab again, so the learner's own
 * tabs are never navigated. --stay leaves the probe tab open for inspection. It clicks nothing.
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
function put(u) {
  return new Promise((res, rej) => {
    const q = new URL(u);
    const req = http.request({ hostname: q.hostname, port: q.port, path: q.pathname + q.search, method: 'PUT' },
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res({}); } }); });
    req.on('error', rej); req.end();
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

// The extractor. Nothing here matches a guide label; it reads only what the portal says.
const PLACE = `(() => {
  var t0 = performance.now();
  function txt(el) { return ((el && (el.innerText || el.textContent)) || '').replace(/[ \\t\\n\\r]+/g, ' ').trim(); }
  function nm(el) {
    var a = el.getAttribute && el.getAttribute('aria-label');
    return (a && a.trim()) ? a.trim().slice(0, 60) : txt(el).slice(0, 60);
  }

  // aria-current: compare by VALUE. "false" is a truthy string and Fluent puts it everywhere.
  var current = [];
  Array.prototype.forEach.call(document.querySelectorAll('[aria-current]'), function (e) {
    var v = (e.getAttribute('aria-current') || '').toLowerCase();
    if (!v || v === 'false') return;
    var r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;              // declared but not rendered
    current.push({ value: v, name: nm(e) });
  });

  var crumb = null;
  Array.prototype.forEach.call(document.querySelectorAll('nav,[role="navigation"]'), function (n) {
    if (!/breadcrumb/i.test(n.getAttribute('aria-label') || '')) return;
    var parts = Array.prototype.map.call(n.querySelectorAll('a,[role="link"],li,span'), txt)
      .filter(function (s) { return s && s.length < 60; });
    var seen = {}, uniq = [];
    parts.forEach(function (p) { if (!seen[p]) { seen[p] = 1; uniq.push(p); } });
    if (uniq.length) crumb = uniq.slice(0, 5);
  });

  var dlg = null;
  var d = document.querySelector('[role="dialog"],[role="alertdialog"],dialog[open]');
  if (d) { var dr = d.getBoundingClientRect(); if (dr.width > 50) dlg = nm(d) || '(unnamed dialog)'; }

  var tabs = [];
  Array.prototype.forEach.call(document.querySelectorAll('[role="tab"][aria-selected="true"]'), function (e) {
    var n = nm(e); if (n) tabs.push(n);
  });

  // "the policy appears in the list" — grids, and how many rows they hold
  var lists = [];
  Array.prototype.forEach.call(document.querySelectorAll('[role="grid"],[role="table"],table,[role="list"]'), function (g) {
    var rows = g.querySelectorAll('[role="row"],tr,[role="listitem"]').length;
    var r = g.getBoundingClientRect();
    if (r.width > 100 && rows > 0) lists.push({ name: nm(g).slice(0, 30) || '(list)', rows: rows });
  });

  // route with the volatile parts removed, so it compares across tenants and sessions
  var route = location.pathname.replace(/\\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/{guid}')
                               .replace(/\\/\\d{4,}/g, '/{num}');
  var hash = (location.hash || '').split('?')[0].slice(0, 80);

  var h1 = document.querySelector('main h1,[role="main"] h1,h1');

  return {
    route: route + (hash ? ' ' + hash : ''),
    h1: h1 ? txt(h1).slice(0, 60) : null,
    title: (document.title || '').slice(0, 60),
    ariaCurrentPath: current,
    breadcrumb: crumb,
    dialog: dlg,
    activeTabs: tabs,
    lists: lists.slice(0, 4),
    costMs: Math.round((performance.now() - t0) * 100) / 100,
  };
})()`;

// Read-only Purview routes that correspond to the real lab's steps.
const ROUTES = [
  ['home', 'https://purview.microsoft.com/home'],
  ['IRM overview', 'https://purview.microsoft.com/insiderriskmgmt/overviewpage'],
  ['IRM policies', 'https://purview.microsoft.com/insiderriskmgmt/policiespage'],
  ['IRM settings', 'https://purview.microsoft.com/insiderriskmgmt/insiderriskmgmtsettings'],
  ['IRM alerts', 'https://purview.microsoft.com/insiderriskmgmt/alertspage'],
  ['DLP policies', 'https://purview.microsoft.com/datalossprevention/policiespage'],
];

const sigOf = (p) => JSON.stringify({
  route: p.route, h1: p.h1,
  cur: (p.ariaCurrentPath || []).map((c) => c.value + ':' + c.name),
  crumb: p.breadcrumb, dialog: p.dialog, tabs: p.activeTabs,
});

(async () => {
  const port = process.argv[2] || '9600';
  const stay = process.argv.includes('--stay');
  const made = await put(`http://127.0.0.1:${port}/json/new?about:blank`);
  if (!made.id) { console.log('could not open a probe tab'); return; }
  const tabId = made.id;
  const c = await connect(made.webSocketDebuggerUrl);
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  const seen = [];
  console.log('\n=== CAN THE PORTAL TELL US WHERE WE ARE? ===');
  console.log('    (own tab, read-only navigation, nothing clicked)\n');

  for (const [label, url] of ROUTES) {
    await c.send('Page.navigate', { url });
    await wait(6000);
    const a = await c.send('Runtime.evaluate', { expression: PLACE, returnByValue: true });
    const p1 = a.result && a.result.result && a.result.result.value;
    await wait(2000);
    const b = await c.send('Runtime.evaluate', { expression: PLACE, returnByValue: true });
    const p2 = (b.result && b.result.result && b.result.result.value) || p1;
    if (!p1) { console.log(`  ${label}: no answer`); continue; }

    const stable = sigOf(p1) === sigOf(p2);
    console.log(`  ${label}`);
    console.log(`    route       ${p1.route}`);
    console.log(`    h1          ${JSON.stringify(p1.h1)}`);
    console.log(`    aria-current ${p1.ariaCurrentPath.length ? p1.ariaCurrentPath.map((x) => x.value + '="' + x.name + '"').join(' > ') : 'NONE'}`);
    console.log(`    breadcrumb  ${p1.breadcrumb ? p1.breadcrumb.join(' > ') : 'none'}`);
    console.log(`    dialog      ${p1.dialog || 'none'}`);
    console.log(`    tabs        ${p1.activeTabs.length ? p1.activeTabs.join(', ') : 'none'}`);
    console.log(`    lists       ${p1.lists.length ? p1.lists.map((l) => l.name + ':' + l.rows + ' rows').join(', ') : 'none'}`);
    console.log(`    cost        ${p1.costMs} ms      stable over 2s: ${stable ? 'YES' : 'NO  <- noisy, unusable'}`);
    console.log('');
    seen.push({ label, sig: sigOf(p1), place: p1, stable });
  }

  // Does the signature actually DISCRIMINATE? Identical signatures on different pages are useless.
  console.log('  ' + '-'.repeat(70));
  const bySig = {};
  seen.forEach((s) => { (bySig[s.sig] = bySig[s.sig] || []).push(s.label); });
  const collisions = Object.values(bySig).filter((v) => v.length > 1);
  console.log(`  distinct places visited   ${seen.length}`);
  console.log(`  distinct signatures       ${Object.keys(bySig).length}`);
  console.log(`  all stable while idle     ${seen.every((s) => s.stable) ? 'YES' : 'NO'}`);
  console.log(`  collisions                ${collisions.length ? collisions.map((v) => v.join(' == ')).join(' ; ') : 'none — every place is distinguishable'}`);
  const withCur = seen.filter((s) => s.place.ariaCurrentPath.length).length;
  console.log(`  pages declaring aria-current  ${withCur}/${seen.length}`);
  const withH1 = seen.filter((s) => s.place.h1).length;
  console.log(`  pages with an h1              ${withH1}/${seen.length}`);

  if (!stay) { try { await getJSON(`http://127.0.0.1:${port}/json/close/${tabId}`); } catch (e) {} }
  c.close();
})().catch((e) => console.log('ERR ' + e.message));
