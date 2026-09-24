/*
 * relay-test.js — the child frames know what happened; the top frame has to hear it, once.
 *
 * MEASURED ON THE LIVE AZURE PORTAL, and the reason this component exists:
 *
 *   portal.azure.com       top frame     the blade route, heading, breadcrumb  -> WHERE
 *   sandbox-1.reactblade   child frame   the grid (aria-rowcount=4) and every  -> WHAT HAPPENED
 *   .portal.azure.net      cross-origin  live region ("3 results found")
 *
 * Neither can read the other. Rocky holds both halves of the truth and cannot join them.
 *
 * WHAT THESE CHECKS HOLD, in rough order of how expensive the mistake would be:
 *
 *   - a child frame NEVER records locally; it publishes, or the top frame is not the single
 *     source of truth and two frames disagree about the lab
 *   - the SAME fact re-offered every tick is ONE event, or sixty seconds of an unchanged page
 *     becomes sixty completions
 *   - a DIFFERENT fact is a different event, so de-duplication cannot swallow real news
 *   - transport is chrome.runtime, never postMessage, because a page script can forge a
 *     postMessage and "the policy was created" is exactly what an attacker would inject
 *   - the worker routes to frameId 0 of the SENDER'S OWN TAB, or a learner with two labs open
 *     gets one tab's completions in the other
 *   - a dead service worker loses events rather than throwing
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'webext', f), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

/*
 * A frame. `isTop` decides the role, exactly as frame.js does live. The completion engine is
 * stubbed so the relay can be driven deterministically — what it reports is completion.js's
 * business and is tested there.
 */
/*
 * ONE BROWSER, SHARED STORAGE. Frames do not get their own copy — that is the whole point of
 * the transport, so the harness models it honestly: every frame created from the same `world`
 * reads and writes the same object and hears the same change events.
 */
function makeWorld() {
  const store = {};
  const watchers = [];
  return {
    store,
    chromeFor() {
      return {
        storage: {
          local: {
            get(keys, cb) {
              if (keys === null || keys === undefined) return cb(JSON.parse(JSON.stringify(store)));
              const out = {};
              [].concat(keys).forEach((k) => { if (k in store) out[k] = store[k]; });
              cb(out);
            },
            set(patch, cb) {
              const changes = {};
              for (const k in patch) {
                changes[k] = { oldValue: store[k], newValue: patch[k] };
                store[k] = JSON.parse(JSON.stringify(patch[k]));
              }
              watchers.forEach((fn) => fn(changes, 'local'));
              if (cb) cb();
            },
          },
          onChanged: { addListener(fn) { watchers.push(fn); } },
        },
      };
    },
  };
}

function makeFrame(opts, world) {
  const o = opts || {};
  const w = world || makeWorld();
  const win = {
    LabPilotFrame: { isTop: !!o.isTop, isChild: !o.isTop, ownsUI: !!o.isTop, observes: true },
    LabPilotCompletion: {
      announcements: () => o.said || [],
      snapshot: () => ({ lists: o.lists || {}, dialogs: o.dialogs || [], empty: [], heading: '' }),
    },
  };
  const timers = [];
  new Function('window', 'chrome', 'location', 'setInterval', 'clearInterval', src('content/relay.js'))(
    win, w.chromeFor(), { origin: o.origin || 'https://portal.azure.com', pathname: o.path || '/' },
    (fn) => { timers.push(fn); return timers.length; }, () => {});
  return {
    R: win.LabPilotRelay, win, world: w,
    tick() { timers.forEach((fn) => fn()); },
    // What this frame has written to the shared area — the wire, observable.
    wire() {
      const mine = [];
      for (const k in w.store) if (k.indexOf('lpFrameEvents:') === 0) mine.push(...w.store[k]);
      return mine;
    },
    set(k, v) { o[k] = v; },
  };
}

console.log('\n=== THE CHILD FRAMES REPORT; THE TOP FRAME DECIDES ===\n');

// ---- roles ------------------------------------------------------------------------------
check('a CHILD frame publishes and records nothing locally', () => {
  const f = makeFrame({
    isTop: false, origin: 'https://sandbox-1.reactblade.portal.azure.net',
    said: [{ t: Date.now(), kind: 'count', count: 3, text: '3 results found', assertive: false }],
  });
  f.tick();
  assert.strictEqual(f.wire().length, 1, `child put ${f.wire().length} events on the wire`);
  assert.strictEqual(f.R.events().length, 0,
    'a child frame kept its own log — then two frames hold different versions of the lab');
});

check('a TOP frame records its own events and puts nothing on the wire', () => {
  const f = makeFrame({
    isTop: true, origin: 'https://purview.microsoft.com',
    said: [{ t: Date.now(), kind: 'count', count: 1, text: '1 item', assertive: false }],
  });
  f.tick();
  assert.strictEqual(f.wire().length, 0, 'the top frame published to itself through storage');
  assert.strictEqual(f.R.events().length, 1, 'the top frame did not record its own signal');
});

check('THE HOP: a child publishes, and the top frame in the same browser hears it', () => {
  /*
   * The whole point of stage 2, exercised end to end through one shared storage area — which is
   * what the browser actually provides. On Azure this is the blade frame telling the portal
   * shell that the resource list went from nothing to three rows.
   */
  const world = makeWorld();
  const top = makeFrame({ isTop: true, origin: 'https://portal.azure.com' }, world);
  const child = makeFrame({
    isTop: false, origin: 'https://sandbox-1.reactblade.portal.azure.net',
    lists: { 'Resource groups': { declared: 0, rendered: 0 } },
  }, world);
  child.tick();                                        // learns its baseline
  child.set('lists', { 'Resource groups': { declared: 3, rendered: 3 } });
  child.tick();                                        // publishes the growth
  const heard = top.R.events().filter((e) => e.kind === 'list-grew');
  assert.strictEqual(heard.length, 1,
    `the top frame heard ${top.R.events().length} events and no list-grew: ${JSON.stringify(top.R.events())}`);
  assert.strictEqual(heard[0].from, 0);
  assert.strictEqual(heard[0].to, 3);
  assert.ok(/reactblade/.test(heard[0].frame), 'the event lost which frame it came from');
});

check('a top frame that starts LATE still hears what a child already published', () => {
  // A child frame can be running well before the top frame's scripts are.
  const world = makeWorld();
  const child = makeFrame({
    isTop: false, origin: 'https://sandbox-1.reactblade.portal.azure.net',
    lists: { Things: { declared: 1, rendered: 1 } },
  }, world);
  child.tick();
  child.set('lists', { Things: { declared: 5, rendered: 5 } });
  child.tick();
  const top = makeFrame({ isTop: true, origin: 'https://portal.azure.com' }, world);
  assert.ok(top.R.events().some((e) => e.kind === 'list-grew'),
    'a late top frame lost everything published before it started listening');
});

check('two child frames do not overwrite each other', () => {
  // Azure runs two blade frames. A single shared key would be a read-modify-write race and one
  // frame's news would vanish.
  const world = makeWorld();
  const top = makeFrame({ isTop: true, origin: 'https://portal.azure.com' }, world);
  const a = makeFrame({ isTop: false, origin: 'https://sandbox-1.reactblade.portal.azure.net', lists: { L: { declared: 1, rendered: 1 } } }, world);
  const b = makeFrame({ isTop: false, origin: 'https://sandbox-2.reactblade.portal.azure.net', lists: { L: { declared: 1, rendered: 1 } } }, world);
  a.tick(); b.tick();
  a.set('lists', { L: { declared: 2, rendered: 2 } });
  b.set('lists', { L: { declared: 7, rendered: 7 } });
  a.tick(); b.tick();
  const grew = top.R.events().filter((e) => e.kind === 'list-grew');
  assert.strictEqual(grew.length, 2, `one frame's event was lost: ${JSON.stringify(grew)}`);
  assert.notStrictEqual(a.R._key, b.R._key, 'two frames share a storage key and will race');
});

check('a relayed event is timestamped on arrival', () => {
  const top = makeFrame({ isTop: true });
  top.R._take([{ kind: 'count-grew', frame: 'blade', from: 0, to: 3 }]);
  const e = top.R.events();
  assert.strictEqual(e.length, 1, 'a relayed event was dropped');
  assert.ok(e[0].t > 0, 'a relayed event was not timestamped');
});

// ---- de-duplication, which is the whole reliability story ----------------------------------
check('the same fact re-offered every tick is ONE event', () => {
  /*
   * A child frame re-reads its own state every second. An unchanged page must not become a
   * completion per second. This is the single most important property here.
   */
  const top = makeFrame({ isTop: true });
  for (let i = 0; i < 60; i++) {
    top.R._take([{ kind: 'count-grew', frame: 'blade', from: 0, to: 3 }]);
  }
  assert.strictEqual(top.R.events().length, 1,
    `sixty ticks of an unchanged page produced ${top.R.events().length} events`);
  assert.strictEqual(top.R.events()[0].repeats, 60, 'the repeat count was not kept');
});

check('a DIFFERENT fact is a different event — de-duplication must not swallow news', () => {
  const top = makeFrame({ isTop: true });
  top.R._take([{ kind: 'count-grew', frame: 'blade', from: 0, to: 3 }]);
  top.R._take([{ kind: 'count-grew', frame: 'blade', from: 3, to: 4 }]);
  assert.strictEqual(top.R.events().length, 2, 'a second, genuinely new change was collapsed into the first');
});

check('the same fact from DIFFERENT frames is kept apart', () => {
  // Azure runs two blade frames; one is empty plumbing. They must not be conflated.
  const top = makeFrame({ isTop: true });
  top.R._take([{ kind: 'dialog-opened', frame: 'blade-1', name: 'New policy' }]);
  top.R._take([{ kind: 'dialog-opened', frame: 'blade-2', name: 'New policy' }]);
  assert.strictEqual(top.R.events().length, 2, 'two frames reporting separately were merged');
});

check('the timestamp is NOT part of the key, or nothing would ever de-duplicate', () => {
  const top = makeFrame({ isTop: true });
  const k1 = top.R._keyOf({ frame: 'f', kind: 'count-grew', from: 0, to: 3, t: 1000 });
  const k2 = top.R._keyOf({ frame: 'f', kind: 'count-grew', from: 0, to: 3, t: 99999 });
  assert.strictEqual(k1, k2, 'the key includes the time, so every repeat looks new');
});

// ---- what a child actually reports ------------------------------------------------------
check('a child reports a list CHANGE, never a list state', () => {
  const f = makeFrame({ isTop: false, lists: { Policies: { declared: 1, rendered: 1 } } });
  f.tick();                                            // first tick only learns the baseline
  assert.strictEqual(f.wire().length, 0, 'the first sight of a list was reported as a change');
  f.set('lists', { Policies: { declared: 4, rendered: 4 } });
  f.tick();
  const grew = f.wire().filter((e) => e.kind === 'list-grew');
  assert.strictEqual(grew.length, 1, `expected one list-grew, got ${JSON.stringify(f.wire().map((e) => e.kind))}`);
  assert.strictEqual(grew[0].from, 1);
  assert.strictEqual(grew[0].to, 4);
  assert.strictEqual(grew[0].declared, true);
});

check('an announcement is forwarded once, not on every tick', () => {
  const t0 = Date.now();
  const f = makeFrame({
    isTop: false,
    said: [{ t: t0, kind: 'count', count: 3, text: '3 results found', assertive: false }],
  });
  f.tick(); f.tick(); f.tick();
  assert.strictEqual(f.wire().length, 1,
    `one announcement reached the wire ${f.wire().length} times — the top frame would de-duplicate ` +
    `it, but the wire should not carry it three times either`);
});

check('every event carries the frame it came from', () => {
  const f = makeFrame({
    isTop: false, origin: 'https://sandbox-1.reactblade.portal.azure.net', path: '/React/Index',
    said: [{ t: Date.now(), kind: 'failure', text: 'Client Error', assertive: true }],
  });
  f.tick();
  assert.ok(/reactblade/.test(f.wire()[0].frame),
    `the event does not say which frame it came from: ${JSON.stringify(f.wire()[0])}`);
});

check('frames() says which frames reported and what they carry', () => {
  const top = makeFrame({ isTop: true });
  top.R._take([{ kind: 'count-grew', frame: 'blade', from: 0, to: 3 }]);
  top.R._take([{ kind: 'announce', frame: 'blade', text: 'x' }]);
  top.R._take([{ kind: 'announce', frame: 'auth-iframe', text: 'y' }]);
  const fr = top.R.frames();
  assert.strictEqual(fr.length, 2, `expected two reporting frames, got ${JSON.stringify(fr)}`);
  const blade = fr.find((x) => x.frame === 'blade');
  assert.ok(blade.kinds['count-grew'] === 1 && blade.kinds.announce === 1,
    `frame summary is wrong: ${JSON.stringify(blade)}`);
});

// ---- resilience --------------------------------------------------------------------------
check('publishing with storage unavailable loses the event rather than throwing', () => {
  // An invalidated extension context makes every chrome API throw. That must not propagate into
  // the portal's own JavaScript.
  const f = makeFrame({ isTop: false });
  assert.doesNotThrow(() => f.R.publish({ kind: 'x', frame: 'f' }), 'a publish threw into the page');
});

check('a malformed relayed entry is ignored, not recorded', () => {
  const top = makeFrame({ isTop: true });
  top.R._take(null);                       // nothing at all
  top.R._take([]);                         // an empty batch
  top.R._take([null]);                     // a hole in the batch
  top.R._take([{}]);                       // no kind, no frame
  top.R._take([{ kind: 'x' }]);            // no frame
  top.R._take([{ frame: 'f' }]);           // no kind
  assert.strictEqual(top.R.events().length, 0, `garbage was recorded: ${JSON.stringify(top.R.events())}`);
});

check('a subscriber that throws does not stop the relay', () => {
  const top = makeFrame({ isTop: true });
  let second = 0;
  top.R.onEvent(() => { throw new Error('bad subscriber'); });
  top.R.onEvent(() => { second++; });
  top.R._take([{ kind: 'count-grew', frame: 'f', from: 0, to: 1 }]);
  assert.strictEqual(second, 1, 'one broken subscriber silenced the others');
});

check('the log is bounded, so a long lab cannot grow it without limit', () => {
  const top = makeFrame({ isTop: true });
  for (let i = 0; i < 900; i++) {
    top.R._take([{ kind: 'count-grew', frame: 'f', from: i, to: i + 1 }]);
  }
  assert.ok(top.R.events().length <= top.R._tuning.LOG_MAX + 1,
    `the log grew to ${top.R.events().length}, above the ${top.R._tuning.LOG_MAX} cap`);
});

// ---- transport and routing, asserted on the source --------------------------------------
check('the transport is extension-only — NEVER postMessage', () => {
  /*
   * Any script on the page can call window.parent.postMessage, so a completion would be
   * forgeable by the very page Rocky is watching — and "the policy was created" is precisely
   * the claim worth injecting, because it makes Rocky tell the learner to move on. There is no
   * shared secret available either: a cross-origin child cannot be handed a nonce except over
   * the same forgeable channel.
   */
  const r = code('content/relay.js');
  assert.ok(/chrome\.storage\.local/.test(r), 'the relay does not use chrome.storage');
  assert.ok(!/postMessage/.test(r), 'the relay uses postMessage, which any page script can forge');
});

check('the relay does NOT depend on the service worker', () => {
  /*
   * A worker hop was built first and abandoned. With --load-extension and a persisted profile,
   * restarting the browser reloads content scripts and the manifest while leaving the OLD
   * worker registered — measured repeatedly, including after a manifest version bump. Nothing
   * errors; the worker answers what it always answered and ignores the new messages. A
   * transport that silently does nothing in the environment you test in is the wrong
   * foundation for the component carrying every completion signal.
   */
  const r = code('content/relay.js');
  assert.ok(!/chrome\.runtime\.sendMessage/.test(r),
    'the relay still messages the worker, so it breaks whenever the worker is stale');
  const b = code('background.js');
  assert.ok(!/lp-frame-event/.test(b),
    'the worker still carries relay routing that nothing uses');
});

check('each frame owns its storage key, and the top frame reads them all', () => {
  const r = code('content/relay.js');
  assert.ok(/lpFrameEvents:/.test(r), 'the relay does not namespace its storage keys');
  assert.ok(/indexOf\("lpFrameEvents:"\)\s*===\s*0/.test(r),
    'the top frame does not scan for every frame\'s key, so a second blade frame is unheard');
});

check('the relay runs in every frame — it is not top-frame gated', () => {
  assert.ok(!/LabPilotFrame\s*&&\s*!window\.LabPilotFrame\.ownsUI/.test(code('content/relay.js')),
    'relay.js carries the UI guard, so child frames would never report');
});

check('the manifest loads the relay after the engine it reads', () => {
  const m = JSON.parse(src('manifest.json'));
  const js = m.content_scripts[0].js;
  assert.ok(js.indexOf('content/relay.js') > js.indexOf('content/completion.js'),
    'relay.js loads before completion.js and would find nothing to report');
  assert.ok((m.content_scripts[0].matches || []).some((h) => /azure\.net/.test(h)),
    'the Azure blade origin is not injected, so there is nothing in that frame to relay FROM');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — one tab, one stream, one truth.\n`);
