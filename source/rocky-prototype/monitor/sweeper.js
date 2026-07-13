// Continuous Fleet Monitor — the time dimension for Lab Doctor.
// Each sweep analyzes the whole fleet, diffs against the previous sweep, and emits ALERTS only on
// CHANGES (regression / recovery / platform-incident). No change => silence: an idempotent monitor
// that never cries wolf on a steady state. Detection latency (MTTD in sweeps) falls out of the
// history and is scored against seeded ground truth in test/monitor.test.js.
//
// Deterministic, source-agnostic: labs come from anywhere (twin adapter today, production later);
// the monitor only sees engine reports.

const { analyzeLab } = require('../labdoctor/analyze');

// A lab's condition signature: the set of loud finding identities (stable across sweeps for the
// same underlying defect — keyed by type/subtype/validations, NOT by finding id which is per-run).
function conditionOf(rep) {
  const loud = rep.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const keyed = loud
    .map((f) => ({
      key: `${f.type}${f.subtype ? ':' + f.subtype : ''}|${(f.validationIds || []).join(',')}`,
      meta: { title: f.title, learners: f.affectedLearners || 0, signature: f.signature || null, severity: f.severity, confidence: f.confidence },
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  const keyMeta = {};
  for (const k of keyed) keyMeta[k.key] = k.meta;
  return {
    status: rep.status, score: rep.score,
    keys: keyed.map((k) => k.key),
    keyMeta, // per-key finding facts — consumed by the reliability ledger (ledger/ledger.js)
    signatures: loud.map((f) => f.signature).filter(Boolean),
    loud,
  };
}

function createMonitor() {
  const history = []; // [{sweepId, at, perLab: {labId: condition-lite}, alerts}]
  let prev = null;

  function sweep(labs, sweepId) {
    const perLab = {}, alerts = [];
    const newSignatures = new Map(); // signature -> [labIds] appearing NEW this sweep

    for (const lab of labs) {
      const rep = analyzeLab(lab);
      const cond = conditionOf(rep);
      perLab[lab.labId] = { status: cond.status, score: cond.score, keys: cond.keys, keyMeta: cond.keyMeta, title: rep.title };

      const was = prev && prev.perLab[lab.labId];
      const newKeys = cond.keys.filter((k) => !was || !was.keys.includes(k));
      const clearedKeys = was ? was.keys.filter((k) => !cond.keys.includes(k)) : [];

      if (newKeys.length) {
        const newLoud = cond.loud.filter((f) => newKeys.includes(`${f.type}${f.subtype ? ':' + f.subtype : ''}|${(f.validationIds || []).join(',')}`));
        alerts.push({
          // regression = a lab with NO loud findings developed one; tier labels (watch/broken) are
          // score cosmetics — change semantics live on the finding set, not the tier.
          type: was && was.keys.length === 0 ? 'regression' : 'new-finding',
          sweepId, labId: lab.labId, labTitle: rep.title,
          detail: newLoud.map((f) => f.title).join(' · '),
          classes: newLoud.map((f) => f.subtype || f.type),
          affectedLearners: newLoud.reduce((s, f) => s + (f.affectedLearners || 0), 0),
          scoreBefore: was ? was.score : null, scoreAfter: cond.score,
        });
        for (const f of newLoud) if (f.signature) {
          if (!newSignatures.has(f.signature)) newSignatures.set(f.signature, []);
          newSignatures.get(f.signature).push(lab.labId);
        }
      }
      // recovery = all loud findings cleared (same finding-set semantics as regression)
      if (was && was.keys.length > 0 && cond.keys.length === 0) {
        alerts.push({ type: 'recovery', sweepId, labId: lab.labId, labTitle: rep.title, detail: `recovered — cleared: ${clearedKeys.join(' ; ')}`, scoreBefore: was.score, scoreAfter: cond.score });
      }
    }

    // Platform incident: the SAME root-cause signature appearing NEW in >= 2 labs in one sweep —
    // that's a platform-level change, not per-lab rot. Individual alerts are folded into one.
    for (const [sig, labIds] of newSignatures) {
      if (labIds.length < 2) continue;
      const folded = alerts.filter((a) => labIds.includes(a.labId) && (a.type === 'regression' || a.type === 'new-finding'));
      for (const a of folded) a.foldedInto = sig;
      alerts.push({
        type: 'platform-incident', sweepId, signature: sig, labIds,
        detail: `same root cause hit ${labIds.length} labs in one sweep (${sig}) — platform-level change, one incident, not ${labIds.length}`,
        affectedLearners: folded.reduce((s, a) => s + (a.affectedLearners || 0), 0),
      });
    }

    const snapshot = { sweepId, perLab, alerts, broken: Object.values(perLab).filter((l) => l.status === 'broken').length, labCount: labs.length };
    history.push(snapshot);
    prev = snapshot;
    return snapshot;
  }

  // MTTD in sweeps for a lab that regressed: sweeps between the first sweep whose data contained the
  // defect and the sweep that alerted. With per-sweep analysis this is 0 by construction — the metric
  // matters when sweeps are scheduled: MTTD_wallclock = detection sweep interval. Exposed for scoring.
  function detectionSweep(labId, type) {
    for (const snap of history) {
      const hit = snap.alerts.find((a) => a.labId === labId && (!type || (a.classes || []).includes(type) || a.type === type));
      if (hit) return snap.sweepId;
    }
    return null;
  }

  return { sweep, detectionSweep, history };
}

module.exports = { createMonitor, conditionOf };
