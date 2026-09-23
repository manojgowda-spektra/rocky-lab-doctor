/*
 * LabPilot WATCHER — the part of Rocky that pays attention.
 *
 * Everything else in the extension answers "where is the next control?". This answers a
 * harder question: "is this learner alright, and is now the moment to say something?"
 *
 * THE DOCTRINE, which is also why this file is not a pile of if-statements:
 *
 *   1. Evidence before speech. Every intervention names the observation that triggered it.
 *      Rocky says "that was the Model catalog, you want Deployments" because he SAW the
 *      click land on a known control that is not the current step. He never says "you seem
 *      confused" on a hunch. If he cannot name what he saw, he stays quiet.
 *
 *   2. Silence is the default state, and it is informative. A learner who is doing fine
 *      should hear nothing. That is what makes the interruptions worth listening to. The
 *      budget below is deliberately mean: a smooth run produces ZERO unsolicited remarks.
 *
 *   3. Earn the right to interrupt, and lose it on dismissal. Every intervention class has
 *      a cooldown; being dismissed doubles it. Rocky who nags is worse than no Rocky.
 *
 *   4. Mood is a consequence, never a decoration. He is warm because he is usually
 *      succeeding; concerned because something concrete failed; delighted because a real
 *      milestone passed. The mood is chosen by the same evidence that chose the words, so
 *      it can never contradict them.
 *
 * WHAT HE CAN ACTUALLY SEE, stated plainly so nobody oversells it: this page. Clicks,
 * focus, typing, navigation, the DOM, and errors the portal renders. He cannot see other
 * learners, the CloudLabs platform's own validation results, or the cloud. When asked about
 * those he says so.
 *
 * window.LabPilotWatcher:
 *   start(ctx) / stop()      ctx = { steps, stepIndex, lab }
 *   note(event)              content.js reports step changes and resolution outcomes
 *   snapshot()               what he has observed (for Ask Rocky grounding + tests)
 *   _test                    pure decision logic, unit-testable without a DOM
 */
(function () {
  "use strict";
  if (window.LabPilotWatcher) return;

  var R = function () { return window.LabPilotRocky; };
  var KB = function () { return window.LabPilotKB; };

  // ---- the interruption budget -----------------------------------------------------------
  // Tuned so a learner who is doing fine hears NOTHING. These are the numbers that decide
  // whether Rocky is a companion or Clippy, so they live in one visible place.
  var BUDGET = {
    maxPerSession: 8,          // hard ceiling; after this only errors and completion speak
    minGapMs: 12000,           // never two remarks inside 12 s, whatever happened
    stuckMs: 45000,            // silence + no progress before "want a hand?"
    reStuckMs: 90000,          // and again only after this much more
    wrongClickCooldownMs: 20000,
    wanderCooldownMs: 30000,
    errorCooldownMs: 15000,
    dismissMultiplier: 2,      // being dismissed doubles that class's cooldown
    repeatFailThreshold: 3,    // same control clicked N times with no progress
  };

  var st = null;

  function fresh(ctx) {
    return {
      ctx: ctx || {},
      startedAt: Date.now(),
      lastSpokeAt: 0,
      spoken: 0,
      lastActivityAt: Date.now(),
      lastProgressAt: Date.now(),
      stepIndex: (ctx && ctx.stepIndex) || 0,
      stepEnteredAt: Date.now(),
      cooldowns: {},            // class -> { until, dismissals }
      clicks: [],               // { t, name, role, wasTarget }
      repeats: {},              // control name -> count since last progress
      errorsSeen: {},           // signature -> last time
      timer: 0,
      lastUrl: location.href,
      stuckFired: 0,
      history: [],              // what he actually said, for Ask Rocky context
    };
  }

  // ---- pure decision core (no DOM; unit tested) --------------------------------------------
  // Kept pure so the question "would Rocky interrupt here?" can be answered in a test
  // instead of by watching a browser and hoping.
  function allowed(s, cls, now) {
    if (s.spoken >= BUDGET.maxPerSession && cls !== 'error' && cls !== 'complete') {
      return { ok: false, why: 'session budget spent' };
    }
    if (now - s.lastSpokeAt < BUDGET.minGapMs && cls !== 'complete') {
      return { ok: false, why: 'too soon after the last remark' };
    }
    var cd = s.cooldowns[cls];
    if (cd && now < cd.until) return { ok: false, why: cls + ' cooling down' };
    return { ok: true };
  }

  function armCooldown(s, cls, baseMs, now) {
    var cd = s.cooldowns[cls] || { dismissals: 0 };
    var mult = Math.pow(BUDGET.dismissMultiplier, cd.dismissals);
    cd.until = now + baseMs * mult;
    s.cooldowns[cls] = cd;
  }

  // ---- speaking ------------------------------------------------------------------------------
  // One door for everything Rocky volunteers, so the budget cannot be bypassed by accident.
  function speak(cls, text, opts) {
    var now = Date.now();
    var gate = allowed(st, cls, now);
    if (!gate.ok) return false;
    opts = opts || {};
    var r = R();
    if (!r) return false;
    st.lastSpokeAt = now;
    st.spoken++;
    st.history.push({ t: now, cls: cls, text: text });
    if (st.history.length > 12) st.history.shift();
    armCooldown(st, cls, opts.cooldownMs || BUDGET.minGapMs, now);
    try {
      r.announce(text, {
        label: opts.label || 'ROCKY',
        mood: opts.mood || 'neutral',
        hint: opts.hint || '',
      });
    } catch (e) { return false; }
    return true;
  }

  // ---- personality ----------------------------------------------------------------------------
  // Warmth carries information: the register tells the learner how serious this is before
  // they have read a word. Humour appears ONLY in safe states — never while something is
  // failing, because a joke next to a real problem reads as not listening.
  var QUIPS = {
    wrongClick: [
      'Close! But not quite the one.',
      'Bold choice. Wrong button, though.',
      'I admire the confidence.',
    ],
    stuck: [
      'Take your time — I am not going anywhere.',
      'This one catches people out.',
    ],
    celebrate: [
      'Look at that.',
      'Textbook.',
      'You made that look easy.',
    ],
  };
  function quip(kind, chance) {
    var list = QUIPS[kind];
    if (!list || Math.random() > (chance == null ? 0.4 : chance)) return '';
    return list[Math.floor(Math.random() * list.length)] + ' ';
  }

  // ---- observations ------------------------------------------------------------------------------
  function currentStep() {
    var steps = st.ctx.steps || [];
    return steps[st.stepIndex] || null;
  }

  function describe(el) {
    var kb = KB();
    if (kb && kb.describe) { try { return kb.describe(el); } catch (e) {} }
    return { name: (el.innerText || el.getAttribute && el.getAttribute('aria-label') || '').trim().slice(0, 60), role: (el.tagName || '').toLowerCase() };
  }

  // Did this click land on the control the current step is asking for? The glow is the
  // authority: it is the only element Rocky has actually endorsed.
  function clickedTheTarget(el) {
    try {
      var O = window.LabPilotOverlay;
      var t = O && O.tracked;
      if (!t) return null;                 // nothing glowed => cannot judge; stay silent
      return t === el || (t.contains && t.contains(el));
    } catch (e) { return null; }
  }

  function onClick(e) {
    if (!st) return;
    st.lastActivityAt = Date.now();
    var raw = e.target;
    if (!raw || raw.nodeType !== 1) return;
    if (raw.closest && raw.closest('[data-labpilot="1"]')) return;   // our own UI
    if (window.LabPilotRocky && window.LabPilotRocky.exploring) return;

    var el = (raw.closest && raw.closest('a,button,input,summary,label,[role],[tabindex]')) || raw;
    var d = describe(el);
    var onTarget = clickedTheTarget(el);
    st.clicks.push({ t: Date.now(), name: d.name, role: d.role, wasTarget: onTarget === true });
    // Breadcrumb: content scripts run in an isolated world, so a test cannot read our
    // variables. Recording the decision on the DOM makes this path observable without
    // changing what Rocky does.
    try {
      document.documentElement.setAttribute('data-lp-lastclick', JSON.stringify({ name: d.name, role: d.role, onTarget: onTarget }));
    } catch (e) {}
    if (st.clicks.length > 30) st.clicks.shift();

    if (onTarget === true) {                // correct: progress, and reset the patience clock
      st.lastProgressAt = Date.now();
      st.repeats = {};
      st.stuckFired = 0;
      return;
    }
    if (onTarget !== false) return;         // nothing glowed: no basis for a judgement

    // A wrong click on a control Rocky can NAME is the strongest, most useful correction he
    // has. On an unknown control he says nothing: "that's wrong" without "here's what it is"
    // is just scolding.
    var kb = KB();
    var known = kb && kb.lookup ? kb.lookup(d, location.pathname) : null;
    var step = currentStep();
    var want = step && (step.text || '');

    var n = (st.repeats[d.name] = (st.repeats[d.name] || 0) + 1);
    if (n >= BUDGET.repeatFailThreshold) {
      speak('repeat',
        'Third time on ' + (d.name || 'that control') + ' and nothing is moving. That is usually the environment, not you. Want me to explain what this step actually needs?',
        { label: 'LET ME HELP', mood: 'concerned', cooldownMs: 60000, hint: 'Click me → Ask Rocky' });
      return;
    }

    if (known && d.name) {
      speak('wrongClick',
        quip('wrongClick', 0.35) + 'That is ' + d.name + ' — ' + (known.what || 'a different control') +
        ' The step wants: ' + want + '. I have it glowed.',
        { label: 'NOT THAT ONE', mood: 'concerned', cooldownMs: BUDGET.wrongClickCooldownMs, hint: 'Alt+N to skip this step' });
    }
  }

  // ---- errors the portal itself renders -----------------------------------------------------------
  // Reading the page's own error text is the difference between "something went wrong" and
  // "this region is out of capacity, pick another". Each rule states what it means and what
  // to do; none of it is guessed at run time.
  var ERRORS = [
    { id: 'quota', any: ['insufficient quota', 'quota exceeded', 'exceeded your current quota', 'not enough quota'],
      say: 'That is a quota limit, not a mistake you made. This subscription has no room for that model in this region. Lower the tokens-per-minute, or pick a region with capacity.' },
    { id: 'capacity', any: ['at capacity', 'is currently at capacity', 'no capacity', 'capacity is unavailable'],
      say: 'The region is full right now. Nothing you did. Choose a different region in the dropdown and try again.' },
    { id: 'forbidden', any: ['do not have access', 'not authorized', 'authorizationfailed', 'permission denied', 'forbidden'],
      say: 'A permissions error. The lab account cannot do that yet. Reload first — this is often just a token that expired. If it persists it is one for support, not for you to fix.' },
    { id: 'nametaken', any: ['already exists', 'already in use', 'name is taken', 'must be unique'],
      say: 'That name is taken. Add a couple of characters and try again — the name only has to be unique here.' },
    { id: 'invalidname', any: ['can only contain', 'must start with', 'invalid name', 'must be between'],
      say: 'The name does not fit the rules. Lowercase letters, digits and hyphens are always safe.' },
    { id: 'network', any: ['failed to fetch', 'network error', 'request timed out', 'something went wrong. please try again'],
      say: 'The portal hiccuped rather than refused. Give it a moment and retry before changing anything.' },
  ];

  function scanErrors() {
    if (!st) return;
    var root = document.body;
    if (!root) return;
    // Alerts first: a portal that marks its own errors is telling us exactly where to look.
    var text = '';
    try {
      var alerts = root.querySelectorAll('[role="alert"],[role="alertdialog"],[aria-live="assertive"],.ms-MessageBar--error,[class*="error" i]');
      for (var i = 0; i < alerts.length && i < 12; i++) {
        var t = (alerts[i].innerText || '').trim();
        if (t && t.length < 600) text += ' ' + t;
      }
    } catch (e) {}
    if (!text) return;
    var low = text.toLowerCase();
    for (var j = 0; j < ERRORS.length; j++) {
      var rule = ERRORS[j];
      for (var k = 0; k < rule.any.length; k++) {
        if (low.indexOf(rule.any[k]) < 0) continue;
        var last = st.errorsSeen[rule.id] || 0;
        if (Date.now() - last < BUDGET.errorCooldownMs * 4) return;
        // Only mark it seen if he ACTUALLY said it. Marking first meant that an error
        // arriving inside the minimum gap after another remark was silently swallowed for a
        // full minute — the learner stares at a red box and Rocky, who spotted it, says
        // nothing. Retry on the next tick instead.
        var said = speak('error', rule.say, {
          label: 'THAT IS AN ERROR', mood: 'concerned',
          cooldownMs: BUDGET.errorCooldownMs, hint: 'Not your fault — this one is the environment',
        });
        if (said) st.errorsSeen[rule.id] = Date.now();
        return;
      }
    }
  }

  // ---- the patience clock -------------------------------------------------------------------------
  function tick() {
    if (!st) return;
    var now = Date.now();

    if (location.href !== st.lastUrl) { st.lastUrl = location.href; st.lastActivityAt = now; }

    scanErrors();

    // Stuck = no progress AND no activity. Someone reading carefully is not stuck, so
    // activity (any click, key or scroll) keeps resetting this.
    var idle = now - st.lastActivityAt;
    var onStep = now - st.stepEnteredAt;
    var threshold = st.stuckFired === 0 ? BUDGET.stuckMs : BUDGET.reStuckMs;
    if (idle > threshold && onStep > threshold) {
      var step = currentStep();
      if (step) {
        var learn = step.learn || {};
        var ok = speak('stuck',
          quip('stuck', 0.3) + 'Still on: ' + (step.text || 'this step') + '. ' +
          (learn.why ? learn.why : 'The control is glowed — or click me and ask and I will explain it.'),
          { label: 'WANT A HAND?', mood: 'think', cooldownMs: BUDGET.reStuckMs, hint: 'Click me → Ask Rocky · Alt+N to skip' });
        if (ok) { st.stuckFired++; st.lastActivityAt = now; }
      }
    }
  }

  // ---- events content.js reports -----------------------------------------------------------------
  // The orchestrator knows things the DOM does not: which step we are on, and whether the
  // resolver found it. Rocky's reaction to those is where the delight lives.
  function note(ev) {
    if (!st || !ev) return;
    var now = Date.now();
    if (ev.type === 'step') {
      var advanced = ev.index > st.stepIndex;
      st.stepIndex = ev.index;
      st.stepEnteredAt = now;
      st.lastProgressAt = now;
      st.repeats = {};
      st.stuckFired = 0;
      // Task boundaries are the honest milestones — a real chunk of work finished.
      if (advanced && ev.taskChanged && ev.taskTitle) {
        speak('milestone', quip('celebrate', 0.5) + 'That is ' + ev.taskTitle + ' done. Next part coming up.',
          { label: 'NICE', mood: 'happy', cooldownMs: 30000 });
      }
    } else if (ev.type === 'complete') {
      speak('complete', quip('celebrate', 0.8) + 'Lab complete. You deployed a real model and talked to it — every click your own.',
        { label: 'DONE', mood: 'celebrate', cooldownMs: 0 });
    } else if (ev.type === 'absent' && ev.persistedMs > 20000) {
      // A step that will not resolve for 20s is drift, and saying so out loud is the whole
      // honesty proposition: he would rather admit it than point somewhere plausible.
      speak('drift',
        'I cannot find this control on your build of the portal, so I am not going to guess at it. The step is: ' +
        (ev.text || '') + '. Click me and choose Next when you have done it.',
        { label: 'I AM NOT SURE', mood: 'concerned', cooldownMs: 60000, hint: 'Never a wrong glow — that is the deal' });
    }
  }

  // ---- activity --------------------------------------------------------------------------------------
  function bump() { if (st) st.lastActivityAt = Date.now(); }

  function start(ctx) {
    if (st) stop();
    st = fresh(ctx);
    document.addEventListener('click', onClick, true);
    ['keydown', 'scroll', 'pointerdown'].forEach(function (t) { document.addEventListener(t, bump, true); });
    st.timer = setInterval(tick, 3000);
    // Observable proof that the watcher is live (content scripts are in an isolated world,
    // so a test cannot read our variables).
    try {
      document.documentElement.setAttribute('data-lp-watching', String((ctx && ctx.steps || []).length));
    } catch (e) {}
  }

  function stop() {
    if (!st) return;
    document.removeEventListener('click', onClick, true);
    ['keydown', 'scroll', 'pointerdown'].forEach(function (t) { document.removeEventListener(t, bump, true); });
    clearInterval(st.timer);
    st = null;
  }

  // What Rocky has actually observed. Ask Rocky uses this so answers about "how am I doing"
  // are grounded in evidence rather than invented.
  function snapshot() {
    if (!st) return null;
    var now = Date.now();
    return {
      stepIndex: st.stepIndex,
      totalSteps: (st.ctx.steps || []).length,
      onStepMs: now - st.stepEnteredAt,
      idleMs: now - st.lastActivityAt,
      sessionMs: now - st.startedAt,
      remarks: st.spoken,
      recentClicks: st.clicks.slice(-5).map(function (c) { return { name: c.name, onTarget: c.wasTarget }; }),
      saidRecently: st.history.slice(-3).map(function (h) { return h.cls; }),
      errorsSeen: Object.keys(st.errorsSeen),
    };
  }

  window.LabPilotWatcher = {
    start: start, stop: stop, note: note, snapshot: snapshot,
    // exposed for tests: the decision logic, free of any DOM
    _test: { allowed: allowed, armCooldown: armCooldown, fresh: fresh, BUDGET: BUDGET, ERRORS: ERRORS },
  };
})();
