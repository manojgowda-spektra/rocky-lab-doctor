/*
 * derive-pack.js — turn a whole-run recording into a Step Pack, offline.
 *
 * THE RULE THAT DICTATES THE ARCHITECTURE: discrimination is a question about the WHOLE RUN.
 * "Does this signal also hold at eleven other steps" cannot be answered while recording step
 * three. So the recorder captures continuously and knows nothing about steps, and every step
 * boundary, expected outcome and score is derived here. A per-step capture would reproduce the
 * furniture bug inside the completion channel — an "expected state" that is true everywhere is
 * furniture wearing a new hat.
 *
 * WHAT IT DERIVES, per step:
 *
 *   startState     the place the operator acted FROM
 *   action         what they pressed, with its region
 *   transition     the place it led to
 *   atoms          candidate evidence, each scored
 *   success        the atoms that prove this step happened
 *   failure        error signals seen in this window
 *   latency        measured, and classified — ui / mixed / async
 *   discrimination for every atom: how many OTHER steps it also holds at
 *   observability  whether this step can be detected at all
 *
 * ATOM KINDS, and why each is in the set:
 *   place       the aria-current path or heading changed to X. Structural where the portal
 *               declares it; measured on Purview as 6 of 6 pages, absent on Azure.
 *   count       a list cardinality rose. Order-free and tolerant of a pre-seeded tenant, so it
 *               survives a second run and a different tenant. Never "== 7".
 *   announce    a live region said something matching a CLASS. The literal text is kept for the
 *               report and never matched, because wording changes and meaning does not.
 *   emptied     empty-state copy disappeared. Needs no row counting, immune to virtualisation.
 *   dialog      a modal opened or closed. MOVEMENT — never allowed to prove completion.
 *
 *   node test/derive-pack.js <trace.json> [--out pack.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ---- atom construction -------------------------------------------------------------------
// Only these prove the WORLD changed. A place change or a dialog is the learner MOVING, which
// is progress and not proof — the distinction that the whole of stage 1 exists to enforce.
const PROVES_COMPLETION = { count: 1, announce: 1, emptied: 1 };
const STRUCTURAL = { count: 1, place: 1, dialog: 1 };   // survive a rename; lexical ones do not

function atomKey(a) {
  return [a.kind, a.klass || '', a.name || '', a.dir || ''].join('│');
}

/*
 * A STEP IS AN ACTION AND EVERYTHING THAT FOLLOWED IT, UNTIL THE NEXT ACTION.
 *
 * Not "until the page changed" — a page can change several times inside one step (a wizard
 * pane, then a toast, then a list refresh) and splitting on that would shatter one step into
 * four. Not a fixed window either: a provisioning step can take a minute while a nav click
 * takes 300ms, and any constant would be wrong for one of them. The operator's next deliberate
 * action is the only boundary that means something.
 */
function windows(trace) {
  const acts = (trace.actions || []).slice().sort((a, b) => a.t - b.t);
  const out = [];
  for (let i = 0; i < acts.length; i++) {
    const from = acts[i].t;
    const to = i + 1 < acts.length ? acts[i + 1].t : (trace.durationMs || Infinity);
    out.push({ index: i, action: acts[i], from, to });
  }
  return out;
}

function atomsIn(trace, w) {
  const found = [];
  const evs = (trace.events || []).filter((e) => e.t >= w.from && e.t < w.to);

  for (const e of evs) {
    if (e.kind === 'count-grew' || e.kind === 'list-grew') {
      found.push({
        kind: 'count', dir: 'up', name: e.name || e.frame, frame: e.frame,
        from: e.from, to: e.to, declared: !!e.declared,
        survival: e.declared ? 'structural' : 'lexical',
        at: e.t, detail: `${e.name || 'a list'} ${e.from} → ${e.to}`,
      });
    } else if (e.kind === 'count-shrank' || e.kind === 'list-shrank') {
      found.push({
        kind: 'count', dir: 'down', name: e.name || e.frame, frame: e.frame,
        from: e.from, to: e.to, declared: !!e.declared,
        survival: e.declared ? 'structural' : 'lexical', at: e.t,
        detail: `${e.name || 'a list'} ${e.from} → ${e.to}`,
      });
    } else if (e.kind === 'empty-state-cleared') {
      found.push({ kind: 'emptied', name: e.phrase || '', frame: e.frame, survival: 'lexical', at: e.t, detail: 'empty state cleared' });
    } else if (e.kind === 'announce') {
      // The CLASS is the atom. The literal words are kept for the report and never matched:
      // Microsoft rewords its toasts and the meaning survives the rewording.
      if (e.klass === 'busy') continue;
      found.push({
        kind: 'announce', klass: e.klass || 'other', frame: e.frame,
        assertive: !!e.assertive, text: e.text || '',
        survival: 'lexical', at: e.t,
        detail: `${e.klass}: ${String(e.text || '').slice(0, 60)}`,
      });
    } else if (e.kind === 'action') {
      // An action is the learner ACTING. It is the step BOUNDARY, never evidence that the step
      // finished — the distinction the whole design rests on.
      continue;
    } else if (e.kind === 'dialog-opened' || e.kind === 'dialog-closed') {
      found.push({
        kind: 'dialog', dir: e.kind === 'dialog-opened' ? 'open' : 'close',
        name: e.name || '', frame: e.frame, survival: 'structural', at: e.t,
        detail: `${e.kind} ${e.name || ''}`,
      });
    }
  }

  // The place the action led to, from the samples inside the window.
  const samples = (trace.samples || []).filter((s) => s.t >= w.from && s.t < w.to);
  const last = samples[samples.length - 1];
  const first = samples[0];
  if (last && (!first || last.place.section !== (w.action.from && w.action.from.section) ||
               last.place.page !== (w.action.from && w.action.from.page))) {
    const label = [last.place.section, last.place.page].filter(Boolean).join(' > ');
    if (label) {
      found.push({
        kind: 'place', name: label,
        // aria-current is the portal DECLARING where you are; a heading is the page naming
        // itself. The first survives a rename of the page, the second does not.
        survival: last.place.source === 'aria-current' ? 'structural' : 'lexical',
        source: last.place.source, at: last.t, detail: `place → ${label}`,
      });
    }
  }
  return found;
}

/*
 * DISCRIMINATION: at how many OTHER steps does this same atom also hold?
 *
 * Zero means it happens at exactly one point in the whole run, and it is therefore, MEASURED ON
 * THIS RECORDING, a false-fire-free test for that step. This is the number that separates a
 * real completion signal from furniture, and it is the reason the recorder records everything
 * and derives afterwards.
 */
function score(steps) {
  const counts = Object.create(null);
  for (const s of steps) {
    const seen = Object.create(null);
    for (const a of s.atoms) {
      const k = atomKey(a);
      if (seen[k]) continue;                 // an atom firing twice in one step is still one step
      seen[k] = 1;
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  for (const s of steps) {
    for (const a of s.atoms) {
      a.discrimination = (counts[atomKey(a)] || 1) - 1;
    }
  }
  return counts;
}

/*
 * THE SATISFY RULE, DERIVED RATHER THAN TUNED.
 *
 *   fire on  (>=1 STRUCTURAL atom with discrimination 0)
 *        or  (>=2 atoms with discrimination 0)
 *
 * One atom unique in the whole run already has a measured zero false-fire rate, so one is
 * enough for correctness. The second is required only when the unique atom is LEXICAL, because
 * a rename is silent and breaks a lexical atom without warning — two independent lexical atoms
 * broken by the same rename is possible and much less likely. There is no knob: k is 1 for
 * structural and 2 for lexical, and the reason is written down.
 */
function satisfy(step) {
  const unique = step.atoms.filter((a) => a.discrimination === 0 && PROVES_COMPLETION[a.kind]);
  const structural = unique.filter((a) => a.survival === 'structural');
  if (structural.length >= 1) return { fires: true, on: [structural[0]], rule: 'one structural atom unique in this run' };
  if (unique.length >= 2) return { fires: true, on: unique.slice(0, 2), rule: 'two lexical atoms, each unique in this run' };
  /*
   * WHY IT DID NOT FIRE MATTERS AS MUCH AS THAT IT DID NOT. There are three different causes
   * and they need three different fixes, so lumping them together produces a report an author
   * cannot act on — and one of them ("its only signals are movement") reads as a contradiction
   * if described in terms of discrimination, because a place change CAN be unique and still
   * prove nothing.
   */
  const proving = step.atoms.filter((a) => PROVES_COMPLETION[a.kind]);
  if (!proving.length) {
    return { fires: false, on: [], why: 'movement-only', rule: step.atoms.length
      ? 'everything that happened here was MOVEMENT — a place change or a dialog. Nothing ' +
        'announced an outcome, no list changed, no empty state cleared, so there is no evidence ' +
        'the world is different'
      : 'nothing happened at all' };
  }
  if (unique.length === 1) {
    return { fires: false, on: [], why: 'single-lexical',
      rule: 'the only unique evidence is lexical (' + unique[0].detail + ') — a silent rename ' +
            'would break it with nothing to fall back on' };
  }
  return { fires: false, on: [], why: 'not-unique',
    rule: 'every signal here also fires at other steps in this lab (' +
          proving.map((a) => a.kind + ' x' + (a.discrimination + 1)).join(', ') + ')' };
}

/*
 * LATENCY, MEASURED AND THEN CLASSIFIED. The deadline is derived from what actually happened,
 * not chosen: an async step gets NO deadline at all, because Rocky saying "you seem stuck" to
 * someone waiting on a provisioning job is the most annoying thing he can do, and the recording
 * already proves the wait is normal.
 */
function latency(step) {
  const evs = step.atoms.filter((a) => typeof a.at === 'number');
  if (!evs.length) return { observedMs: null, klass: 'unknown', deadlineMs: null, why: 'nothing observed in this window' };
  const observed = Math.max(0, Math.min(...evs.map((a) => a.at)) - step.action.t);
  if (observed < 2000) {
    return { observedMs: observed, klass: 'ui', deadlineMs: Math.max(3000, observed * 6),
      why: 'the outcome appeared immediately; 6x the observed time, floored at 3s' };
  }
  if (observed < 10000) {
    return { observedMs: observed, klass: 'mixed', deadlineMs: Math.max(6000, observed * 4),
      why: 'a round trip; 4x the observed time, floored at 6s' };
  }
  return { observedMs: observed, klass: 'async', deadlineMs: null,
    why: `took ${Math.round(observed / 1000)}s when recorded — Rocky must never call this stuck` };
}

function derive(trace) {
  const ws = windows(trace);
  const steps = ws.map((w) => ({
    index: w.index,
    startState: w.action.from || null,
    action: { name: w.action.name, role: w.action.role, region: w.action.region, t: w.action.t },
    window: { from: w.from, to: w.to === Infinity ? null : w.to },
    atoms: atomsIn(trace, w),
  }));
  score(steps);

  for (const s of steps) {
    const sat = satisfy(s);
    s.success = sat.on;
    s.satisfies = sat.fires;
    s.satisfyRule = sat.rule;
    s.failure = s.atoms.filter((a) => a.kind === 'announce' && a.klass === 'failure');
    s.movement = s.atoms.filter((a) => !PROVES_COMPLETION[a.kind]);
    s.latency = latency(s);
    s.transition = (s.atoms.find((a) => a.kind === 'place') || {}).name || null;

    /*
     * OBSERVABILITY IS A FINDING, NOT A DEFAULT. A step with no unique evidence cannot be
     * detected by any model, ever — the fix is to the lab, not to Rocky. Saying so at record
     * time is the whole point of doing this before a learner sees it.
     */
    s.observability = s.satisfies ? 'observable'
      : s.atoms.length === 0 ? 'silent'
      : 'ambiguous';
    s.observabilityWhy = sat.rule;
    s.observabilityCause = sat.why || (s.satisfies ? 'satisfied' : 'unknown');
  }

  return {
    schema: 'rocky-pack/1',
    name: trace.name,
    portal: trace.portal,
    derivedAt: new Date().toISOString(),
    recordedAt: trace.recordedAt,
    durationMs: trace.durationMs,
    steps,
    summary: {
      steps: steps.length,
      observable: steps.filter((s) => s.observability === 'observable').length,
      ambiguous: steps.filter((s) => s.observability === 'ambiguous').length,
      silent: steps.filter((s) => s.observability === 'silent').length,
      withFailure: steps.filter((s) => s.failure.length).length,
      async: steps.filter((s) => s.latency.klass === 'async').length,
      places: Array.from(new Set((trace.samples || [])
        .map((x) => [x.place.section, x.place.page].filter(Boolean).join(' > '))
        .filter(Boolean))),
    },
  };
}

// ---- cli -----------------------------------------------------------------------------------
function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node test/derive-pack.js <trace.json> [--out pack.json]');
    process.exit(2);
  }
  const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pack = derive(trace);
  const oi = process.argv.indexOf('--out');
  if (oi > 0 && process.argv[oi + 1]) {
    fs.writeFileSync(process.argv[oi + 1], JSON.stringify(pack, null, 1));
    console.log('wrote ' + process.argv[oi + 1]);
  }

  console.log(`\n=== STEP PACK: ${pack.name} (${pack.portal}) ===\n`);
  console.log(`  ${pack.summary.steps} step(s) derived from ${Math.round((pack.durationMs || 0) / 1000)}s of recording`);
  console.log(`  observable ${pack.summary.observable} · ambiguous ${pack.summary.ambiguous} · silent ${pack.summary.silent}`);
  console.log(`  places visited: ${pack.summary.places.join(' | ') || 'none'}\n`);
  for (const s of pack.steps) {
    const tag = s.observability === 'observable' ? 'OK ' : s.observability === 'ambiguous' ? '?? ' : '!! ';
    console.log(`  ${tag}step ${s.index + 1}  click "${s.action.name}" (${s.action.region})`);
    if (s.startState) console.log(`        from    ${[s.startState.section, s.startState.page].filter(Boolean).join(' > ') || s.startState.route || '-'}`);
    if (s.transition) console.log(`        to      ${s.transition}`);
    console.log(`        latency ${s.latency.observedMs == null ? '-' : s.latency.observedMs + 'ms'} (${s.latency.klass})`);
    if (s.success.length) {
      s.success.forEach((a) => console.log(`        PROVES  ${a.detail}   [${a.survival}, discrimination ${a.discrimination}]`));
    } else {
      console.log(`        PROVES  nothing — ${s.observabilityWhy}`);
    }
    s.failure.forEach((a) => console.log(`        FAILED  ${a.detail}`));
    s.movement.slice(0, 3).forEach((a) => console.log(`        moved   ${a.detail}   [discrimination ${a.discrimination}]`));
    console.log('');
  }
}

if (require.main === module) main();
module.exports = { derive, windows, atomsIn, score, satisfy, latency };
