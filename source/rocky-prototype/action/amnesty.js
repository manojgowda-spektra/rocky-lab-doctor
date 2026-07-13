// False-FAIL Amnesty — the first ACTION-plane capability, in its destroyer-hardened form.
// When a validator regresses into failing correct work, the learners it wronged can have their
// earned verdict restored — but ONLY under gates that make writing a wrong PASS structurally
// impossible rather than merely unlikely:
//
//   G1 FLEET-CONFIRMED   an OPEN false-fail case exists in the reliability ledger for (lab, validator)
//                        — no individual-learner judgment ever triggers a write (MIN_AFFECTED stands)
//   G2 REGRESSION-ONLY   monitor history shows a sweep BEFORE the case where this defect was absent —
//                        born-broken validators are never amnestied (nothing was "taken away")
//   G3 STATE-PROVEN      the learner's own observed state matches the validator's expected state —
//                        the same deterministic contradiction the engine asserts, at per-learner
//                        grain. Missing/empty observed = INELIGIBLE: absence of evidence is not
//                        evidence of correctness.
//   G4 HUMAN-GATED       buildAmnestyPacket() only DRAFTS. executeAmnesty() throws without an
//                        authorizedBy identity, and every write carries reason + evidence + author.
//   G5 REVERSION GUARD   reconcileAmnesty() re-checks every amnestied pair after the fix ships;
//                        ONE contradicted pair halts the validator's amnesty pipeline (the vision
//                        metric: "0 amnestied pairs fail post-fix re-validation" is asserted, not hoped).
//
// This module is pure logic + an injected writer, so the same packet flows to the twin's PUT
// endpoint today and the production endpoint after the semantics spike. All twin numbers are
// SIMULATED and labeled as such in the packet provenance.

const { observedMatchesExpected, hasKeys } = require('../labdoctor/analyze');

// G2: find the latest sweep BEFORE the case opened where the lab was observed WITHOUT this defect.
function lastCleanSweep(monitorHistory, labId, caseKey, openedSweep) {
  let clean = null;
  for (const snap of monitorHistory) {
    if (snap.sweepId >= openedSweep) break;
    const cond = snap.perLab && snap.perLab[labId];
    if (cond && !cond.keys.includes(caseKey)) clean = snap.sweepId;
  }
  return clean; // null => born broken (or never observed clean) => G2 fails
}

// Build the DRAFT packet: who would be amnestied, on what evidence, and who was excluded and why.
// Inputs: lab (defs), learners (per-learner rows), ledgerCases (ledger.cases), monitorHistory.
function buildAmnestyPacket({ lab, learners, ledgerCases, monitorHistory }) {
  const vdefs = Object.fromEntries((lab.validations || []).map((v) => [v.validationId, v]));

  // G1: open, fleet-confirmed false-fail cases only (validation-bug with NO subtype).
  // False-pass cases are validator faults too, but amnesty NEVER applies: those learners' work is
  // wrong — flipping anything there would manufacture the system's own worst defect.
  const candidates = ledgerCases.filter((c) => c.labId === lab.labId && c.type === 'validation-bug' && !c.subtype && c.closedSweep === null);

  const cases = [], eligible = [], ineligible = [];
  for (const c of candidates) {
    const clean = lastCleanSweep(monitorHistory, lab.labId, c.key, c.openedSweep);
    const caseView = {
      caseId: c.caseId, key: c.key, validationIds: c.validationIds, openedSweep: c.openedSweep,
      lastCleanSweep: clean, regression: clean !== null,
      repeatOffender: !!c.recurrenceOf, // recurrence => stricter review, flagged on every pair below
    };
    cases.push(caseView);
    if (!caseView.regression) {
      ineligible.push({ caseId: c.caseId, reason: 'no-prior-clean-state', detail: `validator was never observed working before sweep ${c.openedSweep} — nothing was taken away, so nothing is restored` });
      continue; // G2 fails: no pairs from this case, regardless of learner state
    }
    for (const vid of c.validationIds) {
      const def = vdefs[vid];
      if (!def || !def.expected) { ineligible.push({ caseId: c.caseId, validationId: vid, reason: 'no-expected-state', detail: 'validator has no expected{} to prove learner state against' }); continue; }
      for (const u of learners) {
        const row = (u.validationResults || []).find((r) => r.validationId === vid);
        if (!row || row.status !== 'failed') continue; // amnesty only ever flips FAILED verdicts
        const obs = row.observed || {};
        if (!hasKeys(obs, def.expected)) {
          ineligible.push({ caseId: c.caseId, validationId: vid, eventUserId: u.eventUserId, reason: 'no-evidence', detail: 'observed state missing the expected keys — cannot prove the work is correct' });
          continue;
        }
        if (!observedMatchesExpected(obs, def.expected)) {
          ineligible.push({ caseId: c.caseId, validationId: vid, eventUserId: u.eventUserId, reason: 'state-mismatch', detail: `observed ${JSON.stringify(obs)} does not match expected ${JSON.stringify(def.expected)} — this failure is genuine` });
          continue;
        }
        eligible.push({
          caseId: c.caseId, validationId: vid, eventUserId: u.eventUserId,
          previousStatus: 'failed', proposedStatus: 'passed',
          repeatOffender: caseView.repeatOffender,
          evidence: { observed: obs, expected: def.expected, fleetCase: c.caseId, lastCleanSweep: clean },
        });
      }
    }
  }

  return {
    labId: lab.labId, labTitle: lab.title,
    draft: true, // a packet is NEVER self-executing
    cases, eligible, ineligible,
    stats: { cases: cases.length, eligible: eligible.length, ineligible: ineligible.length },
    provenance: { dataSource: 'SIMULATED (digital twin)', gates: ['fleet-confirmed', 'regression-only', 'state-proven', 'human-gated', 'reversion-guarded'] },
  };
}

// G4: execute ONLY with a named human authorization; the injected writer performs the actual PUT
// (twin today, production after the spike). Returns per-pair write results — failures are recorded,
// never retried silently.
async function executeAmnesty(packet, writer, opts = {}) {
  if (!opts.authorizedBy) throw new Error('amnesty requires an explicit authorizedBy identity — packets are drafts, humans execute');
  if (!packet || !Array.isArray(packet.eligible)) throw new Error('not an amnesty packet');
  const results = [];
  for (const pair of packet.eligible) {
    const write = {
      labId: packet.labId, eventUserId: pair.eventUserId, validationId: pair.validationId,
      status: pair.proposedStatus, previousStatus: pair.previousStatus,
      reason: `false-fail amnesty: fleet case ${pair.caseId}; observed state matched expected; validator last clean at sweep ${pair.evidence.lastCleanSweep}`,
      writtenBy: opts.authorizedBy,
      evidence: pair.evidence,
    };
    try {
      const r = await writer(write);
      results.push({ ...pair, written: true, response: r });
    } catch (e) {
      results.push({ ...pair, written: false, error: e.message });
    }
  }
  return { labId: packet.labId, authorizedBy: opts.authorizedBy, written: results.filter((r) => r.written).length, failed: results.filter((r) => !r.written).length, results };
}

// G5: after the FIX ships and the validator is corrected, every amnestied pair must genuinely pass.
// contradicted = the fixed validator STILL fails them => our "their work was correct" claim was wrong
// => halt all further amnesty for this validator and alarm a human. Absent learners are 'unknown'
// (seat expired), never silently counted as confirmed.
function reconcileAmnesty(execution, learnersNow) {
  const confirmed = [], contradicted = [], unknown = [];
  for (const r of execution.results.filter((x) => x.written)) {
    const u = learnersNow.find((x) => x.eventUserId === r.eventUserId);
    const row = u && (u.validationResults || []).find((x) => x.validationId === r.validationId);
    if (!row) { unknown.push({ eventUserId: r.eventUserId, validationId: r.validationId }); continue; }
    (row.status === 'passed' ? confirmed : contradicted).push({ eventUserId: r.eventUserId, validationId: r.validationId, statusNow: row.status });
  }
  return { confirmed, contradicted, unknown, halt: contradicted.length > 0, metric: `${contradicted.length} amnestied pair(s) failed post-fix re-validation (target: 0)` };
}

module.exports = { buildAmnestyPacket, executeAmnesty, reconcileAmnesty, lastCleanSweep };
