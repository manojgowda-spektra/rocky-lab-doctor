/*
 * LabPilot COACH — what to say when Rocky is not certain, which is most of the time.
 *
 * THE PROBLEM THIS EXISTS FOR. Every assistant in this category fails the same way: one signal
 * fails and the whole thing collapses to "I'm not sure" or silence. A human instructor never
 * does that. Asked "where am I?" while genuinely unsure, an instructor does not say "I cannot
 * determine your step" — they say "you're in Insider Risk Management, and the next thing the
 * guide asks for here is Policy indicators", which is less precise and still useful.
 *
 * So Rocky degrades in SPECIFICITY, not in availability. Five levels, each one true, each one
 * useful, each one reachable from strictly less evidence than the level above:
 *
 *   POINT    the target resolved uniquely            "Click Solutions."            + glow
 *   LOCATE   step known, control not on screen       "This step wants Solutions.
 *                                                     It is usually in the left nav."
 *   ORIENT   section known, step uncertain           "You are in Insider Risk Management.
 *                                                     The next unfinished step here is
 *                                                     Settings > Policy indicators."
 *   SITUATE  lab known, position unknown             "You are in the Purview portal. Two of
 *                                                     the five steps are done."
 *   ASK      nothing matches the guide               "I can see this page but cannot match it
 *                                                     to the guide. What are you working on?"
 *
 * WHY THIS ORDER. It follows the evidence, and each level drops exactly one requirement:
 * POINT needs a resolved control; LOCATE needs only a believed step; ORIENT needs only a
 * section from the URL; SITUATE needs only the lab; ASK needs nothing at all. There is no
 * input for which Rocky has nothing to say, which is the whole point.
 *
 * WHY IT IS NOT A MODEL. Every sentence above is assembled from facts Rocky already holds —
 * the guide's own words, the URL, the done ledger. A model asked to fill these gaps would
 * invent the missing certainty rather than admit it, which is the failure this module exists
 * to prevent. The model's place is answering questions the learner asks, not manufacturing
 * confidence Rocky has not earned.
 *
 * HONESTY IS ENFORCED, NOT INTENDED. Each level states only what its evidence supports. A step
 * NUMBER appears only at POINT and LOCATE, where the belief has converged. ORIENT deliberately
 * names the section rather than the step, because the section is what the URL actually proves.
 *
 * window.LabPilotCoach:
 *   say(ctx)     -> { level, text, canGlow, why }   pure, unit tested, never null
 */
(function () {
  "use strict";
  if (window.LabPilotCoach) return;

  // The belief must be this strong before a step NUMBER is stated. Matches pilot.js CONF_SHOW:
  // a number Rocky is unsure of is worse than no number, because the learner acts on it.
  var CONF_NUMBER = 0.80;
  // Below this the belief is too weak to name a step at all, even without a number.
  var CONF_STEP = 0.50;

  function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  function firstLabel(step, hop) {
    var t = (step && step.targets) || [];
    var i = Math.max(0, Math.min(hop || 0, t.length - 1));
    return (t[i] && t[i].label) || "";
  }

  /*
   * Where in the product is the learner? Derived from the URL, which is the one signal that
   * survives when control names fail — a portal can rename every button and the route still
   * says which section you are in. Returned in the portal's own words where they are known,
   * and otherwise as the route segment itself, which is still more use than nothing.
   */
  var SECTION = [
    { re: /insiderriskmgmt|insiderrisk/i, name: "Insider Risk Management" },
    { re: /dlp|dataloss/i, name: "Data Loss Prevention" },
    { re: /informationprotection|sensitivity/i, name: "Information Protection" },
    { re: /datalifecycle|informationgovernance/i, name: "Data Lifecycle Management" },
    { re: /compliancemanager/i, name: "Compliance Manager" },
    { re: /auditlog|\baudit\b/i, name: "Audit" },
    { re: /contentexplorer|activityexplorer/i, name: "Content Explorer" },
  ];

  function sectionOf(url) {
    var u = String(url || "");
    for (var i = 0; i < SECTION.length; i++) if (SECTION[i].re.test(u)) return SECTION[i].name;
    // Unknown section: use the route's own last meaningful segment rather than giving up.
    // Only for something that is actually a URL — otherwise arbitrary text would be echoed
    // back to the learner as though it were a place in the product.
    if (!/^https?:\/\//i.test(u)) return null;
    try {
      var path = u.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "");
      var parts = path.split("/").filter(function (p) { return p && p.length > 2 && !/^\d+$/.test(p); });
      if (parts.length) {
        var seg = parts[parts.length - 1].replace(/[-_]+/g, " ");
        if (/^[a-z0-9 ]{3,30}$/i.test(seg)) return seg;
      }
    } catch (e) { /* a malformed URL is simply no section */ }
    return null;
  }

  // Where a control usually hides when it is not on screen. Generic on purpose: a specific
  // claim Rocky cannot verify would be a guess dressed as help.
  function whereItUsuallyIs(label) {
    if (/^(save|cancel|next|back|submit|create|apply|ok)$/i.test(label)) {
      return "It is usually at the bottom or top of the panel you are filling in.";
    }
    if (/settings|indicators|policies|configuration/i.test(label)) {
      return "It is usually in the left navigation, or behind the gear icon.";
    }
    return "It is usually behind a menu, a tab, or a panel that has not been opened yet.";
  }

  /*
   * THE LADDER. Always returns something usable.
   *
   * ctx: {
   *   lab, steps, index, total, confidence, hop, done,
   *   step      the believed step object, if any
   *   verdict   the resolver's last answer for the current target
   *   url, title
   *   surface   non-browser surface for this step, if any
   * }
   */
  function say(ctx) {
    ctx = ctx || {};
    var step = ctx.step || null;
    var conf = typeof ctx.confidence === "number" ? ctx.confidence : 0;
    var verdict = ctx.verdict || null;
    var total = ctx.total || (ctx.steps && ctx.steps.length) || 0;
    var done = ctx.done || 0;
    var section = sectionOf(ctx.url);
    var label = step ? clean(firstLabel(step, ctx.hop)) : "";

    // A step Rocky cannot see is its own answer, and an honest one. Saying which surface it
    // is on is more use than hunting for a control that was never in the browser.
    if (step && ctx.surface && ctx.surface !== "browser") {
      return {
        level: "SURFACE", canGlow: false, why: "surface:" + ctx.surface,
        text: "This step happens in " + ctx.surface + ", which I cannot see from the browser. " +
              (step.text ? "The guide says: " + clean(step.text) : ""),
      };
    }

    // 1. POINT — the control resolved uniquely. The only level that glows.
    if (verdict && verdict.status === "resolved" && step) {
      var num = conf >= CONF_NUMBER && total ? "Step " + (ctx.index + 1) + " of " + total + ". " : "";
      return {
        level: "POINT", canGlow: true, why: "resolved",
        text: num + (step.text ? clean(step.text) : "Click " + label + "."),
      };
    }

    // 2. LOCATE — the step is known, the control is not on screen. Name what to look for and
    //    where it tends to live. No glow: Rocky has not found it and will not pretend to.
    if (step && conf >= CONF_STEP && label) {
      var num2 = conf >= CONF_NUMBER && total ? "Step " + (ctx.index + 1) + " of " + total + ": " : "";
      var amb = verdict && verdict.status === "ambiguous";
      return {
        level: "LOCATE", canGlow: false, why: amb ? "ambiguous" : "absent",
        text: amb
          ? num2 + "I can see more than one “" + label + "” here, so I will not guess. " +
            "Which part of the page are you working in?"
          : num2 + "This step wants “" + label + "”. I cannot see it on this page. " +
            whereItUsuallyIs(label),
      };
    }

    // 3. ORIENT — the belief is too weak to name a step, but the URL says which section the
    //    learner is in. Name the section (which the URL proves) and the next unfinished step
    //    (which the done ledger proves). Deliberately no step number.
    if (section) {
      var next = nextUnfinished(ctx);
      return {
        level: "ORIENT", canGlow: false, why: "section-only",
        text: "You are in " + section + ". " +
              (next ? "The next thing the guide asks for is: " + clean(next) + "."
                    : "I am not certain which step you are on yet."),
      };
    }

    // 4. SITUATE — no section either. The lab and the done ledger are still facts.
    if (total) {
      return {
        level: "SITUATE", canGlow: false, why: "lab-only",
        text: (ctx.lab ? clean(ctx.lab) + ". " : "") +
              done + " of " + total + " steps look done from here. " +
              "I cannot match this page to the guide, so I will stay quiet until it looks familiar.",
      };
    }

    // 5. ASK — nothing matched. Turn it into a question rather than an apology: the learner
    //    knows the answer, and asking is the one move that always makes progress.
    return {
      level: "ASK", canGlow: false, why: "no-guide",
      text: "I can see this page but I have not matched it to a lab guide. What are you trying to do?",
    };
  }

  // The first step the done ledger has not recorded as finished. Uses the guide's own words.
  function nextUnfinished(ctx) {
    var steps = ctx.steps || [];
    var doneMap = ctx.doneMap || {};
    for (var i = 0; i < steps.length; i++) {
      if (!doneMap[steps[i].id]) return steps[i].text || firstLabel(steps[i], 0);
    }
    return null;
  }

  window.LabPilotCoach = {
    say: say,
    _sectionOf: sectionOf,
    _levels: ["POINT", "LOCATE", "ORIENT", "SITUATE", "ASK", "SURFACE"],
  };
})();
