/*
 * LabPilot WORLD MODEL — what Rocky knows, kept current at ~1 ms, with no model in the loop.
 *
 * THIS IS THE PRODUCT. The architecture's central claim is that continuous AWARENESS and
 * continuous REASONING are different things. Everything Rocky needs to know moment to moment —
 * which lab, which step, what is on screen, what the learner just did, whether they are stuck —
 * is maintained here by a state machine fed by events. A model that re-derived this every few
 * seconds would be slower, costlier, and less reliable, because it would derive it differently
 * each time. Intelligence lives in the state, not the token stream.
 *
 * FOUR PARTS:
 *   TaskGraph     the lab, parsed once from the guide: steps, targets, surfaces, order
 *   Position      a BELIEF over "which step am I on", not a guess — confidence accumulates
 *   LearnerState  attempts, errors, dwell, oscillation — the raw material for stuck detection
 *   Resolution    for the current step's target: resolved / ambiguous / absent, with score
 *
 * WHY POSITION IS A BELIEF. A single observation is ambiguous: two steps may both mention
 * "Create". STORM-PSR (procedure-step recognition on egocentric video) solves exactly this by
 * accumulating confidence over frames until a threshold, which also tolerates swapped and
 * repeated steps. Same idea here, with far cleaner observations. Rocky must never announce a
 * step from one weak signal, and must never get permanently stuck on a wrong one.
 *
 * WHY STEPS ARE PARTIALLY ORDERED. Lab steps within an exercise are often order-independent.
 * A strict list produces false "you skipped a step" alarms. Advancing on EVIDENCE (the target
 * is gone / the next step's target appeared) rather than on a counter handles a learner who
 * does 5 before 4 without complaining about it.
 *
 * window.LabPilotWorld:
 *   ingest(guide)      build the task graph from a guide-reader parse
 *   observe(screen)    update the model from a perception snapshot  (the hot path)
 *   current()          the whole state, for the monitor and for a model prompt
 *   note(event)        record a learner event (click, error, dismissal)
 *   reset()
 */
(function () {
  "use strict";
  if (window.LabPilotWorld) return;

  // ---- tuning ------------------------------------------------------------------------------
  // Deliberately conservative. The literature's thresholds (3-in-a-row mastery, 10 practice
  // opportunities) are calibrated to maths items, not portal steps, so they are not borrowed
  // here. These are starting points to be tightened from cohort telemetry.
  var CONF_ADVANCE = 0.65;   // belief needed before we say "you are on step N"
  var DECAY = 0.82;          // old evidence fades, so a wrong lock-on cannot persist
  var STUCK_MS = 45000;      // dwell on one step before considering the learner stuck
  var STUCK_ATTEMPTS = 3;    // failed/repeated attempts at the same target
  var OSCILLATE = 4;         // back-and-forth page changes that signal hunting

  function now() { return Date.now(); }
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim(); }

  // ---- the model ---------------------------------------------------------------------------
  var M = null;

  function blank() {
    return {
      lab: null,
      steps: [],            // TaskGraph
      belief: [],           // parallel to steps: P(on this step)
      index: -1,            // best-supported step, or -1 when unknown
      confidence: 0,
      done: {},             // stepId -> when it was satisfied
      resolution: null,     // last verdict for the current target
      learner: {
        enteredStep: now(),
        attempts: 0,        // actions taken on the current step
        errors: 0,
        misclicks: 0,
        routeChanges: 0,
        recentRoutes: [],
        lastEvent: now(),
        dismissed: {},      // label -> true, remembered for the whole session
      },
      url: "",
      updatedAt: now(),
    };
  }

  /*
   * INGEST — turn a guide-reader parse into the task graph.
   *
   * The guide reader already gives ordered targets with authored (1)(2)(3) click order and a
   * surface classification. This adds the per-step identity and the expected-evidence fields
   * the position belief needs.
   */
  function ingest(guide) {
    if (!M) M = blank();
    var steps = [];
    var raw = (guide && guide.steps) || [];
    for (var i = 0; i < raw.length; i++) {
      var s = raw[i];
      if (!s || !s.targets || !s.targets.length) continue;
      // every reading of every target, in the guide's own order
      var labels = [];
      for (var j = 0; j < s.targets.length; j++) {
        var t = s.targets[j];
        labels.push(t.label);
        if (t.alt && t.alt.length) labels = labels.concat(t.alt);
      }
      steps.push({
        id: "s" + steps.length,
        n: steps.length,
        text: s.text || "",
        targets: s.targets,            // ordered click targets within this instruction
        labels: labels,                // flattened, for cheap matching
        surface: s.surface || "browser",
        surfaceWhy: s.surfaceWhy || null,
        page: guide && guide.page,
      });
    }
    M.lab = (guide && guide.title) || M.lab;
    M.steps = steps;
    M.belief = steps.map(function () { return 0; });
    M.index = steps.length ? 0 : -1;
    M.confidence = 0;
    M.updatedAt = now();
    return M;
  }

  /*
   * OBSERVE — the hot path. Called on every meaningful screen change.
   *
   * `screen` is a perception snapshot: { url, title, controls: [{name, role, id}], }.
   * Cost is dominated by the label comparisons, which is why controls arrive pre-extracted
   * and pre-filtered to what is visible and interactive.
   */
  function observe(screen) {
    if (!M) M = blank();
    screen = screen || {};
    var t0 = (window.performance && performance.now) ? performance.now() : 0;

    // route change is a strong signal AND a learner event
    if (screen.url && screen.url !== M.url) {
      if (M.url) {
        M.learner.routeChanges++;
        M.learner.recentRoutes.push(screen.url);
        if (M.learner.recentRoutes.length > 8) M.learner.recentRoutes.shift();
      }
      M.url = screen.url;
    }

    // --- evidence for each step -------------------------------------------------------------
    // Cheap and deterministic: how many of a step's labels are present on screen right now.
    // A step whose controls are all visible is likely the current one; a step whose controls
    // have vanished is likely complete.
    var names = [];
    var ctrls = screen.controls || [];
    for (var c = 0; c < ctrls.length; c++) {
      var nm = norm(ctrls[c].name);
      if (nm) names.push(nm);
    }
    var haystack = " " + names.join(" | ") + " ";

    var best = -1, bestScore = 0;
    for (var i = 0; i < M.steps.length; i++) {
      var step = M.steps[i];
      var hit = 0;
      for (var l = 0; l < step.labels.length; l++) {
        var want = norm(step.labels[l]);
        if (!want) continue;
        // exact control name, or the label appearing inside one
        if (haystack.indexOf(" " + want + " ") >= 0) { hit += 1; }
        else if (haystack.indexOf(want) >= 0) { hit += 0.6; }
      }
      var evidence = step.labels.length ? hit / step.labels.length : 0;

      // A completed step decays: we should not keep believing we are on a step whose work is
      // visibly done. A step already marked done gets a strong penalty so the belief moves on.
      if (M.done[step.id]) evidence *= 0.25;

      // accumulate rather than replace — one ambiguous frame must not move the belief far
      M.belief[i] = (M.belief[i] * DECAY) + (evidence * (1 - DECAY) * 3);
      if (M.belief[i] > 1) M.belief[i] = 1;
      if (M.belief[i] > bestScore) { bestScore = M.belief[i]; best = i; }
    }

    // --- commit the belief ------------------------------------------------------------------
    if (best >= 0 && bestScore >= CONF_ADVANCE) {
      if (best !== M.index) {
        // moving forward means everything before it is satisfied — this is what makes
        // out-of-order work non-alarming: we infer completion from evidence, not a counter.
        for (var d = 0; d < best; d++) if (!M.done[M.steps[d].id]) M.done[M.steps[d].id] = now();
        M.index = best;
        M.learner.enteredStep = now();
        M.learner.attempts = 0;
      }
      M.confidence = bestScore;
    } else {
      M.confidence = bestScore;
    }

    M.updatedAt = now();
    M.lastObserveMs = t0 ? (performance.now() - t0) : 0;
    return M;
  }

  // ---- learner events ------------------------------------------------------------------------
  function note(ev) {
    if (!M) M = blank();
    ev = ev || {};
    var L = M.learner;
    L.lastEvent = now();
    if (ev.type === "click") { L.attempts++; }
    if (ev.type === "misclick") { L.misclicks++; L.attempts++; }
    if (ev.type === "error") { L.errors++; }
    if (ev.type === "dismiss" && ev.label) { L.dismissed[norm(ev.label)] = true; }
    if (ev.type === "complete" && M.index >= 0 && M.steps[M.index]) {
      M.done[M.steps[M.index].id] = now();
    }
    M.updatedAt = now();
    return M;
  }

  function setResolution(r) {
    if (!M) M = blank();
    M.resolution = r || null;
    return M;
  }

  /*
   * STUCK — cheap behavioural signals, each with support in the literature.
   * Returns a reason string, or null. The monitor decides what to do about it.
   */
  function stuck() {
    if (!M || M.index < 0) return null;
    var L = M.learner;
    var dwell = now() - L.enteredStep;
    // repeated attempts at the same step without advancing (wheel-spinning)
    if (L.attempts >= STUCK_ATTEMPTS) return "repeated-attempts";
    // hunting between pages (oscillation / back-and-forth navigation)
    if (L.routeChanges >= OSCILLATE) return "oscillating";
    // long dwell with no progress
    if (dwell > STUCK_MS && L.attempts === 0) return "dwelling";
    // an error the learner has not recovered from
    if (L.errors > 0 && (now() - L.lastEvent) > 15000) return "after-error";
    return null;
  }

  function currentStep() {
    if (!M || M.index < 0 || !M.steps[M.index]) return null;
    return M.steps[M.index];
  }

  function current() {
    if (!M) M = blank();
    return {
      lab: M.lab,
      step: currentStep(),
      index: M.index,
      total: M.steps.length,
      confidence: Math.round(M.confidence * 100) / 100,
      resolution: M.resolution,
      stuck: stuck(),
      done: Object.keys(M.done).length,
      learner: M.learner,
      url: M.url,
      observeMs: M.lastObserveMs,
    };
  }

  function dismissed(label) {
    return !!(M && M.learner.dismissed[norm(label)]);
  }

  function reset() { M = blank(); return M; }

  window.LabPilotWorld = {
    ingest: ingest,
    observe: observe,
    note: note,
    setResolution: setResolution,
    current: current,
    currentStep: currentStep,
    stuck: stuck,
    dismissed: dismissed,
    reset: reset,
    _tuning: { CONF_ADVANCE: CONF_ADVANCE, DECAY: DECAY, STUCK_MS: STUCK_MS, STUCK_ATTEMPTS: STUCK_ATTEMPTS, OSCILLATE: OSCILLATE },
  };
})();
