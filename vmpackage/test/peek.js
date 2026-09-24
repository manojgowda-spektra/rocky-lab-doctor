/*
 * peek.js — read Rocky's REAL belief out of a live browser, from the isolated world.
 *
 * WHY THIS IS NOT A ONE-LINER. Content scripts run in an ISOLATED WORLD. window.LabPilotWorld
 * does not exist in the page's own JavaScript context, so every console snippet that reaches
 * for it comes back undefined — which reads as "Rocky is not loaded" when he is running
 * perfectly well two feet away. That mistake cost four bugs' worth of misdiagnosis on this
 * project. The isolated context is found here by asking CDP for the execution contexts and
 * picking the one whose auxData.type is 'isolated' (NOT 'isolatedWorld' — one wrong string
 * blocked the harness for an afternoon) and in which LabPilotWorld actually answers.
 *
 *   node test/peek.js [port]      default 9600
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

// What we want to know, evaluated INSIDE the content script's world.
const EXPR = `(() => {
  const W = window.LabPilotWorld, P = window.LabPilotPilot, C = window.LabPilotCoach;
  if (!W) return { here: false };
  const c = W.current();
  const glow = document.querySelector('.lp-glow, [data-lp-glow]');
  return {
    here: true,
    url: location.href.slice(0, 120),
    lab: c.lab,
    believedIndex: c.index,
    believedStep: c.step ? String(c.step.text || '').slice(0, 120) : null,
    believedTargets: c.step ? (c.step.targets || []).map(t => t.label) : [],
    hop: c.hop,
    total: c.total,
    confidence: c.confidence,
    done: c.done,
    doneIds: Object.keys(c.doneMap || {}),
    stuck: c.stuck,
    resolution: c.resolution,
    route: c.route,
    beliefs: W._beliefs ? W._beliefs().map(n => Math.round(n * 100) / 100) : null,
    steps: (c.steps || []).map((s, i) => i + ': ' + (s.targets || []).map(t => t.label).join(' > ')),
    learner: c.learner ? { attempts: c.learner.attempts, misclicks: c.learner.misclicks,
      routeChanges: c.learner.routeChanges, dwellMs: Date.now() - c.learner.enteredStep } : null,
    pilot: P ? { on: P.status().on, lastDecision: P.status().lastDecision,
      progress: P.status().progress } : null,
    coachNow: (P && P.coach) ? P.coach() : null,
    glowing: glow ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      label: glow.getAttribute('data-lp-label') || '',
      over: (e => e ? ((e.getAttribute && e.getAttribute('aria-label')) || e.innerText || '').replace(/\s+/g,' ').trim().slice(0,60) : null)
            (document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)) }))(glow.getBoundingClientRect()) : null,
    // Is the control Rocky claims to have RESOLVED actually on this screen at all?
    policiesOnScreen: Array.from(document.querySelectorAll('*')).filter(e => {
      const t = ((e.getAttribute && e.getAttribute('aria-label')) || '').trim();
      return t === 'Policies';
    }).map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }),
    // The breadcrumb: the portal's own statement of where the learner is. Rocky reads none of it.
    breadcrumb: Array.from(document.querySelectorAll('[role="navigation"],nav')).map(n =>
      ({ label: (n.getAttribute('aria-label')||''), text: (n.innerText||'').replace(/\s+/g,' ').trim().slice(0,100) })).slice(0,6),
    heading: (document.querySelector('h1,h2,[role="heading"]') || {}).innerText || '',
    onScreenSample: Array.from(document.querySelectorAll('a[href],button,[role="button"],[role="tab"],[role="menuitem"],[role="radio"]'))
      .map(e => (e.getAttribute('aria-label') || e.innerText || '').replace(/\\s+/g,' ').trim())
      .filter(Boolean).slice(0, 40),
  };
})()`;

(async () => {
  const port = process.argv[2] || '9600';
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const pages = list.filter((t) => t.type === 'page' && /^https?:/.test(t.url || ''));
  if (!pages.length) { console.log('no pages'); return; }

  for (const t of pages) {
    const c = await connect(t.webSocketDebuggerUrl);
    await c.send('Runtime.enable');            // replays the contexts that already exist
    await wait(700);
    const contexts = c.events
      .filter((e) => e.method === 'Runtime.executionContextCreated')
      .map((e) => e.params.context);
    // 'isolated' — NOT 'isolatedWorld'. Extension content scripts live here.
    const isolated = contexts.filter((x) => x.auxData && x.auxData.type === 'isolated');

    console.log('\n' + '='.repeat(78));
    console.log(t.url.slice(0, 96));
    console.log(`contexts: ${contexts.length}, isolated: ${isolated.length}`);

    let got = null;
    for (const ctx of isolated) {
      const r = await c.send('Runtime.evaluate', { expression: EXPR, contextId: ctx.id, returnByValue: true });
      const v = r.result && r.result.result && r.result.result.value;
      if (v && v.here) { got = v; break; }
    }
    if (!got) { console.log('LabPilotWorld not answering in any isolated world here'); c.close(); continue; }
    console.log(JSON.stringify(got, null, 1));
    c.close();
  }
})().catch((e) => console.log('ERR ' + e.message));
