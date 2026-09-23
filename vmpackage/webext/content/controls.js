/*
 * LabPilot step controls — the ACTIONS behind Rocky's radial menu (explore.js draws the ring).
 * There is deliberately NO control bar any more: Rocky himself is the only UI. Click him and
 * the options fan out around him:  ‹ Back · Next › · 🎉 Finish · ↻ Restart · 📘 Learn ·
 * 🧭 Explore/▶ Resume · 💬 Ask · ✕ Hide.   Keyboard (skip.js): Alt+P/N/C/H/L/E/A.
 *
 * This file owns: moving the persisted step pointer (chrome.storage lpStepIndex; content.js
 * re-evaluates on change), the bulletproof celebration (own confetti + banner, so the finale can
 * never fail to appear), the AUTO-FINALE when the pointer passes the last step, and the
 * AUTO-ON-LAST-CLICK trigger. The glow itself still appears ONLY on a uniquely resolved control.
 */
(function () {
  "use strict";
  if (window.__lpControls) return;

  // Next / Back. The learner has just clicked a menu item and is waiting for the step to
  // move, so a failure here must NOT be silent: an empty catch made both buttons do nothing
  // at all, with no message, which is indistinguishable from Rocky being broken. It also
  // defeated the menu's own "I BROKE" reporter, which only ever sees what is thrown at it.
  function setIndex(delta) {
    try {
      chrome.storage.local.get(["lpStepIndex"], function (v) {
        var err = chrome.runtime.lastError;
        if (err) { console.error("[Rocky] could not read the step pointer:", err.message); return; }
        var i = Math.max(0, ((v && v.lpStepIndex) || 0) + delta);
        chrome.storage.local.set({ lpStepIndex: i }, function () {
          var e2 = chrome.runtime.lastError;
          if (e2) console.error("[Rocky] could not move to step " + i + ":", e2.message);
        });
      });
    } catch (e) {
      console.error("[Rocky] step controls failed:", e);
      throw e;    // let the menu's own error reporter see it, rather than swallowing it here
    }
  }
  function restart() {
    try { chrome.storage.local.set({ lpStepIndex: 0 }, function () { setTimeout(function () { location.reload(); }, 60); }); }
    catch (e) { location.reload(); }
  }

  // ---- bulletproof celebration (own confetti + banner; also nudges Rocky green) ----
  var celebrating = false;
  function selfConfetti(msg) {
    var c = document.createElement("canvas"); c.setAttribute("data-labpilot", "1");
    c.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none";
    c.width = window.innerWidth; c.height = window.innerHeight;
    (document.body || document.documentElement).appendChild(c);
    var g = c.getContext("2d"); if (!g) { c.remove(); }
    var cols = ["#ffcf5a", "#ffdd7a", "#5ef0a0", "#7df9ff", "#6d7cff", "#ff8fce", "#fff"];
    var P = [], ox = c.width / 2, oy = c.height * 0.42;
    for (var i = 0; i < 320; i++) P.push({ x: ox + (Math.random() - 0.5) * 120, y: oy,
      w: 7 + Math.random() * 7, h: 9 + Math.random() * 12, vx: (Math.random() - 0.5) * 17,
      vy: -9 - Math.random() * 12, g: 0.24 + Math.random() * 0.22, rot: Math.random() * 6.28,
      vr: -0.35 + Math.random() * 0.7, c: cols[i % cols.length] });
    var ban = document.createElement("div"); ban.setAttribute("data-labpilot", "1");
    ban.style.cssText = "position:fixed;left:50%;top:34%;transform:translate(-50%,-50%);z-index:2147483647;" +
      "text-align:center;pointer-events:none;background:rgba(13,20,38,.94);border:1px solid rgba(255,207,90,.6);" +
      "border-radius:18px;padding:22px 34px;box-shadow:0 18px 50px rgba(0,0,0,.55);color:#fff;font-family:'Segoe UI',system-ui,sans-serif";
    ban.innerHTML = '<div style="font-size:46px;line-height:1">🎉</div>' +
      '<div style="font-size:24px;font-weight:800;margin-top:8px">' + (msg || "Lab complete!") + '</div>' +
      '<div style="font-size:14px;opacity:.82;margin-top:6px;font-weight:400">Guided end to end by Rocky.</div>';
    (document.body || document.documentElement).appendChild(ban);
    var t0 = Date.now();
    if (g) (function f() { var el = Date.now() - t0; g.clearRect(0, 0, c.width, c.height);
      for (var i = 0; i < P.length; i++) { var p = P[i]; p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); }
      if (el < 5200) requestAnimationFrame(f); else c.remove();
    })();
    setTimeout(function () { if (ban.parentNode) ban.remove(); }, 6000);
  }
  function celebrate() {
    if (celebrating) return; celebrating = true; setTimeout(function () { celebrating = false; }, 3000);
    var msg = "Lab complete — guided end to end by Rocky!";
    try { if (window.LabPilotRocky && window.LabPilotRocky.celebrate) window.LabPilotRocky.celebrate(msg); } catch (e) {}
    selfConfetti(msg);
  }
  window.__lpCelebrate = celebrate;

  // AUTO-FINALE: fire once the step pointer reaches the end of the bundle, however it got there.
  var totalSteps = 0, autoFired = false;
  try {
    fetch(chrome.runtime.getURL("bundle/test-bundle.json")).then(function (r) { return r.json(); })
      .then(function (b) { try { (b.labs||[]).forEach(function(l){(l.tasks||[]).forEach(function(t){totalSteps+=(t.steps||[]).length;});}); } catch(e){} });
  } catch (e) {}
  var curIndex = 0;
  function checkDone(idx) { if (!autoFired && totalSteps && idx >= totalSteps) { autoFired = true; celebrate(); } }
  try { chrome.storage.local.get(["lpStepIndex"], function (v) { curIndex = v.lpStepIndex || 0; }); } catch (e) {}
  try {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === "local" && ch.lpStepIndex) { curIndex = ch.lpStepIndex.newValue || 0; checkDone(curIndex); }
    });
  } catch (e) {}

  // AUTO on the LAST CLICK: on the final step, clicking an actionable control (or the glowed
  // target) fires the finale the moment the last click happens.
  function actionable(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (n.getAttribute && n.getAttribute("data-labpilot") === "1") return false; // ignore our own UI
      var tag = (n.tagName || "").toLowerCase();
      if (tag === "button" || tag === "a" || (n.getAttribute && n.getAttribute("role") === "button")) return true;
      if (tag === "input") { var ty = (n.getAttribute("type") || "").toLowerCase(); if (ty === "submit" || ty === "button") return true; }
    }
    return false;
  }
  document.addEventListener("click", function (e) {
    if (autoFired || !totalSteps) return;
    if (window.LabPilotRocky && window.LabPilotRocky.exploring) return;          // exploring: no step logic
    if (curIndex >= totalSteps - 1) {
      var onGlow = false;
      try { onGlow = !!(window.LabPilotOverlay && window.LabPilotOverlay.tracked && e.target &&
             (e.target === window.LabPilotOverlay.tracked ||
              (window.LabPilotOverlay.tracked.contains && window.LabPilotOverlay.tracked.contains(e.target)))); } catch (x) {}
      if (onGlow || actionable(e.target)) { autoFired = true; setTimeout(celebrate, 450); }
    }
  }, true);

  window.__lpControls = { next: function () { setIndex(1); }, back: function () { setIndex(-1); }, restart: restart, celebrate: celebrate };
})();
