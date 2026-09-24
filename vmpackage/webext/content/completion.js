/*
 * LabPilot COMPLETION — did the WORLD change, or did the learner merely act?
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE:
 *
 *     A learner action is evidence of ATTEMPT.
 *     A world change is evidence of COMPLETION.
 *
 * Everything Rocky got wrong this week came from conflating those. A control being on screen
 * means the step is POSSIBLE — that is the definition of navigation furniture. A click means
 * the learner TRIED. Neither means the work is done, and treating them as if they did produced
 * a card reading "STUCK? open Policies" to a learner three screens past it, and four of their
 * clicks scored as mistakes because none landed on the control Rocky was pointing at.
 *
 * WHAT THE PORTALS ACTUALLY DECLARE, MEASURED ON THE LIVE LAB (2026-09-24)
 *
 *   Purview, Insider Risk policies page, settled:
 *     role=status  "List loaded  No data available"
 *     role=status  "0 items"
 *     page text    "0 Policy"
 *     grid         aria-rowcount = 1     (header row only)
 *     empty state  "get started", "you don't have"
 *   Purview, Users page, after a permissions failure:
 *     role=status      "Failed to load data. Please try again later."
 *     role=alertdialog "Client Error  Looks like you don't have the right permissio..."
 *   Azure, Resource groups blade (inside the cross-origin child frame):
 *     role=grid    aria-rowcount = "4"
 *     role=status  "3 results found"
 *     aria-live    "Showing 1 - 3 of 3. Display count: auto"
 *
 * So both portals announce the cardinality of a list in words, and both announce failure the
 * same way. Azure declares NO aria-current — its position channel is weak — but its completion
 * channel is as good as Purview's. That asymmetry is why completion is being built first.
 *
 * TWO PROPERTIES THAT ARE NOT NEGOTIABLE, AND WHY
 *
 * 1. A RISING EDGE, NOT A STATE. "The policy list has one row" is not completion: it may have
 *    had one row when the learner arrived, in a pre-seeded tenant or on a second visit. Only
 *    "the list went from N to more than N, and I watched it happen" is completion. Every
 *    judgement here is made against a BASELINE captured before the learner acted.
 *
 * 2. WATCH, DO NOT SAMPLE. A toast appears and is removed. Measured: an idle portal page is
 *    byte-stable across 2.5 seconds (+0 appeared, -0 vanished on both pages tested), so the
 *    page is quiet — but the announcements that matter live for a second or two and a 1 Hz poll
 *    walks straight past them. Announcements are therefore captured by a MutationObserver
 *    scoped to live regions and kept in a short ring buffer with timestamps.
 *
 * WHAT THIS FILE DOES NOT DO. It does not decide WHICH step completed. Matching an observed
 * change to an expected outcome needs the recorded expectation, which is Recorder 2.0's job.
 * This engine answers a narrower question honestly: what changed in the world, when, was it a
 * success or a failure, and how strong is that as evidence. Emitting "something was created"
 * and letting the caller decide whether it was the RIGHT something keeps the two concerns
 * separable and keeps this testable.
 *
 * Runs in EVERY frame, including cross-origin child frames: on Azure the grid and the live
 * regions are in the child and the top frame cannot see them.
 *
 * window.LabPilotCompletion:
 *   start()                 begin watching live regions
 *   snapshot()              read the completion-relevant state of this document  (~2-7 ms)
 *   baseline()              remember the current snapshot as "before"
 *   changes()               rising edges since the baseline, typed and tiered
 *   announcements(sinceMs)  what the page has said out loud recently
 *   verdict()               { world, attempt, failure } summarised
 */
(function () {
  "use strict";
  if (window.LabPilotCompletion) return;

  // ---- tuning, every value derived ------------------------------------------------------------

  // How long an announcement stays relevant. Portal toasts are removed after a few seconds and
  // a learner reads them in about one; anything older than this describes a different action.
  var ANNOUNCE_TTL_MS = 30000;
  // The ring is bounded so a chatty portal cannot grow it without limit. Twenty is well above
  // the seven live regions measured on the busiest page tested.
  var ANNOUNCE_MAX = 40;
  // Ignore an announcement shorter than this: Fluent ships empty live regions that exist only
  // to be written into later, and "" is not news. Measured: 2 of 7 on Purview were empty.
  var ANNOUNCE_MIN_CHARS = 3;

  /*
   * TEXT CLASSES. Deliberately about the SHAPE of an outcome, never a specific portal's wording.
   * A phrase list tuned to Purview would be wrong on Azure by the second sprint, and a lab
   * author cannot be asked to keep one updated. These are the words English-language enterprise
   * software uses to report that something did or did not happen, and a miss costs a missed
   * completion (recoverable — other atoms still fire) rather than a false one.
   */
  var SAYS_SUCCESS = /\b(success|succeeded|saved|created|complete[d]?|updated|applied|added|enabled|turned on|published|deployed|provision(ed|ing)? complete|deleted|removed)\b/i;
  var SAYS_FAILURE = /\b(fail(ed|ure)?|error|denied|unauthoriz|not authoriz|no permission|don'?t have (the )?right|insufficient|invalid|unable|couldn'?t|cannot|can'?t|try again|timed out|quota|forbidden|conflict)\b/i;
  var SAYS_BUSY = /\b(loading|working on it|in progress|please wait|saving|creating|provisioning|refreshing)\b/i;

  /*
   * A COUNT SAID OUT LOUD.
   *
   * Measured on the Azure blade, in order, as the list loaded:
   *   "0 results found" -> "Showing 1 - 0 of 0" -> "3 results found" -> "Showing 1 - 3 of 3"
   *
   * None of those contains a success word, so they classified as "other" and the strongest
   * completion signal Azure produces was being discarded. They are a DECLARED CARDINALITY in
   * words — the same fact as aria-rowcount, from a portal whose grid reports zero size — and
   * the transition between two of them is exactly "the thing now exists".
   *
   * "Showing A - B of N" is read as N, the total, not B. A list showing 1-50 of 200 has 200.
   */
  var SAYS_COUNT = [
    /\bshowing\s+[\d,]+\s*[-\u2013\u2014]\s*[\d,]+\s+of\s+([\d,]+)/i,
    /\b([\d,]+)\s+(?:results?|items?|policies|policy|alerts?|rows?|records?|entries)\b/i,
    /\b(?:results?|items?|rows?)\s*[:=]\s*([\d,]+)/i,
  ];

  function countIn(text) {
    for (var i = 0; i < SAYS_COUNT.length; i++) {
      var m = SAYS_COUNT[i].exec(text);
      if (m) {
        var n = Number(String(m[1]).replace(/,/g, ""));
        if (isFinite(n)) return n;
      }
    }
    return null;
  }

  // Where a portal announces things. role=alert and alertdialog are assertive by definition and
  // are weighted higher than a polite status line.
  var LIVE_SEL = '[aria-live],[role="status"],[role="alert"],[role="alertdialog"],[role="log"]';
  var LIST_SEL = '[role="grid"],[role="table"],[role="treegrid"],table,[role="list"],[role="listbox"]';

  /*
   * EMPTY-STATE PHRASES. The cleanest creation signal there is: empty-state copy disappearing
   * needs no row counting and is immune to list virtualisation, which is the trap that makes
   * counting rendered rows wrong on both portals. Kept short and generic for the same reason as
   * the text classes above.
   */
  var EMPTY_PHRASES = [
    "no policies", "no items", "no results", "no alerts", "no cases", "no data",
    "nothing to show", "nothing here", "create your first", "get started",
    "you don't have", "you haven't", "is empty",
  ];

  function txt(el) {
    try { return ((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim(); }
    catch (e) { return ""; }
  }
  function nameOf(el) {
    var a = el && el.getAttribute && el.getAttribute("aria-label");
    if (a && a.trim()) return a.trim().slice(0, 60);
    return txt(el).slice(0, 60);
  }
  /*
   * IS IT SHOWN? AND WHY SIZE IS NOT ALWAYS THE ANSWER.
   *
   * Measured on the live Azure portal: the Resource groups grid inside the blade frame declares
   * aria-rowcount="4" and reports width 0, height 0. A cross-origin child frame is laid out by
   * a parent it cannot see, and its own layout viewport can be degenerate while the content is
   * drawn full-size on screen. A size test therefore rejected the single most important list on
   * the portal — the same mistake as the frame size heuristic deleted earlier the same day.
   *
   * So size is used only where it means something: when this document has a viewport of its
   * own. Where it does not, the style checks stand alone and the element is kept. Failing open
   * costs an occasional list that is genuinely hidden; failing closed costs Azure entirely.
   */
  function hasViewport() {
    try { return (window.innerWidth || 0) > 1 && (window.innerHeight || 0) > 1; }
    catch (e) { return false; }
  }

  function rendered(el) {
    try {
      var cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
      if (!hasViewport()) return true;            // no usable viewport: size cannot be judged
      var r = el.getBoundingClientRect();
      return !(r.width < 1 || r.height < 1);
    } catch (e) { return false; }
  }

  // ---- the announcement ring ------------------------------------------------------------------
  var heard = [];        // { t, text, assertive, kind }
  var observer = null;
  var started = false;

  function classify(text) {
    // Order matters. "failed to save" contains "save", so failure is checked first: a false
    // success is the expensive mistake and a false failure merely makes Rocky cautious. Busy
    // outranks count because "Loading 0 results" is a page still working, not an empty answer.
    if (SAYS_FAILURE.test(text)) return "failure";
    if (SAYS_SUCCESS.test(text)) return "success";
    if (SAYS_BUSY.test(text)) return "busy";
    if (countIn(text) !== null) return "count";
    return "other";
  }

  function note(el, text) {
    var clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length < ANNOUNCE_MIN_CHARS) return;
    var role = (el && el.getAttribute && el.getAttribute("role")) || "";
    var politeness = (el && el.getAttribute && el.getAttribute("aria-live")) || "";
    var assertive = role === "alert" || role === "alertdialog" || politeness === "assertive";
    var last = heard[heard.length - 1];
    // The same text announced twice in a row is one announcement. Portals re-write a live
    // region on every render, and thirty identical writes are not thirty events.
    if (last && last.text === clean) { last.t = Date.now(); return; }
    var kind = classify(clean);
    heard.push({
      t: Date.now(), text: clean.slice(0, 300), assertive: assertive, kind: kind,
      count: kind === "count" ? countIn(clean) : null,
    });
    if (heard.length > ANNOUNCE_MAX) heard.splice(0, heard.length - ANNOUNCE_MAX);
  }

  function start() {
    if (started) return;
    started = true;
    // Seed from whatever is already on screen, so an announcement made before Rocky loaded is
    // not lost entirely — it will have a start-of-session timestamp, which is honest.
    try {
      var now = document.querySelectorAll(LIVE_SEL);
      for (var i = 0; i < now.length; i++) note(now[i], txt(now[i]));
    } catch (e) { /* a document that will not be queried cannot be watched */ }

    try {
      observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var target = records[i].target;
          /*
           * NEVER LISTEN TO ROCKY HIMSELF.
           *
           * Rocky's card, glow and bubble are DOM, and they change whenever he speaks. Without
           * this the engine would hear his own output, treat it as the page announcing
           * something, and on a card containing a word like "created" would report a completion
           * the portal never made. The repo has already paid for this once with a 60fps
           * feedback loop that made pointing impossible on any real lab, which is why
           * no-feedback-loop-test.js exists and why it caught this file the moment it landed.
           */
          try {
            if (target && target.closest &&
                target.closest('[data-labpilot], #labpilot-overlay-root, #labpilot-rocky')) continue;
          } catch (e) { /* a text node has no closest(); fall through to the parent check */ }
          var host = null;
          try { host = target.closest ? target.closest(LIVE_SEL) : null; } catch (e) { host = null; }
          if (!host && target.parentElement && target.parentElement.closest) {
            try {
              // A text node reports itself as the target and has no closest(), so the self-check
              // above cannot see it. Its parent can.
              if (target.parentElement.closest('[data-labpilot], #labpilot-overlay-root, #labpilot-rocky')) continue;
              host = target.parentElement.closest(LIVE_SEL);
            } catch (e) { host = null; }
          }
          if (host) note(host, txt(host));

          /*
           * A LIVE REGION THAT ARRIVES ALREADY FULL.
           *
           * The check above reads records[i].target, which for an appendChild is the PARENT.
           * So a portal that builds its error toast complete with its text and then attaches it
           * - `body.appendChild(div[role=alert] "Client Error...")` - produces one record whose
           * target is <body>, and body.closest(LIVE_SEL) is null. The announcement was dropped
           * entirely, silently, and it is the assertive kind: errors and permission failures,
           * the announcements that matter most.
           *
           * Found by provoking a real error on the live Azure portal and watching nothing reach
           * Position. The seeding pass in start() hid it during development, because anything
           * present before Rocky loaded was picked up by querySelectorAll instead.
           */
          var added = records[i].addedNodes;
          for (var a = 0; added && a < added.length; a++) {
            var nd = added[a];
            if (!nd || nd.nodeType !== 1) continue;
            try {
              if (nd.closest && nd.closest('[data-labpilot], #labpilot-overlay-root, #labpilot-rocky')) continue;
              if (nd.matches && nd.matches(LIVE_SEL)) note(nd, txt(nd));
              // The region may be nested inside the subtree that was attached.
              if (nd.querySelectorAll) {
                var inner = nd.querySelectorAll(LIVE_SEL);
                for (var b = 0; b < inner.length; b++) note(inner[b], txt(inner[b]));
              }
            } catch (e) { /* a node that will not be queried cannot be heard */ }
          }
        }
      });
      // characterData and childList both matter: portals variously replace the text node and
      // replace the whole element. subtree is required because the announcement is usually in
      // a child of the element carrying the role.
      observer.observe(document.documentElement || document, {
        subtree: true, childList: true, characterData: true,
      });
    } catch (e) { /* no MutationObserver: snapshot() still reads live regions on demand */ }
  }

  function announcements(sinceMs) {
    var cut = Date.now() - (typeof sinceMs === "number" ? sinceMs : ANNOUNCE_TTL_MS);
    var out = [];
    for (var i = 0; i < heard.length; i++) if (heard[i].t >= cut) out.push(heard[i]);
    return out;
  }

  // ---- the snapshot -----------------------------------------------------------------------------
  /*
   * LIST CARDINALITY, AND WHY aria-rowcount IS NOT OPTIONAL.
   *
   * Fluent and Ibiza both virtualise long lists: only the visible rows exist in the DOM. Counting
   * rendered rows therefore reports 12 for a 40-row list and changes when the learner merely
   * scrolls — a creation and a scroll would be indistinguishable. aria-rowcount is the declared
   * total and is what both portals publish (Purview: 1 on an empty policy list; Azure: "4").
   * When it is absent the rendered count is kept but marked, so a caller can weigh it lower.
   *
   * De-duplication matters too: on Purview a single logical grid matched the selector three
   * times (a div wrapper, the role=grid, and a role=presentation sibling) and only one carried
   * aria-rowcount. Keyed by name+role so the wrappers collapse onto the real one.
   */
  function lists() {
    var out = {};
    var nodes;
    try { nodes = document.querySelectorAll(LIST_SEL); } catch (e) { return out; }
    for (var i = 0; i < nodes.length && i < 40; i++) {
      var g = nodes[i];
      /*
       * A LIST IS NOT JUDGED BY ITS OWN BOX.
       *
       * Measured twice on the live Azure blade: the Resource groups grid declares
       * aria-rowcount="4" and its own getBoundingClientRect is 0 x 0. A grid can legitimately
       * have no box while its rows are drawn — display:contents, absolutely positioned rows, a
       * virtualiser that sizes the scroll container instead. A viewport test was tried first
       * and did not help, because the blade frame HAS a viewport; it is small, so geometry
       * applied and the grid was rejected anyway.
       *
       * Geometry was only ever there to skip hidden lists, and the style check already does
       * that properly. So for lists it is dropped entirely: a list counts if it is not
       * display:none / visibility:hidden / opacity:0 AND it either declares a row count or
       * contains rows. Both of those are about content, which is what a list is.
       */
      var shown = true;
      try {
        var cs0 = getComputedStyle(g);
        shown = !(cs0.visibility === "hidden" || cs0.display === "none" || cs0.opacity === "0");
      } catch (e) { shown = true; }
      if (!shown) continue;
      var declared = g.getAttribute("aria-rowcount");
      // Keyed on the NAME ALONE, deliberately. Measured on Purview: one policy list matched
      // the selector three times — a plain div wrapper, the role="grid" that carries
      // aria-rowcount, and a role="presentation" sibling — all with the same accessible name.
      // Including the role in the key made those three separate lists, so one creation would
      // have been reported three times and two of the three readings had no declared count.
      var key = nameOf(g) || "list";
      var rows = 0;
      try { rows = g.querySelectorAll('[role="row"],tr,[role="listitem"],[role="option"]').length; }
      catch (e) { rows = 0; }
      var entry = {
        declared: declared === null ? null : Number(declared),
        rendered: rows,
      };
      // Prefer the node that declares a count; a wrapper that does not is the same list seen twice.
      // Nothing to say about a list with neither a declared count nor a row in it.
      if (entry.declared === null && entry.rendered === 0) continue;
      var prev = out[key];
      if (!prev || (prev.declared === null && entry.declared !== null)) out[key] = entry;
    }
    return out;
  }

  /*
   * EMPTY-STATE COPY, WITHOUT PAYING FOR LAYOUT.
   *
   * This read innerText of the whole body, and innerText forces a reflow to work out what is
   * visible. Measured on the live Purview policies page that made one snapshot cost 10.8 ms
   * against a 5 ms budget — and it ran on every observation.
   *
   * textContent needs no layout at all. It also returns text from hidden nodes, which for this
   * purpose is a fair trade: a false "the empty state is still here" delays a completion by one
   * observation, whereas 10.8 ms on the hot path is paid every second forever. Scoped to the
   * main region where a portal puts its empty state, falling back to body only when there is no
   * main landmark.
   */
  function emptyStates() {
    var body = "";
    try {
      var root = document.querySelector('main,[role="main"]') || document.body;
      body = String((root && root.textContent) || "").replace(/\s+/g, " ").slice(0, 20000).toLowerCase();
    } catch (e) { return []; }
    var found = [];
    for (var i = 0; i < EMPTY_PHRASES.length; i++) {
      if (body.indexOf(EMPTY_PHRASES[i]) >= 0) found.push(EMPTY_PHRASES[i]);
    }
    return found;
  }

  function dialogs() {
    var out = [];
    var nodes;
    try { nodes = document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog'); }
    catch (e) { return out; }
    for (var i = 0; i < nodes.length; i++) {
      if (!rendered(nodes[i])) continue;
      out.push(nameOf(nodes[i]) || "(unnamed)");
    }
    return out;
  }

  function snapshot() {
    var t0 = 0;
    try { t0 = performance.now(); } catch (e) { t0 = 0; }
    var s = {
      t: Date.now(),
      url: (function () { try { return location.href; } catch (e) { return ""; } })(),
      lists: lists(),
      empty: emptyStates(),
      dialogs: dialogs(),
      /*
       * THE LAST COUNT THE PAGE SAID OUT LOUD, captured INTO the snapshot.
       *
       * This was first done by comparing announcement timestamps against the baseline's, and
       * that is fragile in exactly the way timestamps always are: an announcement made in the
       * same millisecond as the baseline is unorderable, and on a fast machine that is the
       * common case rather than the rare one. A snapshot that carries the value needs no clock.
       */
      announcedCount: (function () {
        for (var q = heard.length - 1; q >= 0; q--) {
          if (heard[q].kind === "count" && heard[q].count !== null) return heard[q].count;
        }
        return null;
      })(),
      announcedCountText: (function () {
        for (var q2 = heard.length - 1; q2 >= 0; q2--) {
          if (heard[q2].kind === "count" && heard[q2].count !== null) return heard[q2].text;
        }
        return "";
      })(),
      heading: (function () {
        try {
          var h = document.querySelector('main h1,[role="main"] h1,h1,main h2,[role="main"] h2');
          return h ? txt(h).slice(0, 60) : "";
        } catch (e) { return ""; }
      })(),
    };
    try { s.ms = Math.round((performance.now() - t0) * 100) / 100; } catch (e) { s.ms = 0; }
    return s;
  }

  // ---- the baseline and the rising edge ---------------------------------------------------------
  var base = null;

  function baseline(s) {
    base = s || snapshot();
    return base;
  }

  /*
   * WHAT CHANGED SINCE THE BASELINE.
   *
   * Every entry carries a TIER, and the tier is the whole point:
   *
   *   "world"    the world is different — a list grew, an empty state cleared, an outcome was
   *              announced. Only these may complete a step.
   *   "moved"    the learner is somewhere else — a dialog opened or closed, the heading changed.
   *              Evidence of progress, never of completion.
   *
   * A shrinking list is reported too, and as a world change: deleting a thing is completing a
   * step in plenty of labs, and a caller that only cares about growth can filter on direction.
   */
  function changes() {
    var now = snapshot();
    var out = [];
    if (!base) return { from: null, to: now, changes: out };

    // list cardinality
    for (var key in now.lists) {
      var a = base.lists[key], b = now.lists[key];
      if (!b) continue;
      if (!a) {
        // A list that did not exist before now does. Only interesting if it has content.
        var n0 = b.declared === null ? b.rendered : b.declared;
        if (n0 > 0) out.push({ kind: "list-appeared", tier: "world", key: key, to: n0, declared: b.declared !== null });
        continue;
      }
      var before = a.declared === null ? a.rendered : a.declared;
      var after = b.declared === null ? b.rendered : b.declared;
      if (after === before) continue;
      out.push({
        kind: after > before ? "list-grew" : "list-shrank",
        tier: "world", key: key, from: before, to: after,
        // A count that both sides DECLARED is trustworthy. A count from rendered rows changes
        // when the learner scrolls a virtualised list, so it is flagged as the weaker reading.
        declared: a.declared !== null && b.declared !== null,
      });
    }

    // empty state clearing is creation without needing to count anything
    for (var i = 0; i < base.empty.length; i++) {
      if (now.empty.indexOf(base.empty[i]) < 0) {
        out.push({ kind: "empty-state-cleared", tier: "world", phrase: base.empty[i] });
      }
    }

    // dialogs: opening and closing are movement, not completion. A wizard closing is the
    // learner leaving the wizard, which happens on Cancel just as much as on Create.
    for (var d = 0; d < now.dialogs.length; d++) {
      if (base.dialogs.indexOf(now.dialogs[d]) < 0) out.push({ kind: "dialog-opened", tier: "moved", name: now.dialogs[d] });
    }
    for (var d2 = 0; d2 < base.dialogs.length; d2++) {
      if (now.dialogs.indexOf(base.dialogs[d2]) < 0) out.push({ kind: "dialog-closed", tier: "moved", name: base.dialogs[d2] });
    }

    if (now.heading && now.heading !== base.heading) {
      out.push({ kind: "heading-changed", tier: "moved", from: base.heading, to: now.heading });
    }

    // announcements made since the baseline was taken
    var said = announcements(Date.now() - base.t + 500);
    for (var s = 0; s < said.length; s++) {
      if (said[s].t < base.t) continue;
      if (said[s].kind === "success") {
        out.push({ kind: "announced-success", tier: "world", text: said[s].text, assertive: said[s].assertive });
      } else if (said[s].kind === "failure") {
        out.push({ kind: "announced-failure", tier: "world", text: said[s].text, assertive: said[s].assertive });
      } else if (said[s].kind === "busy") {
        out.push({ kind: "announced-busy", tier: "moved", text: said[s].text });
      }
    }

    /*
     * THE ANNOUNCED COUNT, BEFORE AND AFTER.
     *
     * Azure's grid reports zero size inside its blade frame, so the DOM cardinality path finds
     * nothing there. The portal says the number out loud instead, and the transition between
     * the last count heard before the baseline and the last one heard after it is the same
     * evidence: "0 results found" then "3 results found" is a creation, declared by the portal.
     */
    if (base.announcedCount !== null && now.announcedCount !== null &&
        now.announcedCount !== base.announcedCount) {
      out.push({
        kind: now.announcedCount > base.announcedCount ? "count-grew" : "count-shrank",
        tier: "world", from: base.announcedCount, to: now.announcedCount,
        declared: true, text: now.announcedCountText,
      });
    }

    return { from: base, to: now, changes: out };
  }

  /*
   * THE SUMMARY A CALLER ACTS ON.
   *
   *   world    changes that mean the world is different. Only these may complete a step.
   *   moved    changes that mean the learner is elsewhere. Progress, not completion.
   *   failure  the page said something went wrong, with its own words for the report.
   *   busy     the page said it is working. This is why Rocky must NOT call a slow step stuck:
   *            a provisioning step that announces "in progress" is behaving correctly.
   *
   * `settled` is false while the page says it is busy, so a caller can wait rather than judge.
   */
  function verdict() {
    var c = changes();
    var world = [], moved = [], failure = [], busy = [];
    for (var i = 0; i < c.changes.length; i++) {
      var ch = c.changes[i];
      if (ch.kind === "announced-failure") failure.push(ch);
      else if (ch.kind === "announced-busy") busy.push(ch);
      else if (ch.tier === "world") world.push(ch);
      else moved.push(ch);
    }
    return {
      world: world, moved: moved, failure: failure, busy: busy,
      settled: busy.length === 0,
      // A world change that a portal DECLARED (a count both sides published, or an announcement
      // it made assertively) is stronger than one inferred from rendered rows.
      strong: world.filter(function (w) {
        return w.declared === true || w.assertive === true || w.kind === "empty-state-cleared";
      }),
      ms: c.to.ms,
    };
  }

  function reset() { heard.length = 0; base = null; }

  window.LabPilotCompletion = {
    start: start,
    snapshot: snapshot,
    baseline: baseline,
    changes: changes,
    verdict: verdict,
    announcements: announcements,
    reset: reset,
    _classify: classify,
    _countIn: countIn,
    _note: note,
    _tuning: { ANNOUNCE_TTL_MS: ANNOUNCE_TTL_MS, ANNOUNCE_MAX: ANNOUNCE_MAX, ANNOUNCE_MIN_CHARS: ANNOUNCE_MIN_CHARS },
  };

  // Watching costs nothing until something is announced, and an announcement missed cannot be
  // recovered, so start immediately rather than waiting for a guide.
  try { if (document.documentElement) start(); } catch (e) { /* not a document */ }
})();
