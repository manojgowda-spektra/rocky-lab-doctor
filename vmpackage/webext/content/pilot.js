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
 * CROSS-TAB. Measured live (Know Your Data SMB, template 15549): the guide renders on
 * experience.cloudlabs.ai and the learner works on purview.microsoft.com. The guide reader finds
 * the guide only on the CloudLabs tab, so until now the pilot never started where the clicks
 * happen and nothing could glow there. The tab that can read the guide is the OWNER: it
 * publishes the parsed steps and its belief to chrome.storage.local under one small key. A lab
 * tab with no guide of its own is a FOLLOWER: it ingests those steps into ITS OWN world model
 * and runs this same loop against its own page, so resolution and the glow happen where the
 * controls are. Each tab glows only its own page. The follower is the tab with the evidence, so
 * its belief is published back and the owner adopts it; the owner's belief (formed from the
 * CloudLabs shell, not the work) is published for status but never imported. Storage events are
 * the only trigger: chrome.storage.onChanged fires in every tab the moment one writes.
 *
 * window.LabPilotPilot:
 *   start()      begin guiding from the guide on screen, or follow the guide another tab published
 *   stop()
 *   status()     what Rocky currently believes and is doing, and which role this tab has
 *   mode(name)   guided | observe | assessment
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

  if (window.LabPilotPilot) return;

  var MIN_GAP_MS = 8000;      // never speak twice inside this window
  var RE_POINT_MS = 20000;    // re-glow the same target only this often

  // cross-tab (see the header)
  var SHARED_KEY = "lpSharedGuide";
  var FRESH_MS = 30 * 60 * 1000;      // older than this is another lab, or an abandoned one
  var HEARTBEAT_MS = 10 * 60 * 1000;  // republish on a real turn once the record is this old
  var TAB = Math.random().toString(36).slice(2, 10);   // so a tab can tell its own echo apart

  var st = {
    on: false,
    mode: "guided",
    lastSpoke: 0,
    lastTarget: "",
    lastPointAt: 0,
    said: 0,
    glowing: null,
    announced: {},        // guide title -> true, once the pre-flight summary has been said
    preflight: null,      // a summary held back (ask box open / Rocky mid-flight), said on a later turn
    role: null,          // "owner" (guide on this tab) | "follower" (guide relayed from another tab)
    guide: null,         // { title, steps } as ingested: compact, the same shape that is published
    sharedSig: "",       // identity of the ingested steps, so a re-render is not a re-ingest
    sharedAt: 0,         // updatedAt of the record we ingested; anything older is ignored
    sourceUrl: "",       // where the guide actually is
    pubIndex: -2, pubConf: -1, pubAt: 0,   // what this tab last published
    stopped: false,
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

    // The learner is typing a question. Nothing the pilot has to say is more important than
    // the answer they explicitly asked for, and speaking now displaces it — observed live,
    // where "what step am I on" came back as an unrelated recovery hint. The glow is not
    // suppressed, only the talking.
    if (state.asking) return { act: "SILENT", why: "learner-is-asking" };

    // A step Rocky cannot see is a step he should not hunt for. Naming the surface is more
    // useful than silently failing to find a control that was never in the browser.
    if (step.surface && step.surface !== "browser") {
      return { act: "SILENT", why: "surface:" + step.surface, surface: step.surface };
    }

    // Permanent dismissal beats everything except an explicit question.
    if (verdict && verdict.label && W() && W().dismissed(verdict.label)) {
      return { act: "SILENT", why: "dismissed" };
    }

    // Nothing left to point at. The ledger says every step is finished, so any glow would be
    // pointing at work already done and any step number would contradict the ledger. Measured
    // live: with all five steps recorded done, Rocky was still glowing step 4 and telling the
    // learner to do it.
    if (world.complete) return { act: "SILENT", why: "lab-complete" };

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
      // A step boundary is the one moment interrupting is cheap (Bailey & Konstan): the
      // learner has just finished something. When position moved FORWARD since the last glow
      // - the next hop of the same instruction once its menu opened, or the next step once
      // its end-state was observed - point straight away. Holding the gap here would leave
      // the learner staring at an open menu for eight seconds with Rocky saying nothing.
      // A backward move (the belief retreating) still waits: that is not the learner's doing.
      var movedOn = state.lastIndex != null && (
        (world.index === state.lastIndex && (world.hop || 0) > (state.lastHop || 0)) ||
        (typeof world.index === "number" && world.index > state.lastIndex));
      if ((nowMs - state.lastSpoke) < MIN_GAP_MS && !sameTarget && !movedOn) {
        return { act: "DEFER", why: "min-gap" };
      }
      return { act: "POINT", why: movedOn ? "resolved-after-progress" : "resolved", verdict: verdict, step: step };
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


  /*
   * THE COACH LADDER, as the rest of the extension sees it.
   *
   * coach.js degrades in SPECIFICITY rather than availability: POINT -> LOCATE -> ORIENT ->
   * SITUATE -> ASK, each level true, each reachable from strictly less evidence than the one
   * above, and none of them silence. This is the only place that assembles its context, so
   * every caller gets the same answer to "what would Rocky say right now".
   *
   * It never returns null. A caller that gets nothing from the lab record, the CloudLabs
   * corpus and the model can hand the learner this instead of an apology.
   */
  function coach(opts) {
    opts = opts || {};
    var C = window.LabPilotCoach;
    var w = W();
    var world = opts.world || (w && w.current()) || {};
    if (!C) {
      // The ladder is not loaded. Say the one thing that is true without it rather than
      // returning null and letting the caller fall through to silence.
      return { level: "ASK", canGlow: false, why: "coach-missing",
               text: "I have no guide for this page. What are you trying to get done? " +
                     "I can still tell you about anything on screen." };
    }
    /*
     * THE COACH GETS THE WORLD MODEL, not just the world model's step index.
     *
     * `sayable` is the single authority on whether a step number may be spoken at all, and
     * `place` is the only thing in the extension that reads where the learner is from the page
     * rather than from a URL pattern. Passing them here is what stops coach.js keeping its own
     * private answer to both questions.
     */
    var snap = null;
    try {
      var PZ = window.LabPilotPosition;
      snap = PZ ? PZ.read() : null;
    } catch (e) { snap = null; }

    // WHY this step, from the guide, when the guide says. The coach appends it to POINT so the
    // pointing sentence teaches instead of only directing.
    var whyNow = null;
    try {
      var MEN = window.LabPilotMentor;
      whyNow = MEN && MEN.why && world.step ? MEN.why(world.step, world.index) : null;
    } catch (e) { whyNow = null; }

    return C.say({
      why: whyNow,
      sayable: snap ? snap.sayable : null,
      place: snap ? snap.place : null,
      lab: world.lab, steps: world.steps, doneMap: world.doneMap,
      step: world.step, index: world.index, total: world.total,
      confidence: world.confidence, hop: world.hop, done: world.done, complete: world.complete,
      surface: world.step && world.step.surface,
      verdict: opts.verdict || world.resolution,
      url: world.url || (typeof location !== "undefined" ? location.href : ""),
      title: typeof document !== "undefined" ? document.title : "",
    });
  }

  // ---- speaking -----------------------------------------------------------------------------

  /*
   * THE COACH LADDER WAS BEING DELIVERED THROUGH THE SPINNER.
   *
   * This function took ONE argument while both of its callers passed two — the mood was dropped
   * on the floor — and it routed everything to rocky.checking(), whose whole job is to say "One
   * sec, finding this step..." while Rocky looks for something. checking() forces the purple
   * `think` halo and calls the renderer with no `extra`, so the label chip, the ask box and the
   * Learn panel were all unreachable by construction.
   *
   * The effect: every ORIENT, LOCATE, SITUATE and ASK line — the entire ladder written to sound
   * like an instructor, the one part of Rocky that degrades in specificity rather than into
   * silence — rendered identically to a loading state. Recovery, explore, progress and the
   * watcher all go through announce() and all get a proper card. The one module written to
   * sound human was the one module whose output looked like a spinner.
   *
   * announce() with an empty label renders the card with no chip, which is what these lines
   * want: the sentence carries the state, and no instructor announces their mode before
   * speaking.
   */
  function say(text, mood) {
    try {
      var R = window.LabPilotRocky;
      if (R && R.announce) { R.announce(text, { label: "", mood: mood || "neutral", hint: "" }); return true; }
      if (R && R.checking) { R.checking(text); return true; }   // older build: worse, but not silence
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

  // ---- pre-flight summary ---------------------------------------------------------------------

  /*
   * Said once per guide title, when the guide is first read: how many steps Rocky can point at
   * in the browser, and how many happen somewhere he cannot see (VS Code, a terminal, the VM
   * desktop). The counts come straight from the guide reader's surface field — nothing is
   * inferred, so the sentence is honest by construction. Pure, and unit tested.
   */
  function summarise(steps, unread) {
    steps = steps || [];
    var web = 0, outside = 0, where = [];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i] || {};
      if (!s.surface || s.surface === "browser") { web++; continue; }
      outside++;
      if (where.indexOf(s.surface) < 0) where.push(s.surface);
    }
    if (!web && !outside) return null;
    var n = function (k) { return k === 1 ? "1 step" : k + " steps"; };
    var away = " outside the browser (" + where.join(", ") + "), where I will say so and step back.";
    var text;
    if (!outside)  text = "This page has " + n(web) + " I can point at.";
    else if (!web) text = "This page has no steps I can point at: " + (outside === 1 ? "its one step happens" : "all " + outside + " happen") + away;
    else           text = "This page has " + n(web) + " I can point at, and " + outside + " that happen" + (outside === 1 ? "s" : "") + away;

    /*
     * AND WHAT HE CANNOT POINT AT. Saying only the good number invites a learner to believe the
     * rest of the page is not there. Rocky reads 5 of 26 instructions on the demo challenge, and
     * a mentor who does not admit that is the kind of mentor this project exists not to build.
     */
    if (unread > 0) {
      text += " There " + (unread === 1 ? "is 1 more line" : "are " + unread + " more lines") +
              " here I can read to you but not point at, so check the guide as well as me.";
    }
    return { web: web, outside: outside, unread: unread || 0, where: where, text: text };
  }

  // Queue the summary for this guide, keyed on its title, and say it now if that is allowed.
  // Returns true only when Rocky actually spoke.
  function preflight(guide) {
    var key = String((guide && guide.title) || "");
    if (st.announced[key]) return false;
    var s = summarise(guide && guide.steps, guide && guide.unread);
    if (!s) return false;
    st.preflight = { key: key, text: s.text };
    return flushPreflight();
  }

  /*
   * Say the held summary, unless now is a bad moment:
   *   - an ask box is open: the learner's question beats anything proactive, always
   *   - Rocky is mid-flight: announce() clears his pending arrival, and the glow is revealed
   *     ON arrival — so speaking now would leave the target un-glowed for the whole step
   * Both clear on a later turn; the summary waits. Never a demand, and a calm mood: this is
   * orientation, not an instruction. It does not count as "speaking" for MIN_GAP either,
   * because the first glow should follow it at once, not eight seconds later.
   */
  function flushPreflight() {
    var p = st.preflight;
    if (!p) return false;
    var asking = false;
    try { asking = !!document.querySelector('input[data-labpilot]'); } catch (e) { asking = false; }
    if (asking) return false;
    if (Date.now() - st.lastPointAt < 1500) return false;
    var R = window.LabPilotRocky;
    if (!R || !R.announce) { st.preflight = null; return false; }     // no Rocky, no voice
    st.preflight = null;
    st.announced[p.key] = true;
    try { R.announce(p.text, { label: "THIS PAGE", mood: "neutral" }); } catch (e) { return false; }
    return true;
  }

  // ---- the loop ------------------------------------------------------------------------------

  /*
   * Which labels to hunt for on this step. An instruction with several ordered targets
   * ("Solutions > Insider Risk Management") is walked one hop at a time: the world model
   * records how many hops the page has been seen to satisfy (progress.js feeds it), and the
   * pointer sits on the first unsatisfied one. Pure, so the hop walk is unit tested.
   */
  function labelsFor(step, hop) {
    var tg = (step && step.targets) || [];
    if (!tg.length) return [];
    var t = tg[Math.max(0, Math.min(hop | 0, tg.length - 1))];
    var labels = [t.label];
    if (t.alt) labels = labels.concat(t.alt);
    return labels.filter(Boolean);
  }

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

    // 1b. a correct click armed an expected end-state (progress.js); judge it against THIS
    //     screen before choosing a target, so a satisfied hop or step moves the pointer in
    //     the same turn rather than waiting for a further change that may never come.
    try { if (window.LabPilotProgress) window.LabPilotProgress.check(snap); } catch (e) { /* never block the turn */ }

    var world = w.current();
    if (!world.step) return;

    // cross-tab: tell the other tabs when the belief moved. One storage write, and only when
    // the position or confidence actually changed (or the record is getting old).
    if (st.role && (world.index !== st.pubIndex || Math.abs(world.confidence - st.pubConf) >= 0.1 ||
        (Date.now() - st.pubAt) > HEARTBEAT_MS)) publish();

    // 2. resolve the current step's current HOP against the live page  (~1 ms).
    // labelsFor walks to the first unsatisfied hop: "Solutions > Insider Risk Management"
    // points at Solutions until its menu opens, then at Insider Risk Management.
    var labels = labelsFor(world.step, world.hop);
    var verdict = labels.length ? l.resolveAny(labels) : { status: "absent", reason: "no-labels" };
    w.setResolution({ status: verdict.status, score: verdict.score, label: verdict.label });

    // 3. decide whether to speak  (~0 ms)
    // decide() is pure and unit-tested, so the live "is the ask box open" check happens here
    // and is passed in rather than read inside it.
    try { st.asking = !!document.querySelector('input[data-labpilot]'); } catch (e) { st.asking = false; }

    // A summary held back earlier (ask box open, or Rocky mid-flight) gets its turn here,
    // BEFORE any new flight starts — announce() would cancel one. One boolean on the hot path.
    if (st.preflight && !st.asking) flushPreflight();

    var d = decide(world, verdict, Date.now(), st);

    // 4. act
    if (d.act === "POINT") {
      if (pointAt(verdict, world.step, world)) {
        st.lastSpoke = Date.now();
        st.lastPointAt = Date.now();
        st.lastTarget = verdict.label;
        st.lastIndex = world.index;          // where the glow was, so decide() can tell
        st.lastHop = world.hop || 0;         // forward progress from a retreating belief
        st.said++;
      }
    } else if (d.act === "ASK") {
      clearGlow();
      say("There is more than one “" + (verdict.label || "match") + "” on this page, so I would be guessing. Which part of the page are you working in?", "think");
      st.lastSpoke = Date.now();
      st.said++;
    } else if (d.act === "ESCALATE") {
      clearGlow();
      /*
       * THE LADDER, NOT A HAND-ROLLED LINE.
       *
       * This used to say "I cannot find X on this page" and stop, which is only the right
       * answer when Rocky knows the step and simply cannot see its control. When the belief
       * is too weak to name a step it said the same thing about a control it was never
       * looking for, and when there was no step at all it said nothing whatsoever. The coach
       * picks the highest level the evidence actually supports, and is never silent.
       */
      var c = coach({ world: world, verdict: verdict });
      say(c.text, c.level === "ORIENT" || c.level === "SITUATE" ? "think" : "sad");
      st.lastCoach = c.level;
      st.lastSpoke = Date.now();
      st.said++;
    }
    st.lastDecision = d;
  }

  // ---- cross-tab: the shared guide ---------------------------------------------------------

  function store() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) return chrome.storage;
    } catch (e) { /* not an extension context */ }
    return null;
  }

  function hereUrl() {
    try { return String(location.href || "").slice(0, 300); } catch (e) { return ""; }
  }

  /*
   * The steps in the shape that is both ingested and published: text, ordered targets with
   * their alternative readings, and the surface when it is not the browser. Small on purpose:
   * the record is written on every belief change and read by every lab tab.
   */
  function compactSteps(steps) {
    var out = [];
    for (var i = 0; i < steps.length && i < 60; i++) {
      var s = steps[i];
      if (!s || !s.targets || !s.targets.length) continue;
      var tg = [];
      for (var j = 0; j < s.targets.length && j < 6; j++) {
        var t = s.targets[j];
        if (!t || !t.label) continue;
        var c = { n: t.n, label: String(t.label).slice(0, 60) };
        if (t.alt && t.alt.length) c.alt = t.alt.slice(0, 3);
        tg.push(c);
      }
      if (!tg.length) continue;
      var cs = { text: String(s.text || "").slice(0, 240), targets: tg };
      if (s.surface && s.surface !== "browser") {
        cs.surface = s.surface;
        if (s.surfaceWhy) cs.surfaceWhy = s.surfaceWhy;
      }
      /*
       * THE THIRD LAYER THAT REBUILT THE STEP FROM TEXT AND TARGETS ALONE.
       *
       * guide-reader keeps the author's mark-up, purpose clause and task heading; world-model's
       * ingest() was taught to pass them through; and this function — the ONLY caller of
       * ingest() in the extension — was compacting every step down to text and targets first,
       * so none of it ever arrived. Measured: 79 parsed Zava steps, zero with a why, zero with a
       * task, zero with raw. The gates missed it because every test called ingest() directly.
       * Bounded, like everything else in a record that also travels cross-tab.
       */
      if (s.raw) cs.raw = String(s.raw).slice(0, 400);
      if (s.why) cs.why = String(s.why).slice(0, 160);
      if (s.task) cs.task = String(s.task).slice(0, 160);
      if (s.learn && (s.learn.why || s.learn.what)) {
        cs.learn = { why: s.learn.why || null, what: s.learn.what || null };
      }
      out.push(cs);
    }
    return out;
  }

  // What makes one step list the same as another: the title and the click path. The guide
  // pane re-renders often; the steps change only on a page turn or a new challenge.
  function sigOf(title, steps) {
    var parts = [String(title || "")];
    for (var i = 0; i < steps.length; i++) {
      var tg = steps[i].targets || [], labs = [];
      for (var j = 0; j < tg.length; j++) labs.push(tg[j].label);
      parts.push(labs.join(">"));
    }
    return parts.join("|");
  }

  function publish() {
    var s = store();
    if (!s || !st.on || !st.guide) return false;
    var w = W();
    var world = w ? w.current() : null;
    var rec = {
      v: 1,
      title: st.guide.title,
      steps: st.guide.steps,
      index: world ? world.index : -1,
      confidence: world ? world.confidence : 0,
      role: st.role,
      from: TAB,
      sourceUrl: st.sourceUrl,
      updatedAt: Date.now(),
    };
    // remembered BEFORE the write: onChanged fires re-entrantly in this same tab
    st.pubIndex = rec.index; st.pubConf = rec.confidence; st.pubAt = rec.updatedAt;
    try { var o = {}; o[SHARED_KEY] = rec; s.local.set(o); } catch (e) { return false; }
    return true;
  }

  /*
   * Take on the position in a shared record — but only from a FOLLOWER. The follower is the tab
   * that sees the controls the steps refer to; the owner's belief is formed from the CloudLabs
   * shell, where a stray "Save" button is evidence of nothing. The world model applies its own
   * floor (CONF_ADVANCE) and a stronger local belief is never overwritten.
   */
  function adoptFrom(rec) {
    if (!rec || rec.role !== "follower") return false;
    var w = W();
    if (!w || !w.adopt) return false;
    var world = w.current();
    var idx = Number(rec.index), conf = Number(rec.confidence) || 0;
    if (!(idx >= 0) || idx === world.index || !(conf > world.confidence)) return false;
    if (!w.adopt(idx, conf)) return false;
    st.pubIndex = idx; st.pubConf = conf;    // adopted, not discovered: do not echo it back
    st.lastTarget = "";                      // the step changed; the next turn may point afresh
    return true;
  }

  var subscribed = false;
  function subscribe() {
    if (subscribed) return;
    var s = store();
    if (!s) return;
    subscribed = true;
    // listener first, then the initial read, so nothing written in between is missed
    try {
      s.onChanged.addListener(function (changes, area) {
        if (area !== "local" || !changes || !changes[SHARED_KEY]) return;
        onShared(changes[SHARED_KEY].newValue);
      });
    } catch (e) { /* ignore */ }
    try { s.local.get([SHARED_KEY], function (v) { onShared(v && v[SHARED_KEY]); }); } catch (e) { /* ignore */ }
  }

  function ignore(why) { return { act: "ignore", why: why }; }

  /*
   * A shared guide arrived, or changed. What it means for THIS tab:
   *   our own echo, empty, stale, or older than what we hold   -> nothing
   *   not running, and this page has no guide of its own        -> follow it
   *   following, and the OWNER's steps changed (page turn)      -> re-ingest
   *   same steps, from a follower that is more confident        -> adopt its position
   * Returns what it did, so the decision can be unit tested without a browser.
   */
  function onShared(rec) {
    if (!rec || typeof rec !== "object") return ignore("empty");
    if (rec.from === TAB) return ignore("own-echo");
    if (!rec.steps || !rec.steps.length) return ignore("empty");
    var at = Number(rec.updatedAt) || 0;
    if (Date.now() - at > FRESH_MS) return ignore("stale");
    if (st.stopped) return ignore("stopped");

    if (!st.on) {
      var g = G(), w = W(), p = P();
      if (!g || !w || !p) return ignore("missing-dependency");
      var own = null;
      try { own = g.read(); } catch (e) { /* ignore */ }
      if (own && own.steps && own.steps.length) return ignore("own-guide");   // never follow when this tab can lead
      var r = begin({ title: rec.title, steps: rec.steps }, "follower", { sourceUrl: rec.sourceUrl, seed: rec });
      return r.ok ? { act: "follow", steps: r.steps } : ignore(r.why);
    }

    if (at < st.sharedAt) return ignore("older");
    if (sigOf(rec.title, rec.steps) !== st.sharedSig) {
      // Different steps. Only the owner's word changes what a follower is working on; an owner
      // keeps the guide it can see.
      if (st.role === "follower" && rec.role === "owner") {
        var r2 = begin({ title: rec.title, steps: rec.steps }, "follower", { sourceUrl: rec.sourceUrl, seed: rec });
        return r2.ok ? { act: "reingest", steps: r2.steps } : ignore(r2.why);
      }
      return ignore("not-ours");
    }
    return adoptFrom(rec) ? { act: "adopt", index: Number(rec.index) } : ignore("no-change");
  }

  // The guide on THIS tab changed: a page turn, a new challenge, or a guide appearing on a page
  // that was following another tab's. Owners re-ingest and republish; a follower whose own page
  // grew a guide is promoted, because the guide on screen always beats one relayed from elsewhere.
  function onOwnGuide(gg) {
    if (!st.on || !gg || !gg.steps || !gg.steps.length) return;
    var steps = compactSteps(gg.steps);
    if (!steps.length) return;
    if (st.role === "owner" && sigOf(gg.title, steps) === st.sharedSig) return;   // re-rendered, not changed
    begin(gg, "owner");
  }

  // ---- starting ------------------------------------------------------------------------------

  /*
   * Ingest a step list and run the loop against this page, as owner (the guide is here) or
   * follower (it came through storage). Called again on a page turn or a role change, so the
   * one-off wiring (perception, recovery, the handover event) happens only the first time.
   */
  function begin(guide, role, opts) {
    opts = opts || {};
    var w = W(), p = P(), g = G();
    var steps = compactSteps((guide && guide.steps) || []);
    if (!steps.length) return { ok: false, why: "no-guide-on-screen" };

    st.guide = { title: String((guide && guide.title) || "").slice(0, 160), steps: steps };
    st.sharedSig = sigOf(st.guide.title, steps);
    st.sharedAt = (opts.seed && Number(opts.seed.updatedAt)) || Date.now();
    st.sourceUrl = role === "owner" ? hereUrl() : String(opts.sourceUrl || "").slice(0, 300);
    w.ingest({ title: st.guide.title, page: guide && guide.page, steps: steps });
    // Once per guide title, in whichever tab is about to guide: what Rocky can point at here
    // and what he cannot. The cross-tab restructure moved start()'s body into begin(), so the
    // summary hooks in here to cover the follower path as well as the owner's.
    // `unread` rides along from guide-reader.read(): how many instruction-shaped lines on this
    // page yielded no target. A follower has no page of its own to count, so it is absent there
    // and the sentence simply does not appear.
    preflight({ title: st.guide.title, steps: steps, unread: guide && guide.unread });
    if (opts.seed) adoptFrom(opts.seed);

    var fresh = !st.on;
    st.on = true;
    st.stopped = false;
    st.role = role;
    st.lastTarget = ""; st.lastPointAt = 0;   // a new step list may be pointed at straight away
    if (!fresh) clearGlow();                  // the old page's glow is about the old step

    if (fresh) {
      g.onChange(onOwnGuide);
      p.onChange(turn);
      // Recovery rides the same perception stream. It also FEEDS the world model — until it
      // starts, learner.attempts/errors/misclicks stay zero and stuck() is measuring nothing,
      // so this is a prerequisite for stuck detection rather than an optional extra.
      try { if (window.LabPilotRecovery) window.LabPilotRecovery.start(); } catch (e) {}
      // Tell content.js the pilot owns the glow now. Its bundle loop may have taken the overlay
      // while this tab had no guide, and a follower can start long after its retries gave up.
      try { window.dispatchEvent(new CustomEvent("lp-pilot-start", { detail: { role: role } })); } catch (e) {}
    }
    subscribe();
    publish();
    turn(p.snapshot());                       // act on what is already on screen
    return { ok: true, role: role, steps: steps.length };
  }

  function start() {
    if (st.on) return { ok: false, why: "already-running", role: st.role };
    var g = G(), w = W(), p = P();
    if (!g || !w || !p) return { ok: false, why: "missing-dependency" };
    st.stopped = false;

    var guide = g.read();
    if (guide && guide.steps && guide.steps.length) return begin(guide, "owner");

    // No guide on this tab. It may be on ANOTHER tab — the CloudLabs guide beside a Purview tab,
    // measured live. Subscribe to the shared record; if a fresh one is already there the
    // follower starts inside subscribe(), otherwise it starts the moment one is published.
    subscribe();
    if (st.on) return { ok: true, role: st.role, steps: st.guide.steps.length };
    /*
     * A VM LAB HAS NO GUIDE IN THE BROWSER AT ALL. On a laptop the CloudLabs tab publishes the
     * guide and the portal tab follows it; inside a lab VM the learner's browser shows only the
     * portal, so both routes above come up empty and Rocky would sit there blind next to a
     * learner who can see the guide perfectly well on the other screen.
     *
     * rocky-vm.ps1 has already fetched that guide, so it leaves the lines in the extension
     * folder. Asked for once, asynchronously: if the file is not there - which is every install
     * except a VM one - nothing happens and nothing is logged.
     */
    tryHandedOverGuide();
    return { ok: false, why: "no-guide-on-screen" };
  }

  var handoverTried = false;
  function tryHandedOverGuide() {
    if (handoverTried) return;
    handoverTried = true;
    var g = G();
    if (!g || !g.fromLines) return;
    try {
      fetch(chrome.runtime.getURL("labguide.json"))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || !j.lines || !j.lines.length || st.on) return;
          var guide = g.fromLines(j.lines, j.page, j.title);
          if (guide.steps.length) {
            console.log("[Rocky] using the guide the VM installer handed over: " +
                        guide.steps.length + " step(s) from " + j.lines.length + " lines");
            begin(guide, "owner");
          }
        })
        .catch(function () { /* no handed-over guide: the normal case */ });
    } catch (e) { /* no fetch, no extension URL: nothing to do */ }
  }

  function stop() { st.on = false; st.role = null; st.stopped = true; clearGlow(); }

  function status() {
    var w = W();
    var world = w ? w.current() : null;
    return {
      on: st.on,
      mode: st.mode,
      role: st.role,                       // owner | follower | null
      sourceUrl: st.sourceUrl || null,     // where the guide is, when it is on another tab
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
    coach: coach,          // what Rocky would say now, at the best level the evidence allows
    mode: mode,
    _decide: decide,           // pure, unit-tested
    _compactSteps: compactSteps, // the ONLY path into ingest(); the chain gate drives the real one
    _labelsFor: labelsFor,     // pure, unit-tested: the hop walk
    _turn: turn,               // for the end-state gate, which drives a turn with a mocked screen
    _summary: summarise,       // pure, unit-tested
    _preflight: preflight,
    _flushPreflight: flushPreflight,
    _state: st,
    // cross-tab internals, unit-tested with a mocked chrome.storage (test/crosstab-test.js)
    _shared: { KEY: SHARED_KEY, FRESH_MS: FRESH_MS, TAB: TAB, onShared: onShared, publish: publish, sigOf: sigOf, compactSteps: compactSteps },
  };
})();
