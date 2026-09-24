/*
 * azure-dig.js — what is actually inside an Azure portal blade?
 *
 * The capability report found only 18 visible controls on the Resource groups blade, 17 of them
 * in the banner, and no aria-current at all. Either the Azure portal genuinely declares almost
 * nothing, or the harvest is missing where Ibiza puts its content. Those two have opposite
 * consequences for Rocky, so this finds out which before anything is designed around it.
 *
 *   node test/azure-dig.js [match] [port]     match defaults to BrowseResourceGroups
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

const DIG = String.raw`(() => {
  var t = function (e) { return ((e && (e.innerText || e.textContent)) || '').replace(/\s+/g, ' ').trim(); };
  var SEL = 'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"],' +
            '[role="menuitem"],[role="treeitem"],[role="gridcell"],[role="row"],[role="columnheader"],[tabindex]';
  var all = Array.prototype.slice.call(document.querySelectorAll(SEL));
  var visible = all.filter(function (e) {
    try { var r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.top < innerHeight && r.bottom > 0; }
    catch (x) { return false; }
  });
  var hosts = Array.prototype.slice.call(document.querySelectorAll('*')).filter(function (e) { return e.shadowRoot; });
  var frames = Array.prototype.slice.call(document.querySelectorAll('iframe'));
  return {
    hash: (location.hash || '').slice(0, 90),
    totalEls: document.querySelectorAll('*').length,
    selMatches: all.length,
    visible: visible.length,
    sampleVisible: visible.slice(0, 24).map(function (e) {
      return (((e.getAttribute && e.getAttribute('aria-label')) || t(e)) || '').slice(0, 34);
    }).filter(Boolean),
    bodyTextLen: document.body ? t(document.body).length : 0,
    bodySample: t(document.body).slice(0, 260),
    shadowHosts: hosts.length,
    iframes: frames.length,
    iframeSrcs: frames.slice(0, 6).map(function (f) { return (f.getAttribute('src') || f.getAttribute('name') || '(no src)').slice(0, 70); }),
    gridcells: document.querySelectorAll('[role="gridcell"]').length,
    rows: document.querySelectorAll('[role="row"]').length,
    columnheaders: document.querySelectorAll('[role="columnheader"]').length,
    ariaCurrentAny: document.querySelectorAll('[aria-current]').length,
    ariaSelectedTrue: document.querySelectorAll('[aria-selected="true"]').length,
    titleAttrNodes: document.querySelectorAll('[title]').length,
    dataTestIds: document.querySelectorAll('[data-testid],[data-automation-id],[data-telemetryname]').length,
  };
})()`;

(async () => {
  const match = process.argv[2] || 'BrowseResourceGroups';
  const port = process.argv[3] || '9600';
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  // Accept 'iframe' targets too. Azure renders blade content in CROSS-ORIGIN iframes on
  // portal.azure.net, and those are separate CDP targets — filtering to 'page' hides the
  // only frame that contains the thing a lab step is about.
  const t = list.find((x) => (x.type === 'page' || x.type === 'iframe') && new RegExp(match, 'i').test(x.url || ''));
  if (!t) { console.log(`no tab matching ${match}`); return; }
  const c = await connect(t.webSocketDebuggerUrl);
  await c.send('Runtime.enable');
  const r = await c.send('Runtime.evaluate', { expression: DIG, returnByValue: true });
  c.close();
  const v = r.result && r.result.result && r.result.result.value;
  if (!v) { console.log('no value; exceptionDetails:', JSON.stringify(r.result && r.result.exceptionDetails || {}).slice(0, 400)); return; }
  console.log(JSON.stringify(v, null, 1));
})().catch((e) => console.log('ERR ' + e.message));
