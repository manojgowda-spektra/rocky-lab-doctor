// Lab Doctor — autonomous lab QA engine.
// Compares a Cosmos-authored spec (steps + validation definitions = expected ground truth)
// against fleet telemetry (per-learner validation results, errors, timings), classifies the
// divergence, ranks by fleet impact, and drafts an author-ready fix.
//
// Design constraints (from docs/labdoctor_market_gap.md — the competitive research):
//   C1  Never silently mutate. Findings carry DRAFT fixes + evidence + confidence; a human approves.
//   C2  The triage/RCA layer is the value center, not the healer. Most of the logic lives here.
//   C3  Disambiguate flake from drift via FLEET aggregation, never a single session. The strongest
//       signal: a step that SUCCESSFUL learners fail => the validator is the bug, not the learner.
//
// Deterministic-first (no LLM required): detection + a baseline fix draft always work. An optional
// LLM pass (enrichFinding) refines the draft into author-facing before/after text + rationale.

const { redact } = require('../src/redact');
const DEPREC = require('./azure-deprecations.json');

// ---- severity model: weight × fleet-impact drives the health-score deduction ----
const SEVERITY = {
  critical: { rank: 0, weight: 42 },
  high: { rank: 1, weight: 26 },
  medium: { rank: 2, weight: 13 },
  low: { rank: 3, weight: 5 }, // shaves a couple points for transparency, but never marks a lab "broken"
  info: { rank: 4, weight: 0 },
};

const ENV_ERROR = /Authorization|Quota|License|Marketplace|Forbidden|denied/i;
const MIN_AFFECTED = 4; // fleet floor — never flag on a single session (C3)

// ---- aggregation: turn cohorts into per-validation / per-step fleet stats ----
function aggregate(lab) {
  const cohorts = (lab.telemetry && lab.telemetry.cohorts) || [];
  const totalLearners = cohorts.reduce((n, c) => n + (c.count || 0), 0);
  const stepOrder = (lab.steps || []).map((s) => s.stepGuid);
  const lastStep = stepOrder[stepOrder.length - 1];

  // per-validation
  const vstats = {};
  for (const v of lab.validations || []) {
    vstats[v.validationId] = { def: v, attempts: 0, fails: 0, passes: 0, retries: 0, failingCohorts: [], passingCohorts: [], resolvedOnRetry: 0 };
  }
  // per-step dwell / retries
  const sstats = {};
  for (const s of lab.steps || []) sstats[s.stepGuid] = { def: s, dwellNum: 0, dwellDen: 0, maxRetries: 0, learners: 0, cohortDwells: [] };

  let completed = 0;
  for (const c of cohorts) {
    const n = c.count || 0;
    const results = c.validationResults || [];
    const failedHere = results.some((r) => r.status === 'failed');
    if ((c.reachedStep === lastStep || !lastStep) && !failedHere) completed += n;

    for (const r of results) {
      const vs = vstats[r.validationId];
      if (!vs) continue;
      vs.attempts += n;
      if (r.status === 'failed') { vs.fails += n; vs.failingCohorts.push({ n, observed: r.observed || {}, errors: c.errors || [], label: c.label }); }
      else { vs.passes += n; vs.passingCohorts.push({ n, observed: r.observed || {} }); if (r.resolvedOnRetry || r.firstAttempt === 'failed') vs.resolvedOnRetry += n; }
    }
    for (const [step, secs] of Object.entries(c.timings || {})) {
      const ss = sstats[step]; if (!ss) continue;
      ss.dwellNum += secs * n; ss.dwellDen += n; ss.learners += n;
      ss.cohortDwells.push({ secs, n });
    }
    for (const [vid, rn] of Object.entries(c.retries || {})) {
      const def = (lab.validations || []).find((v) => v.validationId === vid);
      const step = def && def.stepGuid; const ss = step && sstats[step];
      if (ss) ss.maxRetries = Math.max(ss.maxRetries, rn);
      if (vstats[vid]) vstats[vid].retries = Math.max(vstats[vid].retries, rn);
    }
  }
  for (const vs of Object.values(vstats)) vs.failRate = vs.attempts ? vs.fails / vs.attempts : 0;
  for (const ss of Object.values(sstats)) ss.meanDwell = ss.dwellDen ? ss.dwellNum / ss.dwellDen : 0;

  const dwells = Object.values(sstats).map((s) => s.meanDwell).filter((d) => d > 0).sort((a, b) => a - b);
  const medianDwell = dwells.length ? dwells[Math.floor(dwells.length / 2)] : 0;

  return { totalLearners, completed, completionRate: totalLearners ? completed / totalLearners : 0, vstats, sstats, medianDwell };
}

// does an observed state satisfy every key the validation expected? (the "correct-but-failed" test)
function observedMatchesExpected(observed, expected) {
  const keys = Object.keys(expected || {});
  if (!keys.length) return false;
  return keys.every((k) => observed[k] !== undefined && observed[k] === expected[k]);
}
// does the observed state even report on the keys the validation cares about? (needed to tell
// "wrong value" apart from "not measured" when hunting false-passes)
function hasKeys(observed, expected) {
  const keys = Object.keys(expected || {});
  return keys.length > 0 && keys.every((k) => observed[k] !== undefined);
}
const sumN = (arr) => arr.reduce((n, c) => n + (c.n || 0), 0);

// ---- detection: deterministic anomaly rules (the RCA layer, C2) ----
function detect(lab) {
  const agg = aggregate(lab);
  const { vstats, sstats } = agg;
  const findings = [];
  const explained = new Set();
  let seq = 0;
  const mkId = (t) => `${lab.labId}-F${++seq}-${t}`;

  // --- Region / environment DRIFT (lab-level): failing learners whose observed region != expected ---
  const driftCohorts = [];
  const driftValidations = [];
  let skuErr = null;
  for (const [vid, vs] of Object.entries(vstats)) {
    const bad = vs.failingCohorts.filter((c) => c.observed.region && c.observed.region !== lab.expectedRegion);
    if (bad.length) {
      driftValidations.push(vid);
      driftCohorts.push(...bad);
      for (const c of bad) for (const e of c.errors || []) if (/SkuNotAvailable|not available in location/i.test(e.code || e.message || '')) skuErr = e;
    }
  }
  const driftN = sumN(dedupeCohorts(driftCohorts));
  if (driftN >= MIN_AFFECTED) {
    const dc = driftCohorts.find((c) => c.observed.region);
    const wrongRegion = dc && dc.observed.region;
    const driftLabels = new Set(driftCohorts.map((c) => c.label));
    // Absorb downstream SYMPTOMS: any other validation whose failures come ONLY from the same
    // drift cohorts (e.g. "VM not running" because the deploy failed) — fold in, don't double-report.
    for (const [vid, vs] of Object.entries(vstats)) {
      if (driftValidations.includes(vid) || vs.fails === 0) continue;
      if (vs.failingCohorts.every((c) => driftLabels.has(c.label))) { driftValidations.push(vid); explained.add(vid); }
    }
    driftValidations.forEach((v) => explained.add(v));
    // Draft the fix against THIS lab's actual step text (each lab words its region step differently).
    const driftRef = (driftValidations[0] && (lab.validations.find((v) => v.validationId === driftValidations[0]) || {}).stepGuid) || 'S-01';
    const driftStep = (lab.steps || []).find((s) => s.stepGuid === driftRef);
    const driftBefore = ((driftStep && driftStep.instruction) || 'Select a region from the dropdown.').trim();
    findings.push({
      id: mkId('drift'), type: 'drift', severity: 'critical',
      title: `Learners are deploying to the wrong region (${wrongRegion} instead of ${lab.expectedRegion})`,
      validationIds: driftValidations, stepGuid: driftRef,
      affectedLearners: driftN, affectedFraction: agg.totalLearners ? driftN / agg.totalLearners : 0,
      confidence: 0.85,
      signature: `platform-drift:${lab.cloud || 'cloud'}:${wrongRegion}${skuErr ? ':sku-unavailable' : ''}`,
      evidence: [
        `${driftN} learners failed ${driftValidations.join(', ')} with resources observed in "${wrongRegion}" (expected "${lab.expectedRegion}")`,
        skuErr ? `Correlated deployment error: ${skuErr.code || 'SkuNotAvailable'} — ${skuErr.message}` : null,
      ].filter(Boolean),
      draftFix: {
        target: 'guide', ref: driftRef,
        summary: `Pin the region in the step instruction — the portal's region dropdown now defaults to a region where the lab's required SKU isn't available, so learners silently pick the wrong one.`,
        before: driftBefore,
        after: `${driftBefore.replace(/\s*(Choose a region\.?|Select a region( from the dropdown)?\.?)\s*$/i, '').trim()} **Set Region to "${lab.expectedRegion}"** (do not accept the dropdown default — the lab's required SKU is not available in other regions).`,
        rationale: `Root cause is a guide gap amplified by cloud drift, not a learner error. ${skuErr ? `The ${skuErr.code || 'SkuNotAvailable'} error is a symptom of the wrong region, not of the chosen SKU.` : ''}`,
      },
    });
  }

  // --- R2b — VALIDATION BUG (false-PASS): the SILENT one. Pass-side evidence, so it runs for EVERY
  // validation — including ones already "explained" by fail-side findings like drift. A drifting check
  // that ALSO silently passes wrong work is the worst case, not an either/or (found by the digital
  // twin's compound scenario: the old in-loop placement let drift absorption mask the false-pass). ---
  for (const [vid, vs] of Object.entries(vstats)) {
    if (vs.attempts === 0) continue;
    const wrongButPassed = vs.passingCohorts.filter((c) => hasKeys(c.observed, vs.def.expected) && !observedMatchesExpected(c.observed, vs.def.expected));
    const wbpN = sumN(wrongButPassed);
    if (wbpN < MIN_AFFECTED) continue;
    const ex = wrongButPassed[0].observed;
    findings.push({
      id: mkId('falsepass'), type: 'validation-bug', severity: 'critical', subtype: 'false-pass',
      title: `Validation ${vid} is silently PASSING learners whose work is wrong`,
      validationIds: [vid], stepGuid: vs.def.stepGuid,
      affectedLearners: wbpN, affectedFraction: agg.totalLearners ? wbpN / agg.totalLearners : 0,
      confidence: 0.88,
      evidence: [
        `${wbpN} learners were marked PASSED on ${vid} ("${vs.def.description}") while their observed state (${JSON.stringify(pick(ex, Object.keys(vs.def.expected)))}) did NOT match the expected state (${JSON.stringify(vs.def.expected)})`,
      ],
      draftFix: {
        target: 'validation', ref: vid,
        summary: `Tighten the CHECK — it is accepting a wrong end-state as correct, silently certifying learners who didn't complete the objective.`,
        before: `Assert ${vid}: ${JSON.stringify(vs.def.expected)} (currently passes when observed = ${JSON.stringify(pick(ex, Object.keys(vs.def.expected)))})`,
        after: `Change ${vid} to FAIL when the observed state ≠ ${JSON.stringify(vs.def.expected)} — it currently accepts ${JSON.stringify(pick(ex, Object.keys(vs.def.expected)))}.`,
        rationale: `A false-pass is worse than a false-fail: it protects no one and quietly devalues the credential. A passing check generates no complaints, so this defect is invisible to support tickets — only fleet-level expected-vs-observed comparison surfaces it.`,
      },
    });
  }

  // --- Per-validation classification for anything still unexplained with meaningful failure ---
  for (const [vid, vs] of Object.entries(vstats)) {
    if (explained.has(vid) || vs.attempts === 0) continue;

    // R2 — VALIDATION BUG (false-fail): learners in the CORRECT state still failed the check (C3).
    const correctButFailed = vs.failingCohorts.filter((c) => observedMatchesExpected(c.observed, vs.def.expected));
    const cbfN = sumN(correctButFailed);
    if (cbfN >= MIN_AFFECTED) {
      const ex = correctButFailed[0].observed;
      findings.push({
        id: mkId('valbug'), type: 'validation-bug', severity: 'critical',
        title: `Validation ${vid} is failing learners who did the step correctly`,
        validationIds: [vid], stepGuid: vs.def.stepGuid,
        affectedLearners: cbfN, affectedFraction: agg.totalLearners ? cbfN / agg.totalLearners : 0,
        confidence: 0.9,
        evidence: [
          `${cbfN} learners had observed state matching the expected state (${JSON.stringify(pick(ex, Object.keys(vs.def.expected)))}) yet ${vid} ("${vs.def.description}") returned FAILED`,
          `Fleet fail rate for ${vid}: ${(vs.failRate * 100).toFixed(0)}% across ${vs.attempts} attempts`,
        ],
        draftFix: {
          target: 'validation', ref: vid,
          summary: `Fix the CHECK, not the lab. Successful learners are being told they failed — the validation's probe has drifted from what it should assert.`,
          before: `Assert ${vid}: ${JSON.stringify(vs.def.expected)} — the probe currently returns FAILED on matching state`,
          after: `Re-point ${vid}'s probe at the resource state itself, asserting ${JSON.stringify(vs.def.expected)}, so learners whose observed state matches PASS.`,
          rationale: `When learners in the correct end-state fail a check, the check is the defect. Shipping this masks nothing and unblocks real learners.`,
        },
      });
      explained.add(vid); continue;
    }

    // R5 — TRANSIENT / flake: fails resolve on retry and the HARD-fail share is small. NOT a lab defect (C3 restraint).
    const hardFail = vs.failRate;
    if (vs.resolvedOnRetry >= MIN_AFFECTED && hardFail < 0.25) {
      const retryN = vs.resolvedOnRetry;
      findings.push({
        id: mkId('transient'), type: 'transient', severity: 'low',
        title: `${vid} is transient (resolves on retry) — not flagged as broken`,
        validationIds: [vid], stepGuid: vs.def.stepGuid,
        affectedLearners: retryN, affectedFraction: agg.totalLearners ? retryN / agg.totalLearners : 0,
        confidence: 0.75,
        evidence: [
          `${retryN} learners failed ${vid} on the first attempt but passed on retry (propagation delay)`,
          `Hard-fail rate is only ${(hardFail * 100).toFixed(0)}% — below the threshold to flag a defect`,
        ],
        draftFix: {
          target: 'validation', ref: vid,
          summary: `No lab defect. Optionally soften the learner experience: add a "wait ~1 minute" note and a built-in retry to the check.`,
          before: `${vid} asserts immediately.`,
          after: `Add a short poll/backoff to ${vid} and a guide note that external IP / RBAC can take ~1 minute to propagate.`,
          rationale: `Flagging transient propagation delays as broken labs erodes author trust — the exact failure mode the research warned about.`,
        },
      });
      explained.add(vid); continue;
    }

    // R1/R3 — high fleet failure not otherwise explained: env/permission cluster, else generic.
    if (vs.failRate >= 0.35 && vs.fails >= MIN_AFFECTED) {
      const errs = [].concat(...vs.failingCohorts.map((c) => c.errors || []));
      const envErr = errs.find((e) => ENV_ERROR.test(e.code || e.message || ''));
      if (envErr) {
        findings.push({
          id: mkId('env'), type: 'env-permission', severity: 'high',
          title: `${vid} failing for ${(vs.failRate * 100).toFixed(0)}% of the fleet on an environment error (${envErr.code || 'env'})`,
          validationIds: [vid], stepGuid: vs.def.stepGuid,
          affectedLearners: vs.fails, affectedFraction: agg.totalLearners ? vs.fails / agg.totalLearners : 0,
          confidence: 0.7,
          signature: `env:${(envErr.code || (envErr.message || '').slice(0, 24)).replace(/\s+/g, '-')}`,
          evidence: [`${vs.fails} learners failed ${vid} (${(vs.failRate * 100).toFixed(0)}%)`, `Error: ${envErr.code || ''} — ${envErr.message || ''}`],
          draftFix: { target: 'guide', ref: vs.def.stepGuid, summary: `Environment-class failure — the error names the cause (${envErr.code || 'see evidence'}); needs a platform/setup fix, not a guide edit.`, before: '', after: `Resolve the blocked prerequisite behind ${envErr.code || 'the error'} for the lab subscriptions (e.g. raise the quota or grant the permission) before launch.`, rationale: `Environment-class failures usually need a platform or setup fix, not a guide edit.` },
        });
      } else {
        findings.push({
          id: mkId('failrate'), type: 'validation-failed-fleet', severity: 'high',
          title: `${vid} has a high fleet failure rate`,
          validationIds: [vid], stepGuid: vs.def.stepGuid,
          affectedLearners: vs.fails, affectedFraction: agg.totalLearners ? vs.fails / agg.totalLearners : 0,
          confidence: 0.55,
          evidence: [`${vs.fails} of ${vs.attempts} learners failed ${vid} ("${vs.def.description}") — ${(vs.failRate * 100).toFixed(0)}%`],
          draftFix: { target: 'guide', ref: vs.def.stepGuid, summary: `Elevated failure — needs a human look. Not enough signal to auto-classify as drift vs. validator bug vs. learner error.`, before: '', after: `Review step ${vs.def.stepGuid} and ${vid} against current cloud behavior.`, rationale: `Deliberately low-confidence: the engine flags rather than guesses.` },
        });
      }
      explained.add(vid);
    }
  }

  // R4 — GUIDE CLARITY: a step where learners burn far-above-median time + retries but EVENTUALLY pass.
  // Use BOTH the fleet mean AND the worst cohort, so a real hotspot isn't hidden by fast learners averaging it out.
  for (const [step, ss] of Object.entries(sstats)) {
    if (!agg.medianDwell) continue;
    const stepVals = (lab.validations || []).filter((v) => v.stepGuid === step);
    const eventuallyPasses = stepVals.length && stepVals.every((v) => (vstats[v.validationId] || {}).failRate < 0.35);
    const worst = ss.cohortDwells.filter((c) => c.n >= MIN_AFFECTED).reduce((m, c) => Math.max(m, c.secs), 0);
    const worstN = ss.cohortDwells.filter((c) => c.n >= MIN_AFFECTED && c.secs === worst).reduce((n, c) => n + c.n, 0);
    const slow = ss.meanDwell >= 1.7 * agg.medianDwell || worst >= 3 * agg.medianDwell;
    if (slow && ss.maxRetries >= 3 && eventuallyPasses && ss.learners >= MIN_AFFECTED) {
      findings.push({
        id: mkId('clarity'), type: 'guide-clarity', severity: 'medium',
        title: `Step ${step} is confusing — high time-on-step and retries, but learners get there`,
        validationIds: stepVals.map((v) => v.validationId), stepGuid: step,
        affectedLearners: ss.learners, affectedFraction: agg.totalLearners ? ss.learners / agg.totalLearners : 0,
        confidence: 0.6,
        evidence: [
          `Mean time on ${step} is ${Math.round(ss.meanDwell)}s vs. a lab median of ${Math.round(agg.medianDwell)}s (${(ss.meanDwell / agg.medianDwell).toFixed(1)}×)`,
          worst >= 3 * agg.medianDwell ? `${worstN} learners spent ~${Math.round(worst)}s here — ${(worst / agg.medianDwell).toFixed(1)}× the median` : null,
          `Up to ${ss.maxRetries} validation retries on this step, but it eventually passes — effort, not breakage`,
        ].filter(Boolean),
        draftFix: { target: 'guide', ref: step, summary: `Clarify the instruction — learners struggle then succeed, the signature of an ambiguous step.`, before: (ss.def.instruction || '').slice(0, 120), after: `Add the exact portal path + a current screenshot to "${ss.def.title}", and name the specific fields to set.`, rationale: `Ambiguity costs time and satisfaction even when learners recover; the fleet dwell/retry signal pinpoints it.` },
      });
    }
  }

  // rank by fleet impact: severity first, then learners affected
  findings.sort((a, b) => (SEVERITY[a.severity].rank - SEVERITY[b.severity].rank) || (b.affectedLearners - a.affectedLearners));
  return { agg, findings };
}

function dedupeCohorts(arr) {
  // cohorts pushed once per validation can double-count learners; collapse by (label, region)
  const seen = new Map();
  for (const c of arr) { const k = `${c.label}|${c.observed.region}`; if (!seen.has(k)) seen.set(k, c); }
  return [...seen.values()];
}
function pick(obj, keys) { const o = {}; for (const k of keys) if (obj[k] !== undefined) o[k] = obj[k]; return o; }

// ---- health score: 100 minus severity-weighted, fleet-impact-scaled deductions ----
function scoreLab(findings) {
  let deduction = 0;
  for (const f of findings) {
    const w = SEVERITY[f.severity].weight;
    deduction += w * (0.45 + 0.55 * Math.min(1, f.affectedFraction));
  }
  return Math.max(0, Math.round(100 - deduction));
}

const statusOf = (score) => score >= 85 ? 'healthy' : score >= 60 ? 'watch' : 'broken';

// derive lightweight attributes from a lab's spec text — used by the risk radar + synthetic probe.
function labTags(lab) {
  const blob = JSON.stringify([lab.steps || [], lab.validations || [], (lab.telemetry && lab.telemetry.cohorts || []).map((c) => c.errors || [])]);
  const sku = blob.match(/Standard_(D|E|F|B|NC|NV)\w*/i);
  const family = sku ? sku[1].toUpperCase() + '-series' : (/EP\d|premium[- ]?plan/i.test(blob) ? 'Premium-plan' : null);
  const learners = (lab.telemetry && lab.telemetry.cohorts || []).reduce((n, c) => n + (c.count || 0), 0);
  return {
    skuFamily: family,
    regionSelectable: /region|location/i.test(blob) && /dropdown|choose|select/i.test(blob),
    marketplace: /marketplace|image|offer|terms|license/i.test(blob),
    preview: /preview/i.test(blob),
    thinTelemetry: learners < 5,
    learners,
  };
}

function daysBetween(a, b) { const ms = (new Date(b) - new Date(a)); return Math.round(ms / 86400000); }

// ---- SELF-HEAL (counterfactual re-validation): apply the APPROVED fixes' forward effect to a COPY of
// the telemetry, then re-analyze. This models "if authors merge these drafts and the fleet re-runs the
// lab, here is the health." Honest + engine-backed: it never mutates the real catalog and is labelled as
// a projected re-validation, not applied state. A human still approved every fix (C1). ----
function applyApprovedFixes(lab, approvedIds) {
  const { findings } = detect(redact(lab));
  const approved = findings.filter((f) => (approvedIds || []).includes(f.id));
  const clone = JSON.parse(JSON.stringify(lab));
  const stepOrder = (clone.steps || []).map((s) => s.stepGuid);
  const lastStep = stepOrder[stepOrder.length - 1];
  const cohorts = (clone.telemetry && clone.telemetry.cohorts) || [];
  const defOf = (vid) => (clone.validations || []).find((v) => v.validationId === vid);
  // when a fix makes a check pass, the underlying state is now correct too — bring observed into the
  // expected state, or we'd fabricate a false-PASS (passing with a wrong observed value).
  const pass = (r) => { r.status = 'passed'; const def = defOf(r.validationId); if (def) { r.observed = { ...(r.observed || {}) }; for (const [k, v] of Object.entries(def.expected || {})) r.observed[k] = v; } };

  for (const f of approved) {
    const vids = f.validationIds || [];
    if (f.type === 'drift') {
      for (const c of cohorts) {
        const isDrift = (c.validationResults || []).some((r) => vids.includes(r.validationId) && r.status === 'failed' && r.observed && r.observed.region && r.observed.region !== clone.expectedRegion);
        if (!isDrift) continue;
        c.errors = []; // region pinned → the SKU/region deployment error no longer occurs
        for (const r of c.validationResults || []) if (vids.includes(r.validationId)) pass(r);
        c.reachedStep = lastStep; // deploy now succeeds → learners reach the end
        c.label = c.label + ' → healed';
      }
    } else if (f.type === 'validation-bug' && f.subtype !== 'false-pass') {
      for (const c of cohorts) for (const r of c.validationResults || []) if (vids.includes(r.validationId) && r.status === 'failed') pass(r); // corrected check now passes the correct learners
    } else if (f.type === 'validation-bug' && f.subtype === 'false-pass') {
      // Honest: tightening the check reveals the real failures it was masking. Mark the wrongly-passing
      // cohorts as the genuine fails they are (do NOT touch observed) so the false-pass stops firing —
      // and the previously-hidden genuine failures surface as their own (real) finding.
      for (const c of cohorts) for (const r of c.validationResults || []) {
        const def = defOf(r.validationId);
        if (vids.includes(r.validationId) && r.status === 'passed' && def && !observedMatchesExpected(r.observed || {}, def.expected)) r.status = 'failed';
      }
    } else if (f.type === 'guide-clarity') {
      for (const c of cohorts) {
        if (c.timings && c.timings[f.stepGuid]) c.timings[f.stepGuid] = Math.min(c.timings[f.stepGuid], 320);
        if (c.retries) for (const v of vids) if (c.retries[v]) c.retries[v] = 1;
      }
    } else if (f.type === 'env-permission') {
      for (const c of cohorts) {
        if (!(c.errors || []).some((e) => ENV_ERROR.test(e.code || e.message || ''))) continue;
        c.errors = [];
        for (const r of c.validationResults || []) if (vids.includes(r.validationId) && r.status === 'failed') pass(r);
      }
    }
  }
  return clone;
}

// ---- public: analyze one lab (deterministic) ----
function analyzeLab(lab) {
  const safe = redact(lab); // C: never reason over / emit un-redacted telemetry (secrets in error logs)
  const { agg, findings } = detect(safe);
  const isNew = agg.totalLearners === 0; // no telemetry yet — we can't claim healthy; a synthetic probe can pre-QA it
  const score = isNew ? null : scoreLab(findings);
  return {
    labId: safe.labId, title: safe.title, cloud: safe.cloud, expectedRegion: safe.expectedRegion,
    author: safe.author, lastAuthored: safe.lastAuthored, tags: labTags(safe),
    score, status: isNew ? 'new' : statusOf(score),
    history: Array.isArray(safe.history) ? safe.history : null,
    totalLearners: agg.totalLearners, completionRate: Number(agg.completionRate.toFixed(3)),
    findings,
    findingCount: findings.filter((f) => f.severity !== 'low' && f.severity !== 'info').length,
    topFinding: findings[0] ? { type: findings[0].type, title: findings[0].title, severity: findings[0].severity } : null,
  };
}

// ---- RISK RADAR: which currently-healthy labs are most likely to break next? Two signals ONLY, each
// either a verifiable FACT or an inference anchored to something OBSERVED in this same run — no other
// signal survived a complexity/honesty audit (docs/rocky_complexity_audit.md). A weighted 0-100 score
// across many guessed-weight signals was cut: with zero real outcomes to calibrate against, extra
// signals and a numeric score/horizon-estimate implied a precision the system hadn't earned. Re-add a
// signal only once there's a real outcome log (radar-said-X vs. actually-broke-Y) to check it against. ----
function computeRisk(fullReports, patterns, asOf) {
  const atRiskSkus = new Set(); // SKU families already drifting somewhere in the fleet, observed THIS run
  for (const { raw, rep } of fullReports) if (rep.findings.some((f) => f.type === 'drift')) { const t = labTags(raw); if (t.skuFamily) atRiskSkus.add(t.skuFamily); }
  const driftActive = (patterns || []).some((p) => p.signature.startsWith('platform-drift'));

  const risks = [];
  for (const { raw, rep } of fullReports) {
    if (rep.status !== 'healthy') continue; // radar predicts breakage in labs that look FINE today
    const t = rep.tags; const flags = [];

    // Signal 1 — FACT: the lab hardcodes a token already announced retired/deprecated. Zero inference.
    const blob = JSON.stringify(raw.steps || []) + JSON.stringify(raw.validations || []);
    const retired = (DEPREC.retiredSkus || []).find((s) => blob.indexOf(s.token) !== -1);
    if (retired) flags.push({ type: 'retired-dependency', evidence: `hardcodes ${retired.token}, retired ${retired.retired} (replacement: ${retired.replacement})` });

    // Signal 2 — OBSERVED-THIS-RUN inference: shares a fragile attribute with labs already drifting now.
    if (driftActive && t.skuFamily && atRiskSkus.has(t.skuFamily)) flags.push({ type: 'shares-active-drift', evidence: `uses ${t.skuFamily} VMs — the same family already drifting elsewhere in this run's telemetry` });

    if (!flags.length) continue;
    risks.push({ labId: rep.labId, title: rep.title, flags, narrative: `${rep.title} looks healthy now: ${flags.map((f) => f.evidence).join('; ')}.` });
  }
  return risks;
}

// project a lab's health after ALL its actionable fixes are approved + re-validated (engine-backed)
function projectHealed(lab) {
  const before = analyzeLab(lab);
  const actionable = before.findings.filter((f) => f.severity !== 'low' && f.severity !== 'info').map((f) => f.id);
  if (!actionable.length) return before.score;
  return analyzeLab(applyApprovedFixes(lab, actionable)).score;
}

// ---- cross-lab FLEET INTELLIGENCE: the same root cause hitting multiple labs at once is the signal
// no single-lab QA (and no generic AI) can produce. Group findings by signature across the catalog. ----
function detectFleetPatterns(fullReports) {
  const groups = {};
  for (const r of fullReports) for (const f of r.findings || []) {
    if (!f.signature) continue;
    (groups[f.signature] = groups[f.signature] || { signature: f.signature, labs: [], learners: 0 });
    const g = groups[f.signature];
    if (!g.labs.find((x) => x.labId === r.labId)) g.labs.push({ labId: r.labId, title: r.title });
    g.learners += f.affectedLearners;
  }
  return Object.values(groups).filter((g) => g.labs.length >= 2).map((g) => {
    let headline;
    if (g.signature.startsWith('platform-drift')) {
      const region = g.signature.split(':')[2];
      headline = `${g.labs.length} labs are failing with the same root cause — resources landing in ${region}, where the required SKU is not available to the lab subscriptions. This pattern across multiple labs points to a platform-level change, not an authoring mistake.`;
    } else if (g.signature.startsWith('env:')) {
      headline = `${g.labs.length} labs hit the same environment error (${g.signature.slice(4)}) — likely a shared subscription/permission or marketplace prerequisite that regressed.`;
    } else headline = `${g.labs.length} labs share the root cause "${g.signature}".`;
    return { signature: g.signature, headline, labCount: g.labs.length, learners: g.learners, labs: g.labs, severity: 'critical' };
  }).sort((a, b) => b.learners - a.learners);
}

// ---- public: analyze the whole catalog, worst-health first, with cross-lab fleet patterns + risk radar ----
function analyzeCatalog(catalog) {
  const full = (catalog.labs || []).map((l) => ({ raw: l, rep: analyzeLab(l) }));
  const fleetPatterns = detectFleetPatterns(full.map((x) => x.rep));
  const riskRadar = computeRisk(full, fleetPatterns, catalog.asOf);
  const labs = full.map(({ raw, rep }) => ({
    labId: rep.labId, title: rep.title, score: rep.score, status: rep.status,
    completionRate: rep.completionRate, totalLearners: rep.totalLearners,
    findingCount: rep.findingCount, topFinding: rep.topFinding, tags: rep.tags,
    history: rep.history, healedScore: rep.status === 'new' ? null : projectHealed(raw),
    risk: (riskRadar.find((r) => r.labId === rep.labId) || null),
  }));
  // sort: broken/watch worst-first, then healthy, then 'new' (unproven) last
  const rank = (l) => l.status === 'new' ? 1e6 : (l.score == null ? 1e6 : l.score);
  labs.sort((a, b) => rank(a) - rank(b));
  const scoredLabs = labs.filter((l) => typeof l.score === 'number');
  const scored = scoredLabs.length ? Math.round(scoredLabs.reduce((s, l) => s + l.score, 0) / scoredLabs.length) : 100;
  const healedLabs = labs.filter((l) => typeof l.healedScore === 'number');
  const healedCatalog = healedLabs.length ? Math.round(healedLabs.reduce((s, l) => s + l.healedScore, 0) / healedLabs.length) : 100;
  return {
    generatedAt: new Date().toISOString(), windowDays: catalog.windowDays || null, asOf: catalog.asOf || null,
    catalogHealth: scored, healedCatalogHealth: healedCatalog,
    labCount: labs.length, broken: labs.filter((l) => l.status === 'broken').length,
    watch: labs.filter((l) => l.status === 'watch').length,
    newCount: labs.filter((l) => l.status === 'new').length,
    learnersAffected: labs.reduce((s, l) => s + (l.findingCount ? l.totalLearners : 0), 0),
    fleetPatterns, riskRadar, labs,
  };
}

// Models the best-case ceiling if a set of fixes is approved and merged — a MODEL, not a test. No real
// system is re-run; "after" is computed by replaying the fixes' assumed effect onto a telemetry copy.
// Named honestly on purpose: this used to be called revalidate() and the UI said "Re-validated" with a
// checkmark, which claimed a capability (real re-execution) that doesn't exist. See the complexity audit.
function simulatePostFixOutcome(lab, approvedIds) {
  const before = analyzeLab(lab);
  const healed = applyApprovedFixes(lab, approvedIds && approvedIds.length ? approvedIds : before.findings.filter((f) => f.severity !== 'low' && f.severity !== 'info').map((f) => f.id));
  const after = analyzeLab(healed);
  return { labId: before.labId, before, after, approvedCount: (approvedIds || []).length || before.findingCount };
}

// ---- optional LLM enrichment: refine ONE finding's fix into author-facing before/after + rationale ----
// Grounded ONLY in the finding's evidence + draft (no fabrication). Draft-only (C1). Returns the
// enriched finding; on any error/no-LLM, returns the deterministic draft unchanged with source noted.
async function enrichFinding(lab, finding, chatFn, isConfigured) {
  const provenance = {
    dataSource: 'fleet telemetry (fixtures/lab-catalog.json) + Cosmos-authored spec',
    evidence: finding.evidence,
    rule: finding.type,
    deterministicConfidence: finding.confidence,
    fixIsDraftOnly: true,
    humanApprovalRequired: true,
  };
  if (!isConfigured || !isConfigured()) {
    return { ...finding, diagnosis: finding.draftFix.summary, fixSource: 'deterministic', provenance };
  }
  const sys = `You are Lab Doctor, an autonomous QA engineer for hands-on cloud labs. You classify why a lab is failing learners and DRAFT an author-ready fix. Rules: ground EVERY statement in the provided evidence only — never invent state; the fix is a DRAFT a human author must approve (never claim it is applied); prefer fixing the VALIDATION when correct learners fail it; be concise and specific. Respond with ONLY JSON: {"classification": one of ["drift","validation-bug","guide-clarity","env-permission","transient","needs-review"], "diagnosis": "1-2 sentences, evidence-grounded", "fix": {"target": "guide"|"validation"|"platform", "ref": "step or validation id", "before": "current text/behavior", "after": "proposed change", "rationale": "why"}, "confidence": 0..1}`;
  const usr = `Lab: "${lab.title}" (${lab.labId}), expected region ${lab.expectedRegion}.
Detected finding type: ${finding.type} (severity ${finding.severity}).
Title: ${finding.title}
Fleet impact: ${finding.affectedLearners} learners (${(finding.affectedFraction * 100).toFixed(0)}% of the fleet).
EVIDENCE (the only ground truth you may use):
${finding.evidence.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}
Deterministic draft fix (refine it, keep it a draft): target=${finding.draftFix.target} ref=${finding.draftFix.ref}
  before: ${finding.draftFix.before || '(n/a)'}
  after: ${finding.draftFix.after}
  rationale: ${finding.draftFix.rationale}`;
  try {
    const raw = await chatFn([{ role: 'user', content: usr }], { system: sys, json: true });
    let o; try { o = JSON.parse(raw); } catch { o = null; }
    if (!o || !o.fix) return { ...finding, diagnosis: finding.draftFix.summary, fixSource: 'deterministic', provenance };
    return {
      ...finding,
      classification: o.classification || finding.type,
      diagnosis: (o.diagnosis || finding.draftFix.summary).toString().trim(),
      // The red/green diff stays pinned to the deterministic draft: it must read as a concrete edit,
      // and the LLM tends to replace it with investigate-this prose. The LLM contributes the diagnosis
      // and (when it offers one) a sharper rationale — narration, never the assertion.
      draftFix: { ...finding.draftFix, rationale: (o.fix.rationale || finding.draftFix.rationale).toString().trim() },
      llmConfidence: typeof o.confidence === 'number' ? o.confidence : undefined,
      fixSource: 'llm-refined',
      provenance,
    };
  } catch {
    return { ...finding, diagnosis: finding.draftFix.summary, fixSource: 'deterministic', provenance };
  }
}

module.exports = { analyzeLab, analyzeCatalog, detect, aggregate, scoreLab, enrichFinding, applyApprovedFixes, simulatePostFixOutcome, projectHealed, detectFleetPatterns, computeRisk, labTags, observedMatchesExpected, hasKeys, SEVERITY };
