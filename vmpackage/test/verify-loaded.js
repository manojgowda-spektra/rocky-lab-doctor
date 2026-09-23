/*
 * verify-loaded.js — does Rocky ACTUALLY load and run in a real browser?
 *
 * Every other test checks a file or a function. This one launches Edge the way the VM
 * shortcut does — same --user-data-dir, same --load-extension, same install root — opens a
 * page, and asks the page itself what is there: did the content scripts run, did the
 * engine attach, did Rocky render, and does the overlay behave.
 *
 * This is the check that would have caught "the extension silently did not load", which is
 * the single most likely failure on a fresh VM.
 *
 *   node test/verify-loaded.js                         # install root C:\ProgramData\Rocky
 *   node test/verify-loaded.js --ext <path to webext>   # test a working copy instead
 *   node test/verify-loaded.js --url https://ai.azure.com --visible   # against the portal
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { killEdgeTree, rmQuiet, sweepStaleProfiles } = require('./edge-util');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);

const EXT_SRC = argOf('--ext', path.join(process.env.ProgramData || 'C:\\ProgramData', 'Rocky', 'webext'));

/*
 * Load from a STAGED COPY, never from the source tree directly.
 *
 * Measured, repeatedly: byte-identical extension directories load fine from a temp directory
 * and fail to inject when loaded from inside the working repo — 10/10 vs 6/10, every time.
 * The cause is environmental (a watcher or scanner holding files in the working tree), not the
 * extension, and it produced a failure that looked exactly like a code regression.
 *
 * Staging also matches reality: a learner's Edge loads the extension from ProgramData after
 * the installer has copied it there, not from a git checkout. Testing the copy is testing what
 * actually ships.
 */
function stageExtension(src) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'rocky-ext-'));
  const copy = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const f = path.join(from, e.name), t = path.join(to, e.name);
      if (e.isDirectory()) copy(f, t); else fs.copyFileSync(f, t);
    }
  };
  copy(src, dest);
  return dest;
}

const EXT = fs.existsSync(EXT_SRC) ? stageExtension(EXT_SRC) : EXT_SRC;

// The manifest injects only on the https lab hosts, so a file:/// page is — correctly —
// never touched by the content scripts. To exercise the REAL injection path we serve the
// mock page over https from a throwaway self-signed cert and point ai.azure.com at it with
// --host-resolver-rules. The extension is not modified in any way: Edge matches the same
// origin it would match inside the lab.
const SERVE_HOST = argOf('--host', 'ai.azure.com');
const URL_OVERRIDE = argOf('--url', null);
let mock = null;      // https mock server, when we stand one up
let target = null;    // the page we actually opened

// --- minimal CDP (same as live-resolve.js) ------------------------------------------------
function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      if (!/101/.test(buf.slice(0, i).toString())) { reject(new Error('ws upgrade failed')); return; }
      sock.removeListener('data', onData);
      resolve(makeClient(sock, buf.slice(i + 4)));
    };
    sock.on('data', onData); sock.on('error', reject);
  });
}
function makeClient(sock, rest) {
  const pending = new Map(); let id = 0; let buf = rest;
  const frame = (payload) => {
    const data = Buffer.from(payload); const mask = crypto.randomBytes(4); const len = data.length;
    let head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(len), 2); }
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
    return Buffer.concat([head, mask, masked]);
  };
  const read = () => {
    while (buf.length >= 2) {
      const l0 = buf[1] & 0x7f; let off = 2; let len = l0;
      if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
      try {
        const msg = JSON.parse(payload);
        if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
      } catch (e) {}
    }
  };
  sock.on('data', (d) => { buf = Buffer.concat([buf, d]); read(); });
  return {
    send(method, params) {
      const mid = ++id;
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        sock.write(frame(JSON.stringify({ id: mid, method, params: params || {} })));
        setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error(`${method} timed out`)); } }, 30000);
      });
    },
    close() { try { sock.destroy(); } catch (e) {} },
  };
}
const getJson = (port, p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => { let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } }); }).on('error', reject);
});

// A throwaway self-signed certificate, generated in memory for this run only. Edge is told
// to ignore certificate errors for this one host, so nothing is installed into any trust
// store and nothing outlives the process.
function selfSignedCert(host) {
  const { execFileSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rocky-cert-'));
  const key = path.join(dir, 'k.pem');
  const crt = path.join(dir, 'c.pem');
  const openssl = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe']
    .find((c) => { try { execFileSync(c, ['version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } });
  if (!openssl) return null;
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
    '-keyout', key, '-out', crt, '-subj', `/CN=${host}`,
    '-addext', `subjectAltName=DNS:${host}`], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt), dir };
}

function serveMock(host) {
  const https = require('https');
  const tls = selfSignedCert(host);
  if (!tls) return null;
  const html = fs.readFileSync(path.join(__dirname, 'mock-foundry.html'));
  const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    // Serve the mock for every path so any urlPattern in a bundle still lands somewhere.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, dir: tls.dir }));
  });
}



async function main() {
  if (!fs.existsSync(path.join(EXT, 'manifest.json'))) {
    console.log(`[FAIL] no extension at ${EXT} — install it first (test/install-local.ps1 -KeepInstalled)`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const edge = [`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
                `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`].find((p) => p && fs.existsSync(p));
  if (!edge) { console.log('[FAIL] Edge not found'); process.exit(1); }

  // Stand up the mock on a real https origin the manifest matches, unless a URL was given.
  target = URL_OVERRIDE;
  if (!target) {
    mock = await serveMock(SERVE_HOST);
    if (!mock) { console.log('[FAIL] openssl not found — cannot serve an https mock. Pass --url to test a real page.'); process.exit(1); }
    target = `https://${SERVE_HOST}/build/deployments`;
  }

  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = path.join(os.tmpdir(), `rocky-verify-${Date.now()}`);
  const edgeArgs = [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--load-extension=${EXT}`,
    '--no-first-run', '--no-default-browser-check',
    // Edge otherwise opens a sync-confirmation dialog as its own page target, which is what
    // a naive "first page target" pick attaches to. Suppress the whole first-run funnel.
    '--disable-sync', '--no-service-autorun', '--disable-background-networking',
    '--disable-features=DisableLoadExtensionCommandLineSwitch,EdgeSyncPromo,msEdgeWelcomePage,msIdentityFre,ImplicitSignin',
    // A lab VM is 1280+ wide. At the default headless 800x600 the menu panel hits the
    // viewport clamp, so geometry measured here would not be the geometry a learner sees.
    '--window-size=1280,860',
    '--edge-skip-compat-layer-relaunch', '--force-first-run-ui=0',
    ...(mock ? [
      `--host-resolver-rules=MAP ${SERVE_HOST}:443 127.0.0.1:${mock.port}`,
      '--ignore-certificate-errors',
    ] : []),
    ...(has('--visible') ? [] : ['--headless=new', '--disable-gpu']),
    target,
  ];
  const proc = spawn(edge, edgeArgs, { stdio: 'ignore' });

  const fails = []; const oks = []; const infos = [];
  let client;
  try {
    const until = Date.now() + 25000;
    let ver = null;
    while (Date.now() < until && !ver) { try { ver = await getJson(port, '/json/version'); } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
    if (!ver) throw new Error('Edge never opened its debug port');
    oks.push(`Edge started (${ver.Browser})`);

    // Do not guess how long Edge needs. Poll for the content scripts' own evidence.
    await new Promise((r) => setTimeout(r, 1200));

    const targets = await getJson(port, '/json/list');
    // An MV3 service worker target proves the extension was actually installed by Edge.
    const sw = targets.find((t) => t.type === 'service_worker' && /chrome-extension:\/\//.test(t.url || ''));
    if (sw) oks.push(`extension installed — background service worker is live`);
    else infos.push('no service-worker target listed (Edge may not expose it; page checks below are decisive)');

    // Attach to the page we actually asked for. Picking "the first page target" is what
    // attached to Edge's sync dialog and produced a confusing false failure.
    let page = null;
    const wantHost = (() => { try { return new URL(target).host; } catch (e) { return null; } })();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !page) {
      const list = await getJson(port, '/json/list');
      page = list.find((t) => t.type === 'page' && wantHost && (t.url || '').includes(wantHost));
      if (!page) await new Promise((r) => setTimeout(r, 400));
    }
    if (!page) {
      const list = await getJson(port, '/json/list');
      const seen = list.filter((t) => t.type === 'page').map((t) => t.url).join(', ');
      throw new Error(`no page target for ${target}. Pages open: ${seen || 'none'}`);
    }
    client = await wsConnect(page.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    // Measure at lab-VM size. At the headless default the menu panel hits the viewport
    // clamp, so the geometry would not be what a learner sees.
    try {
      await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    } catch (e) {}

    const ask = async (expr) => {
      const r = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r.result.value;
    };

    // 0. did we actually land on the mock, or did the host mapping fail?
    const landed = await ask(`JSON.stringify({ href: location.href, title: document.title, hasMock: !!document.querySelector('[data-testid=\\"model-row-gpt5\\"]'), bodyLen: document.body ? document.body.innerHTML.length : 0 })`);
    const ld = JSON.parse(landed);
    if (ld.hasMock) oks.push(`page loaded from the matched origin: ${ld.href}`);
    else fails.push(`the mock page did not load — href=${ld.href} title="${ld.title}" bodyLen=${ld.bodyLen}`);

    // 1. did the content scripts actually run?
    // Content scripts execute in an ISOLATED world, so their window.LabPilot* globals are
    // deliberately invisible from the page's main world. Probing the main world would only
    // ever prove that isolation works. Ask the extension's own world instead.
    const frameTree = await client.send('Page.getFrameTree');
    const frameId = frameTree.frameTree.frame.id;
    const world = await client.send('Page.createIsolatedWorld', { frameId, worldName: 'rocky-probe', grantUniveralAccess: false });
    void world; // a fresh world is still a DIFFERENT world; see below for the real probe.

    // The dependable, learner-visible evidence is what the scripts PUT IN THE DOM, plus the
    // extension's own world reporting itself. We read the DOM (shared between worlds) and
    // the stylesheet the content scripts inject.
    // Wait (up to 20s) for the content scripts to actually produce their DOM. On a busy
    // machine Edge can take several seconds to install an unpacked extension and reach
    // document_idle; a fixed sleep produced a false failure during a full build.
    const readyBy = Date.now() + 20000;
    let injected = false;
    while (Date.now() < readyBy && !injected) {
      injected = await ask(`!!document.querySelector('[data-labpilot="1"]')`);
      if (!injected) await new Promise((r) => setTimeout(r, 500));
    }

    const domEvidence = await ask(`(function(){
      var tagged = document.querySelectorAll('[data-labpilot="1"]');
      var root = document.getElementById('labpilot-overlay-root');
      var sheets = 0, lpRules = 0;
      for (var i = 0; i < document.styleSheets.length; i++) {
        try {
          var rules = document.styleSheets[i].cssRules || [];
          for (var j = 0; j < rules.length; j++) {
            if (rules[j].selectorText && rules[j].selectorText.indexOf('lp-') >= 0) lpRules++;
          }
          sheets++;
        } catch (e) { sheets++; }
      }
      var classes = [];
      tagged.forEach(function (el) { if (el.className && classes.indexOf(el.className) < 0) classes.push(String(el.className)); });
      return JSON.stringify({ tagged: tagged.length, overlayRoot: !!root, lpRules: lpRules, classes: classes.slice(0, 8) });
    })()`);
    const dom = JSON.parse(domEvidence);
    if (dom.tagged > 0) oks.push(`content scripts ran: ${dom.tagged} Rocky element(s) in the DOM [${dom.classes.join(', ')}]`);
    else fails.push('content scripts produced no DOM — the extension did not inject');
    if (dom.overlayRoot) oks.push('overlay root mounted (#labpilot-overlay-root)');
    else fails.push('overlay root missing');
    if (dom.lpRules > 0) oks.push(`overlay stylesheet injected (${dom.lpRules} lp- rules)`);
    else infos.push('no lp- CSS rules readable (cross-origin stylesheet is normal)');

    // 2. the accuracy contract, checked in the file the browser actually loaded
    const engineSrc = fs.readFileSync(path.join(EXT, 'content', 'anchor-engine.js'), 'utf8');
    const mMin = /MIN_SCORE\s*=\s*([\d.]+)/.exec(engineSrc);
    const mMar = /MARGIN\s*=\s*([\d.]+)/.exec(engineSrc);
    if (mMin && mMar) {
      if (Number(mMin[1]) === 0.7 && Number(mMar[1]) === 0.2) oks.push(`accuracy contract in the loaded extension: MIN_SCORE ${mMin[1]}, MARGIN ${mMar[1]}`);
      else fails.push(`contract changed in the shipped extension: MIN_SCORE ${mMin[1]}, MARGIN ${mMar[1]}`);
    } else infos.push('could not read the contract constants from the engine source');

    // 3. Rocky must actually be on the page — the learner has to SEE him
    const ui = await ask(`(function(){
      var root = document.getElementById('labpilot-overlay-root');
      var hosts = document.querySelectorAll('[data-labpilot="1"]');
      var canvas = document.querySelector('canvas[data-labpilot], #labpilot-rocky, .lp-rocky');
      return JSON.stringify({ overlayRoot: !!root, tagged: hosts.length, rockyEl: !!canvas });
    })()`);
    const u = JSON.parse(ui);
    if (u.overlayRoot || u.tagged > 0) oks.push(`Rocky's UI is in the page (${u.tagged} tagged element(s))`);
    else fails.push('no Rocky UI in the page — the overlay never mounted');

    // 4. is Rocky actually GUIDING — i.e. did the resolver find step 1 and glow it?
    // This is the learner-visible outcome, readable from the DOM regardless of world.
    await new Promise((r) => setTimeout(r, 1500));
    const guiding = await ask(`(function(){
      var glow = document.querySelector('.lp-glow');
      var vis = glow && getComputedStyle(glow).display !== 'none';
      var rect = vis ? glow.getBoundingClientRect() : null;
      var bubble = document.querySelector('.lp-card, .lp-pill, [class*="rocky"]');
      var said = bubble ? (bubble.innerText || '').trim().slice(0, 120) : null;
      return JSON.stringify({
        glowPresent: !!glow,
        glowVisible: !!vis,
        glowRect: rect ? { w: Math.round(rect.width), h: Math.round(rect.height), x: Math.round(rect.left), y: Math.round(rect.top) } : null,
        said: said
      });
    })()`);
    const gd = JSON.parse(guiding);
    if (gd.glowVisible && gd.glowRect && gd.glowRect.w > 0) {
      oks.push(`Rocky is GLOWING a control: ${gd.glowRect.w}x${gd.glowRect.h}px at (${gd.glowRect.x},${gd.glowRect.y})`);
    } else if (gd.glowPresent) {
      infos.push('glow element exists but is not shown — expected when step 1 is not on this page');
    } else {
      infos.push('no glow yet (the mock is not the real portal, so step 1 may be absent)');
    }
    if (gd.said) oks.push(`Rocky is speaking: "${gd.said.replace(/\s+/g, ' ')}"`);

    // 5. the safety contract, exercised against this very page by the shipped engine.
    // Runs in the MAIN world with a fresh copy of the engine file: same code, same DOM,
    // so an ambiguous control here is ambiguous for the extension too.
    const engineJs = fs.readFileSync(path.join(EXT, 'content', 'anchor-engine.js'), 'utf8');
    const safety = await ask(engineJs + `;(function(){
      var A = window.LabPilotAnchor;
      var amb = A.resolve({ text: 'Deploy', role: 'button' });
      var uniq = A.resolve({ text: 'Deploy model', role: 'button' });
      return JSON.stringify({ ambiguous: amb.status, unique: uniq.status,
        uniqueText: uniq.element ? (uniq.element.innerText||'').trim() : null });
    })()`);
    const sf = JSON.parse(safety);
    if (sf.ambiguous === 'resolved') fails.push('the shipped engine GLOWED an ambiguous "Deploy" on this page — safety contract broken');
    else oks.push(`safety contract holds on this page: ambiguous "Deploy" -> ${sf.ambiguous}`);
    if (sf.unique === 'resolved') oks.push(`and the unambiguous control resolves: "${sf.uniqueText}"`);
    else fails.push(`a control that should resolve did not: ${sf.unique}`);

    // 6. uncaught errors from our own files — DELIBERATELY NOT CHECKED HERE.
    //
    // This used to read `window.__lpErrors` through ask(), and it was the only check in the
    // whole suite that claimed to catch a runtime exception from a content script. It could
    // never fail, for two independent reasons: nothing in the extension ever wrote that array
    // (a repo-wide grep found one hit — the read itself), and ask() evaluates in the PAGE
    // world, where a content script's globals are invisible however Rocky is behaving.
    //
    // The producer now exists (content/error-collector.js) and the check now lives in
    // test/interaction-live.js, which enumerates Runtime.executionContextCreated to reach the
    // extension's own isolated world and asserts on __lpErrors AFTER exercising Rocky.
    //
    // It is not reinstated here, because this file only has the page world. A check that
    // cannot fail is worse than an absent one: it reads as coverage.

    // Open Rocky's menu so the screenshot shows it. The panel replaced a radial ring that
    // sprayed buttons across the page; only a picture confirms the new one sits beside him.
    if (has('--menu')) {
      await ask(`(function(){ document.dispatchEvent(new CustomEvent('labpilot-rocky-click')); return true; })()`);   // lp-menu-shot
      await new Promise((r) => setTimeout(r, 900));
      const geo = await ask(`(function(){
        var m=document.getElementById('labpilot-rocky-menu');
        var p=m&&m.firstChild; var rk=document.getElementById('labpilot-rocky');
        if(!p||!rk) return JSON.stringify({open:false});
        var a=p.getBoundingClientRect(), b=rk.getBoundingClientRect();
        return JSON.stringify({open:true,panel:{w:Math.round(a.width),h:Math.round(a.height),x:Math.round(a.left),y:Math.round(a.top)},
          rocky:{x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width)},
          gap:Math.round(b.left-(a.left+a.width)), buttons:p.querySelectorAll('button').length});
      })()`);
      console.log('   [menu] ' + geo);
    }

    // Click the AI SETTINGS button and report what the bubble actually contains. "Nothing
    // opens" needs reproducing, not guessing at.
    if (has('--askthensettings')) {
      await ask(`(function(){ document.dispatchEvent(new CustomEvent('labpilot-rocky-click')); return 1; })()`);
      await new Promise((r) => setTimeout(r, 600));
      await ask(`(function(){ var b=document.querySelectorAll('#labpilot-rocky-menu button');
        for(var i=0;i<b.length;i++) if(/Ask/i.test(b[i].innerText||'')) { b[i].click(); return 1; } return 0; })()`);
      await new Promise((r) => setTimeout(r, 900));
      const askOpen = await ask(`document.querySelectorAll('[data-labpilot="1"] input').length`);
      await ask(`(function(){ document.dispatchEvent(new CustomEvent('labpilot-rocky-click')); return 1; })()`);
      await new Promise((r) => setTimeout(r, 600));
      await ask(`(function(){ var b=document.querySelectorAll('#labpilot-rocky-menu button');
        for(var i=0;i<b.length;i++) if(/AI (on|off)/i.test(b[i].innerText||'')) { b[i].click(); return 1; } return 0; })()`);
      await new Promise((r) => setTimeout(r, 1000));
      const after = await ask(`(function(){
        var ins=document.querySelectorAll('[data-labpilot="1"] input');
        var txt=''; var n=document.querySelectorAll('[data-labpilot="1"]');
        for(var i=0;i<n.length;i++){var t=(n[i].innerText||'').trim(); if(t&&t.length>txt.length) txt=t;}
        return JSON.stringify({inputs:ins.length, showsSettings:/AI SETTINGS/i.test(txt)});
      })()`);
      console.log('   [ask->gear] ask box inputs: ' + askOpen + '  then gear -> ' + after);
      const r = JSON.parse(after);
      if (!r.showsSettings) fails.push('BUG REPRODUCED: gear does nothing when the Ask box is already open');
      else oks.push('gear opens settings even with the Ask box open');
    }

    if (has('--settings')) {
      const clicked = await ask(`(function(){          // lp-settings-probe
        document.dispatchEvent(new CustomEvent('labpilot-rocky-click'));
        return 'menu opened';
      })()`);
      await new Promise((r) => setTimeout(r, 700));
      const found = await ask(`(function(){
        var btns = document.querySelectorAll('#labpilot-rocky-menu button');
        for (var i=0;i<btns.length;i++){
          if (/AI (on|off)/i.test(btns[i].innerText||'')) { btns[i].click(); return 'clicked: '+(btns[i].innerText||'').replace(/\s+/g,' '); }
        }
        return 'NO AI BUTTON among ' + btns.length + ' buttons: ' +
          Array.prototype.map.call(btns, function(b){return (b.innerText||'').replace(/\s+/g,' ');}).join(' | ');
      })()`);
      console.log('   [settings] ' + clicked + ' -> ' + found);
      await new Promise((r) => setTimeout(r, 900));
      const bubble = await ask(`(function(){
        var n = document.querySelectorAll('[data-labpilot="1"]');
        var texts = [];
        for (var i=0;i<n.length;i++){ var t=(n[i].innerText||'').trim(); if(t) texts.push(t.replace(/\s+/g,' ').slice(0,120)); }
        return JSON.stringify({ inputs: document.querySelectorAll('[data-labpilot="1"] input').length, texts: texts.slice(0,4) });
      })()`);
      console.log('   [settings] after click: ' + bubble);
    }

    // A screenshot is the one artefact a human can check without trusting this script.
    if (has('--shot') || has('--visible')) {
      try {
        const shot = await client.send('Page.captureScreenshot', { format: 'png' });
        const out = argOf('--shot-out', path.join(__dirname, 'rocky-proof.png'));
        fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
        oks.push(`screenshot written: ${out}`);
      } catch (e) { infos.push(`screenshot failed: ${e.message}`); }
    }
    if (has('--visible')) { console.log('\n--visible: leaving the browser open for 30s so you can look at Rocky.'); await new Promise((r) => setTimeout(r, 30000)); }
  } catch (e) {
    fails.push(`harness: ${e.message}`);
  } finally {
    if (client) client.close();
    try { proc.kill(); } catch (e) {}
    killEdgeTree(profile);   // the launcher exits; the browser tree does not
    if (mock) { try { mock.server.close(); } catch (e) {} setTimeout(() => { try { fs.rmSync(mock.dir, { recursive: true, force: true }); } catch (e) {} }, 500); }
    rmQuiet(profile);
    if (EXT !== EXT_SRC) rmQuiet(EXT);   // the staged copy, not the source tree
  }

  console.log(`\n=== ROCKY LOADS AND RUNS IN A REAL BROWSER ===`);
  console.log(`extension: ${manifest.name} ${manifest.version}`);
  console.log(`from:      ${EXT}`);
  console.log(`page:      ${target}${mock ? '   (mock served over https on the origin the manifest matches)' : ''}\n`);
  oks.forEach((m) => console.log(`  [ok]   ${m}`));
  infos.forEach((m) => console.log(`  [info] ${m}`));
  fails.forEach((m) => console.log(`  [FAIL] ${m}`));
  console.log(`\n${oks.length} ok, ${infos.length} info, ${fails.length} failure(s)\n`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('verify-loaded failed:', e.message); process.exit(2); });
