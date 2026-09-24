/*
 * record-live.js — drive a REAL workflow on a REAL portal and record it.
 *
 * The recorder and the deriver have to be validated on observed behaviour, not on a fixture.
 * This arms the recorder in the live browser, performs a genuine navigation workflow, stops,
 * and writes the trace out for derive-pack.js.
 *
 * WHAT IT DOES AND DOES NOT DO. It clicks NAVIGATION ONLY — moving between pages of a portal
 * the operator is already signed into. It creates nothing, deletes nothing, and submits
 * nothing, so it cannot change the tenant. That is still a real workflow: place changes, list
 * loads, live-region announcements and real latencies, which is exactly what the pack is
 * derived from.
 *
 *   node test/record-live.js <name> <clickLabel> [<clickLabel> ...] [--port 9600] [--out f.json]
 *
 * Each clickLabel is matched against visible control names in the page, most specific first.
 */
'use strict';
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');

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

async function isoCtx(c) {
  await c.send('Runtime.enable');
  await wait(600);
  return c.events.filter((e) => e.method === 'Runtime.executionContextCreated')
    .map((e) => e.params.context).filter((x) => x.auxData && x.auxData.type === 'isolated');
}
async function inIso(c, expr) {
  for (const ctx of await isoCtx(c)) {
    const r = await c.send('Runtime.evaluate', { expression: expr, contextId: ctx.id, returnByValue: true });
    const v = r.result && r.result.result && r.result.result.value;
    if (v && v.here) return v;
  }
  return null;
}

/*
 * TYPING, because some observable outcomes need it.
 *
 * On Azure every non-mutating click produces nothing: Refresh returns the same rows, and a view
 * menu changes no state. Filtering a list DOES change its cardinality, creates nothing and costs
 * nothing — so it is the one way to prove a real completion signal on that portal without
 * touching the tenant. A label of the form `type:Selector=text` types into the first matching
 * field and fires the events a framework listens for.
 */
const TYPE = (spec) => {
  const eq = spec.indexOf('=');
  const want = spec.slice(5, eq).toLowerCase();
  const text = spec.slice(eq + 1);
  return `(() => {
    const want = ${JSON.stringify(want)}, text = ${JSON.stringify(text)};
    const fields = Array.from(document.querySelectorAll('input,textarea,[contenteditable="true"],[role="searchbox"],[role="textbox"]'));
    const name = (e) => ((e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').toLowerCase());
    // NO FALLBACK TO fields[0]. It typed into the Azure portal's global search box because the
    // blade's filter was in a different frame and the top frame happened to have *a* field.
    // A miss must move on to the next frame, not type somewhere arbitrary.
    const hit = fields.find((e) => name(e).indexOf(want) >= 0);
    if (!hit) return { ok: false, saw: fields.map(name).filter(Boolean).slice(0, 10) };
    hit.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (setter && setter.set && hit instanceof window.HTMLInputElement) setter.set.call(hit, text);
    else hit.value = text;
    hit.dispatchEvent(new Event('input', { bubbles: true }));
    hit.dispatchEvent(new Event('change', { bubbles: true }));
    hit.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text.slice(-1) }));
    return { ok: true, clicked: 'typed "' + text + '" into ' + (name(hit) || 'a field') };
  })()`;
};

// Clicking is done in the PAGE world: a real user event on a real control, so the portal's own
// handlers run exactly as they would for a learner.
const CLICK = (label) => `(() => {
  const want = ${JSON.stringify(label)}.toLowerCase();
  /*
   * GEOMETRY IS MEANINGLESS INSIDE A CROSS-ORIGIN CHILD FRAME, and this driver had the same bug
   * the completion engine already had fixed. Measured: every control in the Azure blade —
   * Create, Refresh, Export to CSV, the whole command bar and grid — reports width 0, height 0,
   * because the frame is laid out by a parent it cannot see. A width>2 filter therefore rejected
   * all 55 of them and every Azure click "missed".
   *
   * So size is only trusted where this document HAS a viewport of its own. Where it does not,
   * the style checks stand alone.
   */
  const hasViewport = (innerWidth || 0) > 1 && (innerHeight || 0) > 1;
  const sel = 'a[href],button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],' +
              '[role="treeitem"],[role="option"],[role="checkbox"],[role="columnheader"],[tabindex]';
  const shown = (e) => {
    try {
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
      if (!hasViewport) return true;
      const r = e.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && r.top < innerHeight && r.bottom > 0;
    } catch (x) { return false; }
  };
  const all = Array.from(document.querySelectorAll(sel)).filter(shown);
  const name = (e) => ((e.getAttribute('aria-label') || e.innerText || '').replace(/\\s+/g, ' ').trim());
  let hit = all.find((e) => name(e).toLowerCase() === want);
  if (!hit) hit = all.find((e) => name(e).toLowerCase().indexOf(want) >= 0);
  if (!hit) return { ok: false, tried: want, saw: all.slice(0, 18).map(name).filter(Boolean) };
  hit.scrollIntoView({ block: 'center' });
  hit.click();
  return { ok: true, clicked: name(hit) };
})()`;

(async () => {
  const argv = process.argv.slice(2);
  const port = argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : '9600';
  const outIdx = argv.indexOf('--out');
  const out = outIdx > 0 ? argv[outIdx + 1] : null;
  const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--port' && argv[i - 1] !== '--out');
  const name = positional[0] || 'unnamed';
  const clicks = positional.slice(1);
  if (!clicks.length) { console.error('give at least one control label to click'); process.exit(2); }

  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const page = list.find((t) => t.type === 'page' && /purview|portal\.azure/.test(t.url || ''));
  if (!page) { console.error('no portal tab open'); process.exit(2); }

  const c = await connect(page.webSocketDebuggerUrl);
  const armed = await inIso(c, `(() => {
    const R = window.LabPilotRecorder;
    if (!R) return { here: false };
    return Object.assign({ here: true }, R.arm(${JSON.stringify(name)}));
  })()`);
  if (!armed || !armed.ok) { console.error('could not arm the recorder: ' + JSON.stringify(armed)); process.exit(2); }
  console.log(`\n  recording "${name}" on ${page.url.replace(/^https?:\/\//, '').slice(0, 60)}\n`);

  /*
   * WAIT FOR THE PLACE TO MOVE, DO NOT SLEEP.
   *
   * The first run of this used fixed 2.5s and 5s waits and produced a trace in which every step
   * was "silent" — nothing had changed. Purview was simply still loading: measured elsewhere in
   * this project at 14 to 28 seconds to settle a blade. The recording was real and the driver
   * was impatient, which is the same mistake that made an earlier probe report "no lists" on a
   * page that plainly had one.
   */
  const placeNow = `(() => {
    const P = window.LabPilotPosition;
    if (!P) return { here: false };
    const s = P.read();
    return { here: true, sig: [s.place.section, s.place.page, s.place.route].join('|') };
  })()`;

  async function settle(maxMs) {
    const until = Date.now() + (maxMs || 30000);
    let last = null, stable = 0;
    while (Date.now() < until) {
      const v = await inIso(c, placeNow);
      const sig = v ? v.sig : null;
      stable = (sig && sig === last) ? stable + 1 : 0;
      last = sig;
      if (stable >= 2) return sig;               // unchanged across three reads
      await wait(1500);
    }
    return last;
  }

  /*
   * CLICK WHEREVER THE CONTROL ACTUALLY IS, INCLUDING A CHILD FRAME.
   *
   * On Azure the command bar and the grid live in a cross-origin iframe on portal.azure.net;
   * the top frame holds only the shell. A driver that only clicks in the top frame can never
   * press Refresh or Create, so every Azure recording would be a walk around the chrome. The
   * recorder still runs in the top frame — it receives the child's events through the relay —
   * but the CLICK has to happen where the button is, exactly as a learner's would.
   */
  async function clickAnywhere(label) {
    const targets = [{ label: 'top', ws: page.webSocketDebuggerUrl }];
    try {
      const all = await getJSON(`http://127.0.0.1:${port}/json/list`);
      all.filter((t) => t.type === 'iframe' && /^https?:/.test(t.url || ''))
        .forEach((t) => targets.push({ label: t.url.replace(/^https?:\/\//, '').slice(0, 34), ws: t.webSocketDebuggerUrl }));
    } catch (e) { /* the top frame alone, then */ }

    const byFrame = [];
    for (const t of targets) {
      let cc;
      try { cc = t.ws === page.webSocketDebuggerUrl ? c : await connect(t.ws); } catch (e) { continue; }
      const expr = label.indexOf('type:') === 0 ? TYPE(label) : CLICK(label);
      const r = await cc.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (cc !== c) cc.close();
      const v = r.result && r.result.result && r.result.result.value;
      if (v && v.ok) return { ok: true, clicked: v.clicked, frame: t.label };
      byFrame.push({ frame: t.label, saw: (v && v.saw) || [] });
    }
    return { ok: false, byFrame };
  }

  for (const label of clicks) {
    const before = await settle(30000);
    const v = await clickAnywhere(label);
    if (!v.ok) {
      console.log(`  MISS  "${label}" — not on screen in any frame.`);
      (v.byFrame || []).forEach((f) => console.log(`          ${f.frame}: ${f.saw.slice(0, 6).join(' | ') || '(nothing)'}`));
      continue;
    }
    const after = await settle(40000);
    console.log(`  click "${v.clicked}" [${v.frame}]  ->  ${after === before ? 'place UNCHANGED' : (after || '').split('|').filter(Boolean).slice(0, 2).join(' > ')}`);
  }

  await wait(3000);
  const done = await inIso(c, `(() => {
    const R = window.LabPilotRecorder;
    if (!R) return { here: false };
    R.stop();
    return { here: true, status: R.status(), json: R.dump() };
  })()`);
  c.close();
  if (!done || !done.json) { console.error('the recorder returned nothing'); process.exit(2); }

  console.log(`\n  ${JSON.stringify(done.status)}\n`);
  const file = out || `test/traces/${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.trace.json`;
  fs.writeFileSync(file, done.json);
  console.log(`  wrote ${file}`);
})().catch((e) => console.log('ERR ' + e.message));
