// Lab Doctor — pre-launch lint for brand-new (zero-telemetry) labs.
//
// This used to also include a 12-type "Synthetic Learner Probe" (an LLM asked to guess where a lab
// would break from spec text alone) and an "Ask Lab Doctor" conversational console. Both were cut by a
// complexity audit (docs/rocky_complexity_audit.md): only 2 of the 12 finding types were deterministic
// (retired-SKU / deprecated-command token matching); the other 10 were uncalibrated LLM speculation that
// looked identical in the UI to real, telemetry-backed findings, and — once a lab has real telemetry —
// were structurally worse than doing nothing, since they competed with better evidence for the same
// triage attention. Ask Lab Doctor was cut because everything it could say was already on screen; it
// added an LLM call, a prompt-injection surface, and zero validated user demand.
//
// What's left is a cheap, deterministic lint: token-match a lab's guide/validator text against a known
// retired-SKU / deprecated-command list. It runs ONLY for labs with zero learner telemetry yet (there's
// no better evidence to compete with there). No LLM call, no speculation, no confidence score to
// calibrate — either the lab hardcodes a token that's already announced dead, or it doesn't.

const { labTags } = require('./analyze');
const DEPREC = require('./azure-deprecations.json');

function specText(lab) {
  return [(lab.steps || []).map((s) => `${s.title} ${s.instruction} ${s.expectedOutcome}`).join(' '),
    (lab.validations || []).map((v) => `${v.description} ${JSON.stringify(v.expected)}`).join(' ')].join(' ');
}
function skuStep(lab, token) { const s = (lab.steps || []).find((x) => (x.instruction || '').indexOf(token) !== -1); return s ? s.stepGuid : 'spec'; }

function deterministicProbe(lab) {
  const text = specText(lab); const out = [];
  // match retired SKU tokens, but drop any token that is a substring of a longer matched token
  // (so "Standard_NC6" doesn't also fire inside "Standard_NC6s_v3").
  const skuHits = (DEPREC.retiredSkus || []).filter((s) => text.indexOf(s.token) !== -1);
  const skus = skuHits.filter((s) => !skuHits.some((o) => o !== s && o.token.indexOf(s.token) !== -1));
  for (const s of skus) out.push({
    type: 'RETIRED_SKU_TOKEN', ref: skuStep(lab, s.token), quotedTrigger: s.token, confidence: 0.93,
    title: `Guide hardcodes ${s.token}, a retired ${s.family} size that no longer provisions`,
    reasoning: `Token match: ${s.token} was retired ${s.retired} (replacement: ${s.replacement}). ${s.note}`,
    draftFix: `Replace ${s.token} with a supported size (${s.replacement}) and re-verify region availability.`,
  });
  for (const c of DEPREC.deprecatedCommands || []) if (text.indexOf(c.token) !== -1) out.push({
    type: 'DEPRECATED_DEPENDENCY', ref: 'spec', quotedTrigger: c.token, confidence: 0.86,
    title: `Guide targets "${c.token}" — ${c.removed ? 'removed' : 'on Azure\'s announced retirement path'}`,
    reasoning: `Token match: "${c.token}" — ${c.removed ? `removed ${c.removed}` : c.deprecated}. ${c.note}`,
    draftFix: `Replace "${c.token}" with "${c.replacement}".`,
  });
  return out.map((f) => normalize(f, lab));
}

function normalize(f, lab) {
  return {
    id: `${lab.labId}-LINT-${Math.abs(hash(f.quotedTrigger))}`,
    type: f.type, severity: f.confidence >= 0.9 ? 'high' : 'medium',
    mode: 'predicted', evidenceType: 'PREDICTED', source: 'pre-launch-lint',
    title: f.title, stepGuid: f.ref, validationIds: [],
    affectedLearners: 0, affectedFraction: 0, confidence: f.confidence,
    quotedTrigger: f.quotedTrigger,
    evidence: [`${f.reasoning}`, `Anchored to spec text: "${f.quotedTrigger}"`],
    draftFix: { target: 'guide', ref: f.ref, summary: 'Pre-launch lint — a deterministic token match, not a model guess.', before: '', after: f.draftFix, rationale: 'This token is already publicly announced retired/deprecated — flag it before the first learner walks into it.' },
    provenance: { dataSource: 'deterministic token match against labdoctor/azure-deprecations.json — no LLM, no telemetry', evidenceType: 'PREDICTED', fixIsDraftOnly: true, humanApprovalRequired: true },
  };
}

// Only meaningful for labs with zero learner telemetry — once a lab has real fleet data, that data is
// strictly better evidence than a lint pass, and running this alongside it would compete for attention.
async function probeLab(lab) {
  const meta = { labId: lab.labId, title: lab.title, ranBy: 'pre-launch-lint' };
  const t = labTags(lab);
  if (t.learners > 0) {
    return { ...meta, findings: [], skipped: true, reason: 'This lab already has learner telemetry — the fleet detector (real evidence) covers it; the pre-launch lint is for brand-new labs only.' };
  }
  return { ...meta, findings: deterministicProbe(lab), source: 'deterministic' };
}

function hash(s) { let h = 0; for (let i = 0; i < String(s).length; i++) { h = (h * 31 + String(s).charCodeAt(i)) | 0; } return h; }

module.exports = { probeLab, deterministicProbe };
