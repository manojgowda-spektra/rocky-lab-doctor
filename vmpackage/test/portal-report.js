/*
 * portal-report.js — can Rocky read this portal? A capability report, per portal, with a verdict.
 *
 * WHY THIS IS A TOOL AND NOT A ONE-OFF. The position and completion engines rest on browser-
 * native declarations: aria-current for WHERE, live regions and list cardinality for DONE. Those
 * held on Purview when measured. Whether they hold on the Azure portal, Copilot Studio, Foundry
 * or the M365 admin centre is a different question for each, and the answer decides whether a
 * portal gets full guidance, degraded guidance, or an honest "I cannot follow you here".
 *
 * Guessing is how this goes wrong. The Azure portal is Ibiza, not Fluent: hash routing, blades,
 * and historically iframes. Any of those can invalidate a signal that is perfectly reliable
 * elsewhere, so each portal is measured before it is trusted.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE EARLIER PROBES. It walks EVERY FRAME. The extension ships
 * with all_frames:false, so if a portal renders its working pane inside an iframe, Rocky is
 * structurally blind to it and no amount of signal design helps. That has to be detected, not
 * assumed. It also waits for the page to SETTLE rather than for a fixed timer — an earlier probe
 * reported "no lists, no heading" on a page that had both, because Purview was still rendering
 * after seven seconds and a live region literally read "Loading Navigation".
 *
 *   node test/portal-report.js <url> [--port 9600] [--stay]
 *   node test/portal-report.js --attach            report on every portal tab already open
 *
 * Read-only. Opens its own tab, clicks nothing, closes up after itself.
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
    const rq = http.request({ hostname: q.hostname, port: q.port, path: q.pathname + q.search, method: 'PUT' },
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res({}); } }); });
    rq.on('error', rej); rq.end();
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

// Runs in EVERY frame. Everything here is a browser-native declaration; no guide label is used.
const CAPS = `(() => {
  function txt(el) { return ((el && (el.innerText || el.textContent)) || '').replace(/[ \\t\\n\\r]+/g, ' ').trim(); }
  function nm(el) {
    var a = el.getAttribute && el.getAttribute('aria-label');
    return (a && a.trim()) ? a.trim().slice(0, 45) : txt(el).slice(0, 45);
  }
  function vis(e) {
    try { var r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      var cs = getComputedStyle(e);
      return !(cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0');
    } catch (x) { return false; }
  }
  function region(el) {
    if (!el.closest) return 'main';
    if (el.closest('[role="dialog"],[role="alertdialog"],dialog')) return 'dialog';
    if (el.closest('[role="menu"],[role="listbox"],[role="menubar"],[role="tree"]')) return 'menu';
    if (el.closest('[role="tablist"]')) return 'tab';
    if (el.closest('nav,[role="navigation"]')) return 'nav';
    if (el.closest('[role="banner"],header')) return 'banner';
    if (el.closest('[role="complementary"],aside')) return 'aside';
    return 'main';
  }
  var t0 = performance.now();
  var SEL = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="treeitem"],[role="option"],[role="checkbox"],[role="radio"],[role="combobox"],[role="textbox"],[role="switch"]';
  var all = Array.prototype.slice.call(document.querySelectorAll(SEL));
  var shown = all.filter(vis);
  var byRegion = {};
  shown.forEach(function (e) { var r = region(e); byRegion[r] = (byRegion[r] || 0) + 1; });

  var cur = [];
  Array.prototype.forEach.call(document.querySelectorAll('[aria-current]'), function (e) {
    var v = (e.getAttribute('aria-current') || '').toLowerCase();
    cur.push({ value: v, usable: !!v && v !== 'false', name: nm(e), region: region(e), vis: vis(e) });
  });

  var crumbs = [];
  Array.prototype.forEach.call(document.querySelectorAll('nav,[role="navigation"],ol,[class*="readcrumb"]'), function (n) {
    var lab = (n.getAttribute('aria-label') || '') + ' ' + (n.className || '');
    if (!/breadcrumb/i.test(String(lab))) return;
    crumbs.push(txt(n).slice(0, 80));
  });

  var live = [];
  Array.prototype.forEach.call(document.querySelectorAll('[aria-live],[role="status"],[role="alert"],[role="alertdialog"],[role="log"]'), function (e) {
    live.push({ how: e.getAttribute('role') || ('aria-live=' + e.getAttribute('aria-live')), text: txt(e).slice(0, 50) });
  });

  var grids = [];
  Array.prototype.forEach.call(document.querySelectorAll('[role="grid"],[role="table"],[role="treegrid"],table,[role="list"]'), function (g) {
    if (!vis(g)) return;
    var rc = g.getAttribute('aria-rowcount');
    grids.push({ how: g.getAttribute('role') || g.tagName.toLowerCase(), name: nm(g),
      rows: g.querySelectorAll('[role="row"],tr,[role="listitem"]').length,
      ariaRowCount: rc === null ? null : Number(rc) });
  });

  var heads = Array.prototype.slice.call(document.querySelectorAll('h1,[role="heading"][aria-level="1"]'))
    .filter(vis).map(function (h) { return txt(h).slice(0, 45); });

  return {
    origin: location.origin, path: location.pathname.slice(0, 60),
    hash: (location.hash || '').slice(0, 70),
    title: (document.title || '').slice(0, 50),
    controls: all.length, visible: shown.length,
    byRegion: byRegion,
    landmarks: {
      main: document.querySelectorAll('main,[role="main"]').length,
      nav: document.querySelectorAll('nav,[role="navigation"]').length,
      banner: document.querySelectorAll('[role="banner"],header').length,
    },
    ariaCurrent: cur, breadcrumbs: crumbs, liveRegions: live,
    grids: grids.slice(0, 5), headings: heads.slice(0, 3),
    costMs: Math.round((performance.now() - t0) * 100) / 100,
  };
})()`;

function verdict(frames) {
  const merged = frames.filter((f) => f.visible > 3);
  const usableCurrent = merged.flatMap((f) => f.ariaCurrent.filter((c) => c.usable && c.vis));
  const anyLive = merged.reduce((n, f) => n + f.liveRegions.length, 0);
  const anyCount = merged.flatMap((f) => f.grids).filter((g) => g.ariaRowCount !== null).length;
  const anyCrumb = merged.flatMap((f) => f.breadcrumbs).length;
  const anyHead = merged.flatMap((f) => f.headings).length;
  const inChildFrame = merged.length > 1;

  const lines = [];
  lines.push(`  POSITION PRIMARY   ${usableCurrent.length
    ? 'aria-current  (' + usableCurrent.map((c) => c.value + '="' + c.name + '"').join(' > ') + ')'
    : anyCrumb ? 'breadcrumb (no usable aria-current)'
    : anyHead ? 'heading + route ONLY — degraded, no declared position'
    : 'NONE — route only. Position here is a guess.'}`);
  lines.push(`  COMPLETION CHANNEL ${anyLive ? anyLive + ' live region(s)' : 'NO LIVE REGIONS — completion cannot be announced'}` +
             `${anyCount ? ', ' + anyCount + ' grid(s) declare aria-rowcount' : ', no declared row counts'}`);
  lines.push(`  FRAMES             ${inChildFrame
    ? merged.length + ' frames carry content — manifest all_frames:false means Rocky sees ONLY the top frame'
    : 'single frame — all_frames:false is fine here'}`);
  const grade = usableCurrent.length && anyLive ? 'FULL — both position and completion are declared'
    : (anyCrumb || anyHead) && anyLive ? 'PARTIAL — completion declared, position degraded'
    : usableCurrent.length ? 'PARTIAL — position declared, completion not announced'
    : 'POOR — neither declared; Rocky should say it cannot follow this portal';
  lines.push(`  VERDICT            ${grade}`);
  return lines.join('\n');
}

async function reportTarget(c, label) {
  await c.send('Runtime.enable');
  await wait(400);
  const ctxs = c.events.filter((e) => e.method === 'Runtime.executionContextCreated').map((e) => e.params.context);
  const seen = new Set(); const frames = [];
  for (const ctx of ctxs) {
    if (seen.has(ctx.id)) continue; seen.add(ctx.id);
    if (ctx.auxData && ctx.auxData.type === 'isolated') continue;     // skip extension worlds
    const r = await c.send('Runtime.evaluate', { expression: CAPS, contextId: ctx.id, returnByValue: true });
    const v = r.result && r.result.result && r.result.result.value;
    if (v) frames.push(v);
  }
  if (!frames.length) {
    const r = await c.send('Runtime.evaluate', { expression: CAPS, returnByValue: true });
    const v = r.result && r.result.result && r.result.result.value;
    if (v) frames.push(v);
  }
  console.log('\n' + '='.repeat(78));
  console.log(label);
  console.log('='.repeat(78));
  frames.forEach((f, i) => {
    console.log(`  frame ${i}  ${f.origin}${f.path}${f.hash}`);
    console.log(`    controls        ${f.visible} visible / ${f.controls} total   (${f.costMs} ms)`);
    console.log(`    regions         ${JSON.stringify(f.byRegion)}`);
    console.log(`    landmarks       main:${f.landmarks.main} nav:${f.landmarks.nav} banner:${f.landmarks.banner}`);
    console.log(`    headings        ${f.headings.length ? JSON.stringify(f.headings) : 'none'}`);
    console.log(`    aria-current    ${f.ariaCurrent.length
      ? f.ariaCurrent.map((c2) => `${c2.value}${c2.usable ? '' : ' (UNUSABLE)'}="${c2.name}"`).join(', ') : 'none'}`);
    console.log(`    breadcrumbs     ${f.breadcrumbs.length ? f.breadcrumbs.join(' | ') : 'none'}`);
    console.log(`    live regions    ${f.liveRegions.length
      ? f.liveRegions.slice(0, 4).map((l) => l.how + (l.text ? '=' + JSON.stringify(l.text) : '')).join(', ') : 'none'}`);
    console.log(`    grids           ${f.grids.length
      ? f.grids.map((g) => `${g.how}(rows ${g.rows}, aria-rowcount ${g.ariaRowCount === null ? 'ABSENT' : g.ariaRowCount})`).join(', ') : 'none'}`);
  });
  console.log('  ' + '-'.repeat(74));
  console.log(verdict(frames));
  return frames;
}

(async () => {
  const argv = process.argv.slice(2);
  const port = (argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : '9600');
  const url = argv.find((a) => /^https?:/.test(a));

  if (argv.includes('--attach') || !url) {
    const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
    for (const t of list.filter((x) => x.type === 'page' && /^https?:/.test(x.url || ''))) {
      const c = await connect(t.webSocketDebuggerUrl);
      await reportTarget(c, (t.title || '(untitled)').slice(0, 60));
      c.close();
    }
    return;
  }

  const made = await put(`http://127.0.0.1:${port}/json/new?about:blank`);
  if (!made.id) { console.log('could not open a probe tab'); return; }
  const c = await connect(made.webSocketDebuggerUrl);
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Page.navigate', { url });

  // SETTLE, do not sleep. Poll until the control count stops moving for three seconds.
  let last = -1, same = 0;
  for (let i = 0; i < 45 && same < 3; i++) {
    await wait(1000);
    const q = await c.send('Runtime.evaluate', { returnByValue: true,
      expression: 'document.querySelectorAll("a[href],button,[role=\'button\']").length' });
    const n = (q.result && q.result.result && q.result.result.value) || 0;
    same = (n === last && n > 2) ? same + 1 : 0;
    last = n;
  }
  await reportTarget(c, url);
  if (!argv.includes('--stay')) { try { await getJSON(`http://127.0.0.1:${port}/json/close/${made.id}`); } catch (e) {} }
  c.close();
})().catch((e) => console.log('ERR ' + e.message));
