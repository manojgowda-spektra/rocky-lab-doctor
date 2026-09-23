/*
 * LabPilot EXPLORE mode — "let me explore" for a live sandbox.
 *
 * Rocky normally guides a fixed sequence of steps. He is the ONLY UI: click him and his options
 * fan out in an animated RING around him (‹ Back · Next › · 🎉 Finish · ↻ Restart · 📘 Learn ·
 * 🧭 Explore/▶ Resume · 💬 Ask · ✕ Hide). Choose "Explore": guiding PAUSES (no glow, no step
 * bubble) and Rocky WATCHES instead:
 *   • REST your mouse on any control (~0.9 s) or DRAW A SMALL CIRCLE around it with the mouse —
 *     no click needed — and Rocky flies there and tells you WHAT it is and WHAT it does
 *     (authored Foundry knowledge base; otherwise an honest role+label description);
 *   • click something he knows and he adds a one-line comment;
 *   • try something DESTRUCTIVE (delete / remove / purge / regenerate key…) and he intercepts the
 *     click, explains the consequence, and only lets a deliberate second click within 8 s through;
 *   • optional "Ask AI": if a Foundry deployment is configured in the popup, one button sends the
 *     control's role/label/context (never page content, never keys) to it for a richer
 *     explanation, shown clearly labelled AI. Rocky's mood and the guard never depend on it.
 *   • ASK ROCKY: click Rocky → "Ask Rocky…" (or Alt+A) in EITHER mode and type any question; it goes to
 *     the configured Foundry deployment with lab context (current step + notes, page, last control)
 *     and comes back labelled AI, with the box kept open for follow-ups (last 4 turns remembered).
 * Click Rocky again → "Resume guiding" and the step glow comes back exactly where you were.
 *
 * Dwell + circle + guard are ACTIVE ONLY WHILE EXPLORING — during guiding Rocky stays the single
 * voice for the current step.  State persists (chrome.storage lpExplore) across page loads.
 */
(function () {
  "use strict";
  if (window.__lpExplore) return;
  var R = function () { return window.LabPilotRocky; }, KB = function () { return window.LabPilotKB; };
  var st = { on: false, steps: [], lastEl: null, armedEl: null, armedUntil: 0, ai: null, menu: null, history: [], lastDesc: null, stepIndex: 0, lab: "" };

  // ---- bundle steps (for "this is step N of your lab") ---------------------------------
  try {
    fetch(chrome.runtime.getURL("bundle/test-bundle.json")).then(function (r) { return r.json(); })
      .then(function (b) { var s = []; st.lab = b.title || ""; (b.labs || []).forEach(function (l) { (l.tasks || []).forEach(function (t) { s = s.concat(t.steps || []); }); }); st.steps = s; }).catch(function () {});
  } catch (e) {}
  try { chrome.storage.local.get(["lpStepIndex"], function (v) { st.stepIndex = (v && v.lpStepIndex) || 0; }); } catch (e) {}

  // ---- Ask-AI config (optional; set in the popup; stored locally only) ------------------
  function loadAI() { try { chrome.storage.local.get(["lpAI"], function (v) { var a = v && v.lpAI; st.ai = (a && a.endpoint && a.deployment && a.apiKey) ? a : null; }); } catch (e) {} }
  loadAI();
  try { chrome.storage.onChanged.addListener(function (ch, area) { if (area === "local" && ch.lpAI) loadAI(); if (area === "local" && ch.lpStepIndex) st.stepIndex = ch.lpStepIndex.newValue || 0; if (area === "local" && ch.lpExplore && !!ch.lpExplore.newValue !== st.on) { ch.lpExplore.newValue ? start(true) : stop(true); } }); } catch (e) {}

  // ---- pure: circle gesture detector ------------------------------------------------------
  // points: [{x,y,t}] from the last ~1.6 s. A circle = >= 300° of consistent rotation around the
  // centroid, radius 12..260 px, radius spread < 50 %, path long enough to be deliberate.
  function detectCircle(pts) {
    if (!pts || pts.length < 10) return null;
    var n = pts.length, cx = 0, cy = 0, i;
    for (i = 0; i < n; i++) { cx += pts[i].x; cy += pts[i].y; }
    cx /= n; cy /= n;
    var rs = [], mean = 0;
    for (i = 0; i < n; i++) { var r = Math.hypot(pts[i].x - cx, pts[i].y - cy); rs.push(r); mean += r; }
    mean /= n;
    if (mean < 12 || mean > 260) return null;
    var v = 0; for (i = 0; i < n; i++) v += (rs[i] - mean) * (rs[i] - mean);
    if (Math.sqrt(v / n) / mean > 0.5) return null;
    var sweep = 0, path = 0, prev = Math.atan2(pts[0].y - cy, pts[0].x - cx);
    for (i = 1; i < n; i++) {
      var a = Math.atan2(pts[i].y - cy, pts[i].x - cx), d = a - prev;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      sweep += d; prev = a; path += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    if (Math.abs(sweep) < Math.PI * 5 / 3) return null;          // >= 300°
    if (path < 2 * Math.PI * mean * 0.6) return null;             // must actually travel around
    return { cx: cx, cy: cy, r: mean, sweep: sweep };
  }

  // ---- explaining ---------------------------------------------------------------------------
  function targetAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || !KB() || !KB().interesting(el)) return null;
    return KB().describe(el);
  }
  function labelFor(via) { return via === "circle" ? "YOU CIRCLED" : via === "dwell" ? "YOU PAUSED ON" : via === "click" ? "YOU OPENED" : "EXPLORE"; }
  function explain(desc, via) {
    if (!desc || !R()) return;
    st.lastEl = desc.el; st.lastDesc = desc;
    var text = KB().explain(desc, { steps: st.steps });
    var opts = { label: labelFor(via), mood: "explore", hint: "Click me to resume the lab · Alt+E" };
    if (st.ai) { opts.onAskAI = function () { askAI(desc, text); }; opts.ask = askBox("Ask Rocky about this…"); }
    R().explain(desc.el, text, opts);
  }
  function askAI(desc, kbText) {
    if (!R()) return;
    R().explain(desc.el, kbText, { label: labelFor("ask"), mood: "think", ai: "Asking your Foundry deployment…", hint: "" });
    var payload = { name: desc.name, role: desc.role, context: desc.context, state: desc.state, route: location.pathname, title: document.title, kb: kbText };
    try {
      chrome.runtime.sendMessage({ type: "lp-ask-ai", payload: payload }, function (res) {
        var ans = res && res.text ? res.text : ("AI unavailable: " + (res && res.error || "no response") + ". The description above is what I can verify myself.");
        R().explain(desc.el, kbText, { label: labelFor("ask"), mood: "explore", ai: ans, hint: "Click me to resume the lab · Alt+E" });
      });
    } catch (e) {}
  }

  // ---- ASK ROCKY: free-text questions (both modes) --------------------------------------------
  function context() {
    var step = st.steps[st.stepIndex] || null, L = step && step.learn || null;
    var c = { lab: st.lab, title: document.title, route: location.pathname, history: st.history.slice(-4) };
    if (step) { c.step = step.text; c.stepNo = st.stepIndex + 1; if (L) c.learn = [L.why, L.what].filter(Boolean).join(" "); }
    if (st.on && st.lastDesc) { c.name = st.lastDesc.name; c.role = st.lastDesc.role; c.context = st.lastDesc.context; c.state = st.lastDesc.state; }

    // GROUNDING. The model is told what is actually true — which lab, which environment,
    // where the learner is, what has gone wrong — and what Rocky cannot see. A model given
    // real context answers from it; a model given none invents something plausible, which
    // is the one failure this whole product exists to avoid.
    try { if (window.LabPilotLab) c.grounding = window.LabPilotLab.summary(); } catch (e) {}
    try {
      var w = window.LabPilotWatcher && window.LabPilotWatcher.snapshot();
      if (w) {
        c.observed = 'Step ' + (w.stepIndex + 1) + ' of ' + w.totalSteps +
          '; ' + Math.round(w.onStepMs / 1000) + 's on this step' +
          (w.errorsSeen.length ? '; errors on the page: ' + w.errorsSeen.join(', ') : '') +
          (w.recentClicks.length ? '; last clicks: ' + w.recentClicks.map(function (k) {
            return (k.name || '?') + (k.onTarget ? ' (correct)' : ' (not the step target)');
          }).join(', ') : '');
      }
    } catch (e) {}

    // Next steps, so "what do I do after this" is answered from the lab, not imagination.
    try {
      var ahead = st.steps.slice(st.stepIndex + 1, st.stepIndex + 4)
        .map(function (x, i) { return (st.stepIndex + 2 + i) + '. ' + x.text; });
      if (ahead.length) c.upcoming = ahead.join(' | ');
    } catch (e) {}
    return c;
  }
  function askBox(placeholder, focus) { return { placeholder: placeholder || "Ask Rocky anything about this lab…", onAsk: askRocky, focus: !!focus }; }
  function openAsk() {
    closeMenu(); if (!R()) return;
    if (!st.ai) { R().announce("I can answer free questions once my Foundry deployment is set: open the extension popup → Ask Rocky and paste the endpoint, model name and key (they stay in this browser). Until then I still explain any control you rest on or circle in Explore mode.", { label: "ASK ROCKY", mood: "think", hint: "Popup → Ask Rocky (AI)" }); return; }
    R().announce(st.on ? "Ask me anything — about this page, the lab, or the control you just looked at." : "Ask me anything about this step or the lab. I'll keep pointing at the current step while we talk.",
      { label: "ASK ROCKY", mood: st.on ? "explore" : "think", ask: askBox(null, true), hint: "Enter to send · Esc closes" });
  }
  function askRocky(q) {
    if (!R()) return;

    // Deterministic first. "Which lab am I in", "how far am I", "what is my resource group"
    // are matters of record, not opinion: answering them from lab.json is instant, free and
    // cannot be wrong. Only genuinely open questions reach the model.
    try {
      var known = window.LabPilotLab && window.LabPilotLab.answer(q);
      if (known) {
        st.history.push({ q: q, a: known }); if (st.history.length > 8) st.history.shift();
        R().announce('“' + q + '”', { label: 'ASK ROCKY', mood: 'happy', ai: known,
          ask: askBox('Follow-up…', true), hint: 'From the lab itself — not generated' });
        return;
      }
    } catch (e) {}

    // Rung 2: the CloudLabs corpus. Compiled from the platform's own docs and the team's
    // resolved-issue register, searched offline, and QUOTED with its source. Only if it has
    // nothing does the question reach a model.
    var CL = window.LabPilotCloudLabs;
    if (CL) {
      CL.ready(function () {
        var found = null;
        try { found = CL.answer(q); } catch (e) {}
        if (found) {
          st.history.push({ q: q, a: found.text }); if (st.history.length > 8) st.history.shift();
          var where = found.title + (found.heading ? ' — ' + found.heading : '');
          // A guess said as a fact is the failure we sell against. Same text, honest framing.
          var label = !found.confident ? 'MY BEST GUESS'
                    : found.kind === 'issue' ? 'A KNOWN ISSUE'
                    : 'FROM THE CLOUDLABS DOCS';
          var body = found.confident ? found.text
                   : 'Not certain this is what you meant, but the closest I have: ' + found.text;
          R().announce(body, {
            label: label,
            mood: !found.confident ? 'think' : found.kind === 'issue' ? 'concerned' : 'happy',
            ask: askBox('Follow-up…', true),
            hint: where + (found.url ? '  ·  ' + found.url : ''),
          });
          return;
        }
        askModel(q);            // the corpus does not cover it
      });
      return;
    }
    askModel(q);
  }

  // Rung 3: a model, over the lab context - used only when neither the lab record nor the
  // documentation answers the question.
  function askModel(q) {
    if (!st.ai) {
      R().announce('I can only answer that with my AI switched on — and I would rather say so than guess. ' +
        'Open the extension popup → Ask Rocky and paste an endpoint, model name and key. ' +
        'Facts about this lab and every control on screen I can still answer without it.',
        { label: 'I CANNOT ANSWER THAT YET', mood: 'concerned', hint: 'Popup → Ask Rocky (AI)' });
      return;
    }

    var c = context(); c.question = q;
    R().announce("“" + q + "”", { label: "ASK ROCKY", mood: "think", ai: "Thinking…", ask: askBox(null, false) });
    try {
      chrome.runtime.sendMessage({ type: "lp-ask-ai", payload: c }, function (res) {
        var ans = res && res.text ? res.text : ("I couldn't reach the AI (" + (res && res.error || "no response") + "). I can still explain any control you rest on or circle.");
        if (res && res.text) { st.history.push({ q: q, a: res.text }); if (st.history.length > 8) st.history.shift(); }
        R().announce("“" + q + "”", { label: "ASK ROCKY", mood: st.on ? "explore" : "happy", ai: ans, ask: askBox("Follow-up…", true), hint: st.on ? "Click me to resume the lab · Alt+E" : "Esc closes · the glow still marks your step" });
      });
    } catch (e) {}
  }

  // ---- watchers (active only while exploring) --------------------------------------------
  var trail = [], last = null, dwellFired = false, timer = null;
  function onMove(e) {
    if (!st.on) return;
    var now = performance.now();
    if (e.buttons) { trail.length = 0; last = null; return; }              // dragging is not a gesture
    if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) > 8) dwellFired = false;
    last = { x: e.clientX, y: e.clientY, t: now };
    if (!trail.length || Math.hypot(e.clientX - trail[trail.length - 1].x, e.clientY - trail[trail.length - 1].y) >= 4) trail.push(last);
    while (trail.length && now - trail[0].t > 1600) trail.shift();
    var c = detectCircle(trail);
    if (c) { trail.length = 0; dwellFired = true; var d = targetAt(c.cx, c.cy); if (d && d.el !== st.lastEl) explain(d, "circle"); else if (d) explain(d, "circle"); }
  }
  function tick() {
    if (!st.on || !last || dwellFired) return;
    if (performance.now() - last.t < 900) return;
    dwellFired = true;
    var d = targetAt(last.x, last.y);
    if (d && d.el !== st.lastEl) explain(d, "dwell");
  }
  function onClickCapture(e) {
    if (!st.on || !KB() || !R()) return;
    if (e.target && e.target.closest && e.target.closest("[data-labpilot='1'],#labpilot-controls,#labpilot-rocky")) return;
    var desc = KB().describe(e.target);
    var d = KB().danger(desc);
    if (d) {
      if (st.armedEl === desc.el && Date.now() < st.armedUntil) { st.armedEl = null; st.armedUntil = 0; return; }   // deliberate second click → allowed
      e.preventDefault(); e.stopImmediatePropagation();
      st.armedEl = desc.el; st.armedUntil = Date.now() + 8000; st.lastEl = desc.el;
      R().explain(desc.el, "Hold on — “" + d.label + "” would do something you can't undo: " + d.why + ". The lab still needs it. If you really mean it, click it again within 8 seconds and I'll let it through.",
        { label: "CAREFUL", mood: "concerned", hint: "Click me to resume the lab · Alt+E" });
      return;
    }
    // a known control: short comment after the page reacts (never blocks)
    var entry = KB().lookup(desc);
    if (entry && desc.el !== st.lastEl) { var dd = desc; setTimeout(function () { if (st.on) explain(dd, "click"); }, 450); }
  }

  // ---- start / stop -------------------------------------------------------------------------
  function start(silent) {
    if (st.on) return; st.on = true; trail.length = 0; last = null; dwellFired = false; st.lastEl = null;
    try { chrome.storage.local.set({ lpExplore: true }); } catch (e) {}
    if (!timer) timer = setInterval(tick, 200);
    if (R()) {
      R().explore(true);
      R().announce("Explore mode — I'm watching, not guiding. Rest your mouse on anything, or draw a little circle around it, and I'll tell you what it is and what it does. I'll stop you before anything destructive. Click me when you want to resume the lab.",
        { label: "EXPLORING", mood: "explore", hint: "Click me to resume the lab · Alt+E", ask: st.ai ? askBox() : null });
    }
    closeMenu();
  }
  function stop(silent) {
    if (!st.on) return; st.on = false; closeMenu();
    try { chrome.storage.local.set({ lpExplore: false }); } catch (e) {}
    if (R()) { R().explore(false); R().announce("Back to the lab — picking up where we left off.", { label: "RESUMING", mood: "happy", hint: "" }); }
    // nudge content.js (MutationObserver) so the step glow returns on the next frame
    try { var s = document.createElement("span"); s.setAttribute("data-lp-nudge", "1"); s.style.display = "none"; document.body.appendChild(s); setTimeout(function () { s.remove(); }, 30); } catch (e) {}
  }
  function toggle() { st.on ? stop() : start(); }

  // ---- Rocky click → RADIAL MENU (his options fan out around him) ----------------------------
  var RING_R = 152, BTN = 52;
  function radialLayout(cx, cy, n, r, vw, vh, size) {
    // PURE: n buttons on a circle of radius r around Rocky. If the whole circle fits on screen the
    // items go evenly all the way round (first at the top, clockwise). Near an edge the ring STAYS
    // CENTRED ON ROCKY and the items are spread along the largest arc that still fits (so he never
    // ends up off-centre or overlapped). Only if no usable arc exists is the ring shifted instead.
    var half = size / 2 + 6, i, k;
    function fits(a) { var x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); return x - half >= 8 && x + half <= vw - 8 && y - half >= 8 && y + half + 22 <= vh - 8; }
    var N = 120, step = 2 * Math.PI / N, okArr = [];
    for (i = 0; i < N; i++) okArr.push(fits(-Math.PI / 2 + i * step));
    var items = [];
    if (okArr.every(Boolean)) {
      for (i = 0; i < n; i++) { var a0 = -Math.PI / 2 + i * 2 * Math.PI / n; items.push({ x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0), a: a0 }); }
      return { items: items, cx: cx, cy: cy, r: r, arc: false, shifted: false };
    }
    // near an edge: try the base radius, then progressively wider rings, and use the largest
    // contiguous arc of angles that fits; accept the first radius whose arc has room for all buttons
    var need = n * size * 1.02, scales = [1, 1.2, 1.45, 1.75, 2.0, 2.4], si;
    for (si = 0; si < scales.length; si++) {
      var rr = r * scales[si], ok2 = [];
      for (i = 0; i < N; i++) { var ang = -Math.PI / 2 + i * step, x = cx + rr * Math.cos(ang), y = cy + rr * Math.sin(ang); ok2.push(x - half >= 8 && x + half <= vw - 8 && y - half >= 8 && y + half + 22 <= vh - 8); }
      var best = { start: 0, len: 0 }, startIdx = ok2.indexOf(false), run = 0, runStart = 0;
      if (startIdx < 0) { best = { start: 0, len: N }; }
      else for (k = 0; k < N; k++) { var idx = (startIdx + k) % N; if (ok2[idx]) { if (!run) runStart = idx; run++; if (run > best.len) best = { start: runStart, len: run }; } else run = 0; }
      var pad = step * 1.5, arcLen = best.len * step - 2 * pad;
      if (arcLen * rr >= need) {
        var arcStart = -Math.PI / 2 + best.start * step + pad;
        for (i = 0; i < n; i++) { var a1 = arcStart + (n === 1 ? arcLen / 2 : i * arcLen / (n - 1)); items.push({ x: cx + rr * Math.cos(a1), y: cy + rr * Math.sin(a1), a: a1 }); }
        return { items: items, cx: cx, cy: cy, r: rr, arc: true, shifted: false };
      }
    }
    // fallback: full circle shifted into the viewport (tiny windows)
    for (i = 0; i < n; i++) { var a2 = -Math.PI / 2 + i * 2 * Math.PI / n; items.push({ x: cx + r * Math.cos(a2), y: cy + r * Math.sin(a2), a: a2 }); }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (i = 0; i < n; i++) { minX = Math.min(minX, items[i].x - half); maxX = Math.max(maxX, items[i].x + half); minY = Math.min(minY, items[i].y - half); maxY = Math.max(maxY, items[i].y + half + 22); }
    var dx = 0, dy = 0;
    if (minX < 8) dx = 8 - minX; else if (maxX > vw - 8) dx = vw - 8 - maxX;
    if (minY < 8) dy = 8 - minY; else if (maxY > vh - 8) dy = vh - 8 - maxY;
    for (i = 0; i < n; i++) { items[i].x += dx; items[i].y += dy; }
    return { items: items, cx: cx + dx, cy: cy + dy, r: r, arc: false, shifted: !!(dx || dy) };
  }
  function menuItems() {
    var C = window.__lpControls || {};
    var learnOn = R() && R().learnOn !== false;
    return [
      { icon: "💬", label: "Ask", title: "Ask Rocky anything about the lab · Alt+A", on: function () { openAsk(); } },
      { icon: "›",  label: "Next", title: "Next step · Alt+N", on: function () { C.next && C.next(); }, big: true },
      { icon: "🎉", label: "Finish", title: "Celebrate the finish · Alt+C", on: function () { C.celebrate && C.celebrate(); } },
      { icon: "✕",  label: "Hide", title: "Hide Rocky · Alt+H (he returns on the next step)", on: function () { try { window.LabPilotOverlay && window.LabPilotOverlay.hide(); } catch (e) {} R().hide(); } },
      { icon: "↻",  label: "Restart", title: "Restart the walkthrough from step 1", on: function () { C.restart && C.restart(); } },
      { icon: "📘", label: learnOn ? "Learn: on" : "Learn: off", title: "WHY / WHAT panel under each step · Alt+L", on: function () { R().toggleLearn && R().toggleLearn(); } },
      st.on ? { icon: "▶", label: "Resume", title: "Resume guiding — back to the current step · Alt+E", on: function () { stop(); }, accent: true }
            : { icon: "🧭", label: "Explore", title: "Let me explore — pause the lab; rest on or circle anything and Rocky explains it · Alt+E", on: function () { start(); }, accent: true },
      { icon: "‹",  label: "Back", title: "Previous step · Alt+P", on: function () { C.back && C.back(); }, big: true }
    ];
  }
  function closeMenu() {
    var m = st.menu; if (!m) return; st.menu = null;
    try { R() && R().dimBubble && R().dimBubble(false); R() && R().react && R().react(false); } catch (e) {}
    // reverse animation: everything collapses back into Rocky, then the layer is removed
    var cx = +m.getAttribute("data-cx"), cy = +m.getAttribute("data-cy");
    var kids = m.querySelectorAll("[data-ring-item]");
    for (var i = 0; i < kids.length; i++) { kids[i].style.transitionDelay = (kids.length - 1 - i) * 22 + "ms"; kids[i].style.left = (cx - BTN / 2) + "px"; kids[i].style.top = (cy - BTN / 2) + "px"; kids[i].style.transform = "scale(.2)"; kids[i].style.opacity = "0"; }
    var ring = m.querySelector("[data-ring]"); if (ring) { ring.style.transform = "scale(0)"; ring.style.opacity = "0"; }
    setTimeout(function () { m.remove(); }, 420);
  }
  function openMenu() {
    closeMenu(); if (!R()) return;
    var rk = R().rect ? R().rect() : { left: innerWidth - 200, top: innerHeight - 260, width: 150, height: 172 };
    var cx0 = rk.left + rk.width / 2, cy0 = rk.top + rk.height * 0.55;          // Rocky's body centre
    var items = menuItems();
    var lay = radialLayout(cx0, cy0, items.length, RING_R, innerWidth, innerHeight, BTN);
    var m = document.createElement("div"); m.id = "labpilot-rocky-menu"; m.setAttribute("data-labpilot", "1");
    m.setAttribute("data-cx", lay.cx); m.setAttribute("data-cy", lay.cy);
    m.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:'Segoe UI',system-ui,sans-serif";
    var ring = document.createElement("div"); ring.setAttribute("data-ring", "1");
    ring.style.cssText = "position:fixed;left:" + (lay.cx - RING_R) + "px;top:" + (lay.cy - RING_R) + "px;width:" + (2 * RING_R) + "px;height:" + (2 * RING_R) + "px;border-radius:50%;border:1.5px dashed rgba(255,207,90,.6);box-shadow:0 0 60px rgba(255,207,90,.18) inset,0 0 24px rgba(255,207,90,.25);transform:scale(0);opacity:0;transition:transform .45s cubic-bezier(.2,.8,.2,1.1),opacity .3s";
    if (!lay.arc && !lay.shifted) m.appendChild(ring);
    items.forEach(function (it, i) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-labpilot", "1"); b.setAttribute("data-ring-item", "1");
      b.setAttribute("aria-label", it.title); b.title = it.title;
      var bg = it.accent ? "linear-gradient(135deg,#6d7cff,#8b5cf6)" : "#0d1426f5";
      b.style.cssText = "position:fixed;width:" + BTN + "px;height:" + BTN + "px;border-radius:50%;border:1.5px solid " + (it.accent ? "rgba(255,255,255,.35)" : "rgba(140,160,255,.45)") + ";background:" + bg + ";color:#fff;cursor:pointer;pointer-events:auto;" +
        "display:flex;align-items:center;justify-content:center;font:" + (it.big ? "800 28px/1" : "600 20px/1") + " 'Segoe UI',system-ui,sans-serif;box-shadow:0 10px 26px rgba(0,0,0,.45);" +
        "left:" + (lay.cx - BTN / 2) + "px;top:" + (lay.cy - BTN / 2) + "px;transform:scale(.2);opacity:0;" +
        "transition:left .42s cubic-bezier(.2,.8,.2,1.18),top .42s cubic-bezier(.2,.8,.2,1.18),transform .42s cubic-bezier(.2,.8,.2,1.18),opacity .25s,border-color .15s;transition-delay:" + (i * 38) + "ms";
      var ic = document.createElement("span"); ic.textContent = it.icon; ic.style.cssText = "pointer-events:none"; b.appendChild(ic);
      var lb = document.createElement("span"); lb.textContent = it.label;
      lb.style.cssText = "position:absolute;top:" + (BTN + 4) + "px;left:50%;transform:translateX(-50%);white-space:nowrap;font:700 11px 'Segoe UI',system-ui,sans-serif;color:#eef2ff;letter-spacing:.3px;text-shadow:0 1px 3px #000,0 0 8px #000;pointer-events:none";
      b.appendChild(lb);
      b.addEventListener("mouseenter", function () { b.style.borderColor = "#ffcf5a"; b.style.transform = "scale(1.14)"; b.style.transitionDelay = "0ms"; });
      b.addEventListener("mouseleave", function () { b.style.borderColor = it.accent ? "rgba(255,255,255,.35)" : "rgba(140,160,255,.45)"; b.style.transform = "scale(1)"; });
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); closeMenu(); setTimeout(function () { try { it.on(); } catch (x) {} }, 40); });
      m.appendChild(b);
      var pos = lay.items[i];
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        b.style.left = (pos.x - BTN / 2) + "px"; b.style.top = (pos.y - BTN / 2) + "px"; b.style.transform = "scale(1)"; b.style.opacity = "1";
        ring.style.transform = "scale(1)"; ring.style.opacity = "1";
      }); });
    });
    document.body.appendChild(m);
    st.menu = m;
    try { R().dimBubble && R().dimBubble(true); R().react && R().react(true); } catch (e) {}
  }
  document.addEventListener("labpilot-rocky-click", function () { st.menu ? closeMenu() : openMenu(); });
  document.addEventListener("mousedown", function (e) { if (st.menu && !st.menu.contains(e.target) && !(e.target.closest && e.target.closest("#labpilot-rocky"))) closeMenu(); }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && st.menu) closeMenu();
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key || "").toLowerCase() === "e") { e.preventDefault(); toggle(); }
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key || "").toLowerCase() === "a") { e.preventDefault(); openAsk(); }
    if (e.key === "Escape" && !st.menu && !st.on && R() && R().dismissAnnounce) { R().dismissAnnounce(); }
  }, true);
  document.addEventListener("mousemove", onMove, { passive: true, capture: true });
  document.addEventListener("click", onClickCapture, true);

  // persisted state
  try { chrome.storage.local.get(["lpExplore"], function (v) { if (v && v.lpExplore) setTimeout(function () { start(true); }, 400); }); } catch (e) {}

  window.__lpExplore = { toggle: toggle, start: start, stop: stop, explain: explain, detectCircle: detectCircle, ask: askRocky, openAsk: openAsk, openMenu: openMenu, closeMenu: closeMenu, radialLayout: radialLayout,
    state: function () { return { on: st.on, armed: !!st.armedEl, ai: !!st.ai, steps: st.steps.length, history: st.history.length }; } };
})();
