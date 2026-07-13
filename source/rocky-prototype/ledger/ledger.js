// Reliability Ledger — the case-history layer on top of the continuous monitor.
// A CASE opens when a loud finding key appears on a lab and closes when it clears. Everything
// downstream is DERIVED from that one append-only history, never re-guessed:
//   - incident-minutes SLI + error budgets (the "diagnosis-confirmed" SLI — clean by construction,
//     because a case only exists when the engine asserted a contradiction, never on raw fail rates)
//   - the fix queue, ranked by learner-sweeps of blocked lab time (learners x age = honest cost)
//   - validator trust tiers (an error budget for the ground-truth layer itself: only the CHECK's own
//     confirmed faults — false-fail / false-pass — count against it; env/drift are the world's fault)
//   - precedent-adjusted confidence (labeled separately; NEVER overwrites the engine's number)
// Deterministic, source-agnostic: consumes monitor sweep snapshots only (twin today, production later).

// key format (from monitor/sweeper.js conditionOf): `${type}[:subtype]|${validationIds.join(',')}`
function parseKey(key) {
  const bar = key.indexOf('|');
  const head = bar === -1 ? key : key.slice(0, bar);
  const vids = bar === -1 ? '' : key.slice(bar + 1);
  const colon = head.indexOf(':');
  return {
    type: colon === -1 ? head : head.slice(0, colon),
    subtype: colon === -1 ? null : head.slice(colon + 1),
    validationIds: vids ? vids.split(',').filter(Boolean) : [],
  };
}

// Validator-fault case classes: type 'validation-bug' covers false-fail (no subtype) and false-pass.
const isValidatorFault = (c) => c.type === 'validation-bug';

function createCaseLedger() {
  const cases = []; // append-only
  const open = new Map(); // `${labId}|${key}` -> case
  let lastSweep = 0;
  let caseSeq = 0;

  function record(snapshot) {
    lastSweep = snapshot.sweepId;
    // platform incidents raised this sweep: signature -> incident id (cases opened for that
    // signature this sweep are the incident's member cases)
    const incidents = new Map();
    for (const a of snapshot.alerts) {
      if (a.type === 'platform-incident') incidents.set(a.signature, `PI-${snapshot.sweepId}-${a.signature}`);
    }

    for (const [labId, cond] of Object.entries(snapshot.perLab)) {
      // open new cases for keys that appeared
      for (const key of cond.keys) {
        const ck = `${labId}|${key}`;
        if (open.has(ck)) continue;
        const meta = (cond.keyMeta || {})[key] || {};
        const prior = cases.filter((c) => c.labId === labId && c.key === key);
        const c = {
          caseId: `CASE-${String(++caseSeq).padStart(4, '0')}`,
          labId, labTitle: cond.title || labId, key, ...parseKey(key),
          title: meta.title || key,
          openedSweep: snapshot.sweepId, closedSweep: null,
          learners: meta.learners || 0,
          signature: meta.signature || null,
          severity: meta.severity || null,
          confidence: typeof meta.confidence === 'number' ? meta.confidence : null,
          recurrenceOf: prior.length ? prior[prior.length - 1].caseId : null,
          incidentId: meta.signature && incidents.has(meta.signature) ? incidents.get(meta.signature) : null,
        };
        cases.push(c);
        open.set(ck, c);
      }
      // close cases whose key cleared for THIS lab (labs absent from the snapshot stay open:
      // unknown is not recovered — same honesty rule as everywhere else in the system)
      for (const [ck, c] of open) {
        if (c.labId !== labId) continue;
        if (!cond.keys.includes(c.key)) { c.closedSweep = snapshot.sweepId; open.delete(ck); }
      }
    }
  }

  // Broken-sweep span: a case covers sweeps [openedSweep .. closedSweep-1] once closed
  // (the closing sweep is the first CLEAN one), or [openedSweep .. lastSweep] while open.
  const coversAt = (c, s) => s >= c.openedSweep && (c.closedSweep === null ? s <= lastSweep : s < c.closedSweep);
  const ageOf = (c) => (c.closedSweep === null ? lastSweep - c.openedSweep + 1 : c.closedSweep - c.openedSweep);

  // SLI: diagnosis-confirmed incident-minutes per lab + error budget. Concurrent cases on one lab
  // do NOT double-count a sweep (distinct broken sweeps), and learner cost per sweep takes the MAX
  // across covering cases, not the sum — the same learners may be hit by both defects.
  function computeSli(opts = {}) {
    const interval = opts.sweepIntervalMinutes !== undefined ? opts.sweepIntervalMinutes : 60;
    const objective = opts.objective !== undefined ? opts.objective : 0.95;
    const window = Math.max(1, Math.min(opts.windowSweeps || lastSweep, lastSweep));
    const winStart = lastSweep - window + 1;

    const byLab = new Map();
    for (const c of cases) {
      if (!byLab.has(c.labId)) byLab.set(c.labId, []);
      byLab.get(c.labId).push(c);
    }
    const perLab = [];
    for (const [labId, labCases] of byLab) {
      let incidentSweeps = 0, learnerSweeps = 0;
      for (let s = winStart; s <= lastSweep; s++) {
        const covering = labCases.filter((c) => coversAt(c, s));
        if (!covering.length) continue;
        incidentSweeps++;
        learnerSweeps += Math.max(...covering.map((c) => c.learners || 0));
      }
      if (!incidentSweeps) continue;
      const allowed = Math.max(1, Math.floor(window * (1 - objective)));
      perLab.push({
        labId, labTitle: labCases[0].labTitle,
        incidentSweeps, incidentMinutes: incidentSweeps * interval, learnerSweeps,
        openCases: labCases.filter((c) => c.closedSweep === null).length,
        totalCases: labCases.length,
        budget: { windowSweeps: window, allowedSweeps: allowed, usedSweeps: incidentSweeps, burnRate: +(incidentSweeps / allowed).toFixed(2) },
      });
    }
    perLab.sort((a, b) => b.learnerSweeps - a.learnerSweeps || b.incidentSweeps - a.incidentSweeps);
    return {
      fleet: {
        windowSweeps: window, sweepIntervalMinutes: interval, objective,
        incidentMinutes: perLab.reduce((s, l) => s + l.incidentMinutes, 0),
        learnerSweeps: perLab.reduce((s, l) => s + l.learnerSweeps, 0),
        labsOverBudget: perLab.filter((l) => l.budget.burnRate > 1).length,
        labsWithIncidents: perLab.length,
      },
      perLab,
    };
  }

  // Fix queue: open cases ranked by accumulated learner cost (learners x age in sweeps).
  // This is THE prioritizer — one honest number, not a vibes-based severity sort.
  function fixQueue() {
    return cases
      .filter((c) => c.closedSweep === null)
      .map((c) => ({ ...c, ageSweeps: ageOf(c), costLearnerSweeps: (c.learners || 0) * ageOf(c) }))
      .sort((a, b) => b.costLearnerSweeps - a.costLearnerSweeps || b.ageSweeps - a.ageSweeps);
  }

  // Validator trust: tier A = clean record (implicit — not listed), B = 1 confirmed validator-fault
  // case, C = repeat offender (>= 2). Only validation-bug cases count; a validator is not blamed for
  // drift or quota failures it merely reported.
  function computeTrust() {
    const validators = {};
    for (const c of cases) {
      if (!isValidatorFault(c)) continue;
      for (const vid of c.validationIds) {
        const id = `${c.labId}:${vid}`;
        const v = validators[id] = validators[id] || { validator: id, labId: c.labId, vid, cases: 0, falseFail: 0, falsePass: 0, lastSweep: 0, caseIds: [] };
        v.cases++;
        v.caseIds.push(c.caseId);
        if (c.subtype === 'false-pass') v.falsePass++; else v.falseFail++;
        v.lastSweep = Math.max(v.lastSweep, c.openedSweep);
      }
    }
    for (const v of Object.values(validators)) v.tier = v.cases >= 2 ? 'C' : 'B';
    return validators;
  }

  // Prior confirmed validator-fault cases for a validator, strictly BEFORE a sweep (so a case never
  // counts itself as its own precedent).
  function precedentFor(labId, vid, beforeSweep) {
    const cutoff = beforeSweep === undefined ? Infinity : beforeSweep;
    return cases.filter((c) => isValidatorFault(c) && c.labId === labId && c.validationIds.includes(vid) && c.openedSweep < cutoff);
  }

  // Precedent-adjusted confidence: +0.04 per prior confirmed case on the same validator, capped at
  // 0.97. Returned as a SEPARATE labeled value — the engine's deterministic confidence is never
  // mutated. Returns null when there is no precedent (no adjustment to claim).
  function adjustedConfidence(base, labId, vid, beforeSweep) {
    const prior = precedentFor(labId, vid, beforeSweep).length;
    if (!prior) return null;
    return { base, adjusted: Math.min(0.97, +(base + 0.04 * prior).toFixed(2)), priorCases: prior };
  }

  // Compact view for the API/UI layer.
  function view(opts = {}) {
    const sli = computeSli(opts);
    return {
      lastSweep,
      totals: { cases: cases.length, open: open.size, closed: cases.length - open.size },
      cases: cases.slice(-50).map((c) => ({ ...c, ageSweeps: ageOf(c) })),
      queue: fixQueue(),
      sli,
      trust: computeTrust(),
    };
  }

  return { record, computeSli, fixQueue, computeTrust, precedentFor, adjustedConfidence, view, cases };
}

module.exports = { createCaseLedger, parseKey };
