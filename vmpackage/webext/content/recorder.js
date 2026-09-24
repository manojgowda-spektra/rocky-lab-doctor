/*
 * LabPilot RECORDER 2.0 — record the WORKFLOW, not the clicks.
 *
 * WHAT THE OLD RECORDER DID, AND WHY IT WAS NOT ENOUGH. capture.js turns a clicked element into
 * a selector bundle, and bundles/foundry-develop-ai-full.json ships 28 recorded steps. Of those
 * 28, ZERO record anything about the state AFTER the click. It captures the cause and never the
 * effect — so it can say what to point at and can never say whether the step worked.
 *
 * THE ONE ARCHITECTURAL DECISION THAT MATTERS HERE: this records what POSITION AND COMPLETION
 * ALREADY PRODUCE, rather than extracting signals a second way. If the recorder had its own
 * reading of the page, a pack could describe a world the runtime cannot perceive — the recording
 * would look perfect and guidance would fail, and the difference would be invisible until a
 * learner hit it. Recording the runtime's own view makes "can Rocky see this?" true by
 * construction, and makes an unobservable step a finding at RECORD time instead of a mystery at
 * run time.
 *
 * CONTINUOUS, NOT STEP BY STEP. The operator does the lab once, normally. Nothing is annotated
 * as it happens. Every step boundary, every expected outcome and every discrimination score is
 * derived afterwards from the whole pass — and discrimination in particular CANNOT be computed
 * any other way, because "does this signal also hold at eleven other steps" is a question about
 * the whole run. A per-step capture reproduces the furniture bug inside the completion channel:
 * an "expected state" that is true everywhere is furniture wearing a new hat.
 *
 * WHAT IT RECORDS
 *   place       Position.read().place — aria-current path, heading, route, with provenance
 *   world       the belief and the cursor, so a derived pack knows what Rocky thought at the time
 *   events      the relay stream: announcements, list cardinality changes, dialogs, from EVERY
 *               frame including the cross-origin Azure blade
 *   actions     what the operator clicked, with the control's identity and its region
 *   timing      wall-clock on everything, so latency classes can be derived rather than guessed
 *
 * WHAT IT DOES NOT RECORD. Form values, keystrokes, page text beyond accessible names, or
 * anything from a frame Rocky would not read at runtime. A recorder on an authenticated
 * enterprise portal is keylogger-shaped and this one is deliberately not.
 *
 * SAFETY. Off by default and armed explicitly. It never ships enabled in a learner build — see
 * recorder-test.js, which fails if the manifest loads it without the operator gate.
 *
 * window.LabPilotRecorder:
 *   arm(name)    begin recording under a name
 *   stop()       end, and return the trace
 *   status()     what is captured so far
 *   trace()      the trace as an object
 *   dump()       the trace as JSON text
 */
(function () {
  "use strict";
  if (window.LabPilotRecorder) return;

  var F = window.LabPilotFrame || { isTop: true, ownsUI: true };

  // Only the top frame records. It already receives every child frame's events through the
  // relay, so recording in children would duplicate the stream and lose the ordering that
  // makes a trace derivable.
  var TOP = !!F.isTop;

  var SAMPLE_MS = 1000;        // matches perception's cadence; a sample is only kept if it moved
  var MAX_SAMPLES = 3000;      // ~50 minutes of change at one per second
  var MAX_ACTIONS = 1000;

  var on = false;
  var trace = null;
  var timer = 0;
  var lastSig = "";

  function nowMs() { return Date.now(); }

  function P() { try { return window.LabPilotPosition || null; } catch (e) { return null; } }
  function R() { try { return window.LabPilotRelay || null; } catch (e) { return null; } }

  function blank(name) {
    return {
      schema: "rocky-trace/2",
      name: name || "untitled",
      recordedAt: new Date().toISOString(),
      portal: (function () { try { return location.host; } catch (e) { return "?"; } })(),
      startedAt: nowMs(),
      endedAt: null,
      // Every sample is a PLACE plus what Rocky believed at that moment. Kept only when it
      // differs from the previous one: an idle page is byte-stable (measured), so an unchanged
      // sample carries no information and would only dilute the derivation.
      samples: [],
      // The relay stream, verbatim. Already de-duplicated and timestamped, and already carries
      // which frame each event came from.
      events: [],
      // What the operator did. The only direct evidence of intent in the whole trace.
      actions: [],
      notes: [],
    };
  }

  function placeSig(s) {
    if (!s) return "";
    return [s.place.section || "", s.place.page || "", s.place.route || "",
            s.belief.index, s.completed.count, s.workflow.state].join("│");
  }

  function sample() {
    if (!on || !trace) return;
    var p = P();
    if (!p) return;
    var s;
    try { s = p.read(); } catch (e) { return; }

    var sig = placeSig(s);
    if (sig === lastSig) return;                 // nothing moved; an unchanged sample is noise
    lastSig = sig;

    if (trace.samples.length < MAX_SAMPLES) {
      trace.samples.push({
        t: nowMs() - trace.startedAt,
        url: s.place.route || "",
        place: {
          section: s.place.section, page: s.place.page,
          source: s.place.source, confidence: s.place.confidence,
        },
        heading: s.place.page || null,
        belief: { index: s.belief.index, confidence: s.belief.confidence },
        cursor: { index: s.cursor.index, source: s.cursor.source },
        completed: s.completed.count,
        workflow: s.workflow.state,
      });
    }

    // Drain whatever the relay has heard since the last drain. The relay de-duplicates, so a
    // repeated read costs nothing and nothing is double-counted.
    var r = R();
    if (r && r.events) {
      var evs;
      try { evs = r.events(); } catch (e) { evs = []; }
      var have = {};
      for (var i = 0; i < trace.events.length; i++) have[trace.events[i]._k] = 1;
      for (var j = 0; j < evs.length; j++) {
        var e = evs[j];
        var k = [e.frame, e.kind, e.text || "", e.name || "", e.from, e.to].join("│");
        if (have[k]) continue;
        trace.events.push({
          _k: k, t: (e.t || nowMs()) - trace.startedAt,
          frame: e.frame, kind: e.kind, klass: e.klass || null,
          text: e.text || null, name: e.name || null,
          from: e.from == null ? null : e.from, to: e.to == null ? null : e.to,
          declared: e.declared === true, assertive: e.assertive === true,
          count: e.count == null ? null : e.count,
        });
      }
    }
  }

  /*
   * A CLICK IS THE ONLY DIRECT EVIDENCE OF INTENT.
   *
   * Everything else in a trace is the world reacting. What the operator chose to press is what
   * separates "the page changed" from "the page changed BECAUSE of this", and it is what lets
   * the deriver attribute an outcome to a step. The control's REGION is recorded beside its
   * name because "Policies in the nav" and "Policies in the grid" are different controls with
   * the same label, and the derivation has to be able to tell them apart.
   */
  function regionOf(el) {
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

  function nameOf(el) {
    try {
      var a = el.getAttribute && el.getAttribute("aria-label");
      if (a && a.trim()) return a.trim().slice(0, 80);
      var t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      return t.slice(0, 80);
    } catch (e) { return ""; }
  }

  function onClick(e) {
    if (!on || !trace) return;
    var el = e.target;
    try { if (el && el.closest && el.closest('[data-labpilot], #labpilot-overlay-root, #labpilot-rocky')) return; }
    catch (x) { return; }
    var hit = null;
    try {
      hit = el.closest('a[href],button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="treeitem"],[role="option"],input,select,summary') || el;
    } catch (x) { hit = el; }
    if (!hit || trace.actions.length >= MAX_ACTIONS) return;

    var p = P();
    var before = null;
    try { before = p ? p.read() : null; } catch (x) { before = null; }

    trace.actions.push({
      t: nowMs() - trace.startedAt,
      name: nameOf(hit),
      role: (hit.getAttribute && hit.getAttribute("role")) || (hit.tagName || "").toLowerCase(),
      region: regionOf(hit),
      // The place the click was made FROM. The deriver needs the start state of a transition,
      // and asking after the fact would read the state the click produced.
      from: before ? {
        section: before.place.section, page: before.place.page,
        route: before.place.route, completed: before.completed.count,
      } : null,
    });
    // Take a sample immediately so the transition has a boundary the deriver can find.
    lastSig = "";
    setTimeout(sample, 0);
  }

  function arm(name) {
    if (!TOP) return { ok: false, why: "only the top frame records" };
    if (on) return { ok: false, why: "already recording", name: trace.name };
    trace = blank(name);
    on = true;
    lastSig = "";
    try { document.addEventListener("click", onClick, true); } catch (e) { /* no document */ }
    try { timer = setInterval(sample, SAMPLE_MS); } catch (e) { timer = 0; }
    sample();
    return { ok: true, name: trace.name };
  }

  function stop() {
    if (!on) return null;
    sample();
    on = false;
    try { clearInterval(timer); } catch (e) { /* nothing */ }
    try { document.removeEventListener("click", onClick, true); } catch (e) { /* nothing */ }
    trace.endedAt = nowMs();
    trace.durationMs = trace.endedAt - trace.startedAt;
    return trace;
  }

  function status() {
    if (!trace) return { recording: false, armed: false };
    return {
      recording: on, name: trace.name,
      samples: trace.samples.length, events: trace.events.length, actions: trace.actions.length,
      seconds: Math.round(((on ? nowMs() : trace.endedAt) - trace.startedAt) / 1000),
      places: (function () {
        var seen = {}, out = [];
        for (var i = 0; i < trace.samples.length; i++) {
          var k = (trace.samples[i].place.section || "") + ">" + (trace.samples[i].place.page || "");
          if (!seen[k]) { seen[k] = 1; out.push(k); }
        }
        return out;
      })(),
    };
  }

  function note(text) {
    if (!trace) return null;
    trace.notes.push({ t: nowMs() - trace.startedAt, text: String(text || "").slice(0, 200) });
    return status();
  }

  function dump() {
    if (!trace) return null;
    var out = JSON.parse(JSON.stringify(trace));
    for (var i = 0; i < out.events.length; i++) delete out.events[i]._k;
    return JSON.stringify(out, null, 1);
  }

  window.LabPilotRecorder = {
    arm: arm, stop: stop, status: status, note: note, dump: dump,
    trace: function () { return trace; },
    isTop: TOP,
    _sample: sample,
    _regionOf: regionOf,
  };
})();
