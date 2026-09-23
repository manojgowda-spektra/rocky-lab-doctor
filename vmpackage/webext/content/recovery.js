/*
 * LabPilot RECOVERY — Rocky notices you are stuck, and helps without giving the answer.
 *
 * THE BUG THIS FIXES FIRST. An adversarial review of the recovery design found that
 * LabPilotWorld.note() had ZERO callers anywhere in the extension (verified: every note() call
 * in content.js goes to LabPilotWatcher). So learner.attempts, errors and misclicks were
 * permanently 0, which made two of the four stuck reasons unreachable — and made the third
 * actively WRONG, because 'dwelling' requires attempts === 0 and would therefore fire on any
 * learner who had been busily clicking for 45 seconds.
 *
 * A hint ladder built on that foundation would escalate at the wrong learners for the wrong
 * reasons. So the feed comes first: it is a prerequisite, not an extra.
 *
 * THE LADDER, and why it is shaped this way. VanLehn's standard hint sequence is Point ->
 * Teach -> Bottom-out. Rocky's glow IS the Point rung, which is a pleasing alignment: his best
 * feature is the pedagogically correct first response. But the bottom-out rung — "the answer
 * is X" — is the one the evidence says to avoid: students given an answer-giving tutor scored
 * 17% WORSE than students who never had one, once it was removed (Bastani, PNAS 2025).
 *
 * So the ladder deliberately moves AWAY from the answer as it escalates:
 *
 *   rung 1  POINT     the glow already happened. Say which step, nothing more.
 *   rung 2  TEACH     what this kind of control is for — the reasoning, not the target
 *   rung 3  RECOVER   get back to a state we both understand
 *   rung 4  STOP      an honest admission, and an offer to be asked
 *
 * Rung 4 is not a hint. It is Rocky saying he is out of useful things to say, which is a
 * better end state than inventing a fifth rung.
 *
 * RESTRAINT IS THE DESIGN, not the ladder. Three rules, each with evidence behind it:
 *   - at most 3 unsolicited rungs in a row (HelpNeed: proactive hints help, but capped)
 *   - a minimum gap between them, reusing watcher.js's OWN budget logic rather than writing a
 *     second one that cannot see the first
 *   - exit is aggressive and cheap: any progress at all resets to rung 0. Recovery should be
 *     hard to enter and trivially easy to leave.
 *
 * window.LabPilotRecovery:
 *   start() / stop()
 *   status()        current rung, last reason, whether it is engaged
 *   _ladder(...)    pure rung selection, unit tested
 */
(function () {
  "use strict";
  if (window.LabPilotRecovery) return;

  var MAX_RUNGS = 3;          // unsolicited hints in a row before Rocky stops offering
  var MIN_GAP_MS = 20000;     // between rungs; longer than the pilot's own 8 s speaking gap
  var st = {
    on: false,
    rung: 0,
    lastRungAt: 0,
    lastReason: null,
    engaged: false,
    said: 0,
  };

  function W() { return window.LabPilotWorld; }
  function P() { return window.LabPilotPilot; }
  function R() { return window.LabPilotRocky; }
  function KB() { return window.LabPilotKB; }

  // ---- the feed: without this, stuck() is measuring nothing ---------------------------------

  /*
   * Mirrors watcher.js onClick's guards exactly — same [data-labpilot] exclusion, same
   * exploring() early return — so Rocky never counts his own UI or a learner who is
   * deliberately poking around in Explore mode as a failed attempt.
   */
  function onClick(e) {
    var raw = e && e.target;
    if (!raw || raw.nodeType !== 1) return;
    if (raw.closest && raw.closest('[data-labpilot="1"]')) return;     // our own UI
    if (R() && R().exploring) return;                                   // deliberate poking
    var w = W();
    if (!w) return;

    // Did they click the thing Rocky glowed? overlay.tracked is the currently glowed element,
    // and it is set on the pilot path too because pilot.pointAt() goes through overlay.guide().
    var glowed = null;
    try { glowed = window.LabPilotOverlay && window.LabPilotOverlay.tracked; } catch (e2) {}

    var el = (raw.closest && raw.closest('a,button,input,summary,label,[role],[tabindex]')) || raw;
    if (glowed && (el === glowed || (glowed.contains && glowed.contains(raw)))) {
      // Correct click: that is progress. Reset everything — this is the aggressive exit.
      w.note({ type: "complete" });
      reset("correct-click");
      return;
    }
    // Any other click is an attempt. Only a click on something Rocky GLOWED at can be called a
    // misclick; otherwise we have no basis for the judgement and say so by not making one.
    w.note({ type: glowed ? "misclick" : "click" });
  }

  // ---- the ladder (pure; unit tested) --------------------------------------------------------

  /*
   * Which rung, given the world and our own history. Returns null for "say nothing", which is
   * the common case and must stay the common case.
   */
  function ladder(world, state, nowMs) {
    if (!world || !world.step) return null;
    if (!world.stuck) return null;                         // not stuck: nothing to do
    if (state.rung >= MAX_RUNGS + 1) return null;          // said our piece; stop offering
    if (nowMs - state.lastRungAt < MIN_GAP_MS) return null;

    var next = state.rung + 1;
    var step = world.step;
    var label = (step.targets && step.targets[0] && step.targets[0].label) || "the next control";

    if (next === 1) {
      // POINT. The glow, if any, already happened. Add only WHERE we are.
      return {
        rung: 1, kind: "POINT",
        text: "You have been on this step a little while. It is: " + (step.text || label),
      };
    }
    if (next === 2) {
      // TEACH. What this kind of control is for — the reasoning, deliberately not the answer.
      var teach = null;
      try {
        if (KB() && KB().lookup) {
          var e = KB().lookup({ name: label, role: "button" });
          if (e && e.what) teach = "“" + label + "” is " + e.what + (e.does ? " " + e.does : "");
        }
      } catch (e3) {}
      return {
        rung: 2, kind: "TEACH",
        text: teach || ("This step wants you to find “" + label + "”. If it is not on screen, it is usually behind a menu, a tab, or a panel that has not been opened yet."),
      };
    }
    if (next === 3) {
      // RECOVER. Get back to a state we both understand, rather than hunting from here.
      return {
        rung: 3, kind: "RECOVER",
        text: "Let us get back to somewhere we both recognise. Go back to the page the guide opened this exercise on, and I will pick the step up from there.",
      };
    }
    // STOP. Not a hint: an honest admission, plus the one thing that is still useful.
    return {
      rung: 4, kind: "STOP",
      text: "I am out of useful suggestions for this step — I cannot see what is blocking you. Ask me a question and I will answer from the lab guide.",
    };
  }

  // ---- acting -------------------------------------------------------------------------------

  function reset(why) {
    if (st.rung === 0 && !st.engaged) return;
    st.rung = 0; st.engaged = false; st.lastReason = null;
    st.lastResetWhy = why || null;
  }

  function speak(rungObj) {
    var r = R();
    if (!r) return false;
    try {
      // announce() is the non-positional voice: recovery is about the situation, not about a
      // control, so Rocky should not fly anywhere to say it.
      r.announce(rungObj.text, {
        label: rungObj.kind === "STOP" ? "I AM STUCK TOO" : "STUCK?",
        mood: rungObj.kind === "STOP" ? "sad" : "concerned",
        hint: "",
      });
    } catch (e) { return false; }
    return true;
  }

  var lastIndex = -1, lastDone = -1;

  /*
   * One turn. Driven by the pilot's own perception events, never a timer — a recovery loop on
   * a clock would be the one thing the architecture forbids.
   */
  function turn() {
    if (!st.on) return;
    var w = W(), p = P();
    if (!w || !p) return;
    var world = w.current();
    if (!world || !world.step) return;

    // PROGRESS RESETS EVERYTHING. Advancing a step, or finishing one, means whatever they were
    // stuck on is behind them. Cheap to check and the most important rule here.
    if (world.index !== lastIndex || world.done !== lastDone) {
      lastIndex = world.index; lastDone = world.done;
      reset("progress");
      return;
    }

    var rungObj = ladder(world, st, Date.now());
    if (!rungObj) return;
    if (!speak(rungObj)) return;
    st.rung = rungObj.rung;
    st.lastRungAt = Date.now();
    st.lastReason = world.stuck;
    st.engaged = true;
    st.said++;
  }

  function start() {
    if (st.on) return { ok: false, why: "already-running" };
    st.on = true;
    document.addEventListener("click", onClick, true);
    // Ride the pilot's perception stream rather than adding a second observer.
    try {
      if (window.LabPilotPerceive) window.LabPilotPerceive.onChange(turn);
    } catch (e) {}
    return { ok: true };
  }

  function stop() {
    st.on = false;
    try { document.removeEventListener("click", onClick, true); } catch (e) {}
    reset("stopped");
  }

  function status() {
    return {
      on: st.on, rung: st.rung, engaged: st.engaged,
      lastReason: st.lastReason, said: st.said,
      lastResetWhy: st.lastResetWhy || null,
    };
  }

  window.LabPilotRecovery = {
    start: start, stop: stop, status: status,
    _ladder: ladder,            // pure, unit tested
    _state: st,
    _onClick: onClick,
    _limits: { MAX_RUNGS: MAX_RUNGS, MIN_GAP_MS: MIN_GAP_MS },
  };
})();
