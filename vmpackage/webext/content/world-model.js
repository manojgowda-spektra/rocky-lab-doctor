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
 * FIVE PARTS:
 *   TaskGraph     the lab, parsed once from the guide: steps, targets, surfaces, order
 *   Position      a BELIEF over "which step am I on", not a guess — confidence accumulates
 *   Route         the URL and title read as position evidence — see "route hints" below
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

  // Route evidence. The belief update multiplies evidence by (1 - DECAY) * 3 and so settles at
  // three times the steady evidence; ROUTE_EVIDENCE is derived so that the URL alone tops out
  // at 0.9 x CONF_ADVANCE (0.585) however CONF_ADVANCE is later tuned. A URL can only flip the
  // belief when the controls agree with it.
  var ROUTE_EVIDENCE = CONF_ADVANCE * 0.3;   // what the URL adds to the step it names, every observation
  var ROUTE_AGREE = 2;         // control evidence counts double on the step the URL names
  var ROUTE_CONTRADICT = 0.5;  // and is halved on a step the URL says the learner is not on
  var TITLE_EVIDENCE = 0.08;   // a title is a weaker claim than a URL; used only when the URL says nothing

  function now() { return Date.now(); }
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim(); }

  // ---- route hints ---------------------------------------------------------------------------
  /*
   * WHY THE URL. Control names alone cannot tell portal steps apart: "Policies" sits in the left
   * nav of every Insider Risk page, so on the solution's overview the Policies step looked as
   * likely as the Settings step the learner was actually on (measured live, template 15549), and
   * the belief never reached the 0.80 the pilot needs before it will say "Step N of M". Portal
   * URLs encode the section: purview.microsoft.com/insiderriskmgmt/policies, or
   * portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.Compute%2FVirtualMachines.
   *
   * A hint is the label with everything but letters and digits removed ("Policy indicators" ->
   * "policyindicators"), plus the first two words of a long label ("Insider Risk Management" ->
   * "insiderrisk", which is how /insiderriskmgmt is found). A handful of portal nouns have a URL
   * segment that is not the label at all; those are in ALIAS, each with the pattern it came from.
   * Nothing here is chosen by a model, and a label too short to mean anything inside a URL
   * ("Save") yields no hint at all.
   *
   * WHAT A MATCH MEANS. The URL names the hop the learner has COMPLETED, not the one they are
   * about to click. /insiderriskmgmt/overview means "Solutions > Insider Risk Management" is
   * done and the learner is on the next unfinished step; /insiderriskmgmt/settings means the
   * first hop of "Settings > Policy indicators" is done and that step is still the current one.
   */
  var HINT_MIN = 5;
  var HINT_STOP = { index: 1, default: 1, login: 1, signin: 1, search: 1, portal: 1, https: 1, microsoft: 1 };
  var ALIAS = {
    // purview.microsoft.com/insiderriskmgmt/... — and compliance.microsoft.com/insiderriskmgmt before it
    insiderriskmanagement: ["insiderriskmgmt"],
    // compliance.microsoft.com/supervisoryreview — the route kept the solution's pre-rename name
    communicationcompliance: ["supervisoryreview"],
    // compliance.microsoft.com/informationgovernance — likewise, the pre-rename route
    datalifecyclemanagement: ["informationgovernance"],
    // portal.azure.com/#view/Microsoft_AAD_IAM/... and entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/...
    // — the blade extensions kept the AAD name
    microsoftentraid: ["microsoftaad"],
    entraid: ["microsoftaad"],
  };

  function plain(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function usable(h) { return h.length >= HINT_MIN && !HINT_STOP[h]; }

  // Hints for one click target: { route: [...], title: [...] }. The two-word prefix is for URL
  // segments only — in a title ("Challenge 04: Insider Risk Detection ...") it would match the
  // lab's own name on the guide tab.
  function hintsFor(target) {
    var route = [], title = [];
    var add = function (list, h) { if (usable(h) && list.indexOf(h) < 0) list.push(h); };
    var readings = [target.label].concat(target.alt || []);
    for (var i = 0; i < readings.length; i++) {
      var full = plain(readings[i]);
      add(route, full); add(title, full);
      var al = ALIAS[full] || [];
      for (var a = 0; a < al.length; a++) { add(route, al[a]); add(title, al[a]); }
    }
    var words = String(target.label || "").trim().split(/\s+/);
    if (words.length >= 3) add(route, plain(words[0] + words[1]));
    return { route: route, title: title };
  }

  // The part of a URL that says where you are — path, query and hash — as space-separated
  // segments of letters and digits. Percent-encoding is undone first, so an Azure blade's
  // Microsoft.Compute%2FVirtualMachines yields "virtualmachines". Hints carry no spaces, so a
  // hint can only ever match inside one segment, never across two.
  function routeText(url) {
    var s = String(url || "");
    var i = s.indexOf("://");
    if (i >= 0) { var j = s.indexOf("/", i + 3); s = j >= 0 ? s.slice(j) : ""; }
    try { s = decodeURIComponent(s); } catch (e) { /* malformed escape: read it raw */ }
    var parts = s.toLowerCase().split(/[\/?&=#:.,;%+~|]+/), out = [];
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k].replace(/[^a-z0-9]/g, "");
      if (p) out.push(p);
    }
    return out.length ? " " + out.join(" ") + " " : "";
  }

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
      hop: {},              // stepId -> how many of its ordered targets the page has satisfied
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
      route: "",            // routeText(url), recomputed only when the URL changes
      title: "",
      titleText: "",        // plain(title), likewise
      position: null,       // what the URL or title last said: { from, pos, passed }
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
      var labels = [], hops = [], hinted = false;
      for (var j = 0; j < s.targets.length; j++) {
        var t = s.targets[j];
        labels.push(t.label);
        if (t.alt && t.alt.length) labels = labels.concat(t.alt);
        var h = hintsFor(t);
        hops.push(h);
        if (h.route.length) hinted = true;
      }
      steps.push({
        id: "s" + steps.length,
        n: steps.length,
        text: s.text || "",
        targets: s.targets,            // ordered click targets within this instruction
        labels: labels,                // flattened, for cheap matching
        hops: hops,                    // per target: route and title hints derived from its label
        hinted: hinted,                // does any hop have a route hint at all ("Save" does not)
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
   * LOCATE — which step does this text (a URL, or a title) put the learner on?
   *
   * Scans hops in guide order and keeps the LAST one whose hint appears: later steps are deeper
   * in the UI, and /insiderriskmgmt/policies names both the solution (step 1) and its Policies
   * page (step 4). A matched final hop means that step's navigation is done, so the position
   * moves to the step after it; a matched earlier hop leaves it on the step. Either way the
   * position then skips steps already marked done — the done ledger is what makes
   * "insiderriskmgmt" mean Settings on first arrival and Policies once Settings and Save are
   * behind the learner, and what stops the URL pinning the belief to a step that is finished.
   *
   * Returns null when nothing matches, else { pos, passed, present }:
   *   pos      the step the text says the learner is on
   *   passed   the matched step, when the position moved off it (-1 if not)
   *   present  per step: does any of its hints appear at all
   */
  function locate(text, key) {
    var at = -1, hop = -1, present = [];
    for (var i = 0; i < M.steps.length; i++) {
      var hops = M.steps[i].hops, seen = false;
      for (var j = 0; j < hops.length; j++) {
        var hs = hops[j][key];
        for (var k = 0; k < hs.length; k++) {
          if (text.indexOf(hs[k]) >= 0) { at = i; hop = j; seen = true; break; }
        }
      }
      present.push(seen);
    }
    if (at < 0) return null;
    var from = (hop === M.steps[at].hops.length - 1) ? at + 1 : at;
    var pos = at;
    for (var n = from; n < M.steps.length; n++) {
      if (!M.done[M.steps[n].id]) { pos = n; break; }
    }
    // nothing unfinished from there on: this is the lab's last page, stay on the matched step
    return { pos: pos, passed: pos === at ? -1 : at, present: present };
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
      M.route = routeText(screen.url);
    }
    if (screen.title != null && screen.title !== M.title) {
      M.title = screen.title;
      M.titleText = plain(screen.title);
    }

    // where the URL says the learner is; the title only when the URL says nothing
    var R = M.route ? locate(M.route, "route") : null;
    var T = (!R && M.titleText) ? locate(M.titleText, "title") : null;
    M.position = R ? { from: "url", pos: R.pos, passed: R.passed }
               : T ? { from: "title", pos: T.pos, passed: T.passed } : null;

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

      // Route evidence. The URL alone adds ROUTE_EVIDENCE, which tops out below CONF_ADVANCE, so
      // a stray "policies" in an unrelated URL cannot flip the belief by itself. When the
      // controls agree with the URL they count double — that is what gets the right step to the
      // pilot's 0.80 in two or three observations. A step the URL has moved past, or whose own
      // destination the URL does not name, has its control evidence halved: the nav item is on
      // screen, but the URL says that is not where the learner is.
      if (R) {
        if (i === R.pos) evidence = evidence * ROUTE_AGREE + ROUTE_EVIDENCE;
        else if (i === R.passed || (step.hinted && !R.present[i])) evidence *= ROUTE_CONTRADICT;
      } else if (T && i === T.pos) {
        evidence += TITLE_EVIDENCE;
      }

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
    if (ev.type === "hop" && M.index >= 0 && M.steps[M.index]) {
      // One target of a multi-target instruction has been seen to take effect (the menu
      // opened). The step is not done; the pointer inside it moves to the next target.
      var hs = M.steps[M.index];
      var h = (M.hop[hs.id] || 0) + 1;
      M.hop[hs.id] = Math.min(h, Math.max(0, (hs.targets || []).length - 1));
    }
    if (ev.type === "complete" && M.index >= 0 && M.steps[M.index]) {
      var cur = M.steps[M.index];
      M.done[cur.id] = now();
      // An OBSERVED completion (progress.js: the toast appeared, the control went away) is the
      // strongest evidence position ever gets - stronger than a label being on screen. Move
      // the belief to the next unfinished step now, so the pilot hunts for ITS target on the
      // very next turn instead of re-glowing the one just finished until enough frames of
      // decay catch up. CONF_ADVANCE, not 1: a progress NUMBER still waits for the page to
      // agree (pilot.js CONF_SHOW), so Rocky moves on without claiming more than he knows.
      M.belief[M.index] = 0;
      var nx = -1;
      for (var k = M.index + 1; k < M.steps.length; k++) if (!M.done[M.steps[k].id]) { nx = k; break; }
      if (nx >= 0) {
        M.index = nx;
        if (M.belief[nx] < CONF_ADVANCE) M.belief[nx] = CONF_ADVANCE;
        M.confidence = M.belief[nx];
        M.learner.enteredStep = now();
        M.learner.attempts = 0;
      }
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
    var step = currentStep();
    return {
      lab: M.lab,
      step: step,
      index: M.index,
      hop: (step && M.hop[step.id]) || 0,     // which of the step's ordered targets is next
      total: M.steps.length,
      confidence: Math.round(M.confidence * 100) / 100,
      resolution: M.resolution,
      stuck: stuck(),
      done: Object.keys(M.done).length,
      learner: M.learner,
      url: M.url,
      route: M.position,    // what the URL or title last said about position, or null
      observeMs: M.lastObserveMs,
    };
  }

  function dismissed(label) {
    return !!(M && M.learner.dismissed[norm(label)]);
  }

  function reset() { M = blank(); return M; }

  // The whole step list. Explore mode uses it to tell a model what comes next, which is the
  // difference between answering "what do I do after this" from the lab and inventing it.
  function steps() { return (M && M.steps) || []; }

  window.LabPilotWorld = {
    steps: steps,
    ingest: ingest,
    observe: observe,
    note: note,
    setResolution: setResolution,
    current: current,
    currentStep: currentStep,
    stuck: stuck,
    dismissed: dismissed,
    reset: reset,
    _tuning: { CONF_ADVANCE: CONF_ADVANCE, DECAY: DECAY, STUCK_MS: STUCK_MS, STUCK_ATTEMPTS: STUCK_ATTEMPTS, OSCILLATE: OSCILLATE,
               ROUTE_EVIDENCE: ROUTE_EVIDENCE, ROUTE_AGREE: ROUTE_AGREE, ROUTE_CONTRADICT: ROUTE_CONTRADICT, TITLE_EVIDENCE: TITLE_EVIDENCE },
  };
})();
