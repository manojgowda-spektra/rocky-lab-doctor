/*
 * completion-engine-test.js — a world change completes a step; an action never does.
 *
 * THE RULE UNDER TEST:
 *     A learner action is evidence of ATTEMPT.
 *     A world change is evidence of COMPLETION.
 *
 * Everything Rocky got wrong this week came from conflating those, so these checks are mostly
 * about refusing things: refusing to call a pre-existing state a completion, refusing to let a
 * scroll look like a creation, refusing to call a slow provisioning step stuck, refusing to
 * treat "failed to save" as a save because it contains the word.
 *
 * The fixtures are the real announcements measured on the live lab:
 *   Purview  role=status "0 items" / "List loaded No data available" / grid aria-rowcount=1
 *   Purview  role=status "Failed to load data. Please try again later."
 *   Purview  role=alertdialog "Client Error  Looks like you don't have the right permissions"
 *   Azure    role=status "3 results found" / aria-live "Showing 1 - 3 of 3" / grid aria-rowcount="4"
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---- a DOM with live regions and grids, and a clock we control --------------------------------
function makeDom() {
  let clock = 1000;
  const nodes = [];
  let mutationCb = null;

  function el(spec) {
    const o = spec || {};
    const node = {
      nodeType: 1,
      tagName: (o.tag || 'div').toUpperCase(),
      attrs: Object.assign({}, o.attrs || {}),
      _text: o.text || '',
      kids: o.kids || [],
      get innerText() { return this._text; },
      set innerText(v) { this._text = v; },
      get textContent() { return this._text; },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      css: o.css || null,
      getBoundingClientRect() { return { width: o.hidden ? 0 : 400, height: o.hidden ? 0 : 200, top: 0, left: 0, right: 400, bottom: 200 }; },
      closest(sel) { return matches(this, sel) ? this : null; },
      matches(sel) { return matches(this, sel); },
      querySelectorAll(sel) { return this.kids.filter((k) => matches(k, sel)); },
      get parentElement() { return null; },
    };
    nodes.push(node);
    return node;
  }

  // A selector engine only as clever as these tests need.
  function matches(n, sel) {
    return String(sel).split(',').some((one) => {
      const s = one.trim();
      let m = s.match(/^\[([a-z-]+)="([^"]+)"\]$/);
      if (m) return n.getAttribute(m[1]) === m[2];
      m = s.match(/^\[([a-z-]+)\]$/);
      if (m) return n.getAttribute(m[1]) !== null;
      if (/^[a-z][a-z0-9]*$/.test(s)) return n.tagName === s.toUpperCase();   // h1/h2 have digits
      return false;
    });
  }

  const body = el({ tag: 'body' });
  const doc = {
    documentElement: el({ tag: 'html' }),
    body,
    querySelectorAll(sel) { return nodes.filter((n) => n !== body && matches(n, sel)); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
  };
  const win = {
    // Per node, so a list hidden by STYLE can be told apart from one that merely has no box.
    getComputedStyle: (n) => (n && n.css) || { visibility: 'visible', display: 'block', opacity: '1' },
    MutationObserver: function (cb) {
      mutationCb = cb;
      return { observe() {}, disconnect() { mutationCb = null; } };
    },
    performance: { now: () => clock },
    location: { href: 'https://purview.microsoft.com/insiderriskmgmt/policiespage' },
  };
  return {
    doc, win, el, body,
    add(spec) { const n = el(spec); return n; },
    setBodyText(t) { body._text = t; },
    // Announce: change a live region's text and fire the observer, exactly as a portal does.
    announce(node, text) { node._text = text; if (mutationCb) mutationCb([{ target: node }]); },
    /*
     * ATTACH: the OTHER way a portal announces something — build the toast complete with its
     * text and append the finished thing. The mutation record's target is then the PARENT, and
     * the live region is only in addedNodes. announce() above could never produce this shape,
     * which is why the gap survived 28 passing tests.
     */
    attach(parent, node) { parent.kids.push(node); if (mutationCb) mutationCb([{ target: parent, addedNodes: [node] }]); },
    tick(ms) { clock += (ms || 1); },
  };
}

function load(dom) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'completion.js'), 'utf8');
  const win = Object.assign({}, dom.win);
  new Function('window', 'document', 'getComputedStyle', 'MutationObserver', 'performance', 'location', code)(
    win, dom.doc, dom.win.getComputedStyle, dom.win.MutationObserver, dom.win.performance, dom.win.location);
  return win.LabPilotCompletion;
}

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}

const grid = (dom, rowcount, rendered) => dom.add({
  attrs: { role: 'grid', 'aria-label': 'Policies', 'aria-rowcount': String(rowcount) },
  kids: Array.from({ length: rendered == null ? rowcount : rendered }, () => dom.el({ attrs: { role: 'row' } })),
});
const status = (dom, text) => dom.add({ attrs: { role: 'status' }, text: text || '' });

console.log('\n=== A WORLD CHANGE COMPLETES; AN ACTION DOES NOT ===\n');

// ---- the core refusal --------------------------------------------------------------------
check('a list that ALREADY had rows is not a completion', () => {
  /*
   * The pre-seeded tenant case, and the second-visit case. "The policy list has one row" is a
   * state. Only "it went from N to more than N while I was watching" is a completion.
   */
  const dom = makeDom();
  const C = load(dom);
  grid(dom, 3);
  C.baseline();
  const v = C.verdict();
  assert.strictEqual(v.world.length, 0,
    `a list that was already populated reported ${JSON.stringify(v.world)} as a world change`);
});

check('a list GROWING is a completion, and it is marked as declared', () => {
  const dom = makeDom();
  const C = load(dom);
  const g = grid(dom, 1);
  C.baseline();
  g.setAttribute('aria-rowcount', '2');
  const v = C.verdict();
  const grew = v.world.filter((w) => w.kind === 'list-grew');
  assert.strictEqual(grew.length, 1, `expected one list-grew, got ${JSON.stringify(v.world)}`);
  assert.strictEqual(grew[0].from, 1);
  assert.strictEqual(grew[0].to, 2);
  assert.strictEqual(grew[0].declared, true, 'a count both sides declared was not marked trustworthy');
  assert.strictEqual(v.strong.length, 1, 'a declared cardinality change was not counted as strong evidence');
});

check('SCROLLING a virtualised list is not a creation', () => {
  /*
   * Fluent and Ibiza render only the visible rows. If rendered rows were the measure, scrolling
   * a 40-row list would look exactly like creating rows. aria-rowcount is the declared total and
   * does not move when the learner scrolls.
   */
  const dom = makeDom();
  const C = load(dom);
  const g = grid(dom, 40, 12);          // 40 declared, 12 rendered
  C.baseline();
  for (let i = 0; i < 8; i++) g.kids.push(dom.el({ attrs: { role: 'row' } }));   // scrolled into view
  const v = C.verdict();
  assert.strictEqual(v.world.length, 0,
    `scrolling produced ${JSON.stringify(v.world)} — a scroll would read as a creation`);
});

check('a list with NO declared count still reports, but is not strong evidence', () => {
  const dom = makeDom();
  const C = load(dom);
  const g = dom.add({ attrs: { role: 'list', 'aria-label': 'Things' }, kids: [dom.el({ attrs: { role: 'listitem' } })] });
  C.baseline();
  g.kids.push(dom.el({ attrs: { role: 'listitem' } }));
  const v = C.verdict();
  assert.strictEqual(v.world.length, 1, 'an undeclared list change was dropped entirely');
  assert.strictEqual(v.world[0].declared, false, 'a rendered-row count was presented as trustworthy');
  assert.strictEqual(v.strong.length, 0, 'a rendered-row count was counted as strong evidence');
});

// ---- announcements: the channel that is transient ------------------------------------------
check('an announcement made and REMOVED is still caught — polling would miss it', () => {
  /*
   * The measured reason this engine watches instead of sampling: a toast lives for a second or
   * two and a 1 Hz poll walks straight past it.
   */
  const dom = makeDom();
  const C = load(dom);
  const toast = status(dom, '');
  C.baseline();
  dom.announce(toast, 'Policy created successfully');
  dom.announce(toast, '');                        // the portal removes it again
  const v = C.verdict();
  const ok = v.world.filter((w) => w.kind === 'announced-success');
  assert.strictEqual(ok.length, 1, `the announcement was lost: ${JSON.stringify(v)}`);
  assert.match(ok[0].text, /created/i);
});

check('"Failed to load data" is a FAILURE, even though it contains no success word', () => {
  const dom = makeDom();
  const C = load(dom);
  const s = status(dom, '');
  C.baseline();
  dom.announce(s, 'Failed to load data. Please try again later.');
  const v = C.verdict();
  assert.strictEqual(v.failure.length, 1, `expected a failure, got ${JSON.stringify(v)}`);
  assert.strictEqual(v.world.length, 0, 'a failure was also counted as a world change that could complete a step');
});

check('the permissions alertdialog measured on Purview is a failure, and assertive', () => {
  const dom = makeDom();
  const C = load(dom);
  const a = dom.add({ attrs: { role: 'alertdialog' }, text: '' });
  C.baseline();
  dom.announce(a, "Client Error  Looks like you don't have the right permissions");
  const v = C.verdict();
  assert.strictEqual(v.failure.length, 1, `expected a failure, got ${JSON.stringify(v)}`);
  assert.strictEqual(v.failure[0].assertive, true, 'an alertdialog was treated as a polite status line');
});

check('"failed to save" is a failure, not a save — failure is tested first for this reason', () => {
  const dom = makeDom();
  const C = load(dom);
  assert.strictEqual(C._classify('Failed to save the policy'), 'failure');
  assert.strictEqual(C._classify('Policy saved'), 'success');
  assert.strictEqual(C._classify('Saving...'), 'busy');
});

check('the same text announced repeatedly is ONE announcement', () => {
  // Portals rewrite a live region on every render. Thirty identical writes are not thirty events.
  const dom = makeDom();
  const C = load(dom);
  const s = status(dom, '');
  C.baseline();
  for (let i = 0; i < 30; i++) dom.announce(s, 'Policy created');
  const v = C.verdict();
  assert.strictEqual(v.world.filter((w) => w.kind === 'announced-success').length, 1,
    'a re-rendered live region produced one event per render');
});

check('an empty live region is not news', () => {
  const dom = makeDom();
  const C = load(dom);
  const s = status(dom, '');
  C.baseline();
  dom.announce(s, '   ');
  assert.strictEqual(C.announcements().length, 0, 'whitespace was recorded as an announcement');
});

// ---- busy: why a slow step is not a stuck step ----------------------------------------------
check('a page that says it is BUSY is not settled, and busy is not completion', () => {
  /*
   * A provisioning step that announces "in progress" is behaving correctly. Calling it stuck is
   * the single most annoying thing Rocky can do, and the page has told us not to.
   */
  const dom = makeDom();
  const C = load(dom);
  const s = status(dom, '');
  C.baseline();
  dom.announce(s, 'Creating policy, please wait');
  const v = C.verdict();
  assert.strictEqual(v.settled, false, 'a page announcing work in progress was treated as settled');
  assert.strictEqual(v.world.length, 0, '"please wait" was counted as a completion');
  assert.strictEqual(v.busy.length, 1);
});

// ---- empty state -------------------------------------------------------------------------
check('empty-state copy CLEARING is a completion, with no counting at all', () => {
  const dom = makeDom();
  const C = load(dom);
  dom.setBodyText('No policies yet. Get started by creating one.');
  C.baseline();
  dom.setBodyText('Departing users policy   Active   12 users in scope');
  const v = C.verdict();
  const cleared = v.world.filter((w) => w.kind === 'empty-state-cleared');
  assert.ok(cleared.length >= 1, `empty state clearing was not detected: ${JSON.stringify(v.world)}`);
  assert.ok(v.strong.length >= 1, 'empty-state clearing should be strong evidence — it needs no row count');
});

// ---- movement is not completion --------------------------------------------------------------
check('a dialog opening or closing is MOVEMENT, never completion', () => {
  /*
   * A wizard closing happens on Cancel exactly as much as on Create. Treating it as completion
   * would mark a step done for a learner who gave up on it.
   */
  const dom = makeDom();
  const C = load(dom);
  C.baseline();
  dom.add({ attrs: { role: 'dialog', 'aria-label': 'New insider risk policy' } });
  const v = C.verdict();
  assert.strictEqual(v.world.length, 0, 'opening a dialog was counted as a world change');
  assert.strictEqual(v.moved.length, 1);
  assert.strictEqual(v.moved[0].kind, 'dialog-opened');
});

check('a heading change is MOVEMENT, never completion', () => {
  const dom = makeDom();
  const C = load(dom);
  const h = dom.add({ tag: 'h1', text: 'Policies' });
  C.baseline();
  h.innerText = 'New insider risk policy';
  const v = C.verdict();
  assert.strictEqual(v.world.length, 0, 'navigating to another page was counted as completing something');
  assert.ok(v.moved.some((m) => m.kind === 'heading-changed'));
});

// ---- idempotency and hygiene -------------------------------------------------------------
check('the same world state read thirty times is still one change', () => {
  const dom = makeDom();
  const C = load(dom);
  const g = grid(dom, 1);
  C.baseline();
  g.setAttribute('aria-rowcount', '2');
  let last = null;
  for (let i = 0; i < 30; i++) last = C.verdict();
  assert.strictEqual(last.world.filter((w) => w.kind === 'list-grew').length, 1,
    'staring at a changed page multiplied one completion into many');
});

check('with no baseline, nothing is ever claimed', () => {
  const dom = makeDom();
  const C = load(dom);
  grid(dom, 5);
  const v = C.verdict();
  assert.strictEqual(v.world.length, 0, 'a judgement was made with nothing to compare against');
});

check('a list that DELETED rows is reported too — deleting is a step in plenty of labs', () => {
  const dom = makeDom();
  const C = load(dom);
  const g = grid(dom, 5);
  C.baseline();
  g.setAttribute('aria-rowcount', '4');
  const v = C.verdict();
  assert.strictEqual(v.world.filter((w) => w.kind === 'list-shrank').length, 1,
    'a deletion produced no world change');
});

check('one logical list seen through two roles is counted ONCE', () => {
  /*
   * WHAT I FIRST WROTE HERE WAS NOT REACHABLE. Measured on Purview, one policy list matched my
   * PROBE's selector three times — a div wrapper, the role="grid", and a role="presentation"
   * sibling. So I reproduced that shape. But the engine's LIST_SEL is narrower than the probe's
   * was: a bare div and role="presentation" match neither, so those two never reach lists() and
   * the de-duplication was never exercised. The check passed while the code it named did
   * nothing, and a mutation that removed de-duplication entirely still passed.
   *
   * The case that IS reachable is a list role nested inside a grid role sharing one accessible
   * name — Fluent does this, the outer carries aria-rowcount and the inner does not. Without
   * de-duplication that is one creation reported twice, once from the untrustworthy count.
   */
  const dom = makeDom();
  const C = load(dom);
  const row = () => dom.el({ attrs: { role: 'row' } });
  const outer = dom.add({ attrs: { role: 'grid', 'aria-label': 'Policies', 'aria-rowcount': '1' }, kids: [row()] });
  const inner = dom.add({ attrs: { role: 'list', 'aria-label': 'Policies' }, kids: [row()] });
  C.baseline();
  outer.setAttribute('aria-rowcount', '2');
  inner.kids.push(row());
  const v = C.verdict();
  assert.strictEqual(v.world.length, 1,
    `one list seen through two roles produced ${v.world.length} changes: ${JSON.stringify(v.world)}`);
  assert.strictEqual(v.world[0].declared, true,
    'the reading that survived was the one with no declared count');
});

check('the snapshot stays inside the hot-path budget on a REALISTIC page', () => {
  /*
   * Sized from measurement, not imagination. The busiest page tested — Purview's Insider Risk
   * policies page — carried three list-shaped nodes and seven live regions; Azure's Resource
   * groups blade carried one grid, one list and four live regions. Six and ten is comfortably
   * above both.
   *
   * The first version of this check used FORTY grids and asserted the same 5 ms hot-path
   * budget. It measured 3.4-3.7 ms and failed once on a loaded machine, which is the definition
   * of a flaky gate: a stress fixture judged against a hot-path number. The stress case is kept
   * below, with a ceiling that suits it.
   */
  const dom = makeDom();
  const C = load(dom);
  for (let i = 0; i < 6; i++) grid(dom, i);
  for (let i = 0; i < 10; i++) status(dom, 'region ' + i);
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) C.snapshot();
  const per = (Date.now() - t0) / 200;
  console.log(`         ${per.toFixed(3)} ms per snapshot, 6 lists + 10 live regions (Purview measured 3 + 7)`);
  assert.ok(per < 5, `${per} ms per snapshot — over the 5 ms hot-path budget`);
});

check('it degrades gracefully on an absurd page rather than falling off a cliff', () => {
  // Forty lists is not a real portal page. This is here to catch an accidental O(n^2), not to
  // police the hot path, so the ceiling is generous and deliberately different from the one above.
  const dom = makeDom();
  const C = load(dom);
  for (let i = 0; i < 40; i++) grid(dom, i);
  for (let i = 0; i < 30; i++) status(dom, 'region ' + i);
  const t0 = Date.now();
  for (let i = 0; i < 50; i++) C.snapshot();
  const per = (Date.now() - t0) / 50;
  console.log(`         ${per.toFixed(2)} ms per snapshot on 40 lists + 30 live regions (stress, not realistic)`);
  assert.ok(per < 25, `${per} ms on the stress fixture — that is superlinear, not slow`);
});

check('it runs in a child frame — the Azure grid and live regions are not in the top frame', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'completion.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/LabPilotFrame/.test(code),
    'completion.js is top-frame gated, so on Azure it would watch the shell and miss the blade entirely');
});

// ---- three defects that ONLY a live portal revealed ------------------------------------------
check('a cardinality announced in WORDS is a completion — the Azure signal', () => {
  /*
   * Measured on the live Azure blade, in order, as the list loaded:
   *   "0 results found" -> "Showing 1 - 0 of 0" -> "3 results found" -> "Showing 1 - 3 of 3"
   * None contains a success word, so all four classified as "other" and the strongest signal
   * Azure produces was being thrown away. Azure's grid reports ZERO SIZE inside its blade frame,
   * so the DOM path finds nothing there either — this announcement is all there is.
   */
  const dom = makeDom();
  const C = load(dom);
  const s2 = status(dom, '');
  dom.announce(s2, '0 results found');
  C.baseline();
  dom.announce(s2, '3 results found');
  const v = C.verdict();
  const grew = v.world.filter((w) => w.kind === 'count-grew');
  assert.strictEqual(grew.length, 1, `the announced count change was missed: ${JSON.stringify(v)}`);
  assert.strictEqual(grew[0].from, 0);
  assert.strictEqual(grew[0].to, 3);
  assert.strictEqual(grew[0].declared, true, 'a count the portal stated was not treated as declared');
});

check('"Showing 1 - 50 of 200" reads the TOTAL, not the page', () => {
  const dom = makeDom();
  const C = load(dom);
  assert.strictEqual(C._countIn('Showing 1 - 50 of 200. Display count: auto'), 200);
  assert.strictEqual(C._countIn('Showing 1 - 0 of 0. Display count: 100 '), 0);
  assert.strictEqual(C._countIn('3 results found'), 3);
  assert.strictEqual(C._countIn('1,204 items'), 1204, 'a thousands separator broke the parse');
  assert.strictEqual(C._countIn('nothing numeric here'), null);
});

check('"Loading 0 results" is BUSY, not an empty answer', () => {
  // Busy must outrank count, or a page still fetching reads as a page that found nothing.
  const dom = makeDom();
  const C = load(dom);
  assert.strictEqual(C._classify('Loading 0 results'), 'busy');
  assert.strictEqual(C._classify('3 results found'), 'count');
});

check('a list with NO usable viewport is still read — the Azure blade reports 0x0', () => {
  /*
   * Measured: the Resource groups grid declares aria-rowcount="4" and reports width 0, height 0,
   * because a cross-origin child frame is laid out by a parent it cannot see. A size test
   * rejected the single most important list on the portal. Where there is no viewport of our
   * own, size means nothing and only the style checks may speak.
   */
  const dom = makeDom();
  dom.win.innerWidth = 0; dom.win.innerHeight = 0;         // a degenerate child-frame viewport
  const C = load(dom);
  const g = dom.add({
    attrs: { role: 'grid', 'aria-label': 'Resource groups', 'aria-rowcount': '1' },
    hidden: true,                                          // getBoundingClientRect -> 0x0
  });
  C.baseline();
  g.setAttribute('aria-rowcount', '4');
  const v = C.verdict();
  assert.strictEqual(v.world.filter((w) => w.kind === 'list-grew').length, 1,
    `a zero-sized grid in a viewport-less frame was skipped: ${JSON.stringify(v.world)}`);
});

check('a list hidden by STYLE is still skipped — fail-open is not "never check"', () => {
  /*
   * Dropping geometry must not become "read everything". The rule is precise: a list's own BOX
   * says nothing (the Azure grid is 0x0 with four rows), but display:none, visibility:hidden
   * and opacity:0 still mean hidden and are still honoured.
   */
  const dom = makeDom();
  const C = load(dom);
  const g = dom.add({
    attrs: { role: 'grid', 'aria-label': 'Hidden', 'aria-rowcount': '1' },
    css: { visibility: 'hidden', display: 'block', opacity: '1' },
  });
  C.baseline();
  g.setAttribute('aria-rowcount', '9');
  assert.strictEqual(C.verdict().world.length, 0,
    'a list with visibility:hidden was read, so the style check is not being applied at all');
});

check('an EMPTY list with no declared count is not a list worth tracking', () => {
  // Portals ship empty list containers that never populate. Tracking them adds noise and a
  // baseline entry that can only ever produce a spurious "appeared".
  const dom = makeDom();
  const C = load(dom);
  dom.add({ attrs: { role: 'list', 'aria-label': 'Never used' } });
  const snap = C.snapshot();
  assert.strictEqual(Object.keys(snap.lists).length, 0,
    `an empty undeclared list was tracked: ${JSON.stringify(snap.lists)}`);
});

check('the empty-state scan does not force layout', () => {
  /*
   * It read innerText of the whole body, and innerText forces a reflow. Measured on the live
   * Purview policies page that made one snapshot cost 10.8 ms against a 5 ms budget, paid on
   * every observation forever. textContent needs no layout.
   */
  const code = fs.readFileSync(path.join(__dirname, '..', 'webext', 'content', 'completion.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fn = code.slice(code.indexOf('function emptyStates'), code.indexOf('function dialogs'));
  assert.ok(/textContent/.test(fn), 'emptyStates no longer uses textContent');
  assert.ok(!/innerText/.test(fn), 'emptyStates reads innerText, which forces a reflow on every observation');
});

check('a live region that arrives ALREADY FULL is still heard', () => {
  /*
   * MEASURED ON THE LIVE AZURE PORTAL. An error was provoked and nothing reached Position.
   *
   * The observer read records[i].target, which for an appendChild is the PARENT — so a portal
   * that attaches a finished `div[role=alert]` produced one record whose target was <body>,
   * and body.closest(LIVE_SEL) is null. The announcement vanished. The failures that matter
   * most are exactly the ones delivered this way: Azure's measured permission error is a
   * role=alertdialog that appears when it happens.
   */
  const dom = makeDom();
  const C = load(dom);
  C.start();
  const toast = dom.el({
    attrs: { role: 'alert' },
    text: "Client Error - Looks like you don't have the right permissions to do this",
  });
  dom.attach(dom.body, toast);
  const said = C.announcements(60000);
  const hit = said.find((a) => /right permissions/.test(a.text));
  assert.ok(hit, 'an appended live region was never heard: ' + JSON.stringify(said.map((x) => x.text)));
  assert.strictEqual(hit.kind, 'failure', 'heard, but not as a failure');
  assert.strictEqual(hit.assertive, true, 'role=alert is assertive by definition');
});

check('a live region nested inside an attached subtree is heard', () => {
  // React portals mount a wrapper, not a bare region: <div class="toast-host"><div role=status>
  const dom = makeDom();
  const C = load(dom);
  C.start();
  const inner = dom.el({ attrs: { role: 'status' }, text: 'Policy created successfully' });
  const wrapper = dom.el({ attrs: { class: 'toast-host' }, kids: [inner] });
  dom.attach(dom.body, wrapper);
  const said = C.announcements(60000);
  assert.ok(said.some((a) => /Policy created/.test(a.text)),
    'a region one level inside the attached node was missed');
});

check('attaching something that is not a live region stays silent', () => {
  // The fix must not turn every appendChild on a busy portal into an announcement.
  const dom = makeDom();
  const C = load(dom);
  C.start();
  const plain = dom.el({ attrs: { class: 'row' }, text: 'Just another table row of content here' });
  dom.attach(dom.body, plain);
  assert.strictEqual(C.announcements(60000).length, 0,
    'an ordinary node was treated as an announcement');
});

check('Purview\'s own "not assigned to a role group" is heard as a FAILURE', () => {
  /*
   * VERBATIM from test/traces/purview-irm-walk.trace.json, recorded on the live portal. It was
   * classified "other", which meant the most common lab defect of all — the account has not got
   * the role — produced a portal announcement Rocky heard and then ignored.
   */
  const dom = makeDom();
  const C = load(dom);
  C.start();
  const region = dom.el({ attrs: { role: 'status' }, text: "Attention: You currently aren't assigned to a role group that allows you to view alerts." });
  dom.announce(region, "Attention: You currently aren't assigned to a role group that allows you to view alerts.");
  const hit = C.announcements(60000).find((a) => /role group/.test(a.text));
  assert.ok(hit, 'the role-group warning was not heard at all');
  assert.strictEqual(hit.kind, 'failure', 'heard, but filed as "' + hit.kind + '" rather than failure');
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — only the world completes a step.\n`);
