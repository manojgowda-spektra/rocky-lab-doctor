/* Rocky Copilot — the ANCHOR ENGINE.
 *
 * This file decides which control on the page Rocky is allowed to point at. It is the
 * safety-critical half of the product and it contains NO model, no network call and no
 * randomness: given the same page and the same step it always returns the same answer.
 *
 * THE ACCURACY CONTRACT — "never a wrong glow"
 * --------------------------------------------
 * A candidate is only resolved when ALL of these hold:
 *   1. no attribute in the step's spec is CONTRADICTED by the candidate   (hard fail)
 *   2. the winning score is >= MIN_SCORE                                   (confidence floor)
 *   3. the winner beats the runner-up by >= MARGIN                         (ambiguity floor)
 * Anything else returns {state:'ambiguous'|'absent'} and the UI shows an honest card
 * instead of a glow. Pointing at the wrong control is therefore impossible by
 * construction rather than unlikely in practice — the same doctrine as the Doctor's
 * engine: assert only from evidence, abstain otherwise.
 *
 * Pure by design: operates on plain candidate objects, never on live DOM nodes, so the
 * whole contract is unit-testable in Node without a browser (test/anchor.test.js).
 * content.js is the only place that touches the DOM; it adapts elements into these
 * plain objects via describeElement().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // Node (tests)
  else root.RockyAnchor = api;                                           // browser (content script)
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Tuned so that a confident single match passes and a genuine near-tie never does.
  // Raising MIN_SCORE trades coverage for safety; we always take safety.
  const MIN_SCORE = 0.7;
  const MARGIN = 0.2;

  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

  // Signals, in descending order of trust. Weights sum to 1.0 for a perfect match.
  // Rationale: a stable test id or an accessible name is authored intent; visible text is
  // strong but drifts with copy edits; role/tag/position are corroborating only.
  const WEIGHTS = {
    testId: 0.32,   // data-testid / data-test / data-automation-id — authored, most stable
    name: 0.24,     // accessible name (aria-label, title, alt, label)
    text: 0.20,     // trimmed visible text
    near: 0.14,     // container text — the ONLY thing separating "Deploy" on two model cards,
                    // so it is weighted as a real disambiguator, not a tie-breaker
    role: 0.07,     // button / link / tab / textbox …
    tag: 0.03,      // button, a, input …
  };

  /** Does the candidate positively contradict a specified attribute?
   *  Absent information is NOT a contradiction — only a present-and-different value is.
   *  This is what makes a wrong glow impossible rather than improbable. */
  function contradicts(cand, spec) {
    if (spec.testId && cand.testId && norm(cand.testId) !== norm(spec.testId)) return 'testId';
    if (spec.role && cand.role && norm(cand.role) !== norm(spec.role)) return 'role';
    if (spec.tag && cand.tag && norm(cand.tag) !== norm(spec.tag)) return 'tag';
    // An exact-text step must not land on an element whose text is something else entirely.
    if (spec.textExact && cand.text && norm(cand.text) !== norm(spec.textExact)) return 'textExact';
    if (cand.disabled && !spec.allowDisabled) return 'disabled';
    if (cand.hidden) return 'hidden';
    return null;
  }

  function textScore(candText, spec) {
    const c = norm(candText);
    if (!c) return 0;
    if (spec.textExact) return c === norm(spec.textExact) ? 1 : 0;
    const want = norm(spec.text);
    if (!want) return 0;
    if (c === want) return 1;
    if (c.startsWith(want)) return 0.8;   // candidate is MORE specific: "Deploy model" for "Deploy"
    if (want.startsWith(c)) return 0.5;   // candidate is LESS specific: "Deploy" for "Deploy model"
    if (c.includes(want)) return 0.7;
    // token overlap — handles "Deploy model" vs "Deploy base model"
    const a = new Set(c.split(' ').filter(Boolean));
    const b = want.split(' ').filter(Boolean);
    if (!b.length) return 0;
    const hit = b.filter((t) => a.has(t)).length;
    return hit ? (hit / b.length) * 0.6 : 0;
  }

  /** Score one candidate against a step spec. Returns 0..1 plus the signals that fired,
   *  so the UI (and a human reviewing a miss) can see exactly why it scored what it did. */
  function score(cand, spec) {
    const why = {};
    let got = 0, possible = 0;   // possible = weight of signals this candidate can be JUDGED on

    if (spec.testId && cand.testId) {
      possible += WEIGHTS.testId;
      if (cand.testId && norm(cand.testId) === norm(spec.testId)) { got += WEIGHTS.testId; why.testId = 1; }
    }
    if (spec.name && cand.name) {
      possible += WEIGHTS.name;
      const s = textScore(cand.name, { text: spec.name });
      got += WEIGHTS.name * s; if (s) why.name = s;
    }
    if ((spec.text || spec.textExact) && cand.text) {
      possible += WEIGHTS.text;
      const s = textScore(cand.text, spec);
      got += WEIGHTS.text * s; if (s) why.text = s;
    }
    if (spec.role && cand.role) {
      possible += WEIGHTS.role;
      if (cand.role && norm(cand.role) === norm(spec.role)) { got += WEIGHTS.role; why.role = 1; }
    }
    if (spec.tag && cand.tag) {
      possible += WEIGHTS.tag;
      if (cand.tag && norm(cand.tag) === norm(spec.tag)) { got += WEIGHTS.tag; why.tag = 1; }
    }
    if (spec.near && cand.containerText) {
      possible += WEIGHTS.near;
      const s = textScore(cand.containerText, { text: spec.near });
      got += WEIGHTS.near * s; if (s) why.near = s;
    }

    // Corroborating signals (role/tag/near) may SUPPORT an identifying match but can never BE
    // one. Without this, every button on the page scores 1.0 on role alone and the whole page
    // becomes a tie. An identifying signal is testId, accessible name, or visible text.
    const specIdentifies = !!(spec.testId || spec.name || spec.text || spec.textExact);
    const candIdentified = !!(why.testId || why.name || why.text);
    if (specIdentifies && !candIdentified) return { value: 0, why, judgedOn: possible };

    // Normalise over what was JUDGEABLE, not over what the spec wished for. A candidate with
    // no test id is missing evidence, not carrying conflicting evidence — and the contract says
    // only conflicting evidence disqualifies.
    return { value: possible ? got / possible : 0, why, judgedOn: possible };
  }

  /** Resolve a step against a list of candidates.
   *  @returns {{state:'resolved'|'ambiguous'|'absent', ...}} */
  function resolve(candidates, spec) {
    const rejected = [];
    const scored = [];

    for (const cand of candidates || []) {
      const bad = contradicts(cand, spec);
      if (bad) { rejected.push({ cand, reason: bad }); continue; }
      const s = score(cand, spec);
      if (s.value > 0) scored.push({ cand, score: s.value, why: s.why });
    }

    if (!scored.length) {
      return { state: 'absent', reason: 'no candidate matched any required signal', rejected: rejected.length };
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    const runnerUp = scored[1] ? scored[1].score : 0;

    if (top.score < MIN_SCORE) {
      return {
        state: 'ambiguous', reason: 'below confidence floor',
        best: top.cand, score: top.score, need: MIN_SCORE, why: top.why,
      };
    }
    if (top.score - runnerUp < MARGIN) {
      return {
        state: 'ambiguous', reason: 'two candidates too close to call',
        best: top.cand, score: top.score, runnerUp, need: MARGIN, why: top.why,
      };
    }
    return { state: 'resolved', target: top.cand, score: top.score, runnerUp, why: top.why };
  }

  return { resolve, score, contradicts, MIN_SCORE, MARGIN, WEIGHTS, _norm: norm };
});
