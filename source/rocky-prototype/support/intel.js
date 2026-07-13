// Support Intelligence v1 — deterministic triage over tickets + engine findings.
// Three capabilities, all evidence-backed and LLM-free (the engine asserts; narration can be added later):
//   1. classifyTicket : ticket text + the lab's diagnosed findings -> defect class + matched finding
//   2. buildLedger    : tickets -> ticket→lab→step ledger rows (the support baseline that has never existed)
//   3. collapseIncidents : open tickets -> root-cause incidents ("N tickets ← 1 broken lab", the volume killer)
//   4. buildPacket    : one ticket -> the auto-assembled, redacted support packet (diagnosis + evidence + fix draft)
//
// Data sources are injected: today the Digital Twin (simulated tickets, clearly labeled), later a real
// ticket export — the swap is a loader, not a rewrite.

const { redact } = require('../src/redact');

// Deterministic text signals. Deliberately conservative: a signal only *suggests*; confirmation comes
// from the lab actually having a matching engine finding. Text alone never asserts a lab defect.
const TEXT_SIGNALS = [
  { re: /SkuNotAvailable|not available in (the )?(location|region)|wrong region|region.*(fail|error)/i, cls: 'drift' },
  { re: /quota|exceeding|QuotaExceeded|capacity/i, cls: 'env' },
  { re: /did (the|this) step exactly|keeps? saying failed|validation.*(fail|red).*(but|even though)|marked (as )?incomplete/i, cls: 'false-fail' },
  { re: /stuck|instructions? (don'?t|do not) match|confusing|can'?t find/i, cls: 'clarity' },
  { re: /password|restart the lab|timer|extend|login|sign.?in/i, cls: 'account-noise' },
];

const FINDING_CLASS = (f) => f.type === 'drift' ? 'drift'
  : f.subtype === 'false-pass' ? 'false-pass'
  : f.type === 'validation-bug' ? 'false-fail'
  : f.type === 'env-permission' ? 'env'
  : f.type === 'guide-clarity' ? 'clarity'
  : f.type === 'transient' ? 'flake' : f.type;

// 1. ---- classify one ticket against the lab's engine report ----
function classifyTicket(ticket, labReport) {
  const text = ticket.text || '';
  const signal = TEXT_SIGNALS.find((s) => s.re.test(text));
  const findings = (labReport && labReport.findings) || [];
  const loud = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');

  if (signal && signal.cls === 'account-noise') {
    return { disposition: 'not-lab-related', class: 'noise', matchedFindingId: null, confidence: 0.9, reason: 'account/administrative request; no lab defect implicated' };
  }
  // strongest case: text signal AND a matching engine finding => confirmed lab defect
  if (signal) {
    const match = loud.find((f) => FINDING_CLASS(f) === signal.cls) || findings.find((f) => FINDING_CLASS(f) === signal.cls);
    if (match) return { disposition: 'lab-defect', class: signal.cls, matchedFindingId: match.id, confidence: 0.9, reason: `ticket text matches ${signal.cls} signal AND the fleet diagnosis confirms an active ${signal.cls} finding on this lab` };
    return { disposition: 'needs-review', class: signal.cls, matchedFindingId: null, confidence: 0.5, reason: `ticket text suggests ${signal.cls} but the fleet shows no matching finding — could be learner-specific` };
  }
  // no text signal but the lab IS diagnosed broken => probably the same root cause, needs eyes
  if (loud.length) {
    return { disposition: 'likely-lab-defect', class: FINDING_CLASS(loud[0]), matchedFindingId: loud[0].id, confidence: 0.6, reason: `no clear text signal, but this lab has an active ${FINDING_CLASS(loud[0])} finding affecting ${loud[0].affectedLearners} learners` };
  }
  return { disposition: 'learner-support', class: 'unclassified', matchedFindingId: null, confidence: 0.4, reason: 'no defect signal in text and the lab is healthy per fleet diagnosis' };
}

// 2. ---- the ledger: every ticket becomes a tagged row (the baseline) ----
function buildLedger(tickets, reportsByLab) {
  return tickets.map((t) => {
    const c = classifyTicket(t, reportsByLab[t.labId]);
    return { ticketId: t.ticketId, labId: t.labId, stepGuid: t.stepGuid || null, ...c, simulated: !!t.simulated };
  });
}

// 3. ---- incident collapse: open tickets grouped by root-cause finding ----
function collapseIncidents(ledger, reportsByLab) {
  const groups = new Map();
  let attached = 0;
  for (const row of ledger) {
    if (!row.matchedFindingId) continue;
    attached++;
    if (!groups.has(row.matchedFindingId)) {
      const rep = reportsByLab[row.labId];
      const f = rep.findings.find((x) => x.id === row.matchedFindingId);
      groups.set(row.matchedFindingId, { findingId: f.id, labId: row.labId, class: FINDING_CLASS(f), title: f.title, affectedLearners: f.affectedLearners, draftFix: f.draftFix && f.draftFix.summary, tickets: [] });
    }
    groups.get(row.matchedFindingId).tickets.push(row.ticketId);
  }
  const incidents = [...groups.values()].sort((a, b) => b.tickets.length - a.tickets.length);
  return { incidents, stats: { tickets: ledger.length, attachedToRootCause: attached, incidents: incidents.length, collapseRatio: incidents.length ? +(attached / incidents.length).toFixed(1) : 0 } };
}

// 4. ---- the support packet: everything an agent needs, assembled and redacted ----
function buildPacket(ticket, labReport, learner) {
  const c = classifyTicket(ticket, labReport);
  const finding = c.matchedFindingId && labReport.findings.find((f) => f.id === c.matchedFindingId);
  const packet = {
    ticketId: ticket.ticketId, labId: ticket.labId, labTitle: labReport.title,
    labHealth: { score: labReport.score, status: labReport.status, completionRate: labReport.completionRate },
    triage: c,
    finding: finding ? { id: finding.id, title: finding.title, severity: finding.severity, evidence: finding.evidence, affectedLearners: finding.affectedLearners, draftFix: finding.draftFix } : null,
    learner: learner ? {
      eventUserId: learner.eventUserId,
      failingValidations: (learner.validationResults || []).filter((r) => r.status === 'failed').map((r) => r.validationId),
      deploymentErrors: (learner.deploymentLog || []).filter((e) => e.level === 'error').map((e) => `${e.code}: ${e.message}`),
      reachedStep: learner.reachedStep,
    } : null,
    suggestedResponse: finding
      ? `Known issue on this lab (${FINDING_CLASS(finding)}, affecting ${finding.affectedLearners} learners). Root cause: ${finding.title}. Fix draft is with the author. Advise the learner: this is not their error.`
      : c.disposition === 'not-lab-related' ? 'Administrative request — route to account support.'
      : 'No fleet-level defect found — investigate as learner-specific; packet contains their validation state.',
    provenance: { generatedBy: 'support/intel.js (deterministic)', dataSource: ticket.simulated ? 'SIMULATED (digital twin)' : 'production', redacted: true },
  };
  return redact(packet);
}

module.exports = { classifyTicket, buildLedger, collapseIncidents, buildPacket, FINDING_CLASS };
