/*
 * LabPilot content orchestrator (PLAN-V2 §A). Ties the anchor engine + overlay to the
 * current step, and keeps guidance a pure function of live page state (accuracy #3):
 * re-evaluates on DOM mutation and SPA route change, so a removed element drops the
 * glow the same frame and a route change re-resolves. Also hosts capture mode.
 *
 * CROSS-NAV (PLAN-V2 cross-nav §A-§E): the step pointer (state.stepIndex, persisted as
 * lpStepIndex) is loaded on startup so a full-page navigation RESUMES at the same step
 * instead of restarting at 0. evaluate() is screen-aware: it derives each step's screen
 * from its selector urlPattern (stepScreen), and when the current step can't resolve it
 * uses a BOUNDED lookahead of EXACTLY ONE step (never a forward-scan) to detect
 * completed-by-navigation, else guides the user back if they've misnavigated.
 *
 * CAPTURE MODE (record-as-you-click): when state.capture is ON, evaluate() shows a
 * persistent "● Recording — Step N of M" card instead of guidance, the operator clicks
 * the real control the step describes, describe() auto-records its selector bundle into
 * chrome.storage.local "lpCaptures", and the capture pointer advances to the next step.
 * Guidance mode (capture OFF) is entirely unaffected.
 */
(function () {
  "use strict";
  var A = window.LabPilotAnchor, O = window.LabPilotOverlay, C = window.LabPilotCapture;
  var Vz = window.LabPilotVision; // scoped pixel fallback for surface:"vision" (may be absent)
  if (!A || !O) return;

  var state = { steps: [], stepIndex: 0, capture: false, captureIndex: 0, bundleId: null, visionRect: null,
                absentStep: -1, absentSince: 0, absentTold: false };
  var evalScheduled = false;
  var visionPoll = 0; // interval id while the current step is a vision step (see below)

  // A pixel surface (RDP canvas / video) repaints WITHOUT firing DOM mutations, so the
  // MutationObserver never wakes us for a vision step. While the current step is vision we
  // poll a re-eval (~400ms) so the glow re-matches as the remote frame changes; the poll is
  // cleared the moment we leave a vision step (no cost on ordinary DOM steps).
  function manageVisionPoll(step) {
    var isVision = !!(step && step.surface === "vision");
    if (isVision && !visionPoll) {
      visionPoll = setInterval(function () { scheduleEval(); }, 400);
    } else if (!isVision && visionPoll) {
      clearInterval(visionPoll); visionPoll = 0;
    }
  }

  function flatten(bundle) {
    var out = [];
    if (!bundle || !bundle.labs) return out;
    bundle.labs.forEach(function (lab) {
      (lab.tasks || []).forEach(function (task) {
        (task.steps || []).forEach(function (s) {
          // tag the owning task so the watcher can mark a genuine milestone rather than
          // an arbitrary step number
          s._taskId = task.id; s._taskTitle = task.title || task.name || "";
          out.push(s);
        });
      });
    });
    return out;
  }

  function glowableTarget(step) {
    if (!step || !step.targets) return null;
    for (var i = 0; i < step.targets.length; i++) {
      var t = step.targets[i];
      var cls = t.targetClass || "ui-control";
      if (cls === "ui-control") return t;
    }
    return null;
  }

  function currentStep() {
    return state.steps[state.stepIndex] || null;
  }

  // A DOM-element-like handle so the overlay can pin its glow to a fixed viewport rect
  // (a vision match inside a pixel surface) using the same guide()/position() path as a
  // real element. isConnected stays true only while we hold it; a re-eval that no longer
  // matches replaces it with the honest card (stopTracking), so no stale glow persists.
  function virtualTarget(rect) {
    return {
      isConnected: true,
      getBoundingClientRect: function () {
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
                 right: rect.left + rect.width, bottom: rect.top + rect.height };
      },
      contains: function () { return false; }
    };
  }

  // ---- CAPTURE MODE: persistent recording card (record-as-you-click) ----------
  // Shows which step the operator should perform next; the click listener records the
  // clicked control's selector bundle and advances this pointer. Uses the loaded
  // bundle's step list for N/M and text so the operator follows the same step order.
  function renderCaptureCard() {
    var M = state.steps.length;
    if (M && state.captureIndex >= M) {
      O.checking("● Capture complete — " + M + " of " + M + " steps recorded",
        "Open the LabPilot popup and click \"Export captures\" to download labpilot-captures.json.");
      return;
    }
    if (!M) {
      O.checking("● Recording — no bundle loaded",
        "Load a bundle to record step-by-step, or just click controls to capture selectors.");
      return;
    }
    var step = state.steps[state.captureIndex] || {};
    var n = state.captureIndex + 1;
    O.checking("● Recording — Step " + n + " of " + M,
      (step.text || "this control") + "  ·  Click the control I describe and I'll record it.");
  }

  // SCREEN IDENTITY (PLAN-V2 cross-nav §B): a step's "screen" is the urlPattern its
  // glowable selector requires (the substring location.href must contain). This is how
  // we know which page a step belongs to WITHOUT guessing from DOM contents. Returns the
  // pattern string, or null when the step declares none (=> screen reasoning disabled for
  // that step: we fall back to the honest "locating" state, never a nav inference).
  function stepScreen(step) {
    if (!step) return null;
    var t = glowableTarget(step);
    if (!t || !t.selectors) return null;
    for (var i = 0; i < t.selectors.length; i++) {
      var attrs = t.selectors[i] && (t.selectors[i].attrs || t.selectors[i]);
      if (attrs && attrs.urlPattern) return attrs.urlPattern;
    }
    return null;
  }

  // MISNAVIGATION redirect target: a VISIBLE nav link whose href leads back toward the
  // current step's screen. Only ever returns a real link that points at that screen
  // (never a random control). Domain-level screens (no "/") are too generic to anchor a
  // redirect glow safely => null (caller shows an honest "get back on track" pill instead).
  function findBackNav(screen) {
    if (!screen || screen.indexOf("/") < 0) return null;
    var links;
    try {
      links = document.querySelectorAll('nav a[href], [role="navigation"] a[href], a[href]');
    } catch (e) { return null; }
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (href.indexOf(screen) >= 0 && A.isVisible(links[i])) return links[i];
    }
    return null;
  }

  function engStepFor(step) {
    if (!step) return null;
    if (step.surface && step.surface !== "browser") return { _surface: step.surface };
    var target = glowableTarget(step);
    if (!target) return { _noTarget: true };
    if (!target.selectors || !target.selectors.length) return { _noSel: true, target: target };
    var es = { selectors: target.selectors };
    var chain = step.then || target.then;
    if (chain) es.then = chain;
    if (step.value && step.value.display != null && step.value.display !== "") es.value = step.value.display;
    return { es: es, target: target };
  }

  function tryResolve(idx) {
    var step = state.steps[idx];
    var built = engStepFor(step);
    if (!built || built._surface || built._noTarget || built._noSel) return { built: built, step: step, r: null };
    return { built: built, step: step, r: A.resolveStep(built.es) };
  }

  function evaluate() {
    evalScheduled = false;
    // CAPTURE MODE takes over the overlay entirely: no guidance resolution runs, so it
    // can never fight the recording card (and guidance mode is untouched when capture off).
    if (state.capture) { renderCaptureCard(); return; }
    if (!state.steps.length) { O.hide(); return; }
    // Past the last step => nothing to show. NEVER scan/glow ahead of the current
    // step: the step pointer only advances on OBSERVED user action (click-track /
    // storage.onChanged) or a BOUNDED one-step completed-by-navigation check below,
    // never by inferring position from which future control happens to be in the DOM.
    // Glowing a later step the user hasn't reached is a guess (PLAN-V2 accuracy #2/#3).
    if (state.stepIndex >= state.steps.length) {
      if (state.celebrate && !state.celebrated && O.celebrate) {
        state.celebrated = true;
        try { if (window.LabPilotWatcher) window.LabPilotWatcher.note({ type: 'complete' }); } catch (e) {}
        O.celebrate(state.celebrateMsg);
      }
      else if (!state.celebrate) { O.hide(); }
      return;
    }

    var idx = state.stepIndex;
    var step = state.steps[idx];
    manageVisionPoll(step); // poll only while on a vision step (canvas repaints silently)

    // VISION surface (PLAN-V2 §vision): the step's control is PIXELS, not DOM — the
    // native OS file picker, or a VS Code / remote-desktop frame shown in-browser (RDP
    // canvas). Template-match the stored reference crop against that pixel surface, under
    // the SAME accuracy contract as DOM: a confident+unique match glows; anything less
    // degrades to the instruction card (never a wrong glow). Requires the vision module.
    if (step && step.surface === "vision") {
      state.visionRect = null;
      var vr = Vz ? Vz.resolveVisionStep(step, {}) : { status: "card", cardText: step.text };
      if (vr && vr.status === "resolved" && vr.viewportRect) {
        state.visionRect = vr.viewportRect;
        O.guide(virtualTarget(vr.viewportRect), step.text || "Do this step",
          { sub: "Step " + (idx + 1) + " of " + state.steps.length });
      } else {
        O.checking((step.text || "Do this step"),
          (vr && vr.cardText && vr.cardText !== step.text ? vr.cardText + "  ·  " : "") +
          "Step " + (idx + 1) + " of " + state.steps.length + " — I'll glow it here once I can see it; follow this if it's a system dialog.");
      }
      return;
    }

    // other non-browser surfaces (vscode/desktop, no vision template) => honest "up next"
    if (step && step.surface && step.surface !== "browser") {
      O.checking("Up next (" + step.surface + "): " + (step.text || "").slice(0, 120));
      return;
    }

    var got = tryResolve(idx);
    var r = got.r;
    if (r && r.status === "resolved") {
      var target = got.built.target;
      if (r.disabled) {
        O.guide(r.element, "Not available yet: " + (target.label || step.text || "this control"),
          { variant: "notice", sub: "This control is disabled right now - finish the prerequisite or pick an available option, and I'll resume." });
        return;
      }
      var sub = "Step " + (idx + 1) + " of " + state.steps.length;
      var gmeta = {};
      if (r.action === "type" && r.value != null && r.value !== "") { sub += " \u00b7 Type: " + r.value; gmeta.copyText = String(r.value); }
      gmeta.sub = sub;
      gmeta.progress = { n: idx + 1, total: state.steps.length };
      if (step.hint) gmeta.hint = step.hint;
      if (step.learn) gmeta.learn = step.learn;   // authored WHY / WHAT / TIP, rendered verbatim by Rocky
      state.absentStep = -1; state.absentTold = false;
      O.guide(r.element, step.text || target.label, gmeta);
      return;
    }

    // CURRENT step unresolvable. Recovery playbooks take priority over everything
    // below (a page showing a known error/at-capacity is the real story). They only
    // fire here, so they never override a good glow.
    var pb = matchPlaybook();
    if (pb) { O.checking(pb.card.title, pb.card.body); return; }

    // SCREEN-AWARE handling (PLAN-V2 cross-nav §C). All decisions are a pure function
    // of (live page, progress) + a BOUNDED lookahead of EXACTLY ONE step. This is NOT a
    // forward-scan: we only ever consult idx+1, and we only advance when the user has
    // genuinely left the current step's screen AND the very next step is live here.
    var curScreen = stepScreen(step);
    if (curScreen === null) {
      // No screen identity for this step => we can't reason about navigation. Fall back
      // to the honest "locating" state (never a nav inference from a screenless step).
      O.checking("One sec - locating this step on the page…");
      return;
    }
    var onCurScreen = location.href.indexOf(curScreen) >= 0;

    // (1) Completed-by-navigation: the user has left cur's screen and the IMMEDIATE next
    //     step's control resolves on THIS page. Advance at most ONE step, persist, re-eval.
    var nextIdx = idx + 1;
    if (!onCurScreen && nextIdx < state.steps.length) {
      var gotNext = tryResolve(nextIdx);
      if (gotNext.r && gotNext.r.status === "resolved" && !gotNext.r.disabled) {
        state.stepIndex = nextIdx;
        try { chrome.storage.local.set({ lpStepIndex: state.stepIndex }); } catch (e2) {}
      reportStep(state.stepIndex - 1, state.stepIndex);
        scheduleEval();
        return;
      }
    }

    // (2) User is on the right screen but the control isn't present yet (still loading, or
    //     it needs a sub-action to reveal it) => honest "finding this step".
    if (onCurScreen) {
      // Time how long this step has been unresolvable HERE. A slow page resolves in a
      // second or two; a step that never resolves on the right screen is portal drift, and
      // the watcher turns that into an honest admission instead of an endless spinner.
      if (state.absentStep !== idx) { state.absentStep = idx; state.absentSince = Date.now(); }
      else if (!state.absentTold && Date.now() - state.absentSince > 20000) {
        state.absentTold = true;
        try {
          if (window.LabPilotWatcher) window.LabPilotWatcher.note({
            type: "absent", index: idx, text: step.text || "", persistedMs: Date.now() - state.absentSince,
          });
        } catch (e3) {}
      }
      O.checking("One sec - finding this step…",
        "Step " + (idx + 1) + " of " + state.steps.length + ": " + ((step.text || "").slice(0, 120)));
      return;
    }

    // (3) MISNAVIGATION: neither cur's screen nor the next step's screen. Point the user
    //     back toward cur's screen. Prefer a REAL nav link that returns there (amber
    //     notice, never a click-me glow); otherwise an honest "get back on track" pill.
    var back = findBackNav(curScreen);
    if (back) {
      O.guide(back, "You've navigated away - go back to continue Step " + (idx + 1) + ": " + ((step.text || "").slice(0, 100)),
        { variant: "notice", sub: "Return to " + curScreen + " to resume." });
      return;
    }
    O.checking("You've navigated away from this step",
      "Go back to " + curScreen + " to continue Step " + (idx + 1) + ": " + ((step.text || "").slice(0, 120)));
  }

  // Built-in DOM recovery playbooks (PLAN-V2: sign-in/error families as data). These
  // fire only when the current step isn't cleanly resolvable, so they never override a
  // good glow. Cowork can later move/extend these into bundle data.
  var PLAYBOOKS = [
    {
      id: "no-access",
      match: { textAny: ["you do not have access", "request access", "project not found", "no access to this", "failed to load project"] },
      card: { title: "Access hiccup - reload or reselect your project", body: "The portal briefly lost access (often a token refresh). Reload the page, or use the project switcher to reselect your project, then continue." }
    },
    {
      id: "region-at-capacity",
      match: { textAny: ["is currently at capacity", "region is at capacity", "not available in the selected region", "this region is at capacity"] },
      card: { title: "This region is at capacity", body: "Azure AI Search can't be created in the selected region right now. Change the region and retry - the guidance resumes once it's available." }
    }
  ];

  function matchPlaybook() {
    var text = ((document.body && document.body.innerText) || "").toLowerCase();
    if (!text) return null;
    for (var i = 0; i < PLAYBOOKS.length; i++) {
      var p = PLAYBOOKS[i];
      if (p.match.urlContains && location.href.indexOf(p.match.urlContains) < 0) continue;
      for (var j = 0; j < p.match.textAny.length; j++) {
        if (text.indexOf(p.match.textAny[j]) >= 0) return p;
      }
    }
    return null;
  }

  function scheduleEval() {
    if (evalScheduled) return;
    evalScheduled = true;
    // Coalesce a burst of mutations into ONE evaluation at the next paint
    // (~16ms, paint-aligned): snappier than a fixed timeout AND cheaper (no
    // wasted eval between frames). Fallback to a short timeout if rAF absent.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(evaluate);
    } else {
      setTimeout(evaluate, 16);
    }
  }

  // ---- liveness: DOM mutations (ignore our own overlay subtree) ----
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var t = muts[i].target;
      if (t && t.closest && t.closest("#labpilot-overlay-root")) continue;
      scheduleEval();
      return;
    }
  });
  try { mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "id", "role", "hidden", "style", "class"] }); } catch (e) { /* ignore */ }

  // ---- SPA route awareness: patch history + listen to nav events ----
  function fireRoute() { window.dispatchEvent(new Event("lp-route")); }
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); fireRoute(); return r; };
  });
  window.addEventListener("popstate", scheduleEval);
  window.addEventListener("hashchange", scheduleEval);
  window.addEventListener("lp-route", scheduleEval);

  // ---- capture mode: record the clicked control as a selector bundle ----
  // Record-as-you-click: on a genuine click (not our own overlay UI) describe the
  // clicked control, append {stepId, stepIndex, bundle, url} into chrome.storage.local
  // "lpCaptures" (the array Cowork ingests), then ADVANCE the capture pointer + re-render
  // the recording card. The operator just reads the step, clicks the control, and moves on.
  document.addEventListener("click", function (e) {
    if (!state.capture) return;
    var raw = e.target;
    if (raw && raw.closest && raw.closest("#labpilot-overlay-root")) return; // ignore our own UI
    if (state.steps.length && state.captureIndex >= state.steps.length) return; // capture complete
    var el = (raw.closest && raw.closest('a,button,input,summary,label,[role],[tabindex],[aria-label]')) || raw;
    var bundle = C && C.describe(el);
    if (!bundle) return;
    var step = state.steps[state.captureIndex] || null;
    var entry = { stepId: step ? step.id : null, stepIndex: state.captureIndex, bundle: bundle, url: location.href };
    try {
      chrome.storage.local.get(["lpCaptures"], function (v) {
        var arr = (v && v.lpCaptures) || [];
        arr.push(entry);
        state.captureIndex = Math.min(state.captureIndex + 1, state.steps.length || (state.captureIndex + 1));
        chrome.storage.local.set({ lpCaptures: arr, lpCaptureIndex: state.captureIndex }, function () { scheduleEval(); });
      });
    } catch (e2) { /* storage unavailable */ }
  }, true);

  document.addEventListener("click", function (e) {
    if (state.capture) return;
    var raw = e.target;
    if (raw && raw.closest && raw.closest("#labpilot-overlay-root")) return;
    // PRIMARY safe advance (PLAN-V2 cross-nav §D): the user clicked the CURRENTLY-glowed
    // element => verified completion of the current step. Advance one, persist, re-eval.
    if (O.tracked && raw && (raw === O.tracked || (O.tracked.contains && O.tracked.contains(raw)))) {
      state.stepIndex = Math.min(state.stepIndex + 1, state.steps.length);
      try { chrome.storage.local.set({ lpStepIndex: state.stepIndex }); } catch (e2) {}
      reportStep(state.stepIndex - 1, state.stepIndex);
      scheduleEval();
      return;
    }
    // VISION advance: the glow is a virtual rect over a pixel surface (contains() is
    // always false), so verify completion by the click landing INSIDE the matched rect.
    var cur = currentStep();
    if (cur && cur.surface === "vision" && state.visionRect && typeof e.clientX === "number") {
      var vrct = state.visionRect;
      if (e.clientX >= vrct.left && e.clientX <= vrct.left + vrct.width &&
          e.clientY >= vrct.top && e.clientY <= vrct.top + vrct.height) {
        state.stepIndex = Math.min(state.stepIndex + 1, state.steps.length);
        state.visionRect = null;
        try { chrome.storage.local.set({ lpStepIndex: state.stepIndex }); } catch (e3) {}
        scheduleEval();
      }
    }
  }, true);

  // ---- state load + sync ----
  // The watcher needs the step list to say anything useful about where the learner is.
  function startWatcher() {
    try {
      if (window.LabPilotWatcher) {
        window.LabPilotWatcher.start({ steps: state.steps, stepIndex: state.stepIndex, lab: state.bundleId });
      }
    } catch (e) {}
  }

  // Tell the watcher where the learner now is. A task boundary is the only milestone
  // worth celebrating: it means a real chunk of the lab is finished.
  function reportStep(prevIdx, nextIdx) {
    try {
      if (!window.LabPilotWatcher) return;
      var prev = state.steps[prevIdx], next = state.steps[nextIdx];
      state.absentStep = -1; state.absentTold = false;
      window.LabPilotWatcher.note({
        type: "step",
        index: nextIdx,
        taskChanged: !!(prev && next && prev._taskId !== next._taskId),
        taskTitle: prev ? prev._taskTitle : "",
      });
    } catch (e) {}
  }

  function applyBundle(bundle) {
    state.steps = flatten(bundle);
    state.bundleId = bundle && (bundle.labId || bundle.title) || "bundle";
    state.celebrate = !!(bundle && bundle.celebrateOnComplete);
    state.celebrateMsg = (bundle && bundle.celebrateMsg) || "Lab complete!";
    state.celebrated = false;
    startWatcher();
    scheduleEval();
  }

  // On startup RESTORE the persisted pointer (PLAN-V2 cross-nav §A): a full-page
  // navigation reloads this content script, so resuming at lpStepIndex (not 0) is what
  // lets guidance continue across navigations instead of restarting the flow. The capture
  // pointer (lpCaptureIndex) resumes the same way so recording survives navigations.
  function loadState() {
    chrome.storage.local.get(["lpBundle", "lpStepIndex", "lpCapture", "lpCaptureIndex"], function (v) {
      state.stepIndex = v.lpStepIndex || 0;
      state.capture = !!v.lpCapture;
      state.captureIndex = v.lpCaptureIndex || 0;
      if (v.lpBundle) {
        applyBundle(v.lpBundle);
      } else {
        // Dev fallback: the packaged test bundle drives the V2-1 gate.
        fetch(chrome.runtime.getURL("bundle/test-bundle.json"))
          .then(function (r) { return r.json(); })
          .then(applyBundle)
          .catch(function () { O.checking("LabPilot: no bundle loaded."); });
      }
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    if (changes.lpStepIndex) {
      var prev = state.stepIndex;
      state.stepIndex = changes.lpStepIndex.newValue || 0;
      reportStep(prev, state.stepIndex);
    }
    if (changes.lpCapture) state.capture = !!changes.lpCapture.newValue;
    if (changes.lpCaptureIndex) state.captureIndex = changes.lpCaptureIndex.newValue || 0;
    if (changes.lpBundle && changes.lpBundle.newValue) { applyBundle(changes.lpBundle.newValue); return; }
    scheduleEval();
  });

  loadState();
})();
