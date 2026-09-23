/*
 * live-session.js — a browser I can watch while you drive it.
 *
 * WHY THIS EXISTS. Seven releases in two days, every one fixing something that only failed
 * in front of a real learner, because I have been debugging through descriptions of what
 * someone else could see. That is the slowest possible loop and it has cost a day.
 *
 * This opens a NORMAL, VISIBLE Edge window with Rocky loaded and remote debugging on. The
 * person drives: signs in, opens the lab, clicks things. I attach over CDP and watch what
 * actually happens — console errors, uncaught exceptions, Rocky's real internal state — and
 * can patch, reload and retest without asking anyone to paste anything.
 *
 * It is NOT headless and NOT a test. It is an observation post.
 *
 *   node test/live-session.js                    open the browser and stream everything
 *   node test/live-session.js --state            print Rocky's current state and exit
 *   node test/live-session.js --port 9333        attach to a session already running
 *
 * PRIVACY. It reads the console, uncaught errors and Rocky's own state. It does not capture
 * keystrokes and does not read page content beyond what Rocky already sees. Everything is
 * printed here, nothing is sent anywhere, and closing the window ends it.
 */
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);
const PORT = Number(argOf('--port', 9333));

// ---------- CDP ---------------------------------------------------------------------------
function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n'); if (i < 0) return;
      if (!/101/.test(buf.slice(0, i).toString())) { reject(new Error('upgrade failed')); return; }
      sock.removeListener('data', onData); resolve(makeClient(sock, buf.slice(i + 4)));
    };
    sock.on('data', onData); sock.on('error', reject);
  });
}
function makeClient(sock, rest) {
  const pending = new Map(); const handlers = []; let id = 0; let buf = rest;
  function frame(p) {
    const d = Buffer.from(p); const mk = crypto.randomBytes(4); const len = d.length; let head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(len), 2); }
    const m = Buffer.alloc(len); for (let i = 0; i < len; i++) m[i] = d[i] ^ mk[i % 4];
    return Buffer.concat([head, mk, m]);
  }
  function read() {
    while (buf.length >= 2) {
      const l0 = buf[1] & 0x7f; let off = 2; let len = l0;
      if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const pl = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
      let m; try { m = JSON.parse(pl); } catch (e) { continue; }
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      } else if (m.method) {
        handlers.forEach((h) => { try { h(m.method, m.params); } catch (e) {} });
      }
    }
  }
  sock.on('data', (d) => { buf = Buffer.concat([buf, d]); read(); });
  return {
    send(method, params) {
      return new Promise((resolve, reject) => {
        const mid = ++id; pending.set(mid, { resolve, reject });
        sock.write(frame(JSON.stringify({ id: mid, method, params: params || {} })));
        setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error(method + ' timeout')); } }, 30000);
      });
    },
    on(fn) { handlers.push(fn); },
    close() { try { sock.destroy(); } catch (e) {} },
  };
}
const getJSON = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ts = () => new Date().toTimeString().slice(0, 8);

/*
 * THE CRUX: content scripts run in an ISOLATED WORLD. Runtime.evaluate in the page world
 * cannot see window.LabPilotRocky — it returns undefined no matter what Rocky is doing, which
 * is why every probe written against the page world has been structurally useless. We listen
 * for executionContextCreated and keep the ids of the extension's own worlds.
 */
function trackContexts(client) {
  const worlds = new Map();          // contextId -> name
  client.on((method, p) => {
    if (method === 'Runtime.executionContextCreated') {
      const c = p.context;
      const isolated = c.auxData && c.auxData.type === 'isolatedWorld';
      if (isolated || /extension/i.test(c.name || '')) worlds.set(c.id, c.name || 'isolated');
    }
    if (method === 'Runtime.executionContextDestroyed') worlds.delete(p.executionContextId);
    if (method === 'Runtime.executionContextsCleared') worlds.clear();
  });
  return worlds;
}

async function inRocky(client, worlds, expr, quiet) {
  // Try every isolated world until one can see Rocky. Report the failure rather than
  // returning undefined silently - a tool built to end silent failures must not have one.
  const tried = [];
  for (const id of worlds.keys()) {
    try {
      const r = await client.send('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true, contextId: id });
      if (!r.exceptionDetails) return r.result.value;
      tried.push(id + ':' + String((r.exceptionDetails.exception || {}).description || 'threw').slice(0, 60));
    } catch (e) { tried.push(id + ':' + e.message.slice(0, 40)); }
  }
  // Last resort: the PAGE world. Rocky is not there, but the DOM is, and the count of his
  // own elements tells us whether he is on the page at all.
  try {
    const r = await client.send('Runtime.evaluate', {
      expression: "({host:location.host, ui:document.querySelectorAll('[data-labpilot]').length, isolatedWorlds:" + worlds.size + "})",
      returnByValue: true });
    const v = r.result.value;
    if (v) { v._note = worlds.size ? 'could not reach Rocky in ' + worlds.size + ' isolated world(s)' : 'no isolated world seen yet'; return v; }
  } catch (e) {}
  if (!quiet && tried.length) console.log('  (worlds tried: ' + tried.join(' | ') + ')');
  return undefined;
}

const STATE_EXPR = `(function(){
  var out = { host: location.host, path: location.pathname.slice(0,60) };
  try { out.rocky = !!window.LabPilotRocky; } catch(e){}
  try { out.exploreLoaded = !!window.__lpExplore; } catch(e){}
  try { var p = window.LabPilotPilot && window.LabPilotPilot.status();
        if (p) { out.pilotOn = p.on; out.mode = p.mode; out.said = p.said;
                 out.glowing = p.glowing; out.decision = p.lastDecision && p.lastDecision.act;
                 out.why = p.lastDecision && p.lastDecision.why;
                 out.progress = p.progress;
                 out.step = p.world && p.world.step && String(p.world.step.text).slice(0,70);
                 out.confidence = p.world && p.world.confidence; } } catch(e){ out.pilotErr = String(e); }
  try { var g = window.LabPilotGuide && window.LabPilotGuide.steps();
        if (g) { out.guideFound = g.found; out.guideSteps = g.steps && g.steps.length; out.guidePage = g.page; } } catch(e){ out.guideErr = String(e); }
  try { out.ui = document.querySelectorAll('[data-labpilot]').length; } catch(e){}
  try { out.ai = !!(window.__lpExplore && window.__lpExplore.state && window.__lpExplore.state().ai); } catch(e){}
  return out;
})()`;

(async () => {
  let client, worlds, child = null;

  if (!has('--port')) {
    // Chrome or Edge — --chrome prefers Chrome. Either way a CLEAN, dedicated profile: this
    // never touches the person's own browser, their cookies, or any signed-in session.
    const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
    const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
    const edge = (has('--chrome') ? CHROME.concat(EDGE) : EDGE.concat(CHROME))
      .find((p) => fs.existsSync(p));
    if (!edge) { console.error('Edge not found'); process.exit(1); }

    // A DEDICATED profile: never touches the person's own Edge, their cookies or their
    // sessions. Signing in here signs in only here, and deleting this folder removes it.
    const profile = path.join(os.tmpdir(), 'rocky-live-session');
    fs.mkdirSync(profile, { recursive: true });
    const EXT = path.join(ROOT, 'webext');

    console.log('');
    console.log('  opening Edge with Rocky loaded...');
    console.log('  profile:   ' + profile + '   (separate from your own Edge)');
    console.log('  extension: ' + EXT);
    console.log('');

    child = spawn(edge, [
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
      `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
      '--no-first-run', '--no-default-browser-check',
      '--disable-features=DisableLoadExtensionCommandLineSwitch,EdgeSyncPromo,msEdgeWelcomePage,msIdentityFre,ImplicitSignin',
      '--window-size=1500,950',
      'https://purview.microsoft.com/',
    ], { detached: true, stdio: 'ignore' });
    child.unref();
  }

  // attach to whichever tab is in front, and re-attach when it changes
  let attached = null;
  async function attach() {
    let list = [];
    try { list = await getJSON(`http://127.0.0.1:${PORT}/json/list`); } catch (e) { return false; }
    const page = list.find((t) => t.type === 'page' && /^https?:/.test(t.url || ''));
    if (!page || page.id === attached) return !!attached;
    if (client) client.close();
    client = await wsConnect(page.webSocketDebuggerUrl);
    worlds = trackContexts(client);
    attached = page.id;

    client.on((method, p) => {
      if (method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) {
        const txt = (p.args || []).map((a) => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
        if (/labpilot|rocky/i.test(txt)) console.log(`  ${ts()} CONSOLE ${p.type.toUpperCase()}: ${txt.slice(0, 220)}`);
      }
      if (method === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails || {};
        const where = (d.url || '').split('/').pop();
        const msg = (d.exception && d.exception.description) || d.text || '';
        console.log(`  ${ts()} UNCAUGHT in ${where}: ${String(msg).split('\n')[0].slice(0, 200)}`);
      }
    });

    // Runtime.enable replays executionContextCreated for contexts that ALREADY exist, but
    // only to listeners attached first - so the handler above must be registered before this
    // line, and it is. Without that ordering the extension's isolated world, created at page
    // load, is never announced and Rocky is invisible to this tool.
    await client.send('Page.enable', {});
    await client.send('Runtime.enable', {});
    await sleep(400);                         // let the replayed context events arrive
    await client.send('Log.enable', {}).catch(() => {});
    console.log(`  ${ts()} attached: ${(page.url || '').slice(0, 90)}`);
    return true;
  }

  for (let i = 0; i < 80 && !attached; i++) { if (await attach()) break; await sleep(500); }
  if (!attached) { console.error('could not attach — is the browser open?'); process.exit(1); }

  if (has('--state')) {
    await sleep(1500);
    const s = await inRocky(client, worlds, STATE_EXPR);
    console.log('\n' + JSON.stringify(s, null, 2) + '\n');
    client.close(); process.exit(0);
  }

  console.log('');
  console.log('  WATCHING. Drive the lab in that window — sign in, open the guide, click Rocky.');
  console.log('  I report Rocky errors, uncaught exceptions, and his state as it changes.');
  console.log('  Ctrl+C here to stop watching (the browser stays open).');
  console.log('');

  let last = '';
  for (;;) {
    await sleep(2500);
    await attach();                                   // follow tab changes
    const s = await inRocky(client, worlds, STATE_EXPR);
    if (!s) continue;
    const key = JSON.stringify(s);
    if (key === last) continue;
    last = key;
    const bits = [
      s.host,
      'ui:' + (s.ui || 0),
      s.rocky ? 'rocky:yes' : 'rocky:NO',
      s.guideFound ? `guide:${s.guideSteps}` : 'guide:none',
      s.pilotOn ? `pilot:on ${s.decision || '-'}${s.why ? '(' + s.why + ')' : ''}` : 'pilot:off',
      s.glowing ? `GLOW "${s.glowing}"` : '',
      s.progress ? `step ${s.progress.n}/${s.progress.total}` : '',
      s.ai ? 'ai:set' : 'ai:none',
    ].filter(Boolean);
    console.log(`  ${ts()} ${bits.join('  ')}`);
    if (s.step) console.log(`           step: ${s.step}`);
    if (s.pilotErr) console.log(`           pilot error: ${s.pilotErr}`);
  }
})().catch((e) => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
