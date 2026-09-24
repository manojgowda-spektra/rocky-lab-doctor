/*
 * LabPilot in-page overlay (PLAN-V2 §A). Renders exactly one of three states, and a
 * glow can exist ONLY while pinned to a resolved element (accuracy contract #1):
 *   - guiding:  glow ring around the element + instruction card, repositioned every
 *               frame so it is immune to scroll / resize / zoom / SPA reflow.
 *   - checking: honest pill (no glow) when the element isn't resolvable right now.
 *   - hidden:   nothing.
 * When Rocky (rocky.js) is present he becomes the SINGLE voice: the glow still marks the
 * exact control, but the text card/pill are suppressed and Rocky's bubble narrates instead
 * (no duplicate guidance). The card/pill remain the fallback when Rocky isn't loaded.
 */
window.LabPilotOverlay = (function () {
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


  var host = null, glow = null, card = null, pill = null, rafId = 0, tracked = null;
  var guidedEl = null, guidedText = null; // change-detection so repeated same-target calls don't restart Rocky

  function ensure() {
    if (host) return;
    host = document.createElement("div");
    host.id = "labpilot-overlay-root";
    host.setAttribute("data-labpilot", "1");

    glow = document.createElement("div");
    glow.className = "lp-glow";
    glow.setAttribute("data-labpilot", "1");

    card = document.createElement("div");
    card.className = "lp-card";
    card.setAttribute("data-labpilot", "1");

    pill = document.createElement("div");
    pill.className = "lp-pill";
    pill.setAttribute("data-labpilot", "1");

    host.appendChild(glow);
    host.appendChild(card);
    host.appendChild(pill);
    (document.body || document.documentElement).appendChild(host);
  }

  function stopTracking() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    tracked = null;
  }

  // One synchronous placement pass. Split out of position() so the glow can be placed without
  // waiting for a frame — see the reveal deadline in guide().
  function placeNow() {
    if (!tracked || !tracked.isConnected) return false;
    var r = tracked.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    var pad = 4;
    glow.style.left = (r.left - pad) + "px";
    glow.style.top = (r.top - pad) + "px";
    glow.style.width = (r.width + pad * 2) + "px";
    glow.style.height = (r.height + pad * 2) + "px";
    return true;
  }

  function position() {
    if (!tracked || !tracked.isConnected) { rafId = 0; return; }
    var r = tracked.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { rafId = requestAnimationFrame(position); return; }
    placeNow();

    if (card.style.display !== "none") {
      var vh = window.innerHeight, cardH = card.offsetHeight || 96;
      var below = r.bottom + 8;
      var top = (below + cardH > vh) ? Math.max(8, r.top - cardH - 8) : below;
      var left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - (card.offsetWidth || 320) - 8));
      card.style.left = left + "px";
      card.style.top = top + "px";
    }
    rafId = requestAnimationFrame(position);
  }

  function exploring() { try { return !!(window.LabPilotRocky && window.LabPilotRocky.exploring); } catch (e) { return false; } }
  function suspend() {   // EXPLORE mode: no glow, no step bubble; guidedEl reset so resume restarts the flight
    stopTracking(); tracked = null; guidedEl = null; guidedText = null;
    glow.style.display = "none"; card.style.display = "none"; pill.style.display = "none";
    ghostHide();
  }
  function guide(element, text, meta) {
    ensure();
    if (exploring()) { suspend(); return; }
    var rk = !!window.LabPilotRocky;
    // content.js re-calls guide() continuously for the SAME control; only (re)start Rocky's
    // flight + reveal when the target actually changes, otherwise leave the shown glow/bubble.
    if (rk && element === guidedEl && text === guidedText) {
      tracked = element;
      if (!rafId) rafId = requestAnimationFrame(position);
      return;
    }
    stopTracking();
    tracked = element;
    host.classList.add("lp-active");
    var notice = !!(meta && meta.variant === "notice");
    glow.classList.toggle("lp-notice", notice);
    glow.style.display = "block";
    pill.style.display = "none";
    // With Rocky loaded, HE is the single voice: no text card, just the precise glow.
    if (rk) {
      guidedEl = element; guidedText = text;
      card.style.display = "none";
      glow.style.display = "none"; // hidden while Rocky flies over; revealed on his arrival
      /*
       * A DEADLINE ON THE REVEAL.
       *
       * The glow used to appear ONLY when Rocky's flight completed, and that flight is driven
       * by requestAnimationFrame. rAF is throttled in a background tab and stops entirely in
       * an occluded one, so the arrival callback can be delayed indefinitely — and the glow,
       * which is the whole product, never appears. Measured on the live Purview portal: the
       * control resolved correctly and the glow stayed display:none because rAF had run once.
       *
       * The animation is a flourish; the glow is the point. If the flight has not landed in
       * 1.2 s, show the glow anyway. Rocky catches up when rAF resumes.
       */
      var revealed = false;
      function reveal() {
        if (revealed) return;
        revealed = true;
        // position() is rAF-driven too, so on the fallback path it may never have run and the
        // glow would appear at 0,0 with no size. Place it once, synchronously, before showing.
        placeNow();
        glow.style.display = "block";
        ghostFly(element);          // the pointer follows the glow; it never clicks
      }
      try {
        // On arrival the glow reveals and the ghost cursor glides to it — the pointer only
        // points; it never clicks (see the ghost cursor block below). The 1.2 s deadline is
        // the same reveal, so whichever happens first wins and the second is a no-op.
        window.LabPilotRocky.guide(element, text || "Do this step", meta, reveal);
        setTimeout(reveal, 1200);
      } catch (e) { reveal(); }
      rafId = requestAnimationFrame(position);
      return;
    }
    // Fallback (no Rocky): render the instruction card.
    card.classList.toggle("lp-notice", notice);
    card.style.display = "block";
    card.innerHTML = "";
    if (meta && meta.progress && meta.progress.total) {
      var pr = document.createElement("div"); pr.className = "lp-card-prog";
      var lbl = document.createElement("div"); lbl.className = "lp-card-proglbl";
      lbl.textContent = "LabPilot · Step " + meta.progress.n + " of " + meta.progress.total;
      var bar = document.createElement("div"); bar.className = "lp-card-progbar";
      var fill = document.createElement("div"); fill.className = "lp-card-progfill";
      fill.style.width = Math.round(100 * meta.progress.n / meta.progress.total) + "%";
      bar.appendChild(fill); pr.appendChild(lbl); pr.appendChild(bar); card.appendChild(pr);
    }
    var t = document.createElement("div"); t.className = "lp-card-title"; t.textContent = text || "Do this step";
    card.appendChild(t);
    if (meta && meta.hint) { var hn = document.createElement("div"); hn.className = "lp-card-hint"; hn.textContent = meta.hint; card.appendChild(hn); }
    if (meta && meta.learn) {  // educational layer (authored, verbatim): WHY this step, WHAT the tech is
      var L = meta.learn, keys = [["WHY", L.why], ["WHAT", L.what], ["TIP", L.tip]];
      for (var li = 0; li < keys.length; li++) { if (!keys[li][1]) continue;
        var lr = document.createElement("div"); lr.className = "lp-card-hint"; lr.textContent = keys[li][0] + " \u00b7 " + keys[li][1]; card.appendChild(lr); }
    }
    if (meta && meta.sub) { var s = document.createElement("div"); s.className = "lp-card-sub"; s.textContent = meta.sub; card.appendChild(s); }
    if (meta && meta.copyText) {
      var box = document.createElement("div"); box.className = "lp-card-copy";
      var code = document.createElement("code"); code.className = "lp-card-value"; code.textContent = meta.copyText;
      var btn = document.createElement("button"); btn.className = "lp-card-copybtn"; btn.type = "button"; btn.textContent = "Copy";
      btn.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var v = meta.copyText;
        function ok() { btn.textContent = "Copied ✓"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); }
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(v).then(ok, ok); }
        else { var ta = document.createElement("textarea"); ta.value = v; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) {} ta.remove(); }
      });
      box.appendChild(code); box.appendChild(btn); card.appendChild(box);
    }
    rafId = requestAnimationFrame(position);
  }

  function checking(title, body) {
    ensure();
    if (exploring()) { suspend(); return; }
    stopTracking();
    host.classList.add("lp-active");
    glow.style.display = "none";
    card.style.display = "none";
    ghostHide();
    guidedEl = null; guidedText = null;
    var rk = !!window.LabPilotRocky;
    if (rk) {
      pill.style.display = "none";
      try { window.LabPilotRocky.checking(title); } catch (e) {}
      return;
    }
    pill.style.display = "block";
    pill.innerHTML = "";
    var t = document.createElement("div");
    t.className = "lp-pill-title";
    t.textContent = title || "One sec — finding this step on the page…";
    pill.appendChild(t);
    if (body) { var b = document.createElement("div"); b.className = "lp-pill-body"; b.textContent = body; pill.appendChild(b); }
  }

  function hide() {
    stopTracking();
    if (!host) return;
    host.classList.remove("lp-active");
    ghostHide();
    glow.style.display = "none";
    card.style.display = "none";
    pill.style.display = "none";
    guidedEl = null; guidedText = null;
    if (window.LabPilotRocky) { try { window.LabPilotRocky.hide(); } catch (e) {} }
  }

  // ---- ghost cursor -------------------------------------------------------------------------
  /*
   * When the glow reveals, a pointer glides from where the learner's mouse last was to the
   * centre of the control, pulses once and fades. It is the form factor of an agent that clicks
   * for you, minus the agent: this element never dispatches an event, never calls click() and
   * never focuses anything. It lives inside the overlay root as pointer-events:none, so
   * perception, recovery and Explore all ignore it. Transform and opacity only (compositor
   * work, no layout); prefers-reduced-motion drops the glide and keeps the single pulse; a
   * hidden tab gets nothing, because nobody is looking.
   */
  var ghost = null, ghostTimer = 0, mouse = { x: -1, y: -1, at: 0 }, reduceMotion = false;
  try { reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
  // last known mouse position, sampled at most every 50 ms: a position, not a stream
  document.addEventListener("mousemove", function (e) {
    if (e.timeStamp - mouse.at < 50) return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.at = e.timeStamp;
  }, { passive: true, capture: true });

  function ghostEnsure() {
    if (ghost) return ghost;
    ensure();
    ghost = document.createElement("div");
    ghost.className = "lp-ghost";
    ghost.setAttribute("data-labpilot", "1");
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg"), arrow = document.createElementNS(NS, "path");
    svg.setAttribute("viewBox", "0 0 24 28"); svg.setAttribute("width", "24"); svg.setAttribute("height", "28");
    arrow.setAttribute("d", "M3 2 L3 22 L8.5 17.5 L12 26 L15.5 24.4 L12 16 L19 16 Z");   // tip at (3,2)
    svg.appendChild(arrow); ghost.appendChild(svg);
    ghost.addEventListener("transitionend", function (e) { if (e.propertyName === "transform") ghostPulse(); });
    ghost.addEventListener("animationend", function (e) { if (e.animationName === "lp-ghost-out") ghostHide(); });
    host.appendChild(ghost);
    return ghost;
  }
  function ghostHide() {
    if (ghostTimer) { clearTimeout(ghostTimer); ghostTimer = 0; }
    if (!ghost) return;
    ghost.className = "lp-ghost"; ghost.style.transition = "none"; ghost.style.opacity = "0";
  }
  function ghostPulse() {           // arrival: one ring, then the CSS fade; animationend hides it
    if (ghostTimer) { clearTimeout(ghostTimer); ghostTimer = 0; }
    if (ghost && !ghost.classList.contains("lp-ghost-pulse")) ghost.classList.add("lp-ghost-pulse");
  }
  function ghostFly(el) {
    if (document.hidden) return;
    var r; try { r = el.getBoundingClientRect(); } catch (e) { return; }
    if (!r || r.width < 1 || r.height < 1) return;
    var g = ghostEnsure();
    ghostHide();
    var to = "translate(" + Math.round(r.left + r.width / 2 - 3) + "px, " + Math.round(r.top + r.height / 2 - 2) + "px)";
    var glide = !reduceMotion && mouse.x >= 0;
    g.style.transform = glide ? "translate(" + mouse.x + "px, " + mouse.y + "px)" : to;
    g.style.opacity = "1";
    if (!glide) { ghostPulse(); return; }
    void g.offsetWidth;                                          // commit the start position
    g.style.transition = "transform .7s cubic-bezier(.22,.8,.2,1)";
    g.style.transform = to;
    ghostTimer = setTimeout(ghostPulse, 900);   // one-shot fallback: no transitionend when start == end
  }
  // ---- end ghost cursor -----------------------------------------------------------------------

  window.addEventListener("scroll", function () { if (tracked && !rafId) rafId = requestAnimationFrame(position); }, true);
  window.addEventListener("resize", function () { if (tracked && !rafId) rafId = requestAnimationFrame(position); }, true);

  function celebrate(msg) {
    ensure(); stopTracking();
    host.classList.add("lp-active");
    glow.style.display = "none"; card.style.display = "none"; pill.style.display = "none";
    if (window.LabPilotRocky) { try { window.LabPilotRocky.celebrate(msg); } catch (e) {} }
    var cvs = document.createElement("canvas"); cvs.className = "lp-confetti"; cvs.setAttribute("data-labpilot", "1");
    cvs.width = window.innerWidth; cvs.height = window.innerHeight; host.appendChild(cvs);
    var ctx = cvs.getContext("2d");
    var colors = ["#4c8dff", "#7B5CFF", "#2FD27E", "#FFC24B", "#FF6B9A"];
    var P = [];
    for (var i = 0; i < 180; i++) P.push({ x: Math.random() * cvs.width, y: -20 - Math.random() * cvs.height,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 10, vy: 2 + Math.random() * 4.5, vx: -2 + Math.random() * 4,
      rot: Math.random() * 6.28, vr: -0.2 + Math.random() * 0.4, c: colors[i % colors.length] });
    var ban = document.createElement("div"); ban.className = "lp-celebrate"; ban.setAttribute("data-labpilot", "1");
    ban.innerHTML = '<div class="lp-celebrate-emoji">🎉</div><div class="lp-celebrate-title">' +
      (msg || "Lab complete!") + '</div><div class="lp-celebrate-sub">You finished the guided walkthrough with LabPilot.</div>';
    host.appendChild(ban);
    var start = Date.now();
    (function frame() {
      var t = Date.now() - start;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      for (var i = 0; i < P.length; i++) { var p = P[i]; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y > cvs.height + 20) { p.y = -20; p.x = Math.random() * cvs.width; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
      if (t < 5200) requestAnimationFrame(frame); else if (cvs.parentNode) cvs.remove();
    })();
    setTimeout(function () { if (ban && ban.parentNode) ban.remove(); }, 6500);
  }

  function refresh() { guidedEl = null; guidedText = null; }   // next guide() call re-flies Rocky and re-says the step
  return { guide: guide, checking: checking, hide: hide, celebrate: celebrate, refresh: refresh, get tracked() { return tracked; },
    _ghost: { fly: ghostFly, hide: ghostHide, el: function () { return ghost; }, mouse: mouse } };   // unit-tested
})();
