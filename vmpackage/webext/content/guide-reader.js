/*
 * LabPilot GUIDE READER — Rocky works out the steps himself, from the guide on screen.
 *
 * WHY THIS EXISTS. Until now Rocky needed a bundle captured by walking each lab once. That
 * is fine for one demo lab and hopeless for a catalogue. CloudLabs Copilot, being inside the
 * platform, reads the guide as data and therefore works on every lab from day one. This
 * closes that gap from the outside: the guide pane is already in the DOM, so read it.
 *
 * WHAT IT DOES NOT CHANGE. It produces TARGETS, not glows. Every target still goes through
 * the anchor engine and its contract — no contradicted attribute, score >= 0.70, beats the
 * runner-up by 0.20 — so a wrong glow remains impossible by construction. The reader can be
 * wrong about what the step wants; it cannot make Rocky point at the wrong thing. If the
 * engine cannot resolve the target uniquely, Rocky says so. That distinction is the whole
 * reason the glow is worth trusting.
 *
 * THE IDIOM IT PARSES. CloudLabs guides are written consistently, and the authors already
 * encode click order:
 *
 *   "Select **File** (1) and then **Open Folder** (2)"
 *   "Click **Auto** (1) and then set the model to **Claude Sonnet 5** (2)"
 *   "Navigate to C:\ path (1), then select the miq-project folder (2) and then Select folder (3)"
 *
 * Those (1)(2)(3) markers are the sub-step order inside one instruction, written by a human
 * who knew the lab. Measured against a real workshop guide, 100% of instruction lines parse
 * and yield usable targets. No model is involved, which keeps it free, instant and private.
 *
 * SURFACES. A guide step is not always a web control. "Click on the Visual Studio Code from
 * the VM desktop" is a desktop action Rocky cannot see, and saying so is the honest answer.
 * Each step is classified, and non-browser steps are announced rather than hunted for.
 *
 * WHAT THE RULES MISS. The idioms above are the ones seen so far; each new lab brings another,
 * and the rules were patched three times in one day for three of them. So the lines the rules
 * read as NOTHING are offered to the model, once per guide page, under the constraints set out
 * at "the model fills what the rules missed" below: its labels are targets for the same
 * contract, never glows, and are kept only if they appear verbatim in their own line.
 *
 * window.LabPilotGuide:
 *   read()            parse the guide pane now -> { page, title, steps[], assisted }
 *   steps()           the last parse
 *   onChange(cb)      called when the learner turns the page, or the model's reading lands
 *   _test             pure parsing and the merge, testable without a DOM
 */
(function () {
  "use strict";
  if (window.LabPilotGuide) return;

  // ---- pure parsing (no DOM; unit tested) ------------------------------------------------

  // The verbs CloudLabs guides actually use to mean "do something to a control".
  var VERB = "(?:Click on|Click|Select|Navigate to|Open|Choose|Enter|Set|Expand|Toggle|Check|Uncheck|Press|Type)";

  // A step that happens somewhere Rocky cannot see. Naming the surface is more useful than
  // silently failing to find a control that was never in the browser.
  var SURFACE = [
    { re: /\b(visual studio code|vs ?code)\b/i, surface: "VS Code", why: "a desktop application" },
    { re: /\bvm desktop\b|\bfrom the vm\b|\bdesktop icon\b/i, surface: "the VM desktop", why: "outside the browser" },
    { re: /\bterminal\b|\bcommand prompt\b|\bpowershell window\b|\bbash\b/i, surface: "a terminal", why: "not a web control" },
    { re: /\bfile (picker|explorer)\b|\bopen folder\b|\bsave as\b/i, surface: "a Windows dialog", why: "drawn by Windows, not the page" },
    { re: /\bnotepad\b|\boutlook (desktop|app)\b/i, surface: "a desktop application", why: "outside the browser" },
  ];

  function surfaceOf(text) {
    for (var i = 0; i < SURFACE.length; i++) {
      if (SURFACE[i].re.test(text)) return SURFACE[i];
    }
    return null;
  }

  // Strip the noise a guide carries that is not part of the control's name.
  function tidy(s) {
    return String(s || "")
      .replace(/\*\*/g, "")               // markdown bold
      .replace(/\s*\(\d\)\s*$/, "")       // a trailing order marker
      .replace(/^(?:the|a|an)\s+/i, "")
      .replace(/\s+/g, " ")
      .replace(/[\s,.;:]+$/, "")
      .trim();
  }

  // Words that describe a thing rather than name it. "the provided GitHub username" is not a
  // label any control carries; "Get Started" is.
  var VAGUE = /^(?:following|below|above|provided|desired|appropriate|corresponding|newly created|required|same|next|previous)\b/i;

  function plausibleLabel(s) {
    if (!s || s.length < 2 || s.length > 48) return false;
    if (VAGUE.test(s)) return false;
    if (/^\d+$/.test(s)) return false;
    return true;
  }

  /*
   * Turn one instruction line into ordered targets.
   *
   * "Select File (1) and then Open Folder (2)" -> [{n:1,label:"File"}, {n:2,label:"Open Folder"}]
   *
   * The (n) markers are authored click order, so when present they are authoritative and we
   * do not have to guess how many actions a sentence contains.
   */
  function parseLine(line) {
    var text = String(line || "").trim();
    if (!text || text.length > 400) return null;

    var surface = surfaceOf(text);
    var targets = [];

    // A guide almost always says WHY you are clicking — "to sign in to GitHub Copilot",
    // "to proceed", "from the lower right corner". That is narration, not part of the
    // control's name, and leaving it in meant a whole class of plain instructions parsed
    // as nothing at all.
    function dropPurpose(str) {
      return str
        .replace(/\s+to\s+(?:sign|proceed|continue|move|open|view|see|complete|enable|start|begin|go)\b.*$/i, "")
        .replace(/\s+(?:from|on|in)\s+the\s+(?:lower right corner|top menu|left navigation|VM desktop)\b.*$/i, "")
        // "Select Save and wait for the success notification" -> "Save". Measured on a live
        // lab: the trailing clause is what the learner does AFTER the click, never part of
        // the control's name, and leaving it in made the target unresolvable.
        .replace(/\s+and\s+(?:wait|remain|confirm|ensure|verify|record|review|repeat|note)\b.*$/i, "")
        .replace(/\s+page\s*$/i, "");
    }

    // Strip a LEADING verb, but only if what remains still looks like a label. "Open Folder",
    // "Import solution" and "Select folder" are control names that begin with a word that is
    // also a verb; removing it blindly left "Folder" and "solution".
    // "Select File" is a menu item called File. "Open Folder" is a button called Open Folder.
    // Both start with a word that is also a verb, and no rule reliably tells them apart from
    // the text alone — so do not try. Return BOTH readings and let the resolver decide: it
    // already scores candidates against the live page and refuses when neither is unique.
    // Guessing here would be exactly the kind of coin-flip the contract exists to prevent.
    function verbReadings(frag) {
      var whole = tidy(frag);
      var out = [];
      var vm = new RegExp("^\\s*" + VERB + "\\s+(?:on\\s+|to\\s+|the\\s+)?(.+)$", "i").exec(frag);
      if (vm) {
        // Verb-stripped FIRST: "Click Auto" almost always means a control named Auto. The
        // whole phrase is kept as the fallback for the minority ("Open Folder"), and the
        // resolver decides which actually exists rather than the parser guessing.
        var rest = tidy(vm[1]);
        if (plausibleLabel(rest)) out.push(rest);
      }
      if (plausibleLabel(whole) && out.indexOf(whole) < 0) out.push(whole);
      return out;
    }

    // Preferred: explicit (1)(2)(3) markers — the author's own click order.
    var marked = /\((\d)\)/.test(text);
    if (marked) {
      var re = new RegExp("([^()]{2,80}?)\\s*\\((\\d)\\)", "g");
      var m;
      while ((m = re.exec(text)) !== null) {
        // take the clause nearest the marker, then offer both verb readings
        var frag = dropPurpose(m[1].split(/,|\band then\b|\bthen\b|\band\b/i).pop());
        var reads = verbReadings(frag);
        if (reads.length) targets.push({ n: Number(m[2]), label: reads[0], alt: reads.slice(1) });
      }
    }

    /*
     * BOLD AS THE TARGET MARKER. Measured against a real CloudLabs lab (Know Your Data, SMB):
     * the (1)(2) idiom parsed 4% of its instructions, because this lab writes compound
     * instructions instead:
     *
     *   "Open **Data loss prevention** > **Settings** > **Endpoint DLP settings**."
     *   "Select **Create or customize advanced DLP rules**, then create a rule named **X**."
     *   "Select **Custom** > **Custom policy**, then enter the policy name `Y`."
     *
     * Every control the learner must click is in **bold**, and the order is left to right.
     * That is an authored signal exactly as reliable as (1)(2), and far more common: the
     * authors bolded the things you click and left everything else plain.
     *
     * Backticked `values` are deliberately NOT treated as targets — they are things to TYPE,
     * not controls to find. Glowing a name the learner has to invent would be a wrong glow.
     */
    if (!targets.length && /\*\*/.test(text)) {
      var bold = text.match(/\*\*([^*]{2,60})\*\*/g) || [];
      for (var b = 0; b < bold.length && b < 6; b++) {
        var lab2 = tidy(bold[b]);
        // Skip a bold run that is plainly prose rather than a control name.
        if (!plausibleLabel(lab2)) continue;
        if (/\s(and|then|the|a|to)\s/i.test(lab2) && lab2.split(/\s+/).length > 6) continue;
        targets.push({ n: b + 1, label: lab2 });
      }
    }

    /*
     * BREADCRUMB PATHS, measured on a LIVE CloudLabs lab (Insider Risk, template 15549).
     * Of 16 instruction lines in the real guide pane, the parser managed ONE. The rest use
     * idioms it had never seen, and none of them carry (1)(2) markers or bold:
     *
     *   "Open Settings > Policy indicators and remain on the Built-in indicators tab."
     *   "In Microsoft Edge, open https://purview.microsoft.com, then open Solutions > ..."
     *   "Select Create policy > Custom policy. Do not select Quick policy."
     *   "In Insider Risk Management, open Policies."
     *
     * Three separate gaps: a `>` path with no bold, a LEADING CLAUSE before the verb, and a
     * trailing sentence after the instruction. All three are trivially parseable and all
     * three were silently producing nothing.
     */
    if (!targets.length) {
      // Drop a leading scene-setting clause: "In Microsoft Edge, open X" -> "open X".
      // Only when a real verb follows, so prose ("In this task, you will...") stays rejected.
      var lead = /^In\s+[^,]{2,40},\s*(.+)$/i.exec(text);
      var body = lead ? lead[1] : text;

      /*
       * A URL is scene-setting, not a target. Measured live on the Purview portal:
       *
       *   "In Microsoft Edge, open https://purview.microsoft.com, then open Solutions >
       *    Insider Risk Management."
       *
       * The parser took "open https://purview..." as the instruction and kept only the last
       * hop, losing "Solutions" — which is the control that actually resolves on the page
       * (score 0.70, a real menuitem), while "Insider Risk Management" is absent until that
       * menu is opened. Rocky therefore had exactly one target and it could never resolve.
       *
       * Drop the navigate-to-a-URL clause and keep what follows: the real click path.
       */
      var afterUrl = /\bhttps?:\/\/\S+[,.]?\s*(?:then\s+|and\s+then\s+|and\s+)?(.+)$/i.exec(body);
      if (afterUrl && afterUrl[1] && afterUrl[1].length > 3) body = afterUrl[1];

      // Keep only the first sentence: "Select Create policy > Custom policy. Do not select
      // Quick policy." — the second sentence is a warning, and treating it as a target would
      // glow the thing the learner was told NOT to click.
      body = body.split(/\.\s+(?=[A-Z])/)[0];

      var pathM = new RegExp("^\\s*" + VERB + "\\s+(?:on\\s+|to\\s+|the\\s+)?(.+)$", "i").exec(body);
      if (pathM && pathM[1].indexOf(">") > 0) {
        var hops = pathM[1].split(">");
        for (var h = 0; h < hops.length && h < 5; h++) {
          // a hop may trail into prose: "Policy indicators and remain on the ... tab"
          var hop = tidy(hops[h].split(/\s+and\s+(?:remain|confirm|ensure|verify)\b/i)[0]);
          if (plausibleLabel(hop)) targets.push({ n: targets.length + 1, label: hop });
        }
      } else if (lead && pathM) {
        // a leading clause but no path: "In Insider Risk Management, open Policies."
        var one2 = tidy(dropPurpose(pathM[1]).replace(/[.]\s*$/, ""));
        if (plausibleLabel(one2)) targets.push({ n: 1, label: one2 });
      }
    }

    // Otherwise: a single instruction, "Click on X" — purpose clause removed first.
    if (!targets.length) {
      var head = dropPurpose(text.replace(/[.]\s*$/, ""));
      var one = new RegExp("^" + VERB + "\\s+(?:on\\s+|to\\s+|the\\s+)?(.{2,48}?)\\s*[.,]?$", "i").exec(head);
      if (one) {
        var lab = tidy(one[1]);
        if (plausibleLabel(lab)) targets.push({ n: 1, label: lab });
      }
    }

    if (!targets.length) return null;
    targets.sort(function (a, b) { return a.n - b.n; });
      /*
       * THE AUTHOR'S MARK-UP IS EVIDENCE, so it is kept alongside the clean text.
       *
       * `text` has ** stripped because that is what a learner should read. But an author bolds
       * or backticks a name precisely because it is a proper noun the learner must reproduce
       * exactly — which is the single best signal for which names are things the learner
       * CREATES, and therefore which later steps depend on them. mentor.js derives "what happens
       * if I skip this" from it.
       *
       * Stripping it here and nowhere keeping it meant that derivation found bold names in a
       * markdown file during development and nothing at all at run time: the feature would have
       * shipped silently doing nothing on every bolded artefact in the corpus.
       */
      return {
      text: text.replace(/\*\*/g, ""),
      raw: text,
      targets: targets,
      surface: surface ? surface.surface : "browser",
      surfaceWhy: surface ? surface.why : null,
    };
  }

  function parseGuide(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var p = parseLine(lines[i]);
      if (p) out.push(p);
    }
    return out;
  }

  // ---- the model fills what the rules missed ------------------------------------------------
  /*
   * WHY THIS EXISTS. parseLine above was patched three times in one day, for three idioms from
   * three labs: (1)(2) markers, **bold**, and "A > B > C" paths behind a leading clause. Every
   * lab writes its instructions differently and that will not stop, so a rule-only reader is a
   * permanent game of whack-a-mole. The rules stay first - free, instant, private, and they
   * still read most lines. The lines they read as NOTHING go to the model, once per guide page,
   * and its reading fills only those gaps.
   *
   * WHAT THE MODEL MAY NOT DO. It never chooses a glow: every label it returns is a TARGET that
   * the anchor engine's 0.70 / 0.20 / no-contradiction contract still adjudicates, exactly as
   * for a rule-parsed label. And it cannot invent a target: a label is kept only if it appears
   * verbatim in its own source line (case- and whitespace-insensitive). That is checked in the
   * service worker, where the reply arrives, and again here, where it is used. The rules win on
   * any overlap: a line they parsed is never asked about and never rewritten.
   *
   * COST AND TIMING. One call per guide page - each line is asked about at most once in this
   * tab, and the worker caches the answer by a hash of the text in chrome.storage.local, so a
   * reload, a second tab or a second learner on the same lab pays nothing. Nothing waits: the
   * rules' steps go to the world model immediately and the model's reading is merged when it
   * lands, announced through onChange like a page turn. No AI configured: nothing happens.
   */
  var assist = { byLine: {}, asked: {}, calls: 0 };
  var ASSIST_MAX_CALLS = 8;        // per page load: a pane that keeps changing must not keep paying
  var ASSIST_MAX_LINES = 60;       // per call

  function lineKey(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim(); }

  // A label the model returned is believed only if the line actually contains it.
  function verbatim(line, label) {
    var l = lineKey(label);
    return l.length >= 2 && l.length <= 48 && lineKey(line).indexOf(l) >= 0;
  }

  // Not every unparsed line is worth a token: a number, a two-word fragment, a bare heading.
  /*
   * A NEGATED INSTRUCTION MUST NEVER REACH THE MODEL.
   *
   * "Do not select Quick policy." names a control the learner is being told to AVOID. The
   * verbatim check cannot save us here — "Quick policy" really is in the line — so a model
   * asked to extract targets from it will hand back the one control that must not be glowed.
   * Pointing at the thing the guide warns against is the worst failure this product has.
   *
   * The deterministic parser already handles this by keeping only the first sentence; the
   * assist path bypassed that, so the same defect came back through a different door.
   * Lines that forbid something are simply not asked about: leaving them unparsed is correct.
   */
  var FORBIDS = /\b(?:do not|don't|never|avoid|without|must not|should not|cannot|can't|no need to|instead of|rather than)\b/i;

  function worthAsking(line) {
    if (line.length < 12 || line.length > 400) return false;
    if (line.split(/\s+/).length < 3) return false;
    if (FORBIDS.test(line)) return false;
    return /[a-z]/i.test(line);
  }

  // The model's reading of one line, shaped exactly like parseLine's result - or null.
  function assisted(line) {
    var a = assist.byLine[lineKey(line)];
    if (!a) return null;
    var targets = [];
    for (var i = 0; i < a.targets.length; i++) {
      // a path the model failed to split is still a path: each hop is its own control
      var hops = String(a.targets[i]).split(">");
      for (var h = 0; h < hops.length && targets.length < 5; h++) {
        var lab = tidy(hops[h]);
        if (verbatim(line, lab) && plausibleLabel(lab)) targets.push({ n: targets.length + 1, label: lab });
      }
    }
    if (!targets.length) return null;
    var surface = surfaceOf(line);            // the rules' surface classification wins where it has one
    return {
      text: line.replace(/\*\*/g, ""),
      raw: line,                      // see parseLine: the author's mark-up is evidence
      targets: targets,
      surface: surface ? surface.surface : (a.surface || "browser"),
      surfaceWhy: surface ? surface.why : null,
      assisted: true,
    };
  }

  /*
   * Every guide line the rules can read becomes a step. Every line they cannot is given the
   * model's reading if it has landed, and otherwise queued for the one question. Pure, so the
   * merge is unit tested without a DOM; read() is the only caller that then asks.
   */
  function parseLines(lines) {
    var steps = [], unparsed = [];
    for (var i = 0; i < lines.length; i++) {
      var p = parseLine(lines[i]) || assisted(lines[i]);       // the rules first; they always win
      if (p) steps.push(p);
      else if (worthAsking(lines[i])) unparsed.push(lines[i]);
    }
    return { steps: steps, unparsed: unparsed };
  }

  // Send the lines nobody has asked about yet, once. Fire-and-forget: silence is the default
  // and nothing on screen waits for this. When the reading lands, re-read the pane and tell the
  // watchers, exactly as if the learner had turned the page.
  function requestAssist(lines) {
    var ask = [];
    for (var i = 0; i < lines.length && ask.length < ASSIST_MAX_LINES; i++) {
      if (!assist.asked[lineKey(lines[i])]) ask.push(lines[i]);
    }
    if (!ask.length || assist.calls >= ASSIST_MAX_CALLS) return;
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return;
    for (var k = 0; k < ask.length; k++) assist.asked[lineKey(ask[k])] = true;
    assist.calls++;
    try {
      chrome.runtime.sendMessage({ type: "lp-parse-guide", payload: { lines: ask } }, function (res) {
        var err = (chrome.runtime && chrome.runtime.lastError) ? chrome.runtime.lastError.message : null;
        if (res && res.skipped) return;                                   // no AI configured: silence
        if (!res || res.error || err) {
          // Traceable, not announced: the rules' steps stand and the learner sees nothing.
          console.warn("[Rocky] guide assist unavailable:", (res && res.error) || err || "no response");
          return;
        }
        var landed = 0;
        var steps = res.steps || [];
        for (var j = 0; j < steps.length; j++) {
          var s = steps[j];
          if (!s || typeof s.line !== "string" || !Array.isArray(s.targets)) continue;
          var key = lineKey(s.line);
          if (!assist.asked[key] || assist.byLine[key]) continue;       // only lines this tab asked about, once
          assist.byLine[key] = { targets: s.targets.map(String), surface: typeof s.surface === "string" ? s.surface : "browser" };
          landed++;
        }
        if (!landed) return;
        var r = read();
        for (var w = 0; w < watchers.length; w++) { try { watchers[w](r); } catch (e) {} }
      });
    } catch (e) { /* no worker to ask: the rules' steps stand */ }
  }

  // ---- reading the page ---------------------------------------------------------------------

  // The guide pane is the largest block of instructional prose that is NOT the portal itself.
  // Rather than hard-code a CloudLabs selector (which would break the moment they restyle),
  // find the container with the most instruction-shaped lines.
  function findGuidePane() {
    var best = null, bestScore = 0;
    var nodes = document.querySelectorAll("div,section,article,main,aside");
    var verbRe = new RegExp("^\\s*" + VERB + "\\b", "i");
    for (var i = 0; i < nodes.length && i < 3000; i++) {
      var el = nodes[i];
      var t = el.innerText || "";
      if (t.length < 200 || t.length > 60000) continue;
      var lines = t.split("\n");
      var hits = 0;
      for (var j = 0; j < lines.length; j++) if (verbRe.test(lines[j])) hits++;
      // prefer density over sheer size: a whole-page match scores worse than the pane
      var score = hits * 1000 - t.length / 100;
      if (hits >= 3 && score > bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  // The page number the learner is on. CloudLabs renders pagination, and reading it means
  // Rocky knows his position without any platform API - the same fact Copilot is handed.
  function currentPage() {
    try {
      // [aria-current] as a bare attribute selector matches aria-current="false" too, which is
      // how an unselected pagination item gets read as the current page. Match the VALUE.
      var sel = document.querySelectorAll('[class*="pag" i] .active, [class*="pag" i] [aria-current]:not([aria-current="false"]), li.active, .page-item.active');
      for (var i = 0; i < sel.length; i++) {
        var n = parseInt((sel[i].innerText || "").trim(), 10);
        if (n > 0) return n;
      }
    } catch (e) {}
    return null;
  }

  function guideTitle(pane) {
    if (!pane) return "";
    var h = pane.querySelector("h1,h2,h3");
    return h ? (h.innerText || "").trim().slice(0, 120) : "";
  }

  var last = null, watchers = [], lastSig = "";

  function read() {
    var pane = findGuidePane();
    if (!pane) { last = { page: currentPage(), title: "", steps: [], found: false }; return last; }
    var lines = (pane.innerText || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var parsed = parseLines(lines);
    var helped = 0;
    for (var i = 0; i < parsed.steps.length; i++) if (parsed.steps[i].assisted) helped++;
    last = {
      page: currentPage(),
      title: guideTitle(pane),
      steps: parsed.steps,
      found: true,
      lines: lines.length,
      assisted: helped,
    };
    // The rules' steps are already in `last`; this asks about the rest and returns at once.
    if (parsed.unparsed.length) requestAssist(parsed.unparsed);
    return last;
  }

  // Turning the page is the signal that the step list has changed. Poll cheaply: the pane
  // text is already in memory and a hash of its head is enough to notice.
  function watch() {
    setInterval(function () {
      try {
        var pane = findGuidePane();
        var sig = (currentPage() || "?") + "|" + ((pane && pane.innerText) || "").slice(0, 200);
        if (sig === lastSig) return;
        lastSig = sig;
        var r = read();
        watchers.forEach(function (cb) { try { cb(r); } catch (e) {} });
      } catch (e) {}
    }, 2000);
  }

  window.LabPilotGuide = {
    read: read,
    steps: function () { return last; },
    onChange: function (cb) { watchers.push(cb); },
    _test: {
      parseLine: parseLine, parseGuide: parseGuide, tidy: tidy, surfaceOf: surfaceOf, plausibleLabel: plausibleLabel,
      parseLines: parseLines, assisted: assisted, verbatim: verbatim, worthAsking: worthAsking, requestAssist: requestAssist, assist: assist,
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
})();
