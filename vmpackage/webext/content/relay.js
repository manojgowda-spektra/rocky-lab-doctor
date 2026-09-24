/*
 * LabPilot RELAY — the child frames know what happened; the top frame has to hear it.
 *
 * WHY THIS EXISTS, MEASURED ON THE LIVE AZURE PORTAL.
 *
 *   portal.azure.com          (top frame)    the blade route in the hash, the heading, the
 *                                            breadcrumb, the portal shell. WHERE the learner is.
 *   sandbox-1.reactblade      (child frame,  the command bar, the grid with aria-rowcount, and
 *   .portal.azure.net         cross-origin)  every live region. WHAT HAPPENED.
 *
 * Neither frame can see the other. A cross-origin child cannot read its parent's DOM, and the
 * parent cannot read the child's. So Rocky has both halves of the truth and no way to put them
 * together — position in one frame, completion in the other, and a step is only complete when
 * you know both.
 *
 * THE TRANSPORT, AND TWO THAT WERE REJECTED.
 *
 * NOT postMessage. Any script on the page can call window.parent.postMessage, so a completion
 * would be forgeable by the very page Rocky is watching — and "the policy was created" is
 * precisely the claim worth injecting, because it makes Rocky tell the learner to move on.
 * There is no shared secret available either: a cross-origin child cannot be handed a nonce
 * except over the same forgeable channel.
 *
 * NOT chrome.runtime through the service worker. That was built first and it does work — on a
 * clean profile the worker receives the event and chrome.tabs is available to forward it. It
 * was abandoned because it depends on the worker being the code you just wrote, and in
 * development it frequently is not: with --load-extension and a persisted profile, restarting
 * the browser reloads the content scripts and the manifest while leaving the OLD service worker
 * registered. Measured repeatedly, including after bumping the manifest version. Nothing
 * errors — the worker answers the messages it always answered and silently ignores the new
 * ones. A transport whose failure mode is "does nothing, silently, in exactly the environment
 * you test in" is the wrong foundation for the component that carries every completion signal.
 *
 * chrome.storage.local, which is what this uses. Extension-only, so the page cannot forge it.
 * chrome.storage.onChanged fires in every frame of every tab running the extension, so no
 * worker logic sits in the path at all — the browser serves it. And this codebase already
 * relies on exactly this mechanism for cross-tab guide sharing, with a suite behind it, so it
 * is a proven path here rather than a fresh bet.
 *
 * THE COST, STATED PLAINLY: storage is global to the browser, so two labs open in two tabs would
 * hear each other. The guide-sharing code already assumes one lab per browser for the same
 * reason, so this adds no new limitation — but it IS one, and when Rocky has to support two
 * concurrent labs this is one of the places that must change.
 *
 * WHAT IS SENT, AND WHAT IS NOT. Only completion-shaped facts: an announcement the portal made,
 * a list cardinality that changed, a dialog that opened or closed. Never page content, never
 * form values, never anything the learner typed. Each event carries the frame's origin so the
 * top frame can tell the Azure blade apart from an auth iframe.
 *
 * THE TOP FRAME AGGREGATES, AND MUST DE-DUPLICATE. Several frames can report the same thing —
 * Azure has two blade frames, one of which is empty plumbing — and a frame re-reports on every
 * tick. Events are keyed by (frame, kind, payload) and collapsed.
 *
 * window.LabPilotRelay:
 *   publish(event)          child frame -> top frame. No-op in the top frame.
 *   events(sinceMs)         top frame: everything heard, newest last
 *   frames()                top frame: which frames have ever reported, and what they carry
 *   onEvent(fn)             top frame: subscribe
 *   start()                 begin. Child frames poll their own completion engine; the top
 *                           frame listens.
 */
(function () {
  "use strict";
  if (window.LabPilotRelay) return;

  var F = window.LabPilotFrame || { isTop: true, ownsUI: true };

  // How often a child frame looks for something worth reporting. Perception runs about once a
  // second; a completion is a human-scale event and nothing is lost by matching that. The
  // announcement ring inside completion.js is populated by a MutationObserver, so a toast that
  // appears and vanishes between ticks is still caught — this interval only controls how
  // promptly it is forwarded, not whether it is seen.
  var TICK_MS = 1000;
  // Events older than this are dropped from the top frame's log. Long enough to correlate a
  // completion with the action that caused it, short enough that a long lab does not grow
  // without bound.
  var LOG_TTL_MS = 10 * 60 * 1000;
  var LOG_MAX = 400;

  var log = [];             // top frame only
  var subs = [];            // top frame only
  var seen = Object.create(null);
  var frameSeen = Object.create(null);
  var timer = 0;
  var started = false;

  function originOf() {
    try { return location.origin + location.pathname.slice(0, 40); } catch (e) { return "?"; }
  }

  /*
   * THE EVENT KEY, and why the timestamp is not in it.
   *
   * A child frame re-reads its own state every tick, so the same unchanged fact is offered over
   * and over. Keying on (frame, kind, the payload that identifies it) collapses those into one.
   * Including a timestamp would defeat the entire purpose — every repeat would look new, and
   * the top frame would see one completion as sixty.
   */
  function keyOf(e) {
    // An ACTION is a one-off, not a state. Two clicks on the same Refresh button are two
    // separate things the learner did, and collapsing them would erase a step boundary — so
    // the timestamp belongs in the key for actions, and nowhere else.
    if (e.kind === "action") return ["action", e.frame, e.name || "", e.t].join("│");
    return [e.frame, e.kind, e.name || "", e.text || "", e.from == null ? "" : e.from,
            e.to == null ? "" : e.to].join("│");
  }

  function record(e) {
    var k = keyOf(e);
    if (seen[k]) { seen[k].lastSeen = Date.now(); seen[k].repeats++; return null; }
    e.t = e.t || Date.now();
    e.repeats = 1;
    e.lastSeen = e.t;
    seen[k] = e;
    log.push(e);
    frameSeen[e.frame] = frameSeen[e.frame] || { first: e.t, kinds: {} };
    frameSeen[e.frame].kinds[e.kind] = (frameSeen[e.frame].kinds[e.kind] || 0) + 1;
    frameSeen[e.frame].last = e.t;
    prune();
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](e); } catch (x) { /* a bad subscriber must not stop the relay */ }
    }
    return e;
  }

  function prune() {
    var cut = Date.now() - LOG_TTL_MS;
    while (log.length && (log[0].t < cut || log.length > LOG_MAX)) {
      var gone = log.shift();
      delete seen[keyOf(gone)];
    }
  }

  // ---- child frame: find what is worth telling the top frame --------------------------------
  var lastCounts = null;
  var lastDialogs = null;
  var lastAnnounceAt = 0;

  function harvest() {
    var C = window.LabPilotCompletion;
    if (!C) return [];
    var out = [];
    var frame = originOf();

    // Announcements: already event-shaped, already timestamped, already de-duplicated in the
    // ring. Forward only the ones newer than the last forwarded.
    var said = C.announcements(5 * 60 * 1000);
    for (var i = 0; i < said.length; i++) {
      if (said[i].t <= lastAnnounceAt) continue;
      out.push({
        kind: "announce", frame: frame, t: said[i].t,
        klass: said[i].kind, assertive: !!said[i].assertive,
        text: said[i].text, count: said[i].count == null ? null : said[i].count,
      });
    }
    if (said.length) lastAnnounceAt = Math.max(lastAnnounceAt, said[said.length - 1].t);

    // List cardinality: report the CHANGE, not the state. The top frame is not interested in
    // "there is a list with four rows"; it is interested in "a list went from one to four".
    var snap = C.snapshot();
    if (lastCounts) {
      for (var key in snap.lists) {
        var before = lastCounts[key];
        if (!before) continue;
        var b0 = before.declared === null ? before.rendered : before.declared;
        var a0 = snap.lists[key].declared === null ? snap.lists[key].rendered : snap.lists[key].declared;
        if (a0 === b0) continue;
        out.push({
          kind: a0 > b0 ? "list-grew" : "list-shrank", frame: frame, t: Date.now(),
          name: String(key).slice(0, 40), from: b0, to: a0,
          declared: before.declared !== null && snap.lists[key].declared !== null,
        });
      }
    }
    lastCounts = snap.lists;

    // Dialogs opening and closing: movement, forwarded because the top frame cannot see it and
    // a wizard opening inside a blade is genuinely useful context.
    var nowD = snap.dialogs.join("│");
    if (lastDialogs !== null && nowD !== lastDialogs) {
      var beforeList = lastDialogs ? lastDialogs.split("│") : [];
      for (var d = 0; d < snap.dialogs.length; d++) {
        if (beforeList.indexOf(snap.dialogs[d]) < 0) {
          out.push({ kind: "dialog-opened", frame: frame, t: Date.now(), name: snap.dialogs[d] });
        }
      }
      for (var d2 = 0; d2 < beforeList.length; d2++) {
        if (snap.dialogs.indexOf(beforeList[d2]) < 0) {
          out.push({ kind: "dialog-closed", frame: frame, t: Date.now(), name: beforeList[d2] });
        }
      }
    }
    lastDialogs = nowD;

    return out;
  }

  /*
   * EACH FRAME WRITES TO ITS OWN KEY.
   *
   * One shared key would be a read-modify-write from several frames at once, and two frames
   * publishing in the same tick would silently lose an event. On Azure there are two blade
   * frames, so that is the normal case rather than the unlucky one. Per-frame keys cannot
   * contend. The random suffix is there because two frames can share an origin and a path.
   *
   * The whole outbox is rewritten each time rather than appended to, so the top frame always
   * sees a complete recent history even if it started late or missed a change event. record()
   * de-duplicates, so re-reading the same entries costs nothing.
   */
  var MY_KEY = "lpFrameEvents:" + originOf() + ":" + Math.random().toString(36).slice(2, 8);
  var outbox = [];

  function publish(e) {
    if (F.isTop) { record(e); return; }
    outbox.push(e);
    if (outbox.length > 30) outbox = outbox.slice(-30);
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
      var patch = {};
      patch[MY_KEY] = outbox;
      chrome.storage.local.set(patch);
    } catch (x) { /* storage unavailable; the next tick rewrites the whole outbox */ }
  }

  function tick() {
    var found;
    try { found = harvest(); } catch (e) { found = []; }
    for (var i = 0; i < found.length; i++) publish(found[i]);
  }

  // ---- top frame: listen ---------------------------------------------------------------------
  function take(list) {
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      // Shape, not trust. Storage is extension-only so nothing hostile reaches here, but a
      // malformed entry from an older build should be skipped rather than recorded as an event.
      if (!e || typeof e.kind !== "string" || typeof e.frame !== "string") continue;
      record(e);                                 // record() de-duplicates; re-reads are free
    }
  }

  function listen() {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
      // Whatever was written before this frame began listening. A child frame can be running
      // well before the top frame's scripts are, and its news must not be lost to the race.
      chrome.storage.local.get(null, function (all) {
        if (!all) return;
        for (var k in all) if (k.indexOf("lpFrameEvents:") === 0) take(all[k]);
      });
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local" || !changes) return;
        for (var k2 in changes) {
          if (k2.indexOf("lpFrameEvents:") !== 0) continue;
          take(changes[k2].newValue);
        }
      });
    } catch (x) { /* not an extension context */ }
  }

  /*
   * CLICKS CROSS THE FRAME BOUNDARY TOO.
   *
   * Measured on the live Azure portal: every meaningful control — Create, Refresh, Export to
   * CSV, the grid itself — is in the cross-origin blade frame. A click listener on the top
   * frame's document never sees any of them, so a recording of an Azure workflow captured
   * THREE successful clicks and reported zero actions. Without an action there is no step
   * boundary, and without a boundary the whole derivation has nothing to attribute outcomes to.
   *
   * A click is also the only direct evidence of INTENT in the entire system, so losing it on
   * the portal with the weakest place signal is the worst possible place to lose it.
   */
  function clickRegion(el) {
    try {
      if (!el || !el.closest) return "main";
      if (el.closest('[role="dialog"],[role="alertdialog"],dialog')) return "dialog";
      if (el.closest('[role="menu"],[role="listbox"],[role="menubar"],[role="tree"]')) return "menu";
      if (el.closest('[role="tablist"]')) return "tab";
      if (el.closest('nav,[role="navigation"]')) return "nav";
      if (el.closest('[role="banner"],header')) return "banner";
      if (el.closest('[role="grid"],[role="table"],table')) return "grid";
      return "main";
    } catch (e) { return "main"; }
  }

  function onChildClick(e) {
    var el = e && e.target;
    if (!el) return;
    try { if (el.closest && el.closest('[data-labpilot], #labpilot-overlay-root, #labpilot-rocky')) return; }
    catch (x) { return; }
    var hit = null;
    try {
      hit = el.closest('a[href],button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],' +
                       '[role="treeitem"],[role="option"],[role="checkbox"],input,select,summary') || el;
    } catch (x) { hit = el; }
    if (!hit) return;
    var nm = "";
    try {
      var a = hit.getAttribute && hit.getAttribute("aria-label");
      nm = (a && a.trim()) ? a.trim() : ((hit.innerText || hit.textContent || "").replace(/\s+/g, " ").trim());
    } catch (x) { nm = ""; }
    if (!nm) return;                                // an unnamed control tells the deriver nothing
    publish({
      kind: "action", frame: originOf(), t: Date.now(),
      name: nm.slice(0, 80),
      role: (hit.getAttribute && hit.getAttribute("role")) || (hit.tagName || "").toLowerCase(),
      region: clickRegion(hit),
    });
  }

  /*
   * TYPING IS AN ACTION, AND THE VALUE IS NOT RECORDED.
   *
   * Labs type constantly — "Type your project name" is literally step one of the shipped
   * Foundry pack — and without this those steps have no boundary, so the derivation has nothing
   * to attribute their outcome to. A whole class of real lab steps would simply not exist.
   *
   * `change` and not `input`: change fires once, on commit, when the learner has finished. input
   * fires per keystroke, which would be both a step boundary per character and, in substance, a
   * keylogger.
   *
   * The FIELD is recorded; the VALUE never is. What a learner types into an enterprise portal is
   * their business and frequently a resource name tied to their tenant, and the derivation does
   * not need it: "they filled in the project name field" is the step, not what they called it.
   */
  function onChildInput(e) {
    var el = e && e.target;
    if (!el || !el.tagName) return;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    // Never record what was typed into a password or anything hidden.
    var type = (el.getAttribute && (el.getAttribute("type") || "")).toLowerCase();
    if (type === "password" || type === "hidden") return;
    try { if (el.closest && el.closest('[data-labpilot], #labpilot-overlay-root, #labpilot-rocky')) return; }
    catch (x) { return; }
    var nm = "";
    try {
      nm = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || "").trim();
    } catch (x) { nm = ""; }
    if (!nm) return;
    publish({
      kind: "action", frame: originOf(), t: Date.now(),
      name: nm.slice(0, 80), role: "textbox", region: clickRegion(el), via: "input",
    });
  }

  function start() {
    if (started) return;
    started = true;
    // Only a child frame reports its clicks. The top frame's recorder already has a listener of
    // its own, and two records of one click would become two steps.
    if (!F.isTop) {
      try {
        document.addEventListener("click", onChildClick, true);
        document.addEventListener("change", onChildInput, true);
      } catch (e) { /* no document */ }
    }
    if (F.isTop) {
      listen();
      // The top frame has its own completion engine and its own signals — Purview keeps the
      // policy grid in the top frame. It reports through the same path so downstream sees one
      // stream whatever the portal's frame layout happens to be.
    }
    try { timer = setInterval(tick, TICK_MS); } catch (e) { timer = 0; }
  }

  function stop() {
    started = false;
    try { clearInterval(timer); } catch (e) { /* nothing to clear */ }
  }

  function events(sinceMs) {
    if (typeof sinceMs !== "number") return log.slice();
    var cut = Date.now() - sinceMs;
    return log.filter(function (e) { return e.t >= cut; });
  }

  function frames() {
    var out = [];
    for (var k in frameSeen) {
      out.push({ frame: k, first: frameSeen[k].first, last: frameSeen[k].last, kinds: frameSeen[k].kinds });
    }
    return out;
  }

  window.LabPilotRelay = {
    start: start, stop: stop, publish: publish,
    events: events, frames: frames,
    onEvent: function (fn) { if (typeof fn === "function") subs.push(fn); },
    reset: function () { log.length = 0; subs.length = 0; seen = Object.create(null); frameSeen = Object.create(null); lastCounts = null; lastDialogs = null; lastAnnounceAt = 0; },
    _harvest: harvest,
    _record: record,
    _keyOf: keyOf,
    _isTop: F.isTop,
    _key: MY_KEY,
    _take: take,
    _tuning: { TICK_MS: TICK_MS, LOG_TTL_MS: LOG_TTL_MS, LOG_MAX: LOG_MAX },
  };

  try { start(); } catch (e) { /* a frame that cannot start simply reports nothing */ }
})();
