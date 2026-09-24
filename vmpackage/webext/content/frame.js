/*
 * LabPilot FRAME — which frame am I, and what am I allowed to do here?
 *
 * WHY THIS EXISTS. Measured on the live Azure portal: the entire working surface of a blade —
 * the command bar (Create, Refresh, Export to CSV, Assign tags) and the grid itself, 4 rows and
 * 12 cells — is rendered inside a CROSS-ORIGIN IFRAME on sandbox-1.reactblade.portal.azure.net.
 * The top frame holds only the shell: portal menu, search, Copilot, notifications, account.
 *
 * So on Azure, Rocky can currently see everything except the thing every lab step is about. Two
 * separate reasons, both in the manifest: content_scripts declared all_frames:false, and not one
 * of the host patterns matches portal.azure.NET — every Azure pattern is .com.
 *
 * Fixing that means running in child frames, and running in child frames means this file has to
 * exist first. There was no top-frame guard anywhere in the extension, so simply turning
 * all_frames on would have mounted a Rocky character, a bubble, a control bar and an overlay
 * root into EVERY frame on the page — including the invisible Office auth iframes — and the
 * learner would have seen several Rockys arguing with each other. That is a worse bug than the
 * one being fixed.
 *
 * THE RULE THIS FILE ESTABLISHES:
 *
 *   isTop  -> the UI lives here, and only here. One Rocky, one overlay, one control bar, one
 *             world model, one source of truth.
 *   child  -> perception lives here. A child frame observes its own document and reports
 *             upward. It draws nothing and decides nothing.
 *
 * WHY window.top === window IS THE TEST, AND WHY IT IS WRAPPED. Reading window.top across an
 * origin boundary throws a SecurityError. A throw therefore MEANS "I am inside a frame owned by
 * someone else", which is exactly the case we must treat as a child — so the catch returns
 * false. Getting this backwards would put the UI in the cross-origin frame and nowhere else.
 */
(function () {
  "use strict";
  if (window.LabPilotFrame) return;

  var isTop;
  try {
    // Same-origin or no frame at all: this comparison is allowed and answers honestly.
    isTop = window.top === window;
  } catch (e) {
    // Cross-origin parent. The throw itself is the answer: we are a guest in someone else's page.
    isTop = false;
  }

  /*
   * A SIZE HEURISTIC WAS TRIED HERE AND DELETED THE SAME HOUR.
   *
   * It read "a frame smaller than roughly 200x200 is plumbing — auth handshakes, token
   * factories — and observing it costs CPU on every mutation for nothing". Reasonable, and
   * wrong: measured immediately afterwards on the live Azure portal, the blade frame holding
   * the command bar and a four-row grid reported dimensions small enough to be excluded, and
   * the rule silently blinded Rocky to the one frame that mattered — the exact bug the frame
   * work exists to fix, reintroduced by the fix.
   *
   * An iframe has no reliable size at script time: it may not have been laid out yet, it can
   * be resized later, and a cross-origin child cannot ask its parent how big it is drawn.
   * Cost is better controlled where it is actually incurred — perception already caps the
   * harvest — and a plumbing frame with no controls costs almost nothing to walk anyway.
   *
   * Every frame observes. Only the top frame draws.
   */
  window.LabPilotFrame = {
    isTop: isTop,
    isChild: !isTop,
    // Draw, decide, speak, glow: top frame only.
    ownsUI: isTop,
    // Observe and report: EVERY frame. See the note above on why size is not a filter.
    observes: true,
    href: (function () { try { return location.href.slice(0, 200); } catch (e) { return ""; } })(),
  };
})();
