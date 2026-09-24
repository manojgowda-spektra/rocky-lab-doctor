/*
 * lab-doctor.js — read a Step Pack and say what is wrong with the LAB.
 *
 * The point of deriving a pack is not only to guide a learner. A pack states, per step, whether
 * that step can be detected at all — and a step that cannot be detected by any model is a defect
 * in the lab, not a shortcoming in Rocky. Saying so before delivery is the whole value: the
 * alternative is a learner getting stuck and nobody being able to explain why.
 *
 * WHAT IT FINDS, and why each is a real lab defect rather than a Rocky limitation:
 *
 *   SILENT STEP        the operator clicked and nothing whatever changed in the browser. Either
 *                      the instruction does nothing, or its effect is somewhere Rocky cannot
 *                      see. A learner has no way to know they succeeded either.
 *   AMBIGUOUS STEP     things changed, but nothing that is unique to this step. Every signal it
 *                      produces also fires elsewhere in the same lab, so "done" is undecidable.
 *   UNGUARDED FAILURE  an error was announced during the run and the operator carried on. The
 *                      recording therefore bakes in a broken state as though it were normal.
 *   NO FAILURE PATH    a step that creates something, with no recorded error signal anywhere in
 *                      the lab. Not fatal — but it means recovery has nothing to recognise.
 *   SLOW STEP          an async step. Correct behaviour, recorded so Rocky never calls it stuck,
 *                      and worth telling the author because learners will think it has hung.
 *   REPEATED SIGNAL    one signal is the sole evidence for several steps. Even where each still
 *                      fires, the lab is leaning on a signal that cannot distinguish them.
 *   FURNITURE ACTION   a click on navigation that produced nothing. Usually an instruction that
 *                      is describing where to look rather than what to do.
 *
 *   node test/lab-doctor.js <pack.json> [--json]
 */
'use strict';
const fs = require('fs');

function diagnose(pack) {
  const findings = [];
  const add = (severity, code, step, title, detail, fix) =>
    findings.push({ severity, code, step: step == null ? null : step + 1, title, detail, fix });

  const steps = pack.steps || [];

  for (const s of steps) {
    const what = `"${s.action.name}" (${s.action.region})`;

    if (s.observability === 'silent') {
      add('critical', 'silent-step', s.index,
        'This step produces no observable change',
        `Clicking ${what} changed nothing in the browser that Rocky can see — no announcement, ` +
        'no list change, no place change, no dialog.',
        'Either the instruction has no effect, or its effect lands somewhere outside the browser. ' +
        'A learner cannot tell they succeeded either, so this is worth fixing in the guide regardless.');
    }

    if (s.observability === 'ambiguous') {
      // Three different causes need three different fixes. Describing a movement-only step in
      // terms of discrimination reads as a contradiction, because a place change can be unique
      // and still prove nothing.
      const cause = s.observabilityCause || 'not-unique';
      const title = cause === 'movement-only'
        ? 'This step moves the learner but proves nothing'
        : cause === 'single-lexical'
          ? 'This step rests on one fragile signal'
          : 'Nothing that happens here is unique to this step';
      const fix = cause === 'movement-only'
        ? 'Navigating somewhere is not finishing something. Either this step is really part of ' +
          'the next one, or the guide should ask for an action with an outcome the portal announces.'
        : cause === 'single-lexical'
          ? 'One rename of that wording and the step becomes undetectable, silently. Pair it with ' +
            'a structural outcome — a row count, a declared place — or accept it will drift.'
          : 'Give the step an outcome the portal announces, or merge it with the step whose outcome it shares.';
      add('major', 'ambiguous-step', s.index, title,
        `Clicking ${what} produced ${s.atoms.length} signal(s). ${s.observabilityWhy}.`, fix);
    }

    if (s.failure.length) {
      add('critical', 'unguarded-failure', s.index,
        'An error was announced during this step and the run continued',
        s.failure.map((f) => f.detail).join('; '),
        'The recording bakes a broken state in as though it were normal. Fix the environment or ' +
        'the instruction, then re-record — a pack derived from a failing run will teach Rocky the failure.');
    }

    if (s.latency.klass === 'async') {
      add('info', 'slow-step', s.index,
        `This step took ${Math.round(s.latency.observedMs / 1000)}s`,
        s.latency.why,
        'No deadline is set for it, so Rocky will not call the learner stuck. Consider saying in ' +
        'the guide that it is slow, because learners assume a hang.');
    }

    if (s.action.region === 'nav' && s.observability !== 'observable') {
      add('minor', 'furniture-action', s.index,
        'This step clicks navigation and proves nothing',
        `${what} is a navigation control and this step has no unique outcome.`,
        'Usually an instruction describing where to look rather than what to do. Consider folding ' +
        'it into the step that follows.');
    }
  }

  // A signal that is the SOLE evidence for several steps: each may still fire, but the lab is
  // leaning on something that cannot tell those steps apart, and one portal change breaks all.
  const soleUse = Object.create(null);
  for (const s of steps) {
    if (s.success.length !== 1) continue;
    const k = [s.success[0].kind, s.success[0].klass || '', s.success[0].name || ''].join('│');
    (soleUse[k] = soleUse[k] || []).push(s.index + 1);
  }
  for (const k in soleUse) {
    if (soleUse[k].length < 2) continue;
    add('major', 'repeated-signal', null,
      'One signal is the only evidence for several steps',
      `Steps ${soleUse[k].join(', ')} each rest on the same single signal (${k.replace(/│/g, ' ')}).`,
      'One portal change breaks all of them at once, and none of them can be told apart if it fires early.');
  }

  const creates = steps.filter((s) => s.success.some((a) => a.kind === 'count' && a.dir === 'up'));
  const anyFailureSignal = steps.some((s) => s.failure.length);
  if (creates.length && !anyFailureSignal) {
    add('info', 'no-failure-path', null,
      'This lab creates things and never showed a failure',
      `${creates.length} step(s) create something, and no error signal appears anywhere in the run.`,
      'Recovery has nothing to recognise. Consider recording a deliberately failing pass once — a ' +
      'permissions error or a duplicate name — so Rocky learns what going wrong looks like here.');
  }

  if (!steps.length) {
    add('critical', 'empty-pack', null, 'No steps were derived',
      'The recording contains no operator actions, so there is nothing to derive.',
      'Record a pass in which the lab is actually performed.');
  }

  const order = { critical: 0, major: 1, minor: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.step || 0) - (b.step || 0));

  const counts = findings.reduce((a, f) => (a[f.severity] = (a[f.severity] || 0) + 1, a), {});
  return {
    lab: pack.name, portal: pack.portal, derivedAt: pack.derivedAt,
    steps: steps.length,
    observable: pack.summary ? pack.summary.observable : null,
    findings, counts,
    verdict: counts.critical ? 'NOT READY — critical findings'
      : counts.major ? 'NEEDS WORK — steps Rocky cannot follow reliably'
      : 'READY — every step is observable',
  };
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: node test/lab-doctor.js <pack.json> [--json]'); process.exit(2); }
  const report = diagnose(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 1)); return; }

  console.log(`\n=== LAB DOCTOR: ${report.lab} (${report.portal}) ===\n`);
  console.log(`  ${report.steps} step(s), ${report.observable} observable`);
  console.log(`  ${report.verdict}\n`);
  if (!report.findings.length) { console.log('  nothing to report.\n'); return; }
  for (const f of report.findings) {
    console.log(`  [${f.severity.toUpperCase()}]${f.step ? ' step ' + f.step : ''}  ${f.title}`);
    console.log(`        ${f.detail}`);
    console.log(`        fix: ${f.fix}`);
    console.log('');
  }
  const c = report.counts;
  console.log(`  ${c.critical || 0} critical · ${c.major || 0} major · ${c.minor || 0} minor · ${c.info || 0} info\n`);
}

if (require.main === module) main();
module.exports = { diagnose };
