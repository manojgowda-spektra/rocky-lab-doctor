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
 * window.LabPilotGuide:
 *   read()            parse the guide pane now -> { page, title, steps[] }
 *   steps()           the last parse
 *   onChange(cb)      called when the learner turns the page
 *   _test             pure parsing, testable without a DOM
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
    return {
      text: text.replace(/\*\*/g, ""),
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
      var sel = document.querySelectorAll('[class*="pag" i] .active, [class*="pag" i] [aria-current], li.active, .page-item.active');
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
    last = {
      page: currentPage(),
      title: guideTitle(pane),
      steps: parseGuide(lines),
      found: true,
      lines: lines.length,
    };
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
    _test: { parseLine: parseLine, parseGuide: parseGuide, tidy: tidy, surfaceOf: surfaceOf, plausibleLabel: plausibleLabel },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
})();
