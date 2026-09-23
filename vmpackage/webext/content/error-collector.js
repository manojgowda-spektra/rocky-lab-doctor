/*
 * error-collector.js — record uncaught errors from Rocky's own files, so a gate can see them.
 *
 * WHY. verify-loaded.js has always ended with this check:
 *
 *     const errs = await ask(`JSON.stringify(window.__lpErrors || [])`);
 *     if (list.length) fails.push(`page errors: ...`);
 *
 * Nothing has ever written window.__lpErrors. A repo-wide grep found exactly one hit: the
 * line that READS it. There was no window.onerror and no unhandledrejection handler anywhere
 * in the extension. So the only check in the suite that claimed to catch a runtime exception
 * from a content script was structurally incapable of failing, and the suite still printed
 * "ALL GATES GREEN - safe to put in front of a learner".
 *
 * That is precisely the shape of the defect that shipped: LabPilotRocky.explain() threw a
 * ReferenceError, every Explore explanation died, and seventeen green gates said nothing.
 *
 * This file is the missing producer. It loads FIRST, before every other content script, so a
 * throw at the top level of any of them is recorded rather than lost.
 *
 * WHAT IT DOES NOT DO. It does not change behaviour, retry anything, or show the learner an
 * error. It only records. An error collector that alters what it observes is worse than none,
 * and a learner must never see a stack trace.
 *
 * ON ISOLATION. window here is the isolated world's window, shared by every content script in
 * this extension and invisible to the page. That is what we want: page errors from the portal
 * itself are not ours and must not fail our gate. It also means a probe has to ask the
 * extension's own execution context for this array — see test/interaction-live.js, which
 * enumerates Runtime.executionContextCreated to find it. Reading it from the page world, as
 * verify-loaded.js did, returns undefined no matter what Rocky is doing.
 */
(function () {
  "use strict";
  if (window.__lpErrors) return;          // never install twice

  var MAX = 50;                            // a loop must not grow this without bound
  var list = [];
  window.__lpErrors = list;

  function record(kind, message, where) {
    if (list.length >= MAX) return;
    var at = where ? ' (' + where + ')' : '';
    list.push(kind + ': ' + message + at);
  }

  // Only OUR files. A portal that throws its own errors is not Rocky's fault, and failing a
  // gate on someone else's bug would make the gate noise, which is how a gate stops being read.
  function ours(src) {
    return typeof src === 'string' && src.indexOf('chrome-extension://') === 0;
  }

  window.addEventListener('error', function (e) {
    try {
      if (!ours(e.filename)) return;
      var file = String(e.filename).split('/').pop();
      record('uncaught', (e.message || 'error'), file + ':' + (e.lineno || 0));
    } catch (err) { /* the collector must never itself throw into the page */ }
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    try {
      var r = e.reason;
      // A rejected promise carries no filename, so we cannot filter by source. Record the
      // stack when there is one: an unhandled rejection inside a content script is a defect
      // whether or not we can prove the file, and a swallowed one is how a question vanishes.
      var msg = (r && r.message) || String(r);
      var stack = (r && r.stack) || '';
      if (stack && stack.indexOf('chrome-extension://') < 0) return;   // clearly not ours
      record('unhandled rejection', msg, '');
    } catch (err) {}
  }, true);
})();
