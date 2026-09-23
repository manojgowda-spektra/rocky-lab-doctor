/*
 * LabPilot PROGRESS — a step is done when the page says so, not when the mouse does.
 *
 * THE DEFECT THIS REPLACES. recovery.js marked a step complete the moment the learner clicked
 * the glowed control. On the live lab (Know Your Data SMB, template 15549) that is wrong in
 * both directions:
 *
 *   "Select Save and wait for the success notification"   the click is the START of the step;
 *                                                          completion is the toast, seconds later
 *   "Select Create policy > Custom policy"                 two hops; the first click opens a
 *                                                          menu and the step is nowhere near done
 *
 * A click is an ACTION. Completion is a STATE the page reaches afterwards, and the page has to
 * be observed reaching it. So a correct click no longer completes anything: it ARMS an expected
 * end-state derived from the step, and every later perception change is checked against it.
 * When it is met the world model is told, and the belief moves on with the strongest evidence
 * it ever gets. When it is not met inside WAIT_MS, Rocky says one line and keeps the glow.
 *
 * WHAT THE END-STATE IS, per step, derived from its own text and targets:
 *
 *   NOTICE    "... wait for the success notification / saved / created"
 *             a [role=status|alert], live region or message bar appears whose text matches
 *             /success|saved|created|complete/ and was NOT already on screen before the click.
 *             Nothing else counts: not the button greying, not the next step's control being
 *             visible, because on a settings page it always is.
 *   HOP       a step with several ordered targets, clicked on any but the last:
 *             the NEXT hop's label resolves (the menu opened). The step is not complete; the
 *             pointer inside it moves to the next hop.
 *   GENERIC   everything else: the clicked control disappeared, or it turned
 *             aria-expanded / aria-selected / aria-pressed / aria-checked = "true", or the URL
 *             changed, or the next step's first target became resolvable when it was not
 *             before the click.
 *
 * RULES KEPT:
 *   - every "does this label resolve" question goes through LabPilotLabel, so the anchor
 *     engine's 0.70 / 0.20 / no-contradiction contract still adjudicates; nothing here scores
 *     an element and no model is called on this path
 *   - no timer loop: perception events drive evaluation, plus ONE deadline per arm
 *   - the deadline line obeys the speaking rules: guided mode only, never over an open ask
 *     box, never while exploring, never for a dismissed label, at most once per arm
 *
 * window.LabPilotProgress:
 *   arm(el)          a correct click on the glowed control happened; derive and arm
 *   check(snap)      evaluate the armed end-state against a perception snapshot. The pilot
 *                    calls this from its turn, after observe() and before choosing a target,
 *                    so a satisfied hop or step moves the pointer in that same turn.
 *   status()
 *   _expect / _met   pure, unit tested
 */
(function () {
  "use strict";
  if (window.LabPilotProgress) return;

  var WAIT_MS = 10000;      // unmet this long -> one line from Rocky; the glow stays

  // Steps whose completion is a confirmation the page shows afterwards.
  var NOTICE_STEP = /\bwait (?:for|until)\b[^.]*?\b(?:notification|success|saved|created|confirmation|message|toast|banner)\b|\bsuccess(?:ful(?:ly)?)?\s+(?:notification|message|saved|created)\b|\b(?:is|are|was|been|gets?)\s+(?:saved|created)\b/i;
  // What such a confirmation says.
  var NOTICE_TEXT = /\b(?:success|successful|successfully|saved|created|complete|completed)\b/i;
  // Where portals put it. Fluent toasts and message bars, plus the ARIA regions screen readers
  // are told about, which is the most reliable signal a portal gives.
  var NOTICE_SEL = '[role="status"],[role="alert"],[aria-live="polite"],[aria-live="assertive"],' +
    '.ms-MessageBar,[class*="toast" i],[class*="notification" i],[class*="messagebar" i]';

  var st = { armed: null, last: null, timer: 0, lastDisarm: null };

  function W() { return window.LabPilotWorld; }
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim(); }

  function labelsOf(target) {
    if (!target) return [];
    var out = [target.label];
    if (target.alt && target.alt.length) out = out.concat(target.alt);
    return out.filter(Boolean);
  }

  // ---- pure: what should the page look like once this step's click has taken effect ----------

  /*
   * expect(step, hop, nextStep) -> { kind, hop, label, next[] } or null.
   *   kind   'notice' | 'hop' | 'generic'
   *   label  the target that was clicked
   *   next   for 'hop': the next hop's readings; otherwise the next step's first target's
   *          readings (empty when the next step is not in the browser or does not exist)
   */
  function expect(step, hop, nextStep) {
    if (!step || !step.targets || !step.targets.length) return null;
    var tg = step.targets;
    var i = Math.max(0, Math.min(hop | 0, tg.length - 1));
    var clicked = labelsOf(tg[i]);
    if (i < tg.length - 1) {
      return { kind: "hop", hop: i, label: clicked[0], next: labelsOf(tg[i + 1]) };
    }
    var next = [];
    if (nextStep && nextStep.targets && nextStep.targets.length && (nextStep.surface || "browser") === "browser") {
      next = labelsOf(nextStep.targets[0]);
    }
    var text = step.text || "";
    if (NOTICE_STEP.test(text)) {
      return { kind: "notice", hop: i, label: clicked[0], next: next, save: /\bsav(?:e|ing)\b/i.test(text) };
    }
    return { kind: "generic", hop: i, label: clicked[0], next: next };
  }

  /*
   * met(exp, obs) -> { met, why }. Pure: everything about the live page arrives in `obs`.
   *
   *   obs.url                the page URL now
   *   obs.notices[]          texts of the confirmation regions on screen now
   *   obs.clicked            { present, expanded, selected } for the armed control, or null
   *   obs.resolves(labels)   does any of these labels resolve UNIQUELY right now (the engine)
   *   obs.baseline           the same facts recorded at arm time:
   *                          { url, notices[], nextResolved, clicked }
   */
  function met(exp, obs) {
    if (!exp || !obs) return { met: false, why: "nothing-armed" };
    var b = obs.baseline || {};

    if (exp.kind === "notice") {
      var seen = b.notices || [];
      var list = obs.notices || [];
      for (var n = 0; n < list.length; n++) {
        var t = list[n];
        if (!NOTICE_TEXT.test(t)) continue;
        if (seen.indexOf(t) >= 0) continue;                 // was already there before the click
        return { met: true, why: "notice: " + t.slice(0, 60) };
      }
      return { met: false, why: "no-notice-yet" };
    }

    if (exp.kind === "hop") {
      if (obs.resolves && obs.resolves(exp.next)) return { met: true, why: "next-hop-resolves" };
      return { met: false, why: "next-hop-absent" };
    }

    // generic
    var c = obs.clicked, bc = b.clicked || {};
    if (c && c.present === false) return { met: true, why: "control-gone" };
    if (c && c.expanded === true && bc.expanded !== true) return { met: true, why: "aria-expanded" };
    if (c && c.selected === true && bc.selected !== true) return { met: true, why: "aria-selected" };
    if (obs.url && b.url && obs.url !== b.url) return { met: true, why: "url-changed" };
    if (exp.next && exp.next.length && obs.resolves && !b.nextResolved && obs.resolves(exp.next)) {
      return { met: true, why: "next-step-resolves" };
    }
    return { met: false, why: "no-evidence" };
  }

  // ---- reading the live page (thin; everything judged above) --------------------------------

  function resolves(labels) {
    var L = window.LabPilotLabel;
    if (!L || !labels || !labels.length) return false;
    try { var r = L.resolveAny(labels); return !!(r && r.status === "resolved"); } catch (e) { return false; }
  }

  function shown(el) {
    try {
      if (!el || !el.isConnected) return false;
      if (typeof getComputedStyle === "function") {
        var cs = getComputedStyle(el);
        if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  function notices() {
    var out = [], nodes;
    try { nodes = document.querySelectorAll(NOTICE_SEL); } catch (e) { return out; }
    for (var i = 0; i < nodes.length && out.length < 20; i++) {
      var n = nodes[i];
      try {
        if (n.closest && (n.closest("#labpilot-overlay-root") || n.closest("[data-labpilot]"))) continue;
        if (!shown(n)) continue;
        var t = String(n.innerText || n.textContent || "").replace(/\s+/g, " ").trim();
        if (t) out.push(t.slice(0, 200));
      } catch (e) { /* one bad node must not hide the others */ }
    }
    return out;
  }

  function nameOf(el) {
    try {
      var a = el.getAttribute && el.getAttribute("aria-label");
      if (a && a.trim()) return a.trim();
      return String(el.innerText || el.textContent || "").trim().slice(0, 100);
    } catch (e) { return ""; }
  }

  function ariaTrue(el, names) {
    var seen = false;
    for (var i = 0; i < names.length; i++) {
      var v = el.getAttribute ? el.getAttribute(names[i]) : null;
      if (v == null) continue;
      seen = true;
      if (v === "true") return true;
    }
    return seen ? false : null;
  }

  function clickedState(a, snap) {
    var el = a.el;
    var present = shown(el);
    if (!present && el && snap && snap.controls) {
      // A framework re-render swaps the node for an identical one. The same name still on
      // screen means the control is still there, whatever happened to our reference.
      for (var i = 0; i < snap.controls.length; i++) {
        if (norm(snap.controls[i].name) === a.name) { present = true; break; }
      }
    }
    var expanded = null, selected = null;
    try {
      expanded = ariaTrue(el, ["aria-expanded"]);
      selected = ariaTrue(el, ["aria-selected", "aria-pressed", "aria-checked"]);
    } catch (e) { /* ignore */ }
    return { present: present, expanded: expanded, selected: selected };
  }

  function observation(a, snap) {
    return {
      url: (snap && snap.url) || "",
      notices: a.exp.kind === "notice" ? notices() : [],
      clicked: clickedState(a, snap),
      resolves: resolves,
      baseline: a.baseline,
    };
  }

  // ---- arming ------------------------------------------------------------------------------

  /*
   * Which hop the glow was on. Normally the world model's count of satisfied hops; if the pilot
   * is known to be glowing a different target of this step (a glow that outlived a belief
   * change), trust the glow, because that is what the learner actually clicked.
   */
  function hopFor(step, hop, glowing) {
    var tg = step.targets;
    var i = Math.max(0, Math.min(hop | 0, tg.length - 1));
    if (!glowing) return i;
    var g = norm(glowing);
    if (labelsOf(tg[i]).map(norm).indexOf(g) >= 0) return i;
    for (var k = 0; k < tg.length; k++) if (labelsOf(tg[k]).map(norm).indexOf(g) >= 0) return k;
    return i;
  }

  function clearDeadline() {
    if (st.timer) { try { clearTimeout(st.timer); } catch (e) {} st.timer = 0; }
  }

  function disarm(why) {
    clearDeadline();
    st.armed = null;
    st.lastDisarm = why || null;
  }

  function arm(el) {
    var w = W();
    if (!w) return null;
    var world = w.current();
    var step = world && world.step;
    if (!step || !step.targets || !step.targets.length) return null;

    var glowing = null;
    try { glowing = window.LabPilotPilot && window.LabPilotPilot._state && window.LabPilotPilot._state.glowing; } catch (e) {}
    var hop = hopFor(step, world.hop || 0, glowing);

    var steps = (w.steps && w.steps()) || [];
    var next = null;
    for (var k = world.index + 1; k < steps.length; k++) { next = steps[k]; break; }

    var exp = expect(step, hop, next);
    if (!exp) return null;

    var url = "";
    try { url = location.href; } catch (e) {}
    var a = {
      stepId: step.id, hop: hop, exp: exp, el: el, name: norm(nameOf(el)),
      at: Date.now(), spoke: false, said: false, baseline: null,
    };
    // What is true right now, so only a CHANGE counts as evidence: a "saved" banner from the
    // previous step, or a next-step control that was always in the left nav, is not the page
    // responding to this click.
    a.baseline = {
      url: url,
      notices: exp.kind === "notice" ? notices() : [],
      nextResolved: exp.kind !== "hop" && exp.next.length ? resolves(exp.next) : false,
      clicked: clickedState(a, null),
    };

    clearDeadline();
    st.armed = a;
    st.timer = setTimeout(onDeadline, WAIT_MS);      // the ONE timer; never re-armed by itself
    return a;
  }

  // ---- checking: called by the pilot on every perception change ------------------------------

  function check(snap) {
    var a = st.armed;
    if (!a) return null;
    var w = W();
    var world = w && w.current();
    // The belief moved to another step on its own evidence: nothing left to wait for here.
    if (!world || !world.step || world.step.id !== a.stepId) {
      st.last = { kind: a.exp.kind, met: false, why: "step-changed", at: Date.now(), stepId: a.stepId, hop: a.hop };
      disarm("step-changed");
      return st.last;
    }
    var r = met(a.exp, observation(a, snap));
    st.last = { kind: a.exp.kind, met: r.met, why: r.why, at: Date.now(), stepId: a.stepId, hop: a.hop };
    if (!r.met) return st.last;

    if (a.exp.kind === "hop") w.note({ type: "hop" });
    else w.note({ type: "complete", why: r.why });
    disarm("met");
    return st.last;
  }

  // ---- the one line ----------------------------------------------------------------------------

  function maySpeak(a) {
    try { if (document.querySelector("input[data-labpilot]")) return false; } catch (e) {}
    try { var R = window.LabPilotRocky; if (R && R.exploring) return false; } catch (e) {}
    try { var P = window.LabPilotPilot; if (P && P.mode && P.mode() !== "guided") return false; } catch (e) {}
    try { var w = W(); if (w && w.dismissed && w.dismissed(a.exp.label)) return false; } catch (e) {}
    return true;
  }

  function lineFor(exp) {
    if (exp.kind === "notice") {
      return exp.save ? "Waiting for the save to finish. I will move on when the confirmation appears."
                      : "Waiting for the confirmation to appear before I move on.";
    }
    if (exp.kind === "hop") return "Waiting for “" + exp.next[0] + "” to appear.";
    return "I have not seen that take effect yet. If the page has moved on, carry on and I will catch up.";
  }

  function onDeadline() {
    st.timer = 0;
    var a = st.armed;
    if (!a || a.spoke) return;
    a.spoke = true;                    // one line per arm, whether or not the rules let it out
    if (!maySpeak(a)) return;
    var R = window.LabPilotRocky;
    if (!R || !R.announce) return;
    try {
      // announce() is the non-positional voice: this is about the situation, not a control,
      // and the glow stays exactly where the pilot put it.
      R.announce(lineFor(a.exp), { label: "WAITING", mood: "think", hint: "" });
      a.said = true;
    } catch (e) { /* ignore */ }
  }

  function status() {
    var a = st.armed;
    return {
      armed: a ? { stepId: a.stepId, hop: a.hop, kind: a.exp.kind, label: a.exp.label, next: a.exp.next,
                   sinceMs: Date.now() - a.at, spoke: a.spoke, said: a.said } : null,
      last: st.last,
      lastDisarm: st.lastDisarm,
      waitMs: WAIT_MS,
    };
  }

  window.LabPilotProgress = {
    arm: arm,
    check: check,
    status: status,
    _expect: expect,        // pure, unit tested
    _met: met,              // pure, unit tested
    _state: st,
    _limits: { WAIT_MS: WAIT_MS },
  };
})();
