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
  /*
   * TOP FRAME ONLY.
   *
   * With all_frames:true — required because the Azure portal renders every blade control and
   * every grid row inside a cross-origin iframe on portal.azure.net — this file would
   * otherwise run once per frame. That means one Rocky per frame, each with its own belief,
   * arguing on screen. The UI, the decisions and the single source of truth live in the top
   * frame; a child frame observes and reports and draws nothing.
   */
  // Fails OPEN: if frame.js somehow did not load, run anyway rather than vanish.
  // frame.js is first in the manifest, so a real child frame always carries it.
  if (window.LabPilotFrame && !window.LabPilotFrame.ownsUI) return;

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
    saidFailure: null,     // id of the last failure announced, so each one is said exactly once
  };

  function W() { return window.LabPilotWorld; }
  function POS() { return window.LabPilotPosition; }
  function MEN() { return window.LabPilotMentor; }
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
      // Correct click: for the LADDER that is progress - whatever they were stuck on, they
      // have just done it - so reset; this is the aggressive exit.
      //
      // It is NOT completion of the step. A click is an action; the step is done when the
      // page reaches the state the guide describes ("wait for the success notification", the
      // menu opening for the next hop), and that has to be observed. progress.js owns that
      // judgement: hand it the glowed element and let the evidence decide.
      var PG = window.LabPilotProgress;
      if (PG && PG.arm) { try { PG.arm(glowed); } catch (e4) {} }
      else w.note({ type: "complete" });           // no end-state module loaded: the old rule
      reset("correct-click");
      return;
    }
    /*
     * A CLICK IS ONLY AN ATTEMPT WHEN THERE WAS SOMETHING TO MISS.
     *
     * Every click anywhere used to count as an attempt, so a learner correctly filling three
     * fields of a wizard Rocky had nothing glowed on was, by the third field, "stuck" — and the
     * ladder said "this one takes people a minute" to someone doing it right. Verified on the
     * demo path: the Create-policy wizard is three clicks.
     *
     * With nothing glowed there is no target, so a click is not evidence of struggling with
     * one; it is the learner working. Only a click that misses a glowed control is an attempt.
     */
    if (!glowed) return;
    w.note({ type: "misclick" });
  }

  /*
   * RUNG 0 - DIAGNOSE. The portal already said what went wrong; Rocky was not listening.
   *
   * Everything below this point is a DWELL ladder: it fires because time passed. That is the
   * weakest evidence in the building, and until now it was the only trigger recovery had -
   * so the best Rocky could manage at a learner staring at a red error banner was "you have
   * been on this step a little while".
   *
   * The relay carries the portal's own failure announcements from every frame, including the
   * cross-origin Azure blade where they actually appear, and position.read().recovery.failure
   * surfaces the latest one. Reacting to THAT is the difference between a timer and a trainer:
   * "you have been here a while" becomes "that failed on permissions, and here is what that
   * usually means".
   *
   * Rung 0 sits OUTSIDE the ladder and does not consume a rung. A learner who hits three
   * genuine errors deserves three genuine diagnoses, and should still have the full hint
   * ladder afterwards.
   */
  var FAILURE_TTL_MS = 45000;   // older than this is old news, not something that just happened
  var FAILURE_GAP_MS = 5000;    // two failures in the same breath get one sentence, not two

  var FAILURES = [
    { code: "permission",
      // "aren't assigned to a role group" is Purview's wording; recorded live, see completion.js.
      re: /permission|not authoriz|unauthoriz|access denied|forbidden|do not have access|don.t have (the )?right|insufficient privileg|requires? (the )?role|assigned to a role|role group/i,
      move: "That is a permissions problem, not something you typed wrong. In a lab it usually " +
            "means the account has not been given the role yet. Wait a minute, refresh, and try " +
            "again - role assignments take time to take effect." },
    { code: "conflict",
      re: /already exists|already in use|already been|conflict|duplicate|is taken/i,
      move: "Something with that name is already there. Either an earlier attempt of yours " +
            "worked, or you need a different name." },
    { code: "notfound",
      re: /not found|does not exist|no longer exists|could not be found|couldn.t be found|\b404\b/i,
      move: "Whatever that was pointing at is not there. Usually it means an earlier step did " +
            "not finish, rather than this one being wrong." },
    { code: "transient",
      re: /try again|timed out|timeout|temporar|throttl|too many requests|network error|\b(503|500|502|429)\b/i,
      move: "That one looks temporary. Give it a moment and do exactly the same thing again." },
    { code: "validation",
      re: /required|invalid|must be|not valid|please enter|cannot be empty|can.t be empty|too (long|short)/i,
      move: "The form is not happy with something on it. Look for the field marked in red - the " +
            "portal puts the reason right next to it." },
  ];

  /*
   * Pure, and unit tested. Returns a code and the one useful thing to do about it, or the
   * unknown class - which deliberately offers no advice, because inventing a plausible cause
   * for an error Rocky cannot read is exactly the behaviour that loses a learner's trust.
   */
  function classify(text) {
    var s = String(text || "");
    for (var i = 0; i < FAILURES.length; i++) {
      if (FAILURES[i].re.test(s)) return { code: FAILURES[i].code, move: FAILURES[i].move };
    }
    return { code: "unknown", move: "" };
  }

  function diagnose(state, failure, nowMs) {
    if (!failure || !failure.text) return null;
    // RISING EDGE, not a state. A failure banner that is merely PRESENT says nothing about
    // now; one that has just arrived says everything. Same rule as the Completion Engine.
    var id = failure.at + "│" + failure.text;
    if (state.saidFailure === id) return null;
    if (!failure.at || nowMs - failure.at > FAILURE_TTL_MS) return null;
    if (nowMs - state.lastRungAt < FAILURE_GAP_MS) return null;

    var c = classify(failure.text);
    var quoted = String(failure.text).replace(/\s+/g, " ").trim().slice(0, 160);
    return {
      rung: 0, kind: "DIAGNOSE", code: c.code, id: id,
      // Rocky QUOTES the portal rather than paraphrasing it. He did not see the click fail; he
      // saw the portal say so, and the sentence should not claim more than that.
      text: "Something just failed. The portal said: “" + quoted + "”" +
            (c.move ? " " + c.move : " I cannot tell what caused that one."),
    };
  }

  // ---- the ladder (pure; unit tested) --------------------------------------------------------

  /*
   * Which rung, given the world and our own history. Returns null for "say nothing", which is
   * the common case and must stay the common case.
   */
  /*
   * WHY ROCKY THINKS YOU ARE STUCK, in the words of what he observed rather than a timer.
   *
   * The world model already knows the REASON — repeated attempts, hunting between pages, a long
   * dwell, an unrecovered error — and the ladder used to throw that away and say "you have been
   * on this step a little while" for all four. An instructor names what they saw.
   */
  function because(world, snap) {
    var r = world && world.stuck;
    var last = snap && snap.lastCompletion ? snap.lastCompletion : null;
    var comp = "";
    try {
      var M = MEN();
      var j = M && M.journey ? M.journey() : [];
      if (j.length) comp = " The last thing I saw the portal do was " + j[j.length - 1].evidence + ".";
    } catch (e) { comp = ""; }
    if (r === "repeated-attempts") return "You have clicked around this step a few times and the page has not changed." + comp;
    if (r === "oscillating") return "You have moved between pages a few times without landing on the one this step needs." + comp;
    if (r === "after-error") return "The portal reported an error and nothing has changed since." + comp;
    if (last) return "Nothing on the page has changed since " + (comp ? "then." + comp : "the last thing I saw.");
    return "Nothing on the page has changed for a while.";
  }

  function ladder(world, state, nowMs, snap) {
    if (!world || !world.step) return null;
    // THE LAB IS FINISHED. Position derives this rather than storing it, so it cannot go stale
    // the way a cached flag can. Nagging someone who has already finished is the worst
    // possible moment to nag.
    if (snap && snap.workflow && snap.workflow.state === "complete") return null;
    if (!world.stuck) return null;                         // not stuck: nothing to do
    if (state.rung >= MAX_RUNGS + 1) return null;          // said our piece; stop offering
    if (nowMs - state.lastRungAt < MIN_GAP_MS) return null;

    var next = state.rung + 1;
    var step = world.step;
    // The hop the learner is actually on, not always the first: "Solutions > Insider Risk
    // Management" is about the second once the menu has opened.
    var tg = step.targets || [];
    var ti = Math.max(0, Math.min(world.hop || 0, tg.length - 1));
    var label = (tg[ti] && tg[ti].label) || "the next control";

    // WHERE THEY ACTUALLY ARE, from Position, which is the only thing in the extension that
    // knows. Empty when it does not know - an unqualified sentence beats a confident wrong one.
    var page = "";
    try { page = (snap && snap.place && snap.place.page) || ""; } catch (e0) { page = ""; }
    var here = page ? " You are on " + page + "." : "";

    if (next === 1) {
      // POINT. The glow, if any, already happened. Add only WHERE we are.
      return {
        rung: 1, kind: "POINT",
        text: because(world, snap) + here + " The step is: " + (step.text || label) +
              " What can you see on the screen?",
      };
    }
    if (next === 2) {
      // TEACH. What this kind of control is for — the reasoning, deliberately not the answer.
      var teach = null;
      /*
       * THE GUIDE'S OWN REASON FIRST. mentor.why() knows the purpose clause the author wrote,
       * the task the step sits under, and what later steps depend on it — all better than a
       * generic note about what kind of control this is.
       */
      try {
        var M2 = MEN();
        var wy = M2 && M2.why ? M2.why(step, world.index) : null;
        if (wy && wy.text) teach = wy.text + " You are looking for \u201C" + label + "\u201D.";
      } catch (e5) { teach = null; }
      try {
        if (!teach && KB() && KB().lookup) {
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
        text: (page ? "You are on " + page + ", and I cannot line that up with this step. " : "") +
              "Let us get back to somewhere we both recognise. Go back to the page the guide opened this exercise on, and I will pick the step up from there.",
      };
    }
    // STOP. Not a hint: an honest admission, plus the one thing that is still useful.
    return {
      rung: 4, kind: "STOP",
      text: "I have run out of ideas from what I can see. Tell me what the screen says — the error, " +
            "or what happens when you click — and we will work it out.",
    };
  }

  // ---- acting -------------------------------------------------------------------------------

  function reset(why) {
    if (st.rung === 0 && !st.engaged) return;
    st.rung = 0; st.engaged = false; st.lastReason = null;
    st.lastResetWhy = why || null;
    // st.saidFailure is deliberately NOT cleared. It is keyed on the failure's own timestamp,
    // so a genuinely new failure always speaks; clearing it here would let one banner be
    // announced twice because something unrelated reset the ladder in between.
  }

  function speak(rungObj) {
    var r = R();
    if (!r) return false;

    /*
     * AN EXPLICIT QUESTION ALWAYS BEATS A PROACTIVE NUDGE.
     *
     * Observed live: the learner opened the ask box and typed "what step am I on", and what
     * came back was a recovery hint — "STUCK? This step wants you to find Solutions…" —
     * because dwelling on step 1 had fired the ladder at the same moment. The reply they
     * asked for was displaced by advice they did not.
     *
     * Someone typing a question is the least stuck a learner ever is: they know exactly what
     * they want. Interrupting that is the Clippy failure in its purest form, so recovery
     * stays quiet while the box is open and simply tries again on the next turn.
     */
    try {
      if (document.querySelector('input[data-labpilot]')) return false;
    } catch (e) { /* no DOM access is not a reason to interrupt */ }

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

  var lastIndex = -1, lastDone = -1, lastCompletionAt = 0;

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

    var snap = null;
    try { var pz = POS(); snap = pz ? pz.read() : null; } catch (e1) { snap = null; }

    /*
     * A WORLD CHANGE ENDS RECOVERY. "A learner action is evidence of attempt; a world change is
     * evidence of completion" - so the strongest possible signal that someone is no longer
     * stuck is the page itself doing something, and it should silence Rocky before any ladder
     * logic runs. This reaches across frames, so it works on Azure, where the grid that
     * changes is not even in this document.
     */
    if (snap && snap.lastCompletion && snap.lastCompletion.at &&
        snap.lastCompletion.at !== lastCompletionAt) {
      lastCompletionAt = snap.lastCompletion.at;
      reset("world-changed");
    }

    /*
     * RUNG 0 PREEMPTS THE LADDER. A portal that has just announced a failure outranks a dwell
     * timer completely, and it has to be checked BEFORE the progress-reset return below - a
     * failed action usually leaves the step index exactly where it was, which is precisely the
     * case the dwell ladder handles worst.
     */
    var d = snap ? diagnose(st, snap.recovery && snap.recovery.failure, Date.now()) : null;
    if (d) {
      if (speak(d)) {
        st.saidFailure = d.id;            // one sentence per distinct failure, not per turn
        st.lastRungAt = Date.now();
        st.lastReason = "failure:" + d.code;
        st.engaged = true;
        st.said++;
      }
      return;                             // never a diagnosis and a hint in the same breath
    }

    // PROGRESS RESETS EVERYTHING. Advancing a step, or finishing one, means whatever they were
    // stuck on is behind them. Cheap to check and the most important rule here.
    if (world.index !== lastIndex || world.done !== lastDone) {
      lastIndex = world.index; lastDone = world.done;
      reset("progress");
      return;
    }

    var rungObj = ladder(world, st, Date.now(), snap);
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
    _diagnose: diagnose,        // pure, unit tested
    _classify: classify,        // pure, unit tested
    _state: st,
    _onClick: onClick,
    _limits: { MAX_RUNGS: MAX_RUNGS, MIN_GAP_MS: MIN_GAP_MS },
  };
})();
