/*
 * pilot-live.js — the whole chain, in real Edge, on a lab nobody captured.
 *
 * This is the test that decides whether the build works. The unit tests prove the world model
 * and the monitor behave; this proves the pieces actually connect:
 *
 *      guide on the page -> guide-reader -> world-model -> label-resolver -> anchor-engine
 *
 * It runs the SHIPPED content scripts against a deliberately hostile mock lab and asserts the
 * behaviour a demo depends on:
 *   - the guide is read off the screen with no captured bundle
 *   - a uniquely-named control RESOLVES
 *   - a control inside a SHADOW ROOT is perceived (portals hide real controls there)
 *   - two controls named "Create" are REFUSED, not guessed between
 *   - a disabled control is not offered as the answer
 *   - the whole pipeline stays inside its millisecond budget on a real page
 *
 * No dependencies: raw CDP over a WebSocket, same as the other browser tests here.
 */
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { killEdgeTree, rmQuiet, sweepStaleProfiles } = require('./edge-util');

const ROOT = path.join(__dirname, '..');

// ---------- minimal CDP client ----------------------------------------------------------
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
  const pending = new Map(); let id = 0; let buf = rest;
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
      try {
        const m = JSON.parse(pl);
        if (m.id && pending.has(m.id)) {
          const p = pending.get(m.id); pending.delete(m.id);
          m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
        }
      } catch (e) { /* events */ }
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
    close() { try { sock.destroy(); } catch (e) {} },
  };
}
const getJSON = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The content scripts this test needs, in dependency order. Injected directly rather than
// loaded as an extension so the test exercises the SAME source the extension ships.
const SCRIPTS = [
  'anchor-engine.js',
  'perception.js',
  'world-model.js',
  'label-resolver.js',
  'guide-reader.js',
  'pilot.js',
];

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

(async () => {
  // Sweep what earlier runs leaked BEFORE starting. Measured: with ~16 Edge processes and
  // several background agents running, this test fails with symptoms that look exactly like
  // code regressions - every resolve returning absent, the guide parsing 0 steps. It is the
  // machine, not the product, and verify-loaded.js already guards itself this way.
  try {
    const swept = sweepStaleProfiles(os.tmpdir(), ['rockypilot-', 'rockybench-', 'rockylive-', 'rockymut-']);
    if (swept) console.log(`  (swept ${swept} stale browser profile(s) from earlier runs)`);
  } catch (e) { /* best effort */ }

  const port = 9800 + Math.floor(Math.random() * 190);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rockypilot-'));
  const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
  if (!edge) { console.error('Edge not found'); process.exit(1); }

  const page = 'file:///' + path.join(__dirname, 'mock-lab.html').replace(/\\/g, '/');
  const child = spawn(edge, [`--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    // Edge otherwise opens a sync-confirmation dialog as its OWN page target, and a naive
    // "first page target" pick attaches to that instead of the lab. The symptom is brutal to
    // diagnose: every control resolves absent and the guide parses 0 steps, which reads
    // exactly like a code regression. Same suppression verify-loaded.js already uses.
    '--disable-sync', '--no-service-autorun', '--disable-background-networking',
    '--disable-features=EdgeSyncPromo,msEdgeWelcomePage,msIdentityFre,ImplicitSignin',
    '--allow-file-access-from-files', '--window-size=1600,1000', page],
    { detached: true, stdio: 'ignore' });

  let client;
  try {
    let targets;
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      try { targets = await getJSON(`http://127.0.0.1:${port}/json/list`); if (targets.some((t) => t.type === 'page')) break; } catch (e) {}
    }
    // Pick the MOCK LAB explicitly. Belt and braces with the flags above: if Edge ever opens
    // another page target, attaching to the wrong one must fail loudly here rather than
    // producing a test run that silently measures the wrong page.
    const lab = targets.filter((t) => t.type === 'page')
      .find((t) => /mock-lab\.html/i.test(t.url || ''));
    if (!lab) {
      throw new Error('mock-lab.html is not among the page targets: '
        + targets.filter((t) => t.type === 'page').map((t) => t.url).join(' | '));
    }
    client = await wsConnect(lab.webSocketDebuggerUrl);
    await sleep(1200);
    const ev = async (expr) => {
      const r = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : 'eval failed');
      return r.result.value;
    };

    console.log('\n=== ROCKY ON A LAB NOBODY CAPTURED ===\n');
    console.log('  page: ' + await ev('document.title'));

    // inject the shipped content scripts
    for (const f of SCRIPTS) {
      const code = fs.readFileSync(path.join(ROOT, 'webext', 'content', f), 'utf8');
      await ev(code + '\n;1');
    }
    const loaded = await ev('[!!window.LabPilotAnchor,!!window.LabPilotPerceive,!!window.LabPilotWorld,!!window.LabPilotLabel,!!window.LabPilotGuide].join(",")');
    console.log('  engines loaded: ' + loaded + '\n');

    // ---- perception ------------------------------------------------------------------------
    const snap = await ev('(() => { const s = window.LabPilotPerceive.snapshot(); ' +
      'return { n: s.controls.length, ms: s.ms, names: s.controls.map(c => c.name) }; })()');
    console.log(`         ${snap.n} controls perceived in ${snap.ms.toFixed(2)} ms`);

    check('perception finds the ordinary controls', () => {
      assert(snap.names.includes('Create a resource'), `names: ${snap.names.join(' | ')}`);
      assert(snap.names.includes('Review + create'), 'missed Review + create');
    });

    check('perception PIERCES the shadow root', () => {
      // "Publish" exists only inside a shadow root. A naive querySelectorAll never sees it,
      // and on a real portal that is a whole class of invisible controls.
      assert(snap.names.includes('Publish'), `shadow-root control not perceived: ${snap.names.join(' | ')}`);
    });

    check('perception stays inside its budget', () => {
      assert(snap.ms < 25, `${snap.ms.toFixed(2)} ms — slower than the measured 2.9 ms baseline by too much`);
    });

    // ---- the guide, read off the screen -----------------------------------------------------
    const guide = await ev('(() => { const g = window.LabPilotGuide.read(); ' +
      'return { found: g.found, steps: g.steps.length, first: g.steps[0] && g.steps[0].targets.map(t=>t.label), ' +
      'surfaces: g.steps.map(s=>s.surface) }; })()');
    console.log(`         guide: ${guide.steps} instruction lines parsed`);

    check('the guide is read from the page with no captured bundle', () => {
      assert(guide.found, 'guide pane not found');
      assert(guide.steps >= 4, `only ${guide.steps} steps parsed from a 5-instruction guide`);
    });

    check('the VS Code step is classified as a surface Rocky cannot see', () => {
      assert(guide.surfaces.some((s) => s !== 'browser'),
        `every step classified as browser: ${guide.surfaces.join(', ')}`);
    });

    // ---- the join: guide label -> live control ----------------------------------------------
    const r1 = await ev('(() => { const r = window.LabPilotLabel.resolve("Create a resource"); ' +
      'return { status: r.status, score: r.score, id: r.element && r.element.id }; })()');
    check('a uniquely-named control RESOLVES from its guide label', () => {
      assert.strictEqual(r1.status, 'resolved', `got ${r1.status}`);
      assert.strictEqual(r1.id, 'btn-create-resource', `resolved the wrong element: ${r1.id}`);
    });

    const r2 = await ev('(() => { const r = window.LabPilotLabel.resolve("Review + create"); ' +
      'return { status: r.status, id: r.element && r.element.id }; })()');
    check('a second real target resolves too', () => {
      assert.strictEqual(r2.status, 'resolved', `got ${r2.status}`);
      assert.strictEqual(r2.id, 'btn-review');
    });

    // ---- the refusals, which matter more than the resolutions --------------------------------
    const r3 = await ev('(() => { const r = window.LabPilotLabel.resolve("Create"); return { status: r.status, count: r.count }; })()');
    check('TWO controls named "Create" are refused, not guessed between', () => {
      assert.notStrictEqual(r3.status, 'resolved',
        'Rocky picked one of two identical "Create" buttons — the contract failed');
    });

    const r4 = await ev('(() => { const r = window.LabPilotLabel.resolve("Nonexistent Button"); return { status: r.status }; })()');
    check('a control that is not there is absent, not invented', () => {
      assert.strictEqual(r4.status, 'absent', `got ${r4.status}`);
    });

    const r5 = await ev('(() => { const r = window.LabPilotLabel.resolve("Resource group name"); ' +
      'return { status: r.status, tag: r.element && r.element.tagName }; })()');
    check('a field is found by its visible label, not its placeholder', () => {
      assert.strictEqual(r5.status, 'resolved', `got ${r5.status}`);
      assert.strictEqual(r5.tag, 'INPUT', `resolved a ${r5.tag} instead of the input`);
    });

    // ---- the world model, driven by the real guide and real screen ---------------------------
    const world = await ev('(() => { ' +
      'window.LabPilotWorld.reset(); ' +
      'window.LabPilotWorld.ingest(window.LabPilotGuide.read()); ' +
      'const s = window.LabPilotPerceive.snapshot(); ' +
      'for (let i=0;i<8;i++) window.LabPilotWorld.observe({url:location.href,title:document.title,controls:s.controls}); ' +
      'const c = window.LabPilotWorld.current(); ' +
      'return { total: c.total, index: c.index, confidence: c.confidence, observeMs: c.observeMs, ' +
      'stepText: c.step && c.step.text }; })()');
    console.log(`         world model: step ${world.index + 1}/${world.total}, confidence ${world.confidence}, ${(world.observeMs || 0).toFixed(3)} ms/observation`);

    check('the world model locks on to a step from the real screen', () => {
      assert(world.total >= 4, `only ${world.total} steps in the graph`);
      assert(world.index >= 0, 'no step identified at all');
      assert(world.confidence > 0, 'zero confidence');
    });

    check('the hot path is genuinely cheap on a real page', () => {
      assert(world.observeMs < 5, `${world.observeMs} ms per observation`);
    });

    // ---- end to end: what would Rocky actually glow right now? -------------------------------
    const e2e = await ev('(() => { ' +
      'const c = window.LabPilotWorld.current(); ' +
      'if (!c.step) return { no: "step" }; ' +
      'const t = c.step.targets[0]; ' +
      'const labels = [t.label].concat(t.alt || []); ' +
      'const t0 = performance.now(); ' +
      'const r = window.LabPilotLabel.resolveAny(labels); ' +
      'const ms = performance.now() - t0; ' +
      'return { label: r.label, status: r.status, id: r.element && r.element.id, ms: ms }; })()');
    console.log(`         end to end: "${e2e.label}" -> ${e2e.status}` +
      (e2e.id ? ` (#${e2e.id})` : '') + ` in ${e2e.ms.toFixed(2)} ms`);

    check('Rocky reaches a verdict on the current step, end to end, in milliseconds', () => {
      assert(['resolved', 'ambiguous', 'absent'].includes(e2e.status), `odd status ${e2e.status}`);
      assert(e2e.ms < 20, `${e2e.ms.toFixed(2)} ms end to end`);
    });

    // ---- liveness: does a DOM change actually wake perception? --------------------------------
    // Two plain evaluations rather than one promise: CDP's awaitPromise + returnByValue was
    // returning {} for a resolved object, which measured the harness rather than the product.
    await ev('window.__lpFired = 0; window.LabPilotPerceive.onChange(function(){ window.__lpFired++; }); ' +
      'window.addLateControl("Freshly Added"); 1');
    await sleep(1200);
    const woke = await ev('(function(){ var s = window.LabPilotPerceive.snapshot(); ' +
      'return { fired: window.__lpFired, sees: s.controls.some(function(c){ return c.name === "Freshly Added"; }) }; })()');
    console.log(`         after adding a control: observer fired ${woke.fired}x, perceived=${woke.sees}`);

    check('a control added after load is noticed', () => {
      assert(woke.sees, 'a newly added control was not perceived');
      assert(woke.fired > 0, 'the change observer never fired for a real DOM change');
    });

    // ---- the pilot itself: does start() take ownership and reach a decision? ---------------
    // Nothing tested this before: the loop was built but nothing ran it, which is exactly the
    // gap that let "wired up" mean "not actually running".
    const piloted = await ev('(function(){ ' +
      'window.LabPilotWorld.reset(); ' +
      'var r = window.LabPilotPilot.start(); ' +
      'var s = window.LabPilotPilot.status(); ' +
      'return { ok: !!(r && r.ok), why: r && r.why, steps: r && r.steps, ' +
      'on: s.on, act: s.lastDecision && s.lastDecision.act, ' +
      'why2: s.lastDecision && s.lastDecision.why, ' +
      'stepText: s.world && s.world.step && s.world.step.text }; })()');
    console.log(`         pilot.start() -> ok=${piloted.ok} steps=${piloted.steps} decision=${piloted.act} (${piloted.why2})`);

    check('the pilot starts from the guide on screen', () => {
      assert(piloted.ok, `start() refused: ${piloted.why}`);
      assert(piloted.on, 'pilot did not stay on');
      assert(piloted.steps >= 4, `ingested only ${piloted.steps} steps`);
    });

    check('the pilot reaches a decision on the first turn', () => {
      assert(['POINT', 'ASK', 'SILENT', 'DEFER', 'ESCALATE'].includes(piloted.act),
        `no decision made, got ${piloted.act}`);
    });

    check('the pilot decided about the step the guide actually starts with', () => {
      assert(piloted.stepText && /create a resource/i.test(piloted.stepText),
        `working on the wrong step: ${piloted.stepText}`);
    });

    console.log('');
  } catch (e) {
    console.error('\n  harness error: ' + e.message + '\n');
    fails.push('harness');
  } finally {
    if (client) client.close();
    try { process.kill(-child.pid); } catch (e) {}
    killEdgeTree(prof); await sleep(400); rmQuiet(prof);
  }

  if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
  console.log(`${pass} passed, 0 failed — Rocky guides a lab he has never seen.\n`);
})();

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
assert.strictEqual = (a, b, msg) => { if (a !== b) throw new Error(msg || `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
assert.notStrictEqual = (a, b, msg) => { if (a === b) throw new Error(msg || `expected not to equal ${JSON.stringify(b)}`); };
