/*
 * LabPilot MENTOR — the layer that turns evidence into teaching.
 *
 * WHAT THIS IS FOR. Everything below Rocky's surface now knows a great deal: Position knows
 * where the learner is and how sure it is, the Completion Engine knows when the world actually
 * changed, the relay carries both across the cross-origin Azure blade. What the learner GETS
 * from all of that is one sentence: "You are in Microsoft Azure. I am not certain which step
 * you are on yet." Measured live on 24 September. True, traceable, and of no use to anybody.
 *
 * This file closes that gap and adds no new perception. It reads Position, World, the relay and
 * the knowledge base, and assembles answers to the five questions a learner beside an instructor
 * would actually get answered:
 *
 *   1. Where am I?                  place + sayable step         (Position)
 *   2. What did I accomplish?       observed world changes       (the journey, below)
 *   3. Why does it matter?          authored notes, KB, or what it unlocks
 *   4. What should I do next?       the next unfinished step     (the done ledger)
 *   5. What happens if I don't?     the later steps that need it (derived, below)
 *
 * THE RULE THAT SHAPES EVERY FUNCTION HERE. Each answer is either backed by evidence or it is
 * null. Null is not a failure — it is the answer, and the caller must render it as silence or as
 * an admission, never as a guess. A mentor who invents a consequence to sound helpful is worse
 * than one who says nothing, because the learner cannot tell the two apart until it costs them.
 *
 * WHY THE JOURNEY IS ACCUMULATED RATHER THAN QUERIED. Position exposes lastCompletion — the
 * single most recent world change. There is no history anywhere: the relay's buffer has a TTL,
 * the done ledger records THAT a step finished but not what proved it, and recorder.js is off
 * unless armed. So this file keeps its own list, appended on the rising edge of
 * lastCompletion.at, exactly as recovery.js watches for the same edge. It is memory-only and
 * per-tab, which is honest about what it is: what Rocky saw, this session.
 *
 * window.LabPilotMentor:
 *   brief()              the five answers, each { text, evidence, source } or null
 *   journey()            what Rocky has WATCHED the learner accomplish, oldest first
 *   why(step)            why this step matters, or null
 *   consequence(step)    what later work needs it, or null
 *   promptBlock()        the grounding handed to the model — replaces one line with the lot
 *   note()               called on each perception tick; records completions
 *   _deps/_artefacts/_creates   pure, unit tested
 */
(function () {
  "use strict";

  /*
   * TOP FRAME ONLY. With all_frames:true this would otherwise run once per frame — one mentor
   * per frame, each with its own journey, none of them complete. The child frames observe and
   * report; the single narrative lives where the UI lives.
   */
  if (window.LabPilotFrame && !window.LabPilotFrame.ownsUI) return;
  if (window.LabPilotMentor) return;

  var JOURNEY_MAX = 40;

  function POS() { try { return window.LabPilotPosition || null; } catch (e) { return null; } }
  function W() { try { return window.LabPilotWorld || null; } catch (e) { return null; } }
  function KB() { try { return window.LabPilotKB || null; } catch (e) { return null; } }
  function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  // ---- 1. the journey: what Rocky actually watched happen ------------------------------------

  var journey = [];
  var lastAt = 0;
  var lastSig = "";

  /*
   * A world change, said the way a person would say it. The Completion Engine's kinds are
   * precise and unreadable; this is the only place they become English, so there is one
   * translation rather than one per caller.
   */
  function phrase(c) {
    if (!c) return null;
    var k = c.kind;
    if (k === "announce" || k === "announced-success") return clean(c.text).slice(0, 120);
    if (k === "count-grew" || k === "list-grew") {
      return (c.from != null && c.to != null)
        ? "the list went from " + c.from + " to " + c.to
        : "the list got longer";
    }
    if (k === "count-shrank" || k === "list-shrank") {
      return (c.from != null && c.to != null)
        ? "the list went from " + c.from + " to " + c.to
        : "the list got shorter";
    }
    if (k === "empty-state-cleared") return "the empty page filled in";
    return null;
  }

  /*
   * Called on every perception tick. Cheap, and deliberately the only way anything enters the
   * journey — a completion that Position never reported is one Rocky never saw, and it must not
   * appear in a list headed "what you have done".
   */
  function note() {
    var p = POS();
    if (!p) return;
    var s;
    try { s = p.read(); } catch (e) { return; }
    var c = s.lastCompletion;
    if (!c || !c.at || c.at === lastAt) return;

    /*
     * RISING EDGE, AND NOT THE SAME EVENT TWICE. A portal that re-announces the same text gets
     * a new timestamp, which the edge check alone would happily record as a second
     * accomplishment. The signature guards against a learner being congratulated twice for one
     * thing, which reads as Rocky not paying attention.
     */
    var sig = c.kind + "\u2502" + (c.text || "") + "\u2502" + (c.from == null ? "" : c.from) + ">" + (c.to == null ? "" : c.to);
    lastAt = c.at;
    if (sig === lastSig) return;
    lastSig = sig;

    var said = phrase(c);
    if (!said) return;                       // a change Rocky cannot put into words is not news

    journey.push({
      at: c.at,
      kind: c.kind,
      evidence: said,
      // The step the learner was on WHEN it happened — attributed only when Position would let
      // that number be spoken. An accomplishment pinned to the wrong step is worse than one
      // pinned to no step.
      step: s.sayable.stepNumber ? { n: s.sayable.stepNumber, of: s.sayable.total } : null,
      place: s.place.page || s.place.section || null,
      frame: c.frame || null,
    });
    if (journey.length > JOURNEY_MAX) journey.splice(0, journey.length - JOURNEY_MAX);

    // The teaching moment. Only ever reached from here, so Rocky can congratulate a learner on
    // exactly the things he has recorded watching them do, and nothing else.
    speakMoment(journey[journey.length - 1], s);
  }

  /*
   * THE BEST MOMENT IN ANY LAB, AND ROCKY WAS SILENT THROUGH IT.
   *
   * Before this, `lastCompletion` — the one piece of hard, cross-frame, world-change evidence
   * the extension owns — had exactly one consumer: recovery.js, which reads it to decide to shut
   * up. It was never spoken and never put in front of the model. So the single thing that would
   * make Rocky feel like a person watching your screen ("your policy is there, the list went
   * from three to four") was already measured, already crossing the Azure blade boundary, and
   * thrown away every time.
   *
   * A learner who has just made something happen is at their most receptive, and Rocky has the
   * proof in his hand. This is the one new voice worth adding.
   *
   * RESTRAINT, because it is a new voice in a crowded room — the pilot, recovery, progress and
   * the watcher can all speak. It fires only on a NEW observed accomplishment, never on a timer;
   * it stays quiet while the ask box is open, because someone typing a question is the least
   * stuck a learner ever is; and it keeps a gap so a portal that announces three things at once
   * produces one sentence rather than three.
   */
  var SPEAK_GAP_MS = 12000;
  var lastSpokeAt = 0;

  // What Rocky says at that moment. Evidence first, then the one next thing — and never a claim
  // that a STEP finished, because what was observed is that the world changed.
  function momentText(entry, snap) {
    if (!entry) return null;
    var lead = entry.kind === "announce" || entry.kind === "announced-success"
      ? "The portal says: \u201C" + entry.evidence + "\u201D"
      : "That went through \u2014 " + entry.evidence + ".";
    var nxt = snap && snap.next && snap.next.text ? clean(snap.next.text) : "";
    if (nxt) {
      lead += " Next, " + nxt.charAt(0).toLowerCase() + nxt.slice(1);
      /*
       * WHAT THE NEXT STEP IS FOR, in the guide's words — the difference between a tracker that
       * reads the next line and an instructor who says why it comes next. Only when the guide
       * gives a reason; never invented, and kept short so the moment stays a moment.
       */
      try {
        var w = W();
        var steps = (w && w.steps && w.steps()) || [];
        var ns = snap.next.index >= 0 ? steps[snap.next.index] : null;
        var nw = ns ? why(ns, snap.next.index) : null;
        if (nw && nw.text && (nw.source === "guide-purpose" || nw.source === "guide-task") && nw.text.length < 120) {
          lead += " " + nw.text;
        }
      } catch (e) { /* no reason is better than a wrong one */ }
    }
    return lead;
  }

  function speakMoment(entry, snap) {
    var now = entry.at || 0;
    if (now - lastSpokeAt < SPEAK_GAP_MS) return false;
    try {
      // An open ask box outranks anything proactive. Same rule recovery.js follows.
      if (document.querySelector('input[data-labpilot]')) return false;
    } catch (e) { /* no DOM access is not a reason to interrupt */ }
    var R;
    try { R = window.LabPilotRocky; } catch (e) { return false; }
    if (!R || !R.announce) return false;
    var text = momentText(entry, snap);
    if (!text) return false;
    try {
      // No label chip: the sentence carries the state, and no instructor announces their mode
      // before speaking.
      R.announce(text, { label: "", mood: "happy", hint: "" });
    } catch (e) { return false; }
    lastSpokeAt = now;
    return true;
  }

  // ---- 2. the derived dependency graph -------------------------------------------------------

  /*
   * WHAT BREAKS IF YOU SKIP THIS, derived from the guide's own words rather than invented.
   *
   * A step that CREATES a named thing is depended on by any later step that names it. Measured
   * against the four real Zava challenge guides (136 instruction steps): 15 steps get a concrete
   * consequence, 25 dependency edges, and — after the filters below — not one false positive in
   * the extracted names. That is roughly one step in nine. For the other eight Rocky says
   * nothing, which is the correct answer and not a shortcoming.
   *
   * THE THREE FILTERS, each of which was earning its place in the measurement:
   *
   *  - The name must be one the GUIDE AUTHOR marked up (**bold** or `code`). Authors mark up a
   *    proper noun precisely because the learner must reproduce it exactly, which is what makes
   *    it depended upon. A bare capitalised phrase is far too loose.
   *  - It must not be a CLICK TARGET anywhere in the guide. If the guide ever asks you to click
   *    a name, it is a control Microsoft shipped, not something you made. This one filter
   *    removed "Custom", "Custom policy", "Documents", "Full directory" and "Credit Card Number"
   *    in a single stroke — the last of which was otherwise about to tell learners that skipping
   *    the document step broke a step that merely opens a built-in sensitive info type.
   *  - Unless it looks like a FILE. Without this exemption the whole of challenge 1 vanished,
   *    because "upload **C:\...\Zava-Customer-Payments.docx**" parses as a click target and the
   *    documents the learner creates were being discarded as furniture. A file is never a portal
   *    control.
   */
  var CREATES = /\b(create|creates|creating|add|adds|name|names|named|save as|new)\b/i;
  var IS_VALUE = /^[\d\s\-/.]+$/;                       // "4532 0151 1283 0366", "12/2032"
  var FIELD_LABEL = /\bfield label\b|\bthe (non-live )?test value\b|\bvalue\b\s*$/i;
  var LOOKS_LIKE_A_FILE = /[\\/%]|\.[a-z0-9]{2,5}$/i;

  /*
   * A FILENAME NEEDS NO MARK-UP, AND THAT MATTERS MORE THAN IT LOOKS.
   *
   * Everything above keys on ** or ` `, which exist in the guide's markdown SOURCE. guide-reader
   * reads the pane's innerText — RENDERED text — and a lab shell that renders markdown turns
   * **Zava Discovery Documents** into plain "Zava Discovery Documents" with the markers gone.
   * Whether they survive has never been checked against a live CloudLabs guide pane, so the
   * marked-name path above is, honestly, unverified in production.
   *
   * A filename is self-delimiting: "Zava-Customer-Payments.docx" is recognisable with no mark-up
   * at all. It is also the safest artefact class there is — a .docx name never collides with a
   * portal control label, which is the risk everywhere else — and on the real corpus these carry
   * most of the downstream references: on challenge 1, five filename artefacts account for 11 of
   * the page's 12 later references.
   *
   * So this path works either way, and the marked-name path is a bonus when the markers survive.
   */
  var BARE_FILE = /(?:^|[\s"(\u201C])([A-Za-z0-9%][\w.\-]*\.(?:docx|xlsx|pptx|txt|csv|json|md|pdf|zip|ps1|sql|yaml|yml))(?=$|[\s.,;:)"\u201D])/g;
  var BARE_PATH = /((?:[A-Za-z]:\\|%[A-Za-z_]+%\\)[\w.\-\\ ]{3,80}?)(?=$|[\s,;:)"\u201D]|\.\s)/g;

  function bareArtefacts(text) {
    var t = String(text || "");
    if (!CREATES.test(t)) return [];
    var out = [], m;
    var res = [BARE_FILE, BARE_PATH];
    for (var r = 0; r < res.length; r++) {
      var re = res[r];
      re.lastIndex = 0;
      while ((m = re.exec(t))) {
        var name = m[1].replace(/[\\/]+$/, "").trim();
        // The creation verb must still come first, or "upload Zava-X.docx" reads as creating it.
        if (!CREATES.test(t.slice(0, m.index))) continue;
        if (name.length < 6) continue;
        if (out.indexOf(name) < 0) out.push(name);
      }
    }
    return out;
  }

  // Every name this line marks up as something being MADE, before the control filter.
  function creates(text) {
    var t = String(text || "");
    if (!CREATES.test(t)) return [];
    var out = [];
    var re = /\*\*([^*]{3,60})\*\*|`([^`]{3,80})`/g;
    var m;
    while ((m = re.exec(t))) {
      var name = (m[1] || m[2]).trim();
      var before = t.slice(0, m.index);
      var after = t.slice(m.index + m[0].length);
      if (/>\s*$/.test(before.replace(/\s+$/, "")) || /^\s*>/.test(after)) continue;  // breadcrumb
      if (!CREATES.test(before)) continue;                      // the verb must come first
      if (IS_VALUE.test(name)) continue;                        // a test value, not a name
      if (FIELD_LABEL.test(before.slice(-40))) continue;        // "the field label **X**"
      if (name.replace(/^\./, "").length < 8) continue;         // ".docx", "True"
      if (out.indexOf(name) < 0) out.push(name);
    }
    // Filenames and paths, which need no mark-up at all. Deduplicated against the marked names
    // above, because a bolded filename is found by both routes.
    var bare = bareArtefacts(t);
    for (var b = 0; b < bare.length; b++) if (out.indexOf(bare[b]) < 0) out.push(bare[b]);
    return out;
  }

  /*
   * The author's mark-up, which `text` has had stripped out of it. Everything in the derivation
   * below keys on ** and ` `, so reading `text` would find nothing at run time even though it
   * finds plenty in a markdown file — which is exactly how this nearly shipped doing nothing.
   */
  function marked(step) {
    if (!step) return "";
    return String(step.raw || step.text || "");
  }

  function targetsOf(steps) {
    var set = {};
    for (var i = 0; i < steps.length; i++) {
      var tg = (steps[i] && steps[i].targets) || [];
      for (var j = 0; j < tg.length; j++) {
        if (tg[j] && tg[j].label) set[String(tg[j].label).toLowerCase().trim()] = 1;
      }
    }
    return set;
  }

  function artefacts(text, controls) {
    var raw = creates(text);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var n = raw[i];
      if (LOOKS_LIKE_A_FILE.test(n) || !controls[n.toLowerCase().trim()]) out.push(n);
    }
    return out;
  }

  function mentions(text, name) {
    var hay = String(text || "").toLowerCase();
    var needle = String(name || "").toLowerCase();
    if (!needle) return false;
    if (hay.indexOf(needle) >= 0) return true;
    // "Zava-Customer-Payments.docx" inside "C:\Users\...\Zava-Customer-Payments.docx"
    var base = needle.replace(/^.*[\\/]/, "");
    return base.length > 6 && hay.indexOf(base) >= 0;
  }

  /*
   * index -> [{ index, name, text }] for the later steps that need what this one makes.
   * Pure, so it can be measured against a real guide corpus without a browser.
   */
  function deps(steps) {
    steps = steps || [];
    var controls = targetsOf(steps);
    var made = [], out = {};
    var i, j, k;
    for (i = 0; i < steps.length; i++) made.push(artefacts(marked(steps[i]), controls));
    for (i = 0; i < steps.length; i++) {
      if (!made[i].length) continue;
      var found = [];
      for (j = i + 1; j < steps.length; j++) {
        for (k = 0; k < made[i].length; k++) {
          if (mentions(marked(steps[j]), made[i][k])) {
            found.push({ index: j, name: made[i][k], text: clean(steps[j] && steps[j].text) });
            break;
          }
        }
      }
      if (found.length) out[i] = found;
    }
    return out;
  }

  var depCache = null, depSig = "";
  function depsNow() {
    var w = W();
    var steps = (w && w.steps && w.steps()) || [];
    var sig = steps.length + "\u2502" + (steps[0] && steps[0].text || "");
    if (depCache && sig === depSig) return { map: depCache, steps: steps };
    depSig = sig;
    depCache = deps(steps);
    return { map: depCache, steps: steps };
  }

  // ---- 3. why it matters ----------------------------------------------------------------------

  /*
   * Three sources, best first, and null when none of them has anything. The ordering matters:
   * an author who wrote a note about this step knows more than a generic knowledge base, and
   * the knowledge base knows more than an inference from what comes later.
   */
  function why(step, index) {
    if (!step) return null;

    // (a) the guide author's own note, on a captured bundle
    var L = step.learn || null;
    if (L && (L.why || L.what)) {
      return { text: clean([L.why, L.what].filter(Boolean).join(" ")), source: "guide-notes" };
    }

    /*
     * (b) THE PURPOSE THE GUIDE WROTE. "Click Continue with GitHub to sign in to GitHub Copilot"
     * carries its own why; guide-reader now keeps it as `why` ("to sign in to GitHub Copilot").
     * The author's reason, in the author's words, beats anything Rocky could infer.
     */
    if (step.why) {
      return { text: "This step is here " + clean(step.why) + ".", source: "guide-purpose" };
    }

    /*
     * (c) THE TASK IT SITS UNDER. A guide pane reads "Task 2: Create the custom departing-user
     * policy" and then eight steps. Every one of those steps accomplishes that. Saying so is the
     * answer to "what does this accomplish?" that the author already gave.
     */
    if (step.task) {
      return { text: "This is part of " + clean(step.task).replace(/\.$/, "") + ".", source: "guide-task" };
    }

    // (d) Rocky's knowledge base, on the control this step is about
    var tg = (step.targets || [])[0];
    if (tg && tg.label && KB() && KB().lookup) {
      try {
        var e = KB().lookup({ name: tg.label, role: "button" });
        if (e && e.what) {
          return {
            text: clean("\u201C" + tg.label + "\u201D is " + e.what + (e.does ? " " + e.does : "")),
            source: "knowledge-base",
          };
        }
      } catch (x) { /* a KB that throws is a KB with nothing to say */ }
    }

    // (c) what it unlocks — only when later steps genuinely name what this one makes
    var d = depsNow();
    var list = typeof index === "number" ? d.map[index] : null;
    if (list && list.length) {
      var name = list[0].name;
      return {
        text: "This is where " + name + " gets made, and " +
              (list.length === 1 ? "a later step needs it." : list.length + " later steps need it."),
        source: "derived-dependency",
      };
    }
    return null;
  }

  // ---- 4. what happens if you skip it ----------------------------------------------------------

  function consequence(step, index) {
    if (typeof index !== "number" || index < 0) return null;
    var d = depsNow();
    var list = d.map[index];
    if (!list || !list.length) return null;               // no evidence, so no claim
    var first = list[0];
    var pos = POS();
    var numbered = false;
    try { numbered = !!(pos && pos.read().sayable.stepNumber); } catch (e) { numbered = false; }

    /*
     * The later step is identified by its OWN WORDS, and numbered only when Position would let
     * a number be spoken at all. Quoting "step 9" when Rocky is not certain which step the
     * learner is on would smuggle a number in through the back door — the exact leak the
     * upcoming-steps list was already caught doing.
     */
    var who = numbered ? "Step " + (first.index + 1) : "A later step";
    return {
      text: who + " needs " + first.name + ": \u201C" + first.text.slice(0, 110) + "\u201D",
      count: list.length,
      name: first.name,
      source: "derived-dependency",
    };
  }

  // ---- 5. the brief ------------------------------------------------------------------------------

  /*
   * The five answers. Every field is { text, evidence?, source } or null, and null means the
   * caller must not say anything on that point.
   */
  function brief() {
    var p = POS();
    var s = null;
    try { s = p ? p.read() : null; } catch (e) { s = null; }
    if (!s) {
      return { where: null, did: null, why: null, next: null, ifNot: null, ready: false };
    }
    var w = W();
    var steps = (w && w.steps && w.steps()) || [];

    // 1. WHERE
    var where = null;
    var placeName = s.place.page || s.place.section || null;
    if (placeName || s.sayable.stepNumber) {
      var bits = [];
      if (placeName) bits.push("You are on " + placeName + ".");
      if (s.sayable.stepNumber) bits.push("That is step " + s.sayable.stepNumber + " of " + s.sayable.total + ".");
      where = {
        text: bits.join(" "),
        source: s.sayable.stepNumber ? s.sayable.source : s.place.source,
        confidence: s.place.confidence,
      };
    } else {
      // Honest, and it says WHY rather than just failing — a learner can act on "the page has
      // not told me its name" in a way they cannot act on silence.
      where = { text: null, source: "none", why: s.sayable.why };
    }

    // 2. WHAT YOU ACCOMPLISHED
    var did = null;
    if (journey.length) {
      var last = journey[journey.length - 1];
      did = {
        text: "You have got " + journey.length + " thing" + (journey.length === 1 ? "" : "s") +
              " done that I actually watched happen. The last was: " + last.evidence + ".",
        evidence: last.evidence,
        count: journey.length,
        source: "observed",
      };
    }

    // 3 / 4 / 5 hang off the step the learner is ON, or the next unfinished one.
    var idx = s.belief.index >= 0 ? s.belief.index : s.next.index;
    var step = idx >= 0 ? steps[idx] : null;

    var whyNow = step ? why(step, idx) : null;

    var next = null;
    if (s.next.index >= 0 && s.next.text) {
      next = {
        text: clean(s.next.text),
        index: s.next.index,
        source: s.next.source,
      };
    }

    var ifNot = step ? consequence(step, idx) : null;

    return { where: where, did: did, why: whyNow, next: next, ifNot: ifNot, ready: true };
  }

  // ---- 6. the model's grounding -------------------------------------------------------------------

  /*
   * promptBlock REPLACES position.promptLine() in the prompt, and the difference is the whole
   * point of this file. The model used to be told one sentence about position and nothing about
   * what the learner had achieved, why the step exists, or what depends on it — so when a
   * learner asked "what have I done so far?" the model had no choice but to invent an answer or
   * refuse. Both happened.
   *
   * Every line here is prefixed with where it came from, because the system prompt instructs the
   * model to prefer the Context block and to quote it. A line with no provenance is a line the
   * model will paraphrase into a claim.
   */
  /*
   * OBSERVED, INFERRED, UNKNOWN — said on every line, so the model can tell them apart.
   *
   * The system prompt tells the model the Context is observed. Some of it is not: the next step
   * comes from a done-ledger that infers completion from evidence, and a consequence is derived
   * from the guide's wording. A model that cannot see the difference quotes an inference as a
   * fact. So every line names its standing, and the prompt tells the model what each standing
   * permits: quote OBSERVED, hedge INFERRED, never upgrade UNKNOWN.
   */
  function promptBlock() {
    var b = brief();
    var out = [];
    var p = POS();
    var s = null;
    try { s = p ? p.read() : null; } catch (e) { s = null; }

    if (p && p.promptLine) {
      try {
        var placeKind = s && s.place && s.place.source === "aria-current" ? "OBSERVED" : "INFERRED";
        var line = p.promptLine();
        out.push((s && s.sayable && s.sayable.stepNumber ? (s.sayable.source === "script" ? "INFERRED" : "OBSERVED") : (placeKind === "OBSERVED" && s.place.page ? "OBSERVED" : "UNKNOWN")) + " (position): " + line);
      } catch (e) { /* keep going */ }
    }

    if (b.did) {
      var items = journey.slice(-5).map(function (jn) {
        return "\u2022 " + jn.evidence + (jn.place ? " (on " + jn.place + ")" : "");
      });
      out.push("OBSERVED (accomplishments) \u2014 world changes Rocky watched happen, in order:\n" + items.join("\n"));
    } else {
      out.push("UNKNOWN (accomplishments): none observed yet this session. Rocky has not watched the " +
               "page change in a way that proves a step finished. Do NOT tell the learner they have " +
               "completed anything.");
    }

    if (b.why) out.push("INFERRED from the guide (why the current step matters, " + b.why.source + "): " + b.why.text);
    if (b.next) out.push("INFERRED from the done-ledger (next unfinished step, in the guide's own words): " + b.next.text);
    if (b.ifNot) out.push("INFERRED from the guide (what depends on the current step): " + b.ifNot.text);
    else out.push("UNKNOWN (consequence): nothing in the guide names anything this step creates, so do not " +
                  "claim a consequence for skipping it.");
    if (s && s.recovery && s.recovery.failure && s.recovery.failure.text) {
      out.push("OBSERVED (portal failure, verbatim): \u201C" + clean(s.recovery.failure.text).slice(0, 160) + "\u201D");
    }

    return out.join("\n");
  }

  // ---- wiring ---------------------------------------------------------------------------------

  function start() {
    try {
      if (window.LabPilotPerceive && window.LabPilotPerceive.onChange) {
        window.LabPilotPerceive.onChange(note);
      }
    } catch (e) { /* no perception stream: note() can still be driven by a caller */ }
  }

  window.LabPilotMentor = {
    brief: brief,
    journey: function () { return journey.slice(); },
    why: why,
    consequence: consequence,
    promptBlock: promptBlock,
    note: note,
    start: start,
    _deps: deps,                 // pure, unit tested against the real guide corpus
    _artefacts: artefacts,
    _creates: creates,
    _phrase: phrase,
    _momentText: momentText,
    _bare: bareArtefacts,
    _reset: function () { journey = []; lastAt = 0; lastSig = ""; depCache = null; depSig = ""; },
  };

  start();
})();
