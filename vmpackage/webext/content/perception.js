/*
 * LabPilot PERCEPTION — what is on screen, in about 3 ms, on change only.
 *
 * MEASURED, not assumed (test/bench-dom.js, test/bench-events.js on this machine):
 *   full interactive extraction ................ 2.9 ms   (66 controls, shadow DOM pierced)
 *   change signature ........................... 0.2 ms
 *   elementFromPoint ........................... 0.1 ms
 *   meaningful events while the learner reads .. 0 in 10 s
 *   meaningful events during a navigation ...... 3
 *
 * For comparison, on the same machine a UIA tree scan of a browser window is 849 ms and a
 * screenshot is 157 ms plus ~1,300 tokens for a model to even see it. For browser labs the DOM
 * is not merely the faster option, it is faster by three orders of magnitude — which is what
 * makes continuous awareness free.
 *
 * TWO JOBS:
 *   1. Notice that something changed, as cheaply as possible (the 0.2 ms signature).
 *   2. When it did, describe the screen once (the 2.9 ms extraction).
 *
 * The 250 ms coalesce window matters: a single navigation produced 19 raw mutation batches but
 * only 3 meaningful changes. Without coalescing, the world model would update 6x more often
 * than anything actually happened.
 *
 * SHADOW DOM IS NOT OPTIONAL. Measured 7 shadow roots on an ordinary Microsoft page. Enterprise
 * portals hide real controls inside them, and a plain querySelectorAll misses every one.
 *
 * window.LabPilotPerceive:
 *   snapshot()         extract the screen now -> { url, title, controls[] }
 *   onChange(cb)       called when the interactive controls actually changed
 *   at(x, y)           what is under this point (Explore Mode)
 *   start() / stop()
 */
(function () {
  "use strict";
  if (window.LabPilotPerceive) return;

  var COALESCE_MS = 250;

  // What a human could click or type into. Kept broad: a whitelist that is too narrow silently
  // loses custom controls, and the resolver's contract is a better guard than this filter.
  var SEL = "a,button,input,select,textarea,summary," +
    "[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox]," +
    "[role=checkbox],[role=radio],[role=combobox],[role=option],[role=treeitem]," +
    "[role=switch],[role=searchbox],[role=textbox],[onclick],[tabindex]:not([tabindex='-1'])";

  var watchers = [], mo = null, lastSig = "", pending = false, started = false;

  function accessibleName(el) {
    // Cheap approximation of the accessible name, in the order portals actually author it.
    var n = el.getAttribute && el.getAttribute("aria-label");
    if (n && n.trim()) return n.trim();
    var lb = el.getAttribute && el.getAttribute("aria-labelledby");
    if (lb) {
      try {
        var ref = document.getElementById(lb);
        if (ref && ref.innerText) return ref.innerText.trim().slice(0, 100);
      } catch (e) { /* ignore */ }
    }
    var txt = (el.innerText || el.textContent || "").trim();
    if (txt) return txt.slice(0, 100);
    var v = el.value || el.title || el.placeholder || (el.getAttribute && el.getAttribute("alt"));
    return (v || "").toString().trim().slice(0, 100);
  }

  function roleOf(el) {
    var r = el.getAttribute && el.getAttribute("role");
    if (r) return r;
    switch (el.tagName) {
      case "A": return el.getAttribute("href") ? "link" : "generic";
      case "BUTTON": case "SUMMARY": return "button";
      case "TEXTAREA": return "textbox";
      case "SELECT": return "combobox";
      case "INPUT":
        var t = (el.getAttribute("type") || "text").toLowerCase();
        return t === "search" ? "searchbox" : (t === "checkbox" ? "checkbox" : (t === "radio" ? "radio" : "textbox"));
      default: return "generic";
    }
  }

  /*
   * Harvest interactive controls, piercing shadow roots.
   *
   * Skips our own overlay: Rocky must never perceive himself, or a glow would look like a
   * page change and he would re-evaluate forever.
   */
  function harvest(root, out, depth) {
    if (depth > 6) return;                       // pathological nesting guard
    var nodes;
    try { nodes = root.querySelectorAll(SEL); } catch (e) { return; }
    for (var i = 0; i < nodes.length && out.length < 400; i++) {
      var el = nodes[i];
      if (el.closest && el.closest("#labpilot-overlay-root")) continue;
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (r.width < 2 || r.height < 2) continue;                     // invisible
      if (r.bottom < 0 || r.top > window.innerHeight) continue;       // outside the viewport
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      out.push({
        el: el,
        name: accessibleName(el),
        role: roleOf(el),
        id: el.id || (el.getAttribute && (el.getAttribute("data-testid") || el.getAttribute("name"))) || "",
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        w: Math.round(r.width),
        h: Math.round(r.height),
        disabled: el.disabled === true || (el.getAttribute && el.getAttribute("aria-disabled") === "true"),
      });
    }
    // shadow roots: enterprise SPAs put real controls in them
    var all;
    try { all = root.querySelectorAll("*"); } catch (e) { return; }
    for (var j = 0; j < all.length; j++) {
      if (all[j].shadowRoot) harvest(all[j].shadowRoot, out, depth + 1);
    }
  }

  function snapshot() {
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    var controls = [];
    harvest(document, controls, 0);
    return {
      url: location.href,
      title: document.title,
      controls: controls,
      ms: t0 ? (performance.now() - t0) : 0,
    };
  }

  /*
   * The cheap poll: has the SET OF CONTROLS changed? Measured at 0.2 ms, which is what makes
   * it safe to run on every mutation batch. A page that repaints without changing its controls
   * (an ad rotating, a clock ticking) produces no event at all.
   */
  function signature() {
    var h = 0, n = 0;
    try {
      var els = document.querySelectorAll(SEL);
      n = els.length;
      for (var i = 0; i < els.length && i < 300; i++) {
        var s = (els[i].getAttribute("aria-label") || els[i].textContent || "").slice(0, 24);
        for (var j = 0; j < s.length; j++) h = ((h << 5) - h + s.charCodeAt(j)) | 0;
      }
    } catch (e) { /* ignore */ }
    return location.href + "|" + n + "|" + h;
  }

  function fire() {
    var snap = snapshot();
    for (var i = 0; i < watchers.length; i++) {
      try { watchers[i](snap); } catch (e) { /* a bad watcher must not stop the others */ }
    }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      var sig = signature();
      if (sig === lastSig) return;      // nothing that matters changed
      lastSig = sig;
      fire();
    }, COALESCE_MS);
  }

  function at(x, y) {
    var el;
    try { el = document.elementFromPoint(x, y); } catch (e) { return null; }
    if (!el) return null;
    if (el.closest && el.closest("#labpilot-overlay-root")) return null;
    // walk up to the nearest thing a human would consider "a control"
    var cur = el, hops = 0;
    while (cur && hops < 6) {
      if (cur.matches) {
        try { if (cur.matches(SEL)) break; } catch (e) { /* ignore */ }
      }
      cur = cur.parentElement; hops++;
    }
    var target = cur || el;
    var r;
    try { r = target.getBoundingClientRect(); } catch (e) { return null; }
    return {
      el: target,
      name: accessibleName(target),
      role: roleOf(target),
      id: target.id || "",
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
    };
  }

  function start() {
    if (started) return;
    started = true;
    lastSig = signature();

    mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (t && t.closest && t.closest("#labpilot-overlay-root")) continue;  // our own glow
        schedule();
        return;
      }
    });
    try {
      mo.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ["aria-label", "aria-disabled", "aria-hidden", "role", "hidden", "disabled", "class", "style"],
      });
    } catch (e) { /* ignore */ }

    // SPA route changes do not always mutate the DOM in a way the observer sees first
    ["pushState", "replaceState"].forEach(function (m) {
      var orig = history[m];
      if (!orig || orig.__lpWrapped) return;
      var wrapped = function () { var r = orig.apply(this, arguments); schedule(); return r; };
      wrapped.__lpWrapped = true;
      history[m] = wrapped;
    });
    window.addEventListener("popstate", schedule);
    window.addEventListener("hashchange", schedule);
    // a click changes the world more often than not; let the coalescer decide
    document.addEventListener("click", schedule, true);
  }

  function stop() {
    started = false;
    if (mo) { try { mo.disconnect(); } catch (e) {} mo = null; }
  }

  window.LabPilotPerceive = {
    snapshot: snapshot,
    signature: signature,
    onChange: function (cb) { if (typeof cb === "function") watchers.push(cb); },
    at: at,
    start: start,
    stop: stop,
    _sel: SEL,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
