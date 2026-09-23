/*
 * LabPilot manual step control — a safety net so the guide can NEVER hard-stall on a stale
 * or unresolved step, plus operator controls for a clean demo recording. It nudges the
 * persisted step pointer (chrome.storage lpStepIndex); content.js re-evaluates on that change.
 *
 *   Alt + N  (or Alt + Right)  -> skip to the NEXT step
 *   Alt + P  (or Alt + Left)   -> go back one step
 *   Alt + C                    -> fire the celebration finale NOW (confetti + banner + Rocky)
 *   Alt + H                    -> hide / reset the overlay
 *   Alt + L                    -> toggle the LEARN panel (WHY / WHAT) in Rocky's bubble
 *
 * The celebration is operator-triggered (like the skip keys): it does not fabricate lab
 * completion, it just lets you land a recording on the confetti finale on demand. It also
 * fires automatically when the real flow passes its last step.
 */
(function () {
  "use strict";
  function bump(delta) {
    try {
      chrome.storage.local.get(["lpStepIndex"], function (v) {
        var i = Math.max(0, (v.lpStepIndex || 0) + delta);
        chrome.storage.local.set({ lpStepIndex: i });
      });
    } catch (e) { /* storage unavailable */ }
  }
  function celebrate() {
    var msg = "Lab complete — guided end to end by Rocky!";
    try { if (window.LabPilotOverlay && window.LabPilotOverlay.celebrate) { window.LabPilotOverlay.celebrate(msg); return; } } catch (e) {}
    try { if (window.LabPilotRocky && window.LabPilotRocky.celebrate) window.LabPilotRocky.celebrate(msg); } catch (e) {}
  }
  function hide() {
    try { if (window.LabPilotOverlay && window.LabPilotOverlay.hide) window.LabPilotOverlay.hide(); } catch (e) {}
  }
  document.addEventListener("keydown", function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    var k = (e.key || "").toLowerCase();
    if (k === "n" || e.code === "ArrowRight") { e.preventDefault(); bump(1); }
    else if (k === "p" || e.code === "ArrowLeft") { e.preventDefault(); bump(-1); }
    else if (k === "c") { e.preventDefault(); celebrate(); }
    else if (k === "h") { e.preventDefault(); hide(); }
    else if (k === "l") { e.preventDefault(); try { if (window.LabPilotRocky && window.LabPilotRocky.toggleLearn) window.LabPilotRocky.toggleLearn(); } catch (x) {} }
  }, true);
})();
