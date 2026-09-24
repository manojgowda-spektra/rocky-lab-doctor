/*
 * LabPilot LAB CONTEXT — what Rocky knows about the lab he is standing in.
 *
 * Three sources, in descending order of authority, and he never mixes them up:
 *
 *   OBSERVED   the page in front of him: route, title, the control under the cursor.
 *   PROVISIONED  lab.json, written by the CloudLabs bootstrap at deploy time: which ODL,
 *              which deployment, which resource group, which region. This is real data
 *              from the platform, not a guess.
 *   AUTHORED   the step bundle: the objective, every step, the WHY/WHAT/TIP written for it.
 *
 * Anything outside those three he does not know, and says so. He cannot see other learners,
 * the platform's own validation results, or the cloud resources themselves — and an
 * assistant that admits that is worth more than one that improvises around it.
 *
 * The bootstrap writes lab.json to disk, which a content script cannot read. So the
 * bootstrap ALSO writes a copy into the extension folder as a web-accessible resource; if
 * that is missing (the laptop demo), Rocky simply reports "not running inside a lab", which
 * is true and harmless.
 *
 * window.LabPilotLab:
 *   ready(cb)      cb(context) once loaded (or immediately if already)
 *   get()          the context object, or null
 *   summary()      one honest paragraph for grounding an answer
 *   answer(q)      deterministic answers to the common factual questions; null if unsure
 */
(function () {
  "use strict";
  if (window.LabPilotLab) return;

  var ctx = null, loaded = false, waiting = [];

  function done(c) {
    ctx = c; loaded = true;
    waiting.splice(0).forEach(function (cb) { try { cb(ctx); } catch (e) {} });
  }

  // lab.json is written by the CloudLabs bootstrap. Its absence is not an error: it just
  // means Rocky is running outside a provisioned lab (a laptop demo, or a learner who
  // installed the extension themselves).
  try {
    fetch(chrome.runtime.getURL("lab.json"))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { done(j); })
      .catch(function () { done(null); });
  } catch (e) { done(null); }

  function steps() {
    try {
      var w = window.LabPilotWatcher && window.LabPilotWatcher.snapshot();
      return w || null;
    } catch (e) { return null; }
  }

  // One paragraph an LLM can be grounded on, or a human can read. Every sentence is
  // traceable to one of the three sources; nothing here is inferred.
  function summary() {
    var bits = [];
    if (ctx) {
      bits.push('This is CloudLabs lab "' + (ctx.labCode || 'unknown') + '"' +
        (ctx.odlId ? ', ODL ' + ctx.odlId : '') + (ctx.deploymentId ? ', deployment ' + ctx.deploymentId : '') + '.');
      if (ctx.resourceGroup) {
        bits.push('The environment is resource group ' + ctx.resourceGroup +
          (ctx.region ? ' in ' + ctx.region : '') + (ctx.vmName ? ', on VM ' + ctx.vmName : '') + '.');
      }
      if (ctx.learnerUpn) bits.push('Signed in as ' + ctx.learnerUpn + '.');
    } else {
      bits.push('Not running inside a provisioned CloudLabs lab, so I have no lab identity to report.');
    }
    /*
     * THE POSITION SENTENCE IS NOT CONDITIONAL ON THE WATCHER.
     *
     * It used to sit inside `if (steps())` because the number came FROM the watcher snapshot.
     * Position does not need the watcher — on the guide-reader path there is no watcher at all,
     * and that is the path Purview and every parsed lab use. Leaving the guard in place meant
     * the model was told nothing about position on exactly the labs where the belief model is
     * the authority, and a model told nothing invents something.
     */
    /*
     * THE MENTOR BLOCK, NOT ONE SENTENCE.
     *
     * promptLine() collapses to exactly "The learner is on step 3 of 12." whenever the belief is
     * confident — place, progress and next step are assembled only on the UNSURE branch. So the
     * better Rocky's belief got, the thinner the model's context became, and questions the model
     * was being asked to answer ("what have I done so far?") had no evidence behind them at all.
     * A model with no evidence and a direct question invents an answer; that was observed.
     *
     * promptBlock() carries the lot — position, the accomplishments Rocky actually watched
     * happen, why the step matters, what comes next, and what depends on it — and says so
     * explicitly when there is nothing, which is what stops the invention.
     */
    var MEN = window.LabPilotMentor;
    var POS = window.LabPilotPosition;
    if (MEN && MEN.promptBlock) bits.push(MEN.promptBlock());
    else if (POS && POS.promptLine) bits.push(POS.promptLine());

    var s = steps();
    if (s && s.totalSteps) {
      if (s.onStepMs > 60000) bits.push('They have been on this step for ' + Math.round(s.onStepMs / 60000) + ' minute(s).');
      if (s.errorsSeen && s.errorsSeen.length) bits.push('Errors seen on the page so far: ' + s.errorsSeen.join(', ') + '.');
    }
    bits.push('I can only see this page and this lab. I cannot see other learners, the platform\'s validation results, or the cloud resources themselves.');
    // One line per fact. Joined with a space, the first OBSERVED/INFERRED/UNKNOWN mark sat in the
    // middle of a sentence about the lab identity and the model read it as prose.
    return bits.join('\n');
  }

  // The questions learners actually ask, answered from evidence rather than a model. If the
  // data is not there, this returns null and the question goes to the AI (or to an honest
  // "I do not know"). Deterministic answers are instant, free, and cannot hallucinate.
  var Q = [
    { m: /which lab|what lab|what am i (doing|in)|what is this lab/i, a: function () {
        if (!ctx) return null;
        return 'You are in "' + (ctx.labCode || 'this lab') + '"' + (ctx.odlId ? ' (ODL ' + ctx.odlId + ')' : '') + '. ' +
          'I know that because CloudLabs told me when it built this environment.';
      } },
    // "what step" was missing, so that exact question fell through to the CloudLabs docs
    // corpus and came back with AWS onboarding pages. Observed live.
    /*
     * "WHAT HAVE I DONE SO FAR?" ANSWERED FROM WHAT ROCKY WATCHED, OR HONESTLY NOT AT ALL.
     *
     * This question matched nothing here, so it fell through to the CloudLabs documentation
     * corpus, which scored an article about ARM templates at 2.81 against a 1.8 floor and
     * answered under "MY BEST GUESS" before the model was ever called. Reproduced offline. The
     * mentor's journey is the only honest source, and when it is empty the honest answer is that
     * nothing has been seen to finish — said plainly, not guessed around.
     */
    /*
     * "WHY AM I DOING THIS?" The mentor knows the guide's reason for the current step and what
     * later steps depend on it. Until now no typed question reached either; it fell to the docs
     * corpus or the model. With no reason in the guide, Rocky says so and quotes the step.
     */
    { m: /why (am i|do i|should i|would i|is this|does this)|what (is this|does this|is that) (for|do|accomplish|unlock|achieve)|what.*(point|purpose) of/i, a: function () {
        var M = window.LabPilotMentor, Wm = window.LabPilotWorld;
        if (!M || !M.why) return null;
        var s;
        try { s = window.LabPilotPosition.read(); } catch (e) { return null; }
        var idx = s.belief.index >= 0 ? s.belief.index : s.next.index;
        var steps = (Wm && Wm.steps && Wm.steps()) || [];
        var step = idx >= 0 ? steps[idx] : null;
        if (!step) return null;
        var w = M.why(step, idx), c = M.consequence ? M.consequence(step, idx) : null;
        if (!w && !c) {
          return 'The guide does not say why this step is here, and I would rather not invent a reason. ' +
            'What it does say is \u201C' + String(step.text || '').replace(/\.$/, '') + '.\u201D';
        }
        return (w ? w.text : '') + (c ? (w ? ' ' : '') + c.text + '.' : '');
      } },
    { m: /what (have|did) i (done|do|accomplish|complete|finish)|what.*(so far|accomplished|completed)|have i (done|finished|completed) anything|what.*got done/i, a: function () {
        var M = window.LabPilotMentor;
        if (!M || !M.journey) return null;
        var j;
        try { j = M.journey(); } catch (e) { return null; }
        if (!j.length) {
          var pl = (function () { try { var s = window.LabPilotPosition.read(); return s.place.page || s.place.section || null; } catch (e) { return null; } })();
          return 'I have not yet watched the page change in a way that proves a step finished, so I will not ' +
            'claim anything is done.' + (pl ? ' What I can see is that you are on ' + pl + '.' : '');
        }
        var recent = j.slice(-3).reverse();
        var say = function (e) {
          return (e.kind === 'announce' || e.kind === 'announced-success')
            ? 'the portal said \u201C' + e.evidence + '\u201D' : e.evidence;
        };
        var parts = [];
        if (recent[0]) parts.push('Most recently ' + say(recent[0]) + (recent[0].place ? ', on ' + recent[0].place : ''));
        if (recent[1]) parts.push('before that ' + say(recent[1]));
        if (recent[2]) parts.push('and before that ' + say(recent[2]));
        return (j.length === 1 ? 'I have watched the portal change once so far. ' : 'I have watched the portal change ' + j.length + ' times so far. ') +
          parts.join('; ') + '. Those are changes I saw, not steps I ticked off.';
      } },
    { m: /where am i|wh(ich|at) step|how far|progress|how many steps|how much left|what.*doing now/i, a: function () {
        // THE PILOT FIRST. When it is driving, it holds the live belief about which step the
        // learner is on, read from the guide on screen. The watcher's list only exists on a
        // captured bundle, so on any other lab it is empty and this answered nothing.
        try {
          var P = window.LabPilotPilot && window.LabPilotPilot.status();
          if (P && P.on && P.world && P.world.step) {
            var txt = String(P.world.step.text || '').slice(0, 180).replace(/\.$/, '');
            var surf = P.world.step.surface && P.world.step.surface !== 'browser'
              ? ' That one happens in ' + P.world.step.surface + ', which I cannot see from here.' : '';
            if (!txt) return 'The guide is open but I cannot tell which line you are on. What did you last click?' + surf;
            // The number comes from sayableStep() alone - one authority, the same one every other
            // surface uses - and the sentence says how sure Rocky is either way.
            var n2 = sayableStep();
            return (n2
              ? 'You are on step ' + n2.n + ' of ' + n2.total + ', which says \u201C' + txt + '.\u201D'
              : 'You look to be on the step that says \u201C' + txt + '\u201D, though I am not sure enough to give you a number.') + surf;
          }
        } catch (e) { /* fall through to the bundle answer */ }

        /*
         * "3 to go after this one" ASSERTS A POSITION AS FIRMLY AS A STEP NUMBER DOES — it
         * says where you are by saying what is left, and it was computed from the bundle
         * counter. Both halves of this sentence now come from Position or neither does.
         */
        var n1 = sayableStep();
        if (n1) {
          var left = n1.total - n1.n;
          return 'Step ' + n1.n + ' of ' + n1.total + '. ' +
            (left > 0 ? left + ' to go after this one.' : 'This is the last one.');
        }
        var s = steps();
        if (s && s.totalSteps) {
          // A count of FINISHED work is a fact from the ledger and safe to give; a count of
          // what remains is not, because it depends on knowing where the learner is.
          try {
            var P2 = window.LabPilotPosition && window.LabPilotPosition.read();
            if (P2 && P2.completed.count) {
              return P2.completed.count + ' of ' + s.totalSteps + ' steps look done from here, ' +
                'but I am not certain which one you are on right now.';
            }
          } catch (e) { /* fall through */ }
          return 'This lab has ' + s.totalSteps + ' steps. I am not certain which one you are on.';
        }

        /*
         * NEVER null FOR THIS QUESTION.
         *
         * "Where am I" used to return null whenever the pilot had no confident step and there
         * was no captured bundle — so it fell through to the corpus, then to the model, and on
         * a lab with no AI key configured the learner asking the single most basic question
         * got "I cannot answer that yet". That is the failure this whole product sells against,
         * arriving at the exact moment someone is lost.
         *
         * The coach ladder always has something true to say: the section from the URL, the
         * next unfinished step from the done ledger, or failing everything a question back.
         * It is a worse answer than a step number and an infinitely better one than an
         * apology, so it goes here rather than after the model.
         */
        try {
          var c = window.LabPilotPilot && window.LabPilotPilot.coach();
          if (c && c.text) return c.text;
        } catch (e) { /* the ladder is best-effort; the lines below still answer something */ }
        return null;
      } },
    { m: /resource group|which region|what region|where.*deployed|subscription/i, a: function () {
        if (!ctx || !ctx.resourceGroup) return null;
        return 'Resource group ' + ctx.resourceGroup + (ctx.region ? ', region ' + ctx.region : '') +
          (ctx.subscriptionId ? ', subscription ' + ctx.subscriptionId : '') +
          '. That comes from the environment itself, not from me guessing.';
      } },
    { m: /who am i|my (account|login|user)|signed in/i, a: function () {
        if (!ctx || !ctx.learnerUpn) return null;
        return 'You are signed in as ' + ctx.learnerUpn + ' — the lab account CloudLabs created for this session.';
      } },
    { m: /what.*(vm|machine)|which vm/i, a: function () {
        if (!ctx || !ctx.vmName) return null;
        return 'You are on ' + ctx.vmName + (ctx.vmSize ? ' (' + ctx.vmSize + ')' : '') + '.';
      } },
    { m: /how long|how much time|been here/i, a: function () {
        var s = steps(); if (!s) return null;
        var mins = Math.max(1, Math.round(s.sessionMs / 60000)), n2 = sayableStep();
        return 'About ' + mins + (mins === 1 ? ' minute' : ' minutes') + ' so far' +
          (n2 ? ', and you are on step ' + n2.n + ' of ' + n2.total + '.' : '. Which step you are on is not something I can pin down yet.');
      } },
    // Narrow on purpose: "can you see the Save button?" used to land here and be told "no".
    { m: /other learners|everyone else|validation (result|status)|did i pass|my (score|grade|mark)|has (my|the) lab been (validated|checked)/i, a: function () {
        return 'No. What I can see is this page and this lab environment. I cannot see other learners, ' +
          'the platform\'s own validation results, or your cloud resources. If I said otherwise I would be making it up.';
      } },
  ];

  /*
   * The ONLY way a step number leaves this file. Null means do not state one — there is
   * deliberately no second opinion behind it, because every bug in this area came from one.
   */
  function sayableStep() {
    try {
      var P = window.LabPilotPosition;
      if (!P) return null;
      var s = P.read();
      return s.sayable.stepNumber ? { n: s.sayable.stepNumber, total: s.sayable.total } : null;
    } catch (e) { return null; }
  }

  function answer(q) {
    if (!q) return null;
    for (var i = 0; i < Q.length; i++) {
      if (Q[i].m.test(q)) { var a = Q[i].a(); if (a) return a; }
    }
    return null;
  }

  window.LabPilotLab = {
    ready: function (cb) { if (loaded) { try { cb(ctx); } catch (e) {} } else waiting.push(cb); },
    get: function () { return ctx; },
    summary: summary,
    answer: answer,
    _test: { Q: Q },
  };
})();
