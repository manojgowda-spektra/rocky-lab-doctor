/*
 * LabPilot EXPLAIN CACHE — "what is a Resource Group" costs one model call, ever.
 *
 * WHAT IS ACTUALLY WORTH CACHING. The authored knowledge base (foundry-kb.js explain()) is
 * deterministic, local and instant — caching it would save nothing and add a bug surface. The
 * expensive path is askAI(): a network round trip to a Foundry deployment, 300-2000 ms, that
 * a learner triggers by hovering. Hover the same control twice and you pay twice.
 *
 * And they do hover the same control twice. A learner exploring a portal blade sweeps back and
 * forth over the same handful of controls; a second learner on the same lab asks about exactly
 * the same ones. The answer does not change: "what is a Resource Group" has one answer.
 *
 * WHAT THE KEY MUST NOT INCLUDE. Not the element, not a DOM path, not coordinates — all three
 * change between page loads and would make the cache useless. The key is what the QUESTION is
 * about: the control's name, its role, and the route it lives on. Two controls with the same
 * name on different pages are different questions; the same control after a re-render is the
 * same question.
 *
 * WHY chrome.storage.local AND NOT sessionStorage. The value of this cache is across page
 * loads and across the whole lab session. A learner who asks about "Resource group" on step 2
 * and meets it again on step 9 should get the instant answer. chrome.storage.local survives
 * navigation; sessionStorage does not survive a cross-origin hop, which labs do constantly.
 *
 * BOUNDED, because an unbounded cache in a long lab session is a leak. Oldest entries are
 * dropped first, and the whole thing is best-effort: a cache miss is normal, a cache failure
 * is invisible, and nothing in Explore mode depends on it working.
 *
 * window.LabPilotExplainCache:
 *   key(desc)            -> a stable string for this control's question
 *   get(desc, cb)        -> cb(text|null)
 *   put(desc, text)      -> store it
 *   stats(cb)            -> { entries, hits, misses } for the gate
 */
(function () {
  "use strict";
  if (window.LabPilotExplainCache) return;

  var STORE = "lpExplainCache";
  var MAX = 300;                 // entries; a long lab session touches far fewer
  var mem = null;                // in-memory mirror, so a repeat hover costs nothing at all
  var hits = 0, misses = 0;

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  }

  /*
   * The cache key: what the question is ABOUT, never where it currently sits.
   *
   * route is included because the same word means different things in different places —
   * "Overview" in a resource group blade is not "Overview" in Copilot Studio. It is trimmed
   * to the path (no query, no hash) so that a resource id in the URL does not fragment the
   * cache into one entry per resource.
   */
  function key(desc) {
    if (!desc) return "";
    var name = norm(desc.name);
    if (!name) return "";
    var route = "";
    try { route = String(location.pathname || "").replace(/\/[0-9a-f-]{8,}/gi, "/*").slice(0, 60); } catch (e) {}
    return norm(desc.role) + "|" + name + "|" + route;
  }

  function load(cb) {
    if (mem) { cb(mem); return; }

    // A DEADLINE, because get() gates the WHOLE Ask-AI path behind this callback: askAI()
    // consults the cache first, so if chrome.storage.local.get never calls back, ask() is
    // never reached and the learner's question is not merely unanswered — it is never sent.
    // No spinner, no error, nothing. An empty cache is a perfectly good answer here; being
    // unable to read the cache must never cost the learner their question.
    var done = false;
    function settle(m, keep) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // On a TIMEOUT we release the caller with an empty cache but deliberately do NOT store
      // it in `mem`: storage was slow, not empty. Caching {} would make every later lookup a
      // permanent miss for the rest of the session, turning a transient stall into a lasting
      // loss of the cache. A real read (or a throw, which is terminal) does set `mem`.
      if (keep) mem = m;
      cb(m);
    }
    var timer = setTimeout(function () { settle({}, false); }, 3000);

    try {
      chrome.storage.local.get([STORE], function (v) { settle((v && v[STORE]) || {}, true); });
    } catch (e) { settle({}, true); }
  }

  function get(desc, cb) {
    var k = key(desc);
    if (!k) { cb(null); return; }
    load(function (m) {
      var e = m[k];
      if (e && e.text) { hits++; cb(e.text); return; }
      misses++;
      cb(null);
    });
  }

  function put(desc, text) {
    var k = key(desc);
    if (!k || !text) return;
    load(function (m) {
      m[k] = { text: String(text).slice(0, 2000), n: (m[k] && m[k].n || 0) + 1 };
      var keys = Object.keys(m);
      if (keys.length > MAX) {
        // Drop the least-asked entries first: a control asked about repeatedly is the one
        // most worth keeping, and "least asked" is cheaper to compute than a true LRU.
        keys.sort(function (a, b) { return (m[a].n || 0) - (m[b].n || 0); });
        for (var i = 0; i < keys.length - MAX; i++) delete m[keys[i]];
      }
      var payload = {};
      payload[STORE] = m;
      try { chrome.storage.local.set(payload); } catch (e) { /* best effort: a cache is never load-bearing */ }
    });
  }

  function stats(cb) {
    load(function (m) { cb({ entries: Object.keys(m).length, hits: hits, misses: misses }); });
  }

  function clear(cb) {
    mem = {};
    try { chrome.storage.local.remove(STORE, function () { if (cb) cb(); }); } catch (e) { if (cb) cb(); }
  }

  window.LabPilotExplainCache = {
    key: key, get: get, put: put, stats: stats, clear: clear,
    _mem: function () { return mem; },
  };
})();
