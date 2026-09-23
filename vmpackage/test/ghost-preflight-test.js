/*
 * ghost-preflight-test.js — the two most demo-able things Rocky does, both kept safe.
 *
 * 1. THE GHOST CURSOR. When the glow reveals, a pointer glides from the learner's mouse to the
 *    centre of the control, pulses once and fades. It is the form factor of an agent that
 *    clicks for you, minus the agent: it must NEVER dispatch an event, call click() or focus
 *    anything. That property is checked two ways here — structurally (the code region cannot
 *    contain the calls) and behaviourally (an instrumented target records any such call).
 *    It must also respect prefers-reduced-motion and do nothing in a hidden tab.
 *
 * 2. THE PRE-FLIGHT SUMMARY. When the pilot ingests a guide it says, once per guide title, how
 *    many steps it can point at and how many happen outside the browser. Honest counts from the
 *    guide reader's surface field; never over an open ask box; never twice for one title.
 *
 * Both halves run in Node with no browser. The ghost half uses a small fake DOM: enough to
 * create elements, set styles and fire the two events the cursor listens for.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'webext', 'content');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

// =============================================================================================
// 1. GHOST CURSOR
// =============================================================================================
console.log('\n=== GHOST CURSOR ===\n');

const overlaySrc = fs.readFileSync(path.join(SRC, 'overlay.js'), 'utf8');
const overlayCss = fs.readFileSync(path.join(SRC, 'overlay.css'), 'utf8');

function ghostRegion() {
  const a = overlaySrc.indexOf('// ---- ghost cursor');
  const b = overlaySrc.indexOf('// ---- end ghost cursor');
  assert.ok(a >= 0 && b > a, 'overlay.js has no "// ---- ghost cursor" ... "// ---- end ghost cursor" region');
  return overlaySrc.slice(a, b);
}

// ---- structural: the code cannot do the dangerous thing -------------------------------------
check('the ghost cursor region exists in overlay.js and is small', () => {
  const region = ghostRegion();
  const lines = region.split('\n').length;
  assert.ok(region.includes('lp-ghost'), 'region does not mention its own element class');
  assert.ok(lines <= 80, `ghost cursor is ${lines} lines; the brief asked for ~80 or fewer`);
});

check('the ghost cursor never clicks, dispatches or focuses', () => {
  const region = ghostRegion();
  const banned = ['.click(', 'dispatchEvent(', '.focus(', 'new MouseEvent', 'new PointerEvent', 'initEvent(', 'setInterval('];
  const found = banned.filter((b) => region.includes(b));
  assert.deepStrictEqual(found, [], `forbidden calls inside the ghost cursor: ${found.join(', ')}`);
});

check('it respects prefers-reduced-motion and a hidden tab', () => {
  const region = ghostRegion();
  assert.ok(region.includes('prefers-reduced-motion'), 'no prefers-reduced-motion check');
  assert.ok(region.includes('document.hidden'), 'no hidden-tab check');
  assert.ok(region.includes('data-labpilot'), 'the element is not marked data-labpilot, so perception would see it');
});

check('the glow reveal (onArrive) is what triggers it, and the CSS is click-through', () => {
  const hook = /LabPilotRocky\.guide\(element[^\n]*ghostFly\(/.test(overlaySrc);
  assert.ok(hook, 'the onArrive callback passed to LabPilotRocky.guide() does not call ghostFly()');
  const rule = /\.lp-ghost\s*\{[^}]*pointer-events:\s*none/.test(overlayCss);
  assert.ok(rule, 'overlay.css .lp-ghost is not pointer-events: none');
  assert.ok(/@keyframes\s+lp-ghost-out/.test(overlayCss), 'no lp-ghost-out keyframes (the fade the JS waits for)');
});

// ---- behavioural: run the real code against an instrumented fake DOM --------------------------
function fakeEl(tag, forbidden, rect) {
  const el = {
    tagName: tag, style: {}, children: [], attrs: {}, listeners: {}, _class: '', isConnected: true, parentNode: null,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener() {},
    contains(c) { return this.children.includes(c); },
    getBoundingClientRect() { return rect || { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
    // the three things the ghost cursor must never do to a page element
    click() { forbidden.push(tag + '.click()'); },
    focus() { forbidden.push(tag + '.focus()'); },
    dispatchEvent() { forbidden.push(tag + '.dispatchEvent()'); },
    fire(t, ev) { (this.listeners[t] || []).forEach((f) => f(ev)); },
  };
  Object.defineProperty(el, 'className', { get() { return el._class; }, set(v) { el._class = v; } });
  el.classList = {
    add(c) { if (!el._class.split(' ').includes(c)) el._class = (el._class + ' ' + c).trim(); },
    remove(c) { el._class = el._class.split(' ').filter((x) => x && x !== c).join(' '); },
    contains(c) { return el._class.split(' ').includes(c); },
    toggle(c, on) { if (on) el.classList.add(c); else el.classList.remove(c); },
  };
  return el;
}

function loadOverlay(opts) {
  opts = opts || {};
  const forbidden = [];
  const timers = [];
  const created = [];
  const doc = fakeEl('#document', forbidden);
  doc.hidden = !!opts.hidden;
  doc.body = fakeEl('BODY', forbidden);
  doc.documentElement = fakeEl('HTML', forbidden);
  doc.createElement = (t) => { const e = fakeEl(t.toUpperCase(), forbidden); created.push(e); return e; };
  doc.createElementNS = (ns, t) => { const e = fakeEl(t, forbidden); created.push(e); return e; };
  doc.querySelector = () => null;
  const win = {
    innerWidth: 1600, innerHeight: 1000, addEventListener() {},
    matchMedia: () => ({ matches: !!opts.reduce }),
  };
  const code = overlaySrc;
  new Function('window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'navigator',
    code)(win, doc, () => 1, () => {}, (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; },
    (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; }, {});
  assert.ok(win.LabPilotOverlay, 'overlay.js did not expose LabPilotOverlay');
  return { win, doc, forbidden, timers, created, O: win.LabPilotOverlay };
}

const TARGET_RECT = { left: 100, top: 200, width: 50, height: 20, right: 150, bottom: 220 };

check('the pointer glides from the last mouse position to the centre of the target', () => {
  const t = loadOverlay();
  assert.ok(t.O._ghost && typeof t.O._ghost.fly === 'function', 'LabPilotOverlay._ghost.fly is missing');
  t.doc.fire('mousemove', { clientX: 10, clientY: 20, timeStamp: 1000 });
  const target = fakeEl('BUTTON', t.forbidden, TARGET_RECT);
  t.O._ghost.fly(target);
  const g = t.O._ghost.el();
  assert.ok(g, 'no ghost element was created');
  assert.strictEqual(g.getAttribute('data-labpilot'), '1', 'ghost is not marked data-labpilot');
  assert.ok(g.parentNode && g.parentNode.id === 'labpilot-overlay-root',
    'ghost is not inside #labpilot-overlay-root');
  assert.strictEqual(g.style.opacity, '1', `ghost not shown: opacity ${g.style.opacity}`);
  // centre (125, 210) minus the arrow tip's offset inside the element
  assert.match(g.style.transform, /translate\(12\dpx,\s*20\dpx\)/, `did not land on the centre: ${g.style.transform}`);
  assert.match(g.style.transition, /transform/, `no transform transition set: "${g.style.transition}"`);
  assert.ok(g.style.transition.indexOf('left') < 0 && g.style.transition.indexOf('top') < 0,
    'it animates layout properties, not transform');
});

check('the target is never clicked, focused or sent an event', () => {
  const t = loadOverlay();
  t.doc.fire('mousemove', { clientX: 10, clientY: 20, timeStamp: 1000 });
  const target = fakeEl('BUTTON', t.forbidden, TARGET_RECT);
  t.O._ghost.fly(target);
  const g = t.O._ghost.el();
  g.fire('transitionend', { propertyName: 'transform' });
  g.fire('animationend', { animationName: 'lp-ghost-out' });
  assert.deepStrictEqual(t.forbidden, [], `the ghost cursor touched the page: ${t.forbidden.join(', ')}`);
  assert.deepStrictEqual(Object.keys(target.listeners), [], 'the ghost cursor attached listeners to the target');
});

check('arrival pulses once, the fade hides it, and the fallback timer is cleared', () => {
  const t = loadOverlay();
  t.doc.fire('mousemove', { clientX: 10, clientY: 20, timeStamp: 1000 });
  t.O._ghost.fly(fakeEl('BUTTON', t.forbidden, TARGET_RECT));
  const g = t.O._ghost.el();
  assert.ok(!g.classList.contains('lp-ghost-pulse'), 'pulsed before arriving');
  const pending = t.timers.filter((x) => !x.cleared);
  assert.strictEqual(pending.length, 1, `expected one one-shot fallback timer, found ${pending.length}`);
  g.fire('transitionend', { propertyName: 'transform' });
  assert.ok(g.classList.contains('lp-ghost-pulse'), 'no pulse on arrival');
  assert.ok(t.timers.every((x) => x.cleared), 'the fallback timer was left running after a real arrival');
  g.fire('animationend', { animationName: 'lp-ghost-ring' });
  assert.strictEqual(g.style.opacity, '1', 'hid on the ring animation instead of waiting for the fade');
  g.fire('animationend', { animationName: 'lp-ghost-out' });
  assert.strictEqual(g.style.opacity, '0', 'did not hide after the fade');
  assert.ok(!g.classList.contains('lp-ghost-pulse'), 'pulse class left on after hiding');
});

check('prefers-reduced-motion: no glide, straight to the pulse', () => {
  const t = loadOverlay({ reduce: true });
  t.doc.fire('mousemove', { clientX: 10, clientY: 20, timeStamp: 1000 });
  t.O._ghost.fly(fakeEl('BUTTON', t.forbidden, TARGET_RECT));
  const g = t.O._ghost.el();
  assert.match(g.style.transform, /translate\(12\dpx,\s*20\dpx\)/, `not placed on the target: ${g.style.transform}`);
  assert.ok(!/transform/.test(g.style.transition || ''), `a glide transition was set: "${g.style.transition}"`);
  assert.ok(g.classList.contains('lp-ghost-pulse'), 'no pulse under reduced motion');
});

check('a hidden tab gets nothing at all', () => {
  const t = loadOverlay({ hidden: true });
  t.doc.fire('mousemove', { clientX: 10, clientY: 20, timeStamp: 1000 });
  t.O._ghost.fly(fakeEl('BUTTON', t.forbidden, TARGET_RECT));
  const g = t.O._ghost.el();
  assert.ok(!g || g.style.opacity !== '1', 'the ghost cursor animated in a hidden tab');
  assert.strictEqual(t.timers.filter((x) => !x.cleared).length, 0, 'a timer was armed in a hidden tab');
});

check('mousemove tracking is throttled, not a stream', () => {
  const t = loadOverlay();
  t.doc.fire('mousemove', { clientX: 10, clientY: 20, timeStamp: 1000 });
  t.doc.fire('mousemove', { clientX: 500, clientY: 500, timeStamp: 1010 });   // 10 ms later: dropped
  assert.strictEqual(t.O._ghost.mouse.x, 10, `a 10 ms-later move was not throttled (x=${t.O._ghost.mouse.x})`);
  t.doc.fire('mousemove', { clientX: 300, clientY: 400, timeStamp: 1200 });   // 200 ms later: kept
  assert.strictEqual(t.O._ghost.mouse.x, 300);
});

check('overlay.hide() also hides the ghost', () => {
  const t = loadOverlay();
  t.doc.fire('mousemove', { clientX: 10, clientY: 20, timeStamp: 1000 });
  t.O._ghost.fly(fakeEl('BUTTON', t.forbidden, TARGET_RECT));
  t.O.hide();
  assert.strictEqual(t.O._ghost.el().style.opacity, '0', 'ghost still visible after hide()');
});

// =============================================================================================
// 2. PRE-FLIGHT SUMMARY
// =============================================================================================
console.log('\n=== PRE-FLIGHT SUMMARY ===\n');

// Same harness shape as pilot-test.js: pure logic, no DOM. document.querySelector is the one
// hook the pilot reads live (is an ask box open), so it is controllable here.
const askBox = { open: false };
function loadPilot(file, win) {
  const code = fs.readFileSync(path.join(SRC, file), 'utf8');
  const doc = {
    readyState: 'complete', addEventListener() {}, querySelectorAll: () => [],
    querySelector: (sel) => (askBox.open && /data-labpilot/.test(sel) ? {} : null),
    documentElement: {}, getElementById: () => null,
  };
  new Function('window', 'document', 'setTimeout', 'setInterval', 'MutationObserver', 'performance', 'location', 'history',
    code)(win, doc, () => 0, () => 0, function () { return { observe() {}, disconnect() {} }; },
    { now: () => Date.now() }, { href: 'https://portal.azure.com/' }, {});
  return win;
}

const win = {};
const said = [];
win.LabPilotRocky = { announce(text, opts) { said.push({ text, opts: opts || {} }); } };
loadPilot('world-model.js', win);
loadPilot('pilot.js', win);
const P = win.LabPilotPilot;

const B = (label) => ({ text: 'Select ' + label + '.', surface: 'browser', targets: [{ n: 1, label }] });
const V = (label, surface) => ({ text: 'Open ' + label + '.', surface, surfaceWhy: 'outside the browser', targets: [{ n: 1, label }] });

check('the summary builder exists and is pure', () => {
  assert.strictEqual(typeof P._summary, 'function', 'LabPilotPilot._summary is missing');
});

check('a browser-only lab: "N steps I can point at", nothing about the desktop', () => {
  const s = P._summary([B('Solutions'), B('Settings'), B('Save')]);
  assert.ok(s, 'no summary for three browser steps');
  assert.strictEqual(s.web, 3); assert.strictEqual(s.outside, 0);
  assert.strictEqual(s.text, 'This page has 3 steps I can point at.');
});

check('a mixed lab names the surfaces and promises to step back', () => {
  const s = P._summary([B('Publish'), V('Visual Studio Code', 'VS Code'), B('Data source'), V('Command Prompt', 'a terminal')]);
  assert.strictEqual(s.web, 2); assert.strictEqual(s.outside, 2);
  assert.strictEqual(s.text,
    'This page has 2 steps I can point at, and 2 that happen outside the browser (VS Code, a terminal), where I will say so and step back.');
});

check('singular grammar, and one outside step', () => {
  const s = P._summary([B('Publish'), V('Visual Studio Code', 'VS Code')]);
  assert.strictEqual(s.text,
    'This page has 1 step I can point at, and 1 that happens outside the browser (VS Code), where I will say so and step back.');
});

check('a page with nothing Rocky can see says so honestly', () => {
  const s = P._summary([V('Visual Studio Code', 'VS Code'), V('Notepad', 'a desktop application')]);
  assert.strictEqual(s.web, 0); assert.strictEqual(s.outside, 2);
  assert.match(s.text, /^This page has no steps I can point at/);
  assert.match(s.text, /VS Code, a desktop application/);
});

check('an empty guide produces no summary and no announcement', () => {
  assert.strictEqual(P._summary([]), null);
  assert.strictEqual(P._summary(undefined), null);
  const before = said.length;
  assert.strictEqual(P._preflight({ title: 'Empty', steps: [] }), false);
  assert.strictEqual(P._preflight(null), false);
  assert.strictEqual(said.length, before, 'Rocky announced a summary for an empty guide');
});

check('announced once per title, calmly, and never as a demand', () => {
  said.length = 0;
  const g = { title: 'Challenge 04: Insider Risk Detection for Departing Users', steps: [B('Solutions'), B('Settings'), B('Save'), B('Policies'), B('Create policy')] };
  assert.strictEqual(P._preflight(g), true, 'first ingest did not announce');
  assert.strictEqual(P._preflight(g), false, 'second ingest of the same title announced again');
  assert.strictEqual(P._preflight(g), false);
  assert.strictEqual(said.length, 1, `announced ${said.length} times for one title`);
  assert.strictEqual(said[0].text, 'This page has 5 steps I can point at.');
  assert.ok(!said[0].opts.demand, 'the summary was marked demand:true');
  assert.strictEqual(said[0].opts.mood, 'neutral', `mood was ${said[0].opts.mood}, expected calm`);
});

check('a different title is a new page and gets its own summary', () => {
  said.length = 0;
  assert.strictEqual(P._preflight({ title: 'Challenge 05', steps: [B('Alerts'), V('VS Code', 'VS Code')] }), true);
  assert.strictEqual(said.length, 1);
  assert.match(said[0].text, /1 step I can point at, and 1 that happens outside the browser/);
});

check('never over an open ask box: held, then said once when the box closes', () => {
  said.length = 0;
  askBox.open = true;
  assert.strictEqual(P._preflight({ title: 'Challenge 06', steps: [B('Home')] }), false, 'spoke over the ask box');
  assert.strictEqual(said.length, 0);
  assert.strictEqual(P._flushPreflight(), false, 'flushed while the box was still open');
  askBox.open = false;
  assert.strictEqual(P._flushPreflight(), true, 'did not say the held summary once the box closed');
  assert.strictEqual(P._flushPreflight(), false, 'said it twice');
  assert.strictEqual(said.length, 1);
  assert.strictEqual(P._preflight({ title: 'Challenge 06', steps: [B('Home')] }), false, 'the held title was not remembered as announced');
});

check('a flight in progress is not interrupted — announce() would cancel the glow reveal', () => {
  // LabPilotRocky.announce() sets state.pending = null, which discards the onArrive that
  // reveals the glow. So the pilot must not flush the summary within a flight's duration.
  said.length = 0;
  askBox.open = true;
  P._preflight({ title: 'Challenge 07', steps: [B('Home')] });
  askBox.open = false;
  P._state.lastPointAt = Date.now();                       // Rocky just took off
  assert.strictEqual(P._flushPreflight(), false, 'spoke during a flight');
  P._state.lastPointAt = Date.now() - 5000;                // long since landed
  assert.strictEqual(P._flushPreflight(), true);
  assert.strictEqual(said.length, 1);
});

check('start() announces from the guide it ingests, and a page turn announces the new title once', () => {
  said.length = 0;
  let onChange = null;
  const guide = { title: 'Challenge 08', page: 1, found: true, steps: [B('Solutions'), B('Policies')] };
  win.LabPilotGuide = { read: () => guide, onChange: (cb) => { onChange = cb; }, steps: () => guide };
  win.LabPilotPerceive = { onChange() {}, snapshot: () => ({ url: 'https://purview.microsoft.com/', title: 'Purview', controls: [] }) };
  win.LabPilotLabel = { resolveAny: () => ({ status: 'absent', reason: 'no-candidates' }) };
  win.LabPilotWorld.reset();
  const r = P.start();
  assert.ok(r && r.ok, `start() refused: ${r && r.why}`);
  assert.strictEqual(said.length, 1, `start() announced ${said.length} times`);
  assert.strictEqual(said[0].text, 'This page has 2 steps I can point at.');
  assert.ok(onChange, 'the pilot did not subscribe to guide changes');
  onChange(guide);                                          // same page re-read: silence
  assert.strictEqual(said.length, 1, 'a re-read of the same title announced again');
  onChange({ title: 'Challenge 09', page: 2, found: true, steps: [B('Alerts'), B('Cases'), B('Save')] });
  assert.strictEqual(said.length, 2, 'turning the page did not announce the new title');
  assert.strictEqual(said[1].text, 'This page has 3 steps I can point at.');
  onChange({ title: 'Challenge 09', page: 2, found: true, steps: [B('Alerts'), B('Cases'), B('Save')] });
  assert.strictEqual(said.length, 2, 'the new title was announced twice');
  P.stop();
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — the pointer only points, and Rocky says once what he can do here.\n`);
