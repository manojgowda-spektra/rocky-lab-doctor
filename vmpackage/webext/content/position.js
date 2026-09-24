/*
 * LabPilot POSITION — the one answer to "where is the learner", and the only one anyone may quote.
 *
 * THE PROBLEM THIS REPLACES. Rocky had FOUR representations of position and they disagreed:
 *
 *   world-model.js   a belief distribution WITH a confidence            (honest)
 *   watcher.js       st.stepIndex, a hard counter, no confidence        (fed the AI prompt)
 *   content.js       state.stepIndex, a hard counter, no confidence     (fed four on-screen lines)
 *   explore.js       a copy of lpStepIndex from storage, no confidence  (fed the AI prompt)
 *
 * The honest one was the quiet one. lab-context.js asserted "The learner is on step N of M" into
 * the model's grounding paragraph from the counter that has no concept of being unsure, and
 * explore.js deleted its own step number with the comment "believed, not known — do not assert
 * it" and then re-added one two lines later from a different counter. So the belief model could
 * be perfectly calibrated, refuse to name a step, and Rocky would still tell the model a number.
 *
 * THE DISTINCTION THAT MAKES THIS TRACTABLE: CURSOR versus BELIEF.
 *
 *   CURSOR   where Rocky is currently guiding. Always defined once a lab is loaded, because the
 *            glow has to point at something. It is a decision Rocky made, not a claim about the
 *            learner, and it is never spoken as a fact.
 *   BELIEF   where the evidence says the learner actually is, with a confidence. Frequently
 *            unknown, and that is a legitimate answer.
 *
 * Conflating those two is the whole bug. A cursor is useful and must exist; it simply must not
 * be quoted. So this module exposes both, clearly labelled, and exposes exactly one field that
 * callers are permitted to put into text or a prompt:
 *
 *   sayable.stepNumber   a number, or null. Null means "do not state a step number", and there
 *                        is no second opinion to fall back on.
 *
 * EVERY VALUE CARRIES ITS PROVENANCE: source, confidence, at. A caller that wants to weigh a
 * value can; a caller that wants to quote one must check `sayable`.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not observe, infer, or advance anything. It reads the
 * subsystems that already exist and ranks them. Adding inference here would make it a fifth
 * source of truth, which is the thing being removed.
 *
 * window.LabPilotPosition.read() -> {
 *   belief, cursor, place, completed, next, workflow, recovery, sayable, sources
 * }
 */
(function () {
  "use strict";
  if (window.LabPilotPosition) return;

  /*
   * THE BAR FOR SAYING A NUMBER OUT LOUD.
   *
   * Matches pilot.js CONF_SHOW exactly, and deliberately so: a learner who sees "Step 3 of 5" in
   * the overlay and is told something different by the AI has lost all reason to trust either.
   * One threshold, one number, one place.
   */
  var SAY_AT = 0.80;

  function now() { return Date.now(); }

  function val(value, source, confidence, at) {
    return { value: value, source: source, confidence: confidence == null ? null : confidence, at: at || now() };
  }

  // ---- the subsystems, read defensively ---------------------------------------------------
  // Any of these can be absent: a frame with no guide, a build without the relay, a portal tab
  // where the pilot never started. Absent is a legitimate answer and must not throw.
  function W() { try { return window.LabPilotWorld || null; } catch (e) { return null; } }
  function P() { try { return window.LabPilotPilot || null; } catch (e) { return null; } }
  function R() { try { return window.LabPilotRelay || null; } catch (e) { return null; } }
  function C() { try { return window.LabPilotCompletion || null; } catch (e) { return null; } }
  function K() { try { return window.LabPilotCoach || null; } catch (e) { return null; } }

  function world() {
    var w = W();
    if (!w || !w.current) return null;
    try { return w.current(); } catch (e) { return null; }
  }
  function pilot() {
    var p = P();
    if (!p || !p.status) return null;
    try { return p.status(); } catch (e) { return null; }
  }

  /*
   * THE PLACE. Read from the portal's own declaration where the portal makes one.
   *
   * Measured: Purview publishes aria-current="page" on 6 of 6 pages and it forms a path —
   * "Insider Risk Management > Policies". Azure publishes none at all, in either frame, so
   * there the honest answer is the route and the heading. The confidence attached says which
   * kind of answer this is, so a caller never has to guess how much to trust it.
   */
  function place() {
    var out = { section: null, page: null, route: null, source: "none", confidence: 0, at: now() };
    try {
      out.route = location.pathname + (location.hash || "").split("?")[0];
    } catch (e) { /* no location */ }

    var cur = [];
    try {
      var nodes = document.querySelectorAll("[aria-current]");
      for (var i = 0; i < nodes.length; i++) {
        // BY VALUE, NEVER BY PRESENCE. getAttribute returns the string "false" on an unselected
        // item and "false" is truthy, so a presence check marks every nav item as current.
        var v = (nodes[i].getAttribute("aria-current") || "").toLowerCase();
        if (!v || v === "false") continue;
        var r = nodes[i].getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;          // declared but not drawn
        var nm = (nodes[i].getAttribute("aria-label") || nodes[i].textContent || "")
          .replace(/\s+/g, " ").trim().slice(0, 60);
        if (nm) cur.push(nm);
      }
    } catch (e) { /* no DOM */ }

    if (cur.length) {
      out.section = cur[0];
      out.page = cur.length > 1 ? cur[cur.length - 1] : null;
      out.source = "aria-current";
      // The portal stating where you are is as good as this gets from the browser.
      out.confidence = 0.95;
      return out;
    }

    // No declaration. Fall back to what the page calls itself, which is weaker but honest.
    try {
      var h = document.querySelector('main h1,[role="main"] h1,h1,main h2,[role="main"] h2');
      if (h) {
        out.page = (h.innerText || h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
        out.source = "heading";
        out.confidence = 0.5;
        return out;
      }
    } catch (e) { /* no DOM */ }

    if (out.route) { out.source = "route"; out.confidence = 0.3; }
    return out;
  }

  /*
   * THE LAST COMPLETION. Drawn from the frame relay, which carries events from EVERY frame —
   * on Azure the grid and every live region are in a cross-origin child the top frame cannot
   * see, so without the relay this would be permanently empty on the portal that needs it most.
   */
  function lastCompletion() {
    var r = R();
    if (!r || !r.events) return null;
    var evs;
    try { evs = r.events(); } catch (e) { return null; }
    if (!evs || !evs.length) return null;
    // Only a WORLD change may count as a completion. A dialog opening or a heading changing is
    // the learner moving, which is progress and not proof.
    var WORLD = { "list-grew": 1, "list-shrank": 1, "count-grew": 1, "count-shrank": 1, "empty-state-cleared": 1 };
    for (var i = evs.length - 1; i >= 0; i--) {
      var e = evs[i];
      if (WORLD[e.kind]) return e;
      if (e.kind === "announce" && e.klass === "success") return e;
    }
    return null;
  }

  function lastFailure() {
    var r = R();
    if (!r || !r.events) return null;
    var evs;
    try { evs = r.events(); } catch (e) { return null; }
    if (!evs) return null;
    for (var i = evs.length - 1; i >= 0; i--) {
      if (evs[i].kind === "announce" && evs[i].klass === "failure") return evs[i];
    }
    return null;
  }

  // ---- the read ----------------------------------------------------------------------------
  function read() {
    var w = world();
    var p = pilot();
    var t = now();

    /*
     * BELIEF. The world model's distribution, and nothing else is allowed to answer this.
     * index -1 means unknown, which is a real answer and must survive to the caller rather than
     * being replaced by a cursor.
     */
    var belief = {
      index: w && typeof w.index === "number" ? w.index : -1,
      total: w ? w.total || 0 : 0,
      text: w && w.step ? String(w.step.text || "") : null,
      targets: w && w.step ? (w.step.targets || []).map(function (x) { return x.label; }) : [],
      hop: w ? w.hop || 0 : 0,
      source: w ? "world-model" : "none",
      confidence: w ? (typeof w.confidence === "number" ? w.confidence : 0) : 0,
      at: w && w.updatedAt ? w.updatedAt : t,
    };

    /*
     * CURSOR. Where Rocky is pointing. A decision, not a claim. It exists so the glow and the
     * step list have something to follow while the belief is still unsure, and it is never
     * spoken. When the belief is confident they agree; when it is not, the cursor still moves
     * and the belief honestly says it does not know.
     */
    var cursorIndex = belief.index;
    var cursorSource = "belief";
    if (cursorIndex < 0) {
      // The bundle path keeps a cursor of its own for captured labs. It is a legitimate thing
      // to POINT with and an illegitimate thing to QUOTE, which is the whole distinction.
      var wk = null;
      try { wk = window.LabPilotWatcher && window.LabPilotWatcher.snapshot ? window.LabPilotWatcher.snapshot() : null; } catch (e) { wk = null; }
      if (wk && typeof wk.stepIndex === "number" && wk.totalSteps) {
        cursorIndex = wk.stepIndex;
        cursorSource = "bundle-cursor";
      }
    }
    var cursor = {
      index: cursorIndex,
      total: belief.total || (function () {
        try { var wk2 = window.LabPilotWatcher && window.LabPilotWatcher.snapshot(); return wk2 ? wk2.totalSteps || 0 : 0; }
        catch (e) { return 0; }
      })(),
      source: cursorSource,
      // A cursor has no confidence BY CONSTRUCTION. It is not a measurement.
      confidence: null,
      at: t,
    };

    var done = {
      count: w ? w.done || 0 : 0,
      ids: w && w.doneMap ? Object.keys(w.doneMap) : [],
      complete: !!(w && w.complete),
      source: w ? "world-model" : "none",
      confidence: null,
      at: t,
    };

    // The next UNFINISHED step, by the guide's own words, from the ledger rather than the belief.
    var next = { index: -1, text: null, source: "none", confidence: null, at: t };
    if (w && w.steps && w.steps.length) {
      for (var i = 0; i < w.steps.length; i++) {
        if (w.doneMap && w.doneMap[w.steps[i].id]) continue;
        next.index = i;
        next.text = String(w.steps[i].text || "");
        next.source = "done-ledger";
        break;
      }
    }

    var comp = lastCompletion();
    var fail = lastFailure();

    /*
     * WORKFLOW STATE. One word for what is happening, derived and never stored, so it cannot go
     * stale the way a cached flag does.
     */
    var state = "unknown";
    if (done.complete) state = "complete";
    else if (p && p.exploring) state = "exploring";
    else if (w && w.stuck) state = "stuck";
    else if (belief.index >= 0) state = "guiding";
    else if (w && w.steps && w.steps.length) state = "searching";

    var recovery = {
      reason: w ? w.stuck || null : null,
      // A failure the PORTAL announced is a far better reason to intervene than a dwell timer,
      // and it says why.
      failure: fail ? { text: fail.text, frame: fail.frame, at: fail.t } : null,
      source: fail ? "relay" : (w && w.stuck ? "world-model" : "none"),
      confidence: null,
      at: t,
    };

    /*
     * SAYABLE. The only field a caller may put into text, a prompt, or anything a learner reads.
     *
     * Null is not a failure to compute. It is the answer: do not state a step number. There is
     * deliberately no fallback, because every previous bug in this area came from one.
     */
    var sayable = { stepNumber: null, total: belief.total || 0, source: "none", why: "" };

    /*
     * SCRIPT MODE, AND WHY IT IS SAYABLE.
     *
     * The bundle path and the pilot path are MUTUALLY EXCLUSIVE — content.js hands over to the
     * pilot the moment a guide is found on screen, and drives the lab itself only when there is
     * none ("whichever answers first drives the glow, and the other is never started"). So in
     * bundle mode there is no belief at all, and gating on one would leave a captured lab
     * showing no progress whatsoever.
     *
     * That cursor is not invented, though. content.js advances it on OBSERVED navigation — the
     * page reaching the state the recorded step describes — not on a timer and not on a click.
     * It is a weaker authority than a measured belief and a far stronger one than a guess, so
     * it may be stated, and it is labelled `script` everywhere it is used. A caller that needs
     * the difference reads sayable.source; a caller that just needs a number gets one that is
     * honestly derived either way.
     */
    if (!w && cursor.source === "bundle-cursor" && cursor.index >= 0 && cursor.total) {
      sayable.stepNumber = cursor.index + 1;
      sayable.total = cursor.total;
      sayable.source = "script";
      sayable.why = "following a recorded script; the cursor advances on observed navigation";
    } else if (!w) sayable.why = "no world model in this frame";
    else if (belief.index < 0) sayable.why = "position unknown";
    else if (done.complete) sayable.why = "the lab is complete; there is no current step";
    else if (belief.confidence < SAY_AT) {
      sayable.why = "confidence " + belief.confidence.toFixed(2) + " is below " + SAY_AT;
    } else {
      sayable.stepNumber = belief.index + 1;
      sayable.source = "belief";
      sayable.why = "belief at " + belief.confidence.toFixed(2);
    }

    return {
      belief: belief,
      cursor: cursor,
      place: place(),
      completed: done,
      next: next,
      lastCompletion: comp ? { kind: comp.kind, frame: comp.frame, from: comp.from, to: comp.to, text: comp.text, at: comp.t, source: "relay" } : null,
      workflow: { state: state, source: "derived", confidence: null, at: t },
      recovery: recovery,
      sayable: sayable,
      sources: {
        world: !!w, pilot: !!p, relay: !!R(), completion: !!C(), coach: !!K(),
        relayEvents: (function () { try { return R() ? R().events().length : 0; } catch (e) { return 0; } })(),
      },
      at: t,
    };
  }

  /*
   * THE SENTENCE A MODEL IS ALLOWED TO BE TOLD.
   *
   * Prompt text is where a wrong number does the most damage, because a model will restate it
   * fluently and the learner has no way to tell it came from a guess. So the prompt line is
   * built HERE, once, from `sayable` — never by the caller assembling its own from an index.
   * When the number is not sayable the sentence says what IS known instead of omitting the
   * subject, because a model given no position will invent one.
   */
  function promptLine() {
    var s = read();
    if (s.sayable.stepNumber) {
      // The model is told WHICH authority this came from. The two are not equally strong, and a
      // model that knows the difference can hedge in the same places Rocky would.
      return s.sayable.source === "script"
        ? "Rocky is walking the learner through a recorded script and is on step " +
          s.sayable.stepNumber + " of " + s.sayable.total +
          ". That is Rocky's position in the script, advanced on observed navigation."
        : "The learner is on step " + s.sayable.stepNumber + " of " + s.sayable.total + ".";
    }
    if (s.completed.complete) return "The learner appears to have completed every step of this lab.";
    var bits = [];
    if (s.place.section) bits.push("in " + s.place.section + (s.place.page ? " > " + s.place.page : ""));
    else if (s.place.page) bits.push("on a page headed “" + s.place.page + "”");
    if (s.completed.count) bits.push(s.completed.count + " of " + (s.belief.total || "?") + " steps look done");
    if (s.next.text) bits.push("the next unfinished step is: " + s.next.text.slice(0, 120));
    if (!bits.length) return "Rocky does not know which step the learner is on. Do not guess one.";
    return "Rocky is NOT certain which step the learner is on (" + s.sayable.why + "). " +
           "What is known: " + bits.join("; ") + ". Do not state a step number.";
  }

  window.LabPilotPosition = {
    read: read,
    promptLine: promptLine,
    SAY_AT: SAY_AT,
    _place: place,
  };
})();
