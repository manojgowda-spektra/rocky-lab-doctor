/*
 * rocky-ui-test.js — the two things a learner does when Rocky is in the way, or in the wrong mode.
 *
 * BOTH OF THESE WERE REPORTED FROM A REAL SESSION, not found by a test:
 *
 *   "we cant drag rocky to other place if required"
 *   "there is no back button once we open chat box"
 *
 * Neither is exotic. Rocky places himself next to the control he is pointing at, which is
 * sometimes exactly where the learner needs to look; and asking a question replaced whatever he
 * was saying with no route back to it. Escape did close the ask box, but nothing on screen said
 * so, and an affordance nobody can see is not an affordance.
 *
 * WHY THESE ARE HARD TO TEST AND THEREFORE WORTH TESTING. rocky.js is a canvas character driven
 * by document-level pointer events, so it falls outside every existing harness — which is
 * precisely why two obvious interaction gaps survived twenty-four green suites. The stub below
 * is deliberately thin: it is a DOM only to the extent rocky.js touches one, and the assertions
 * are about behaviour a learner would notice.
 *
 * THE INVARIANTS THAT MUST NOT REGRESS:
 *   - a drag moves him, and PINS him, so the next step does not yank him back
 *   - a pinned Rocky still FACES the control he is pointing at; he just does not travel to it
 *   - a drag is never also a click, or moving him would open the menu every time
 *   - a click that never moved is still a click, or the menu would stop opening
 *   - he can never be dragged off screen, and a resized window cannot strand him there
 *   - a conversation card offers a way back; a guidance card does not pretend to
 *   - going back restores what he was saying, not a blank panel
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---- the thinnest DOM rocky.js will accept ----------------------------------------------------
function makeEnv() {
  const listeners = {};      // document-level, capture or not — rocky.js only uses capture
  const winListeners = {};
  const store = {};

  const el = (tag) => {
    const node = {
      tagName: String(tag || 'div').toUpperCase(),
      style: { cssText: '', left: '', top: '', opacity: '', cursor: '', background: '', borderColor: '', display: '' },
      children: [], attrs: {}, textContent: '', value: '',
      _html: '',
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); if (!v) this.children.length = 0; },
      width: 0, height: 0, disabled: false,
      _events: {},
      appendChild(c) { this.children.push(c); return c; },
      remove() {},
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      addEventListener(t, fn) { (this._events[t] = this._events[t] || []).push(fn); },
      removeEventListener() {},
      closest() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      // Rocky reads this to hit-test. The host's real position is driven by style.left/top.
      getBoundingClientRect() {
        const L = parseFloat(this.style.left) || 0, T = parseFloat(this.style.top) || 0;
        return { left: L, top: T, right: L + 93, bottom: T + 107, width: 93, height: 107 };
      },
      getContext() {
        return {
          scale() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {},
          stroke() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {},
          clearRect() {}, ellipse() {}, arc() {}, quadraticCurveTo() {}, bezierCurveTo() {},
          lineTo() {}, createLinearGradient() { return { addColorStop() {} }; },
          createRadialGradient() { return { addColorStop() {} }; },
          // OPAQUE everywhere, so hitRocky() depends only on the bounding box — which is what
          // lets this harness test the drag without rasterising a character.
          getImageData() { return { data: [0, 0, 0, 255] }; },
          set fillStyle(v) {}, get fillStyle() { return ''; },
          set strokeStyle(v) {}, get strokeStyle() { return ''; },
          set lineWidth(v) {}, get lineWidth() { return 0; },
          set globalAlpha(v) {}, get globalAlpha() { return 1; },
          set font(v) {}, get font() { return ''; },
          set shadowBlur(v) {}, get shadowBlur() { return 0; },
          set shadowColor(v) {}, get shadowColor() { return ''; },
          set lineJoin(v) {}, get lineJoin() { return ''; },
          set lineCap(v) {}, get lineCap() { return ''; },
          set textAlign(v) {}, get textAlign() { return ''; },
        };
      },
    };
    Object.defineProperty(node, 'offsetWidth', { get: () => 220 });
    Object.defineProperty(node, 'offsetHeight', { get: () => 48 });
    return node;
  };

  const body = el('body');
  const documentElement = el('html');
  const doc = {
    readyState: 'complete', body, documentElement, title: 'Portal',
    createElement: el,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() {},
    dispatchEvent(e) { (listeners[e.type] || []).forEach((fn) => fn(e)); return true; },
    elementFromPoint() { return null; },      // no page control underneath: the hit stands
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    execCommand() {},
  };

  const frames = [];
  // ONE clock, shared by the injected `performance` and the frame timestamps. rocky.js eases
  // on the delta between the timestamp it is handed and its own performance.now(); handing it
  // two unrelated clocks makes dt hugely negative, Math.exp(-9*dt) infinite, and every
  // position NaN — which looks exactly like a broken drag and is not one.
  let clock = 1000;
  const perf = { now: () => clock };
  const win = {
    innerWidth: 1600, innerHeight: 900,
    addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
    matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    navigator: { clipboard: null, userAgent: 'node' },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    CustomEvent: function (type, init) { return Object.assign({ type }, init || {}); },
  };
  win.window = win;

  return {
    win, doc, body, store, winListeners, perf,
    fire(type, ev) { (listeners[type] || []).forEach((fn) => fn(Object.assign({ type }, ev))); },
    fireWin(type) { (winListeners[type] || []).forEach((fn) => fn({ type })); },
    tick(n) { for (let i = 0; i < (n || 1); i++) { clock += 16; const q = frames.splice(0); q.forEach((fn) => fn(clock)); } },
  };
}

function load(env) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'rocky.js'), 'utf8');
  new Function('window', 'document', 'setTimeout', 'setInterval', 'clearTimeout', 'requestAnimationFrame',
    'performance', 'localStorage', 'navigator', 'matchMedia', 'addEventListener', 'innerWidth', 'innerHeight',
    'CustomEvent', 'Event', code)(
    env.win, env.doc, (fn) => { if (typeof fn === 'function') fn(); return 0; }, () => 0, () => {},
    env.win.requestAnimationFrame, env.perf, env.win.localStorage, env.win.navigator,
    env.win.matchMedia, env.win.addEventListener, env.win.innerWidth, env.win.innerHeight,
    env.win.CustomEvent, env.win.CustomEvent);
  return env.win.LabPilotRocky;
}

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// A control on the page for Rocky to point at.
const control = (left, top) => ({
  getBoundingClientRect: () => ({ left, top, right: left + 120, bottom: top + 32, width: 120, height: 32 }),
});
const hostOf = (env) => env.body.children[0];
const noop = { preventDefault() {}, stopImmediatePropagation() {} };

/*
 * Drag him from wherever he currently IS to (tx, ty).
 *
 * He eases toward his target rather than teleporting there, so a hard-coded grab point misses
 * him, hitRocky() refuses the hit, and no drag ever starts. Reading his live rect is what a
 * hand does, and getting this wrong made a working drag look broken for five checks.
 */
function dragTo(env, tx, ty, id) {
  const host = hostOf(env);
  const r = host.getBoundingClientRect();
  const gx = r.left + r.width / 2, gy = r.top + r.height / 2;
  env.fire('pointerdown', { button: 0, pointerId: id || 1, clientX: gx, clientY: gy });
  env.fire('pointermove', Object.assign({ pointerId: id || 1, clientX: tx + r.width / 2, clientY: ty + r.height / 2 }, noop));
  env.fire('pointerup', Object.assign({ pointerId: id || 1 }, noop));
  return host;
}

console.log('\n=== ROCKY CAN BE MOVED, AND YOU CAN GET BACK ===\n');

// ---- dragging ---------------------------------------------------------------------------------
check('a drag moves him', () => {
  const env = makeEnv(); const R = load(env);
  R.guide(control(400, 300), 'Click Publish.');
  env.tick(3);
  const host = dragTo(env, 250, 180);
  assert.ok(Math.abs(parseFloat(host.style.left) - 250) < 2 && Math.abs(parseFloat(host.style.top) - 180) < 2,
    `dragged to 250,180 but he is at ${host.style.left},${host.style.top}`);
});

check('a drag PINS him, so the next step does not yank him back', () => {
  // The whole reason to move him is that he was covering something. A model that re-places him
  // on the next observation undoes the learner's decision a second later.
  const env = makeEnv(); const R = load(env);
  R.guide(control(400, 300), 'Step one.');
  env.tick(3);
  const host = dragTo(env, 100, 120);
  const parked = { x: parseFloat(host.style.left), y: parseFloat(host.style.top) };
  assert.strictEqual(R.pinned, true, 'a drag did not pin him');
  R.guide(control(1200, 700), 'Step two, miles away.');
  env.tick(30);
  assert.ok(Math.abs(parseFloat(host.style.left) - parked.x) < 2 &&
            Math.abs(parseFloat(host.style.top) - parked.y) < 2,
    `he wandered off to ${host.style.left},${host.style.top} after being parked at ${parked.x},${parked.y}`);
});

check('a pinned Rocky still FACES the control — parked is not the same as disengaged', () => {
  const env = makeEnv(); const R = load(env);
  R.guide(control(1400, 300), 'Far right.');
  env.tick(3);
  const host = dragTo(env, 700, 400);
  const parked = parseFloat(host.style.left);

  // A target to his RIGHT and one to his LEFT must not leave him facing the same way, or he
  // sits where he was parked gesturing at nothing, which reads as broken rather than obedient.
  R.guide(control(1400, 300), 'Far right.');
  env.tick(2);
  const facingRight = R.facing;
  R.guide(control(20, 300), 'Now far left.');
  env.tick(2);
  const facingLeft = R.facing;
  assert.notStrictEqual(facingRight, facingLeft,
    `parked Rocky faces ${facingRight} for a target on the right and ${facingLeft} for one on the left — he stopped pointing`);
  assert.ok(Math.abs(parseFloat(host.style.left) - parked) < 2,
    'facing the target moved him, which the pin forbids');
});

check('a drag is never also a click — moving him must not open the menu', () => {
  const env = makeEnv(); const R = load(env);
  R.guide(control(400, 300), 'Step.');
  env.tick(3);
  let clicks = 0;
  env.doc.addEventListener('labpilot-rocky-click', () => { clicks++; });
  const r = hostOf(env).getBoundingClientRect();
  dragTo(env, r.left + 200, r.top + 50);
  env.fire('click', Object.assign({ clientX: r.left + 240, clientY: r.top + 100 }, noop));
  assert.strictEqual(clicks, 0, 'dragging him opened the menu');
});

check('a click that never moved is still a click — the menu must keep working', () => {
  const env = makeEnv(); const R = load(env);
  R.guide(control(400, 300), 'Step.');
  env.tick(3);
  let clicks = 0;
  env.doc.addEventListener('labpilot-rocky-click', () => { clicks++; });
  const r = hostOf(env).getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  env.fire('pointerdown', { button: 0, pointerId: 1, clientX: x, clientY: y });
  env.fire('pointerup', Object.assign({ pointerId: 1 }, noop));
  env.fire('click', Object.assign({ clientX: x, clientY: y }, noop));
  assert.strictEqual(clicks, 1, `a plain click produced ${clicks} menu opens`);
});

check('a tiny wobble is a click, not a drag', () => {
  // Nobody holds a mouse perfectly still. A 2px tremor while clicking must not count as moving
  // him, or the menu becomes unreliable for anyone with an unsteady hand.
  const env = makeEnv(); const R = load(env);
  R.guide(control(400, 300), 'Step.');
  env.tick(3);
  let clicks = 0;
  env.doc.addEventListener('labpilot-rocky-click', () => { clicks++; });
  const r = hostOf(env).getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  env.fire('pointerdown', { button: 0, pointerId: 1, clientX: x, clientY: y });
  env.fire('pointermove', Object.assign({ pointerId: 1, clientX: x + 2, clientY: y + 1 }, noop));
  env.fire('pointerup', Object.assign({ pointerId: 1 }, noop));
  env.fire('click', Object.assign({ clientX: x + 2, clientY: y + 1 }, noop));
  assert.strictEqual(R.pinned, false, 'a 2px tremor pinned him');
  assert.strictEqual(clicks, 1, 'a 2px tremor swallowed the click');
});

check('he cannot be dragged off screen', () => {
  const env = makeEnv(); const R = load(env);
  R.guide(control(400, 300), 'Step.');
  env.tick(3);
  const host = dragTo(env, -5000, -5000);
  assert.ok(parseFloat(host.style.left) >= 0 && parseFloat(host.style.top) >= 0,
    `dragged to ${host.style.left},${host.style.top} — off screen and unrecoverable`);
  dragTo(env, 99999, 99999, 2);
  assert.ok(parseFloat(host.style.left) < env.win.innerWidth && parseFloat(host.style.top) < env.win.innerHeight,
    `dragged to ${host.style.left},${host.style.top} — past the far edge`);
});

check('the parked position survives a reload, as a fraction of the window', () => {
  const env = makeEnv(); const R = load(env);
  R.guide(control(400, 300), 'Step.');
  env.tick(3);
  dragTo(env, 200, 150);
  assert.ok(env.store.lpRockyPos, 'nothing was remembered');
  const saved = JSON.parse(env.store.lpRockyPos);
  assert.ok(saved.fx >= 0 && saved.fx <= 1 && saved.fy >= 0 && saved.fy <= 1,
    `stored ${JSON.stringify(saved)} — not a viewport fraction, so a different window size strands him`);
});

check('a shrinking window cannot strand him outside it', () => {
  const env = makeEnv(); const R = load(env);
  R.guide(control(400, 300), 'Step.');
  env.tick(3);
  const host = dragTo(env, 1400, 760);
  env.win.innerWidth = 700; env.win.innerHeight = 500;
  env.fireWin('resize');
  env.tick(3);
  assert.ok(parseFloat(host.style.left) <= 700 && parseFloat(host.style.top) <= 500,
    `after shrinking to 700x500 he is at ${host.style.left},${host.style.top}`);
});

check('the menu offers a way back only once he has been moved', () => {
  const env = makeEnv(); const R = load(env);
  R.guide(control(400, 300), 'Step.');
  env.tick(3);
  assert.strictEqual(R.pinned, false, 'pinned before anything was dragged');
  dragTo(env, 300, 200);
  assert.strictEqual(R.pinned, true);
  R.unpin();
  assert.strictEqual(R.pinned, false, 'unpin() did not release him');
  assert.ok(!env.store.lpRockyPos, 'unpin() left the parked position behind, so a reload re-pins him');
});

// ---- the way back out of a conversation ---------------------------------------------------------
const bubbleOf = (env) => env.body.children[1];
const buttonsIn = (node) => {
  const out = [];
  (function walk(n) { (n.children || []).forEach((c) => { if (c.tagName === 'BUTTON') out.push(c); walk(c); }); })(node);
  return out;
};

check('a conversation card offers a way back', () => {
  const env = makeEnv(); const R = load(env);
  R.announce('“what is a policy?”', { label: 'ASK ROCKY', ai: 'A policy is…' });
  const bub = bubbleOf(env);
  const back = buttonsIn(bub).find((b) => b.textContent === '‹');
  assert.ok(back, 'an answer card has no way back to the step');
  const label = back.title || back.attrs['aria-label'] || '';
  assert.ok(/back|close/i.test(label), `unlabelled control: ${JSON.stringify(label)}`);
});

check('the ask box itself offers a way back', () => {
  const env = makeEnv(); const R = load(env);
  R.announce('Ask me anything', { label: 'ASK ROCKY', ask: { placeholder: 'Ask…', onAsk() {} } });
  const back = buttonsIn(bubbleOf(env)).find((b) => b.textContent === '‹');
  assert.ok(back, 'the ask box has no visible way out — Escape alone is not an affordance');
});

check('a guidance card does NOT pretend there is somewhere to go back to', () => {
  const env = makeEnv(); const R = load(env);
  R.announce('Click Solutions.', { label: 'STEP 1 OF 5' });
  const back = buttonsIn(bubbleOf(env)).find((b) => b.textContent === '‹');
  assert.ok(!back, 'guidance offered a back arrow that goes nowhere');
});

check('going back restores what Rocky was saying, not a blank panel', () => {
  const env = makeEnv(); const R = load(env);
  R.announce('Open Settings > Policy indicators.', { label: 'STEP 2 OF 5' });
  R.announce('“what is an indicator?”', { label: 'ASK ROCKY', ai: 'An indicator is…' });
  const back = buttonsIn(bubbleOf(env)).find((b) => b.textContent === '‹');
  assert.ok(back, 'no back control to press');
  back._events.click.forEach((fn) => fn({ preventDefault() {}, stopPropagation() {} }));
  const texts = [];
  (function walk(n) { (n.children || []).forEach((c) => { if (c.textContent) texts.push(c.textContent); walk(c); }); })(bubbleOf(env));
  assert.ok(texts.some((t) => /Policy indicators/.test(t)),
    `back did not restore the step — the card now reads: ${JSON.stringify(texts)}`);
  assert.ok(!texts.some((t) => /An indicator is/.test(t)), 'the answer is still on screen after going back');
});

check('going back with nothing to return to clears the card rather than freezing it', () => {
  const env = makeEnv(); const R = load(env);
  R.announce('“hello?”', { label: 'ASK ROCKY', ai: 'Hello.' });
  const back = buttonsIn(bubbleOf(env)).find((b) => b.textContent === '‹');
  back._events.click.forEach((fn) => fn({ preventDefault() {}, stopPropagation() {} }));
  assert.strictEqual(bubbleOf(env).style.opacity, 0, 'a dead panel was left on screen');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky moves when you move him, and there is always a way back.\n`);
