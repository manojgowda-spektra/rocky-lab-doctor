// Rocky P1 engine — grounded, lab-aware diagnosis.
// Deterministic logic over real lab data (no LLM required). Findings-driven and
// extensible: add an entry to ERROR_RULES or FINDING_EXPLAINERS to support a new case.

const { redact } = require('./redact');

// ---- Input validation (fail gracefully, never crash on bad data) ----
class ContextError extends Error {}

function validateContext(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new ContextError('context must be an object');
  if (!ctx.lab || !ctx.lab.title) throw new ContextError('context.lab.title is required');
  ctx.validations = Array.isArray(ctx.validations) ? ctx.validations : [];
  ctx.deploymentActivityLog = Array.isArray(ctx.deploymentActivityLog) ? ctx.deploymentActivityLog : [];
  return ctx;
}

// ---- Cloud error signatures → classification ----
const ERROR_RULES = [
  {
    code: 'SkuNotAvailable',
    match: /SkuNotAvailable|not available in location/i,
    classify: (log) => {
      const m = (log.message || '').match(/location '([^']+)'/i);
      return { kind: 'sku-region', actualRegion: m ? m[1] : null };
    },
  },
  { code: 'QuotaExceeded', match: /Quota.*exceeded|exceeding (approved )?quota/i, classify: () => ({ kind: 'quota' }) },
  { code: 'AuthorizationFailed', match: /AuthorizationFailed|does not have authorization/i, classify: () => ({ kind: 'authz' }) },
  { code: 'LicenseError', match: /license|not licensed|MarketplacePurchaseRequired|terms.*not.*accepted|subscription not registered/i, classify: () => ({ kind: 'license' }) },
];

function findLogErrors(ctx) {
  const out = [];
  for (const entry of ctx.deploymentActivityLog) {
    if (entry.level !== 'error') continue;
    const rule = ERROR_RULES.find((r) => r.match.test(entry.code || '') || r.match.test(entry.message || ''));
    out.push({ entry, rule: rule || null, extra: rule ? rule.classify(entry) : { kind: 'unknown' } });
  }
  return out;
}

// ---- Core analysis: correlate validations + log + lab intent into findings ----
function analyze(rawCtx) {
  const ctx = validateContext(redact(rawCtx)); // SC-005: redact before any reasoning/logging
  const failed = ctx.validations.filter((v) => v.status === 'failed');
  const logErrors = findLogErrors(ctx);
  const findings = [];

  // Region mismatch: failed validation whose observed region != expected region.
  const regionMiss = failed.find(
    (v) => v.observed?.region && v.expected?.region && v.observed.region !== v.expected.region
  );
  if (regionMiss) {
    findings.push({
      type: 'region-mismatch', severity: 'root-cause',
      expected: regionMiss.expected.region, actual: regionMiss.observed.region,
      evidence: [`Validation ${regionMiss.validationId} ("${regionMiss.description}") = FAILED`],
    });
  }

  for (const le of logErrors) {
    if (le.extra.kind === 'sku-region') {
      const inWrongRegion = !!(regionMiss && le.extra.actualRegion === regionMiss.observed.region);
      findings.push({
        type: 'sku-not-available', severity: inWrongRegion ? 'symptom-of-region' : 'root-cause',
        actualRegion: le.extra.actualRegion, expectedRegion: ctx.lab.expectedRegion,
        correlatedWith: inWrongRegion ? 'region-mismatch' : null,
        evidence: [`Deployment log: ${le.entry.code} — ${le.entry.message}`],
      });
    } else if (le.extra.kind === 'quota') {
      findings.push({ type: 'quota-exceeded', severity: 'root-cause', reportable: true, evidence: [`Deployment log: ${le.entry.code} — ${le.entry.message}`] });
    } else if (le.extra.kind === 'authz') {
      findings.push({ type: 'authorization-failed', severity: 'root-cause', reportable: true, evidence: [`Deployment log: ${le.entry.code} — ${le.entry.message}`] });
    } else if (le.extra.kind === 'license') {
      findings.push({ type: 'license-issue', severity: 'root-cause', reportable: true, evidence: [`Deployment log: ${le.entry.code} — ${le.entry.message}`] });
    }
  }

  // Generic: failed validations not already explained by a specific finding.
  if (!findings.length && failed.length) {
    findings.push({
      type: 'validation-failed', severity: 'info',
      validations: failed.map((v) => v.validationId),
      evidence: failed.map((v) => `${v.validationId} "${v.description}" = FAILED`),
    });
  }

  return { ctx, findings, failedCount: failed.length };
}

// ---- Scaffolded explanations per finding type (ADR-003 / PC-002) ----
const FINDING_EXPLAINERS = {
  'region-mismatch': (f, ctx, level, peers) => {
    const sku = peers.find((p) => p.type === 'sku-not-available');
    const head = sku
      ? `This lab ("${ctx.lab.title}") expects everything in **${f.expected}**, but your resources are in **${f.actual}** — and the VM size this lab uses isn't offered in ${f.actual}, which is exactly why the deployment failed. The SkuNotAvailable error is a *symptom* of the wrong region, not a VM-size problem.`
      : `This lab expects resources in **${f.expected}**, but yours are in **${f.actual}**.`;
    const scaffold = {
      hint: `\nHint: Don't change the VM size. Check **Step 1** — which region did the lab specify, and does your resource group match it?`,
      guided: `\nGuided: Region is fixed when you create the resource group. Yours is in ${f.actual}; the lab needs ${f.expected}. You'll recreate it in the right region rather than tweak the VM size.`,
      answer: `\nFix: Delete the resources in ${f.actual}, recreate the resource group in **${f.expected}**, then redeploy. Keep the VM size as specified — it's available in ${f.expected}.`,
    };
    return head + (scaffold[level] || scaffold.hint);
  },
  'quota-exceeded': (f, ctx, level) => `Your deployment hit a **quota limit**.` + (level === 'answer'
    ? ` Fix: request a quota increase for the affected resource/region, or free unused resources, then redeploy.`
    : ` Hint: check which resource/region the log says exceeded quota before retrying.`),
  'authorization-failed': (f, ctx, level) => `The deployment failed on a **permissions/authorization** error.` + (level === 'answer'
    ? ` Fix: ensure your lab account has the required role on the target scope; the lab's setup step usually grants this. If it persists, I can report it to the technical team.`
    : ` Hint: re-check the lab's setup/permission step — something the lab expected to be granted isn't.`),
  'license-issue': (f, ctx, level) => `This looks like a **licensing / marketplace** issue — the resource needs a license or accepted marketplace terms that aren't in place.` + (level === 'answer'
    ? ` Fix: accept the offer's marketplace terms (or have an admin enable the license/SKU) for your subscription, then redeploy. If that doesn't clear it, this usually needs the technical team — I can file a report with the details.`
    : ` Hint: this is rarely something you can fix from the lab steps alone — check whether the lab expected a license/marketplace term to be pre-accepted. I can escalate it if needed.`),
  'validation-failed': (f, ctx) => `Some checks haven't passed yet (${f.validations.join(', ')}). Tell me which step you're on and I'll check what's expected vs. your current state.`,
};

const SEVERITY_ORDER = { 'root-cause': 0, 'symptom-of-region': 1, info: 2 };

function respond(rawCtx, level = 'hint') {
  let analysis;
  try {
    analysis = analyze(rawCtx);
  } catch (e) {
    if (e instanceof ContextError) return `I couldn't read the lab context (${e.message}). Tell me which lab and step you're on.`;
    throw e;
  }
  const { ctx, findings } = analysis;
  if (!findings.length) {
    return `I don't see a failed validation or deployment error to ground a specific fix in yet. Tell me which step you're on and I'll check your lab state.`;
  }
  // Lead with the most actionable root cause.
  const primary = [...findings].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))[0];
  const explainer = FINDING_EXPLAINERS[primary.type];
  const body = explainer ? explainer(primary, ctx, level, findings) : `Issue detected: ${primary.type}.`;
  const evidence = findings.flatMap((f) => f.evidence || []);
  return `${body}\n\n(Grounded in: ${evidence.join(' | ')})`;
}

// Generic AI baseline: blind to lab intent + learner state → plausible-but-lab-breaking advice.
function genericBaseline() {
  return (
    `SkuNotAvailable means the VM size you picked isn't offered in your selected region. ` +
    `Easiest fixes: (1) choose a smaller/different VM size that's available, or (2) try another region. ` +
    `Since you asked — yes, picking a smaller VM size will usually get past this error.`
  );
}

module.exports = { analyze, respond, genericBaseline, validateContext, ContextError, ERROR_RULES };
