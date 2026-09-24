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
    var s = steps();
    if (s && s.totalSteps) {
      bits.push('The learner is on step ' + (s.stepIndex + 1) + ' of ' + s.totalSteps + '.');
      if (s.onStepMs > 60000) bits.push('They have been on this step for ' + Math.round(s.onStepMs / 60000) + ' minute(s).');
      if (s.errorsSeen && s.errorsSeen.length) bits.push('Errors seen on the page so far: ' + s.errorsSeen.join(', ') + '.');
    }
    bits.push('I can only see this page and this lab. I cannot see other learners, the platform\'s validation results, or the cloud resources themselves.');
    return bits.join(' ');
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
    { m: /where am i|wh(ich|at) step|how far|progress|how many steps|how much left|what.*doing now/i, a: function () {
        // THE PILOT FIRST. When it is driving, it holds the live belief about which step the
        // learner is on, read from the guide on screen. The watcher's list only exists on a
        // captured bundle, so on any other lab it is empty and this answered nothing.
        try {
          var P = window.LabPilotPilot && window.LabPilotPilot.status();
          if (P && P.on && P.world && P.world.step) {
            var head = P.progress
              ? 'Step ' + P.progress.n + ' of ' + P.progress.total + '. '
              : '';                                    // not confident enough to claim a number
            var txt = String(P.world.step.text || '').slice(0, 180);
            var surf = P.world.step.surface && P.world.step.surface !== 'browser'
              ? ' That one happens in ' + P.world.step.surface + ', which I cannot see from here.' : '';
            return head + (txt ? 'It says: ' + txt : 'I am tracking the guide but cannot name the step.') + surf;
          }
        } catch (e) { /* fall through to the bundle answer */ }

        var s = steps();
        if (s && s.totalSteps) {
          var left = s.totalSteps - s.stepIndex - 1;
          return 'Step ' + (s.stepIndex + 1) + ' of ' + s.totalSteps + '. ' +
            (left > 0 ? left + ' to go after this one.' : 'This is the last one.');
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
        return 'About ' + Math.max(1, Math.round(s.sessionMs / 60000)) + ' minute(s) so far, and you are on step ' +
          (s.stepIndex + 1) + ' of ' + s.totalSteps + '.';
      } },
    { m: /can you see|do you know about|other learners|everyone else|validation|did i pass/i, a: function () {
        return 'Honestly: no. I can see this page and this lab environment. I cannot see other learners, ' +
          'the platform\'s own validation results, or your cloud resources. If I said otherwise I would be making it up.';
      } },
  ];

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
