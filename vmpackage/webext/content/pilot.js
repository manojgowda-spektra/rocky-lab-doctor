/*
 * LabPilot PILOT — the monitor and governor. The loop that makes Rocky work on any lab.
 *
 * WHAT THIS REPLACES. Until now Rocky needed a bundle captured by walking each lab once. The
 * guide reader, the label resolver and the world model each existed or were built, but nothing
 * joined them, so guide-driven guidance never actually drove a glow. This is that join:
 *
 *      guide-reader  ──▶  world-model  ──▶  label-resolver  ──▶  overlay
 *        (steps)          (which step)       (which control)      (glow)
 *                              ▲
 *                         perception
 *                     (what is on screen)
 *
 * THE MONITOR. Runs on every meaningful change, costs ~1 ms, and decides one of four things:
 *
 *      POINT     the target resolved uniquely     -> glow it, one line of why
 *      ASK       two candidates, neither unique   -> name them, do not point
 *      SILENT    on track, nothing worth saying   -> say nothing at all
 *      ESCALATE  stuck, or an unrecognised state  -> hand to the reasoner (later phase)
 *
 * Nothing here decides WHAT to glow. The label resolver hands the request to the existing
 * anchor engine and its 0.70 / 0.20 / no-contradiction contract adjudicates. The pilot only
 * decides WHETHER to speak — which is the governor's job, and the part that keeps Rocky from
 * becoming Clippy.
 *
 * THE GOVERNOR'S RULES, and why each exists:
 *   - dismissals are permanent. Clippy's fatal property was persisting after being dismissed
 *     "an arbitrary number of times". Once a learner waves Rocky off a target, he stays off it.
 *   - defer to a step boundary. Interrupting mid-task rather than between tasks doubles errors
 *     and adds up to 106% annoyance (Bailey & Konstan, N=50). Non-urgent nudges wait.
 *   - a budget. Silence is a feature; a companion with nothing to say should say nothing.
 *
 * window.LabPilotPilot:
 *   start()      begin guiding from the guide on screen
 *   stop()
 *   status()     what Rocky currently believes and is doing
 *   mode(name)   guided | observe | assessment
 */
(function () {
  "use strict";
  if (window.LabPilotPilot) return;

  var MIN_GAP_MS = 8000;      // never speak twice inside this window
  var RE_POINT_MS = 20000;    // re-glow the same target only this often

  var st = {
    on: false,
    mode: "guided",
    lastSpoke: 0,
    lastTarget: "",
    lastPointAt: 0,
    said: 0,
    glowing: null,
  };

  function W() { return window.LabPilotWorld; }
  function P() { return window.LabPilotPerceive; }
  function L() { return window.LabPilotLabel; }
  function O() { return window.LabPilotOverlay; }
  function G() { return window.LabPilotGuide; }

  /*
   * DECIDE — the monitor. Pure, cheap, and testable without a DOM.
   *
   * Takes the world model's current view plus a resolution verdict; returns an action. Kept
   * free of side effects so the same function can be unit tested and, later, explained to a
   * learner ("I stayed quiet because ...").
   */
  function decide(world, verdict, nowMs, state) {
    if (!world || !world.step) return { act: "SILENT", why: "no-step" };
    if (state.mode === "assessment") return { act: "SILENT", why: "assessment-mode" };

    var step = world.step;

    // A step Rocky cannot see is a step he should not hunt for. Naming the surface is more
    // useful than silently failing to find a control that was never in the browser.
    if (step.surface && step.surface !== "browser") {
      return { act: "SILENT", why: "surface:" + step.surface, surface: step.surface };
    }

    // Permanent dismissal beats everything except an explicit question.
    if (verdict && verdict.label && W() && W().dismissed(verdict.label)) {
      return { act: "SILENT", why: "dismissed" };
    }

    // Observe mode: only speak when the learner is actually stuck.
    if (state.mode === "observe" && !world.stuck) {
      return { act: "SILENT", why: "observe-mode" };
    }

    if (verdict && verdict.status === "resolved") {
      // Do not re-say the same thing. Re-glow only after a decent interval, or if the
      // target changed.
      var sameTarget = verdict.label === state.lastTarget;
      if (sameTarget && (nowMs - state.lastPointAt) < RE_POINT_MS) {
        return { act: "SILENT", why: "already-pointing" };
      }
      if ((nowMs - state.lastSpoke) < MIN_GAP_MS && !sameTarget) {
        return { act: "DEFER", why: "min-gap" };
      }
      return { act: "POINT", why: "resolved", verdict: verdict, step: step };
    }

    if (verdict && verdict.status === "ambiguous") {
      // Two plausible candidates. Naming the ambiguity is honest and useful; guessing is not.
      if ((nowMs - state.lastSpoke) < MIN_GAP_MS) return { act: "DEFER", why: "min-gap" };
      return { act: "ASK", why: "ambiguous", verdict: verdict, step: step };
    }

    // absent. Silence is right unless the learner is stuck — then say what we are looking for.
    if (world.stuck) {
      if ((nowMs - state.lastSpoke) < MIN_GAP_MS) return { act: "DEFER", why: "min-gap" };
      return { act: "ESCALATE", why: world.stuck, step: step, verdict: verdict };
    }
    return { act: "SILENT", why: (verdict && verdict.reason) || "absent" };
  }

  // ---- speaking -----------------------------------------------------------------------------

  // Rocky has no generic say(): the character exposes checking() for "thinking out loud" and
  // happy() for good news. checking() is the right voice for everything the pilot says, since
  // every one of its messages is about finding or not finding something.
  function say(text) {
    try {
      var R = window.LabPilotRocky;
      if (R && R.checking) { R.checking(text); return true; }
    } catch (e) { /* ignore */ }
    return false;
  }

  /*
   * PROGRESS, stated only when it is true.
   *
   * The world model tracks a BELIEF about which step the learner is on, not a fact. Rendering
   * "Step 4 of 12" from a belief of 0.31 would be Rocky asserting something he does not know —
   * the exact failure the project forbids everywhere else. So progress is shown only when the
   * belief has actually converged; below that Rocky shows the step text and no number.
   *
   * CONF_SHOW is deliberately above the world model's own CONF_ADVANCE (0.65). Moving the
   * internal pointer on decent evidence is fine; telling the learner a number needs more.
   */
  var CONF_SHOW = 0.80;

  function progressFor(world) {
    if (!world || world.index < 0 || !world.total) return null;
    if (world.confidence < CONF_SHOW) return null;      // honest silence beats a wrong number
    return { n: world.index + 1, total: world.total };
  }

  function pointAt(verdict, step, world) {
    var o = O();
    if (!o || !verdict.element) return false;
    try {
      // overlay.guide(el, text, meta) glows the element and flies Rocky to it. meta.progress
      // drives the existing step counter and bar; omitted when Rocky is not sure.
      var meta = {};
      var p = progressFor(world);
      if (p) meta.progress = p;
      o.guide(verdict.element, step.text || verdict.label, meta);
    } catch (e) { return false; }
    st.glowing = verdict.label;
    return true;
  }

  function clearGlow() {
    var o = O();
    if (!o) return;
    try { o.hide(); } catch (e) { /* ignore */ }
    st.glowing = null;
  }

  // ---- the loop ------------------------------------------------------------------------------

  /*
   * One turn. Called on a perception change, not on a timer. This is the whole hot path and it
   * should stay in single-digit milliseconds.
   */
  function turn(snap) {
    if (!st.on) return;
    var w = W(), l = L();
    if (!w || !l) return;

    // 1. update the world model from what is on screen  (~1 ms)
    w.observe({ url: snap.url, title: snap.title, controls: snap.controls });

    var world = w.current();
    if (!world.step) return;

    // 2. resolve the current step's target against the live page  (~1 ms)
    var labels = [];
    var tg = world.step.targets || [];
    for (var i = 0; i < tg.length; i++) {
      // Only the FIRST unsatisfied target in an instruction matters: "(1) File then (2) Open
      // Folder" means point at File until it is gone, then Open Folder.
      labels.push(tg[i].label);
      if (tg[i].alt) labels = labels.concat(tg[i].alt);
      break;
    }
    var verdict = labels.length ? l.resolveAny(labels) : { status: "absent", reason: "no-labels" };
    w.setResolution({ status: verdict.status, score: verdict.score, label: verdict.label });

    // 3. decide whether to speak  (~0 ms)
    var d = decide(world, verdict, Date.now(), st);

    // 4. act
    if (d.act === "POINT") {
      if (pointAt(verdict, world.step, world)) {
        st.lastSpoke = Date.now();
        st.lastPointAt = Date.now();
        st.lastTarget = verdict.label;
        st.said++;
      }
    } else if (d.act === "ASK") {
      clearGlow();
      say("I can see more than one “" + (verdict.label || "match") + "”. Which part of the page are you on?", "think");
      st.lastSpoke = Date.now();
      st.said++;
    } else if (d.act === "ESCALATE") {
      clearGlow();
      var what = (world.step.targets && world.step.targets[0] && world.step.targets[0].label) || "the next control";
      say("I cannot find “" + what + "” on this page. " +
          (world.step.text ? "The guide says: " + world.step.text.slice(0, 120) : ""), "sad");
      st.lastSpoke = Date.now();
      st.said++;
    }
    st.lastDecision = d;
  }

  function start() {
    if (st.on) return { ok: false, why: "already-running" };
    var g = G(), w = W(), p = P();
    if (!g || !w || !p) return { ok: false, why: "missing-dependency" };

    var guide = g.read();
    if (!guide || !guide.steps || !guide.steps.length) {
      return { ok: false, why: "no-guide-on-screen" };
    }
    w.ingest(guide);
    st.on = true;

    // re-ingest when the learner turns the page
    g.onChange(function (gg) {
      if (!st.on) return;
      if (gg && gg.steps && gg.steps.length) w.ingest(gg);
    });

    p.onChange(turn);

    // Recovery rides the same perception stream. It also FEEDS the world model — until it
    // starts, learner.attempts/errors/misclicks stay zero and stuck() is measuring nothing,
    // so this is a prerequisite for stuck detection rather than an optional extra.
    try { if (window.LabPilotRecovery) window.LabPilotRecovery.start(); } catch (e) {}

    turn(p.snapshot());               // act on what is already on screen
    return { ok: true, steps: guide.steps.length };
  }

  function stop() { st.on = false; clearGlow(); }

  function status() {
    var w = W();
    var world = w ? w.current() : null;
    return {
      on: st.on,
      mode: st.mode,
      said: st.said,
      glowing: st.glowing,
      lastDecision: st.lastDecision || null,
      world: world,
      // null when Rocky is not confident enough to claim a position. Callers must render the
      // absence as "working on it", never as step 0.
      progress: progressFor(world),
    };
  }

  function mode(name) {
    if (name && ["guided", "observe", "assessment"].indexOf(name) >= 0) {
      st.mode = name;
      if (name !== "guided") clearGlow();
    }
    return st.mode;
  }

  window.LabPilotPilot = {
    start: start,
    stop: stop,
    status: status,
    mode: mode,
    _decide: decide,           // pure, unit-tested
    _state: st,
  };
})();
