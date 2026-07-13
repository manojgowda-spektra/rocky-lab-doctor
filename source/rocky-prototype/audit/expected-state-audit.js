// Expected-State Audit — measures whether a catalog's validation definitions are rich enough to
// ground diagnosis. For each lab: step COVERAGE % (steps with >=1 validation) and RICHNESS %
// (validations whose expected{} asserts more than mere existence). Existence-only checks are the
// false-pass-prone class. Runs against any partner-API-shaped source (Digital Twin today; production
// later via {baseUrl, token}). Library + CLI.
//
// CLI: node audit/expected-state-audit.js <baseUrl> <token> <partnerGuid> [--json out.json]

const EXISTENCE_KEYS = new Set(['exists', 'running', 'deployed', 'present']);

function classifyValidation(v) {
  const keys = Object.keys(v.expected || {});
  if (!keys.length) return 'no-expected';
  const substantive = keys.filter((k) => !EXISTENCE_KEYS.has(k) || v.expected[k] !== true);
  return substantive.length ? 'rich' : 'existence-only';
}

function auditLabDefinitions(def) {
  const steps = def.steps || [];
  const validations = def.validations || [];
  const coveredSteps = new Set(validations.map((v) => v.stepGuid));
  const rich = validations.filter((v) => classifyValidation(v) === 'rich');
  const existenceOnly = validations.filter((v) => classifyValidation(v) === 'existence-only');
  return {
    labId: def.onDemandLabGuid, steps: steps.length, validations: validations.length,
    coveragePct: steps.length ? Math.round((steps.filter((s) => coveredSteps.has(s.stepGuid)).length / steps.length) * 100) : 0,
    richnessPct: validations.length ? Math.round((rich.length / validations.length) * 100) : 0,
    existenceOnly: existenceOnly.map((v) => v.validationId),
    uncoveredSteps: steps.filter((s) => !coveredSteps.has(s.stepGuid)).map((s) => s.stepGuid),
  };
}

async function runAudit({ baseUrl, token, partnerGuid, fetchImpl = fetch }) {
  const get = async (p) => {
    const r = await fetchImpl(baseUrl + p, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${p}`);
    return r.json();
  };
  const labs = await get(`/api/partners/${partnerGuid}/labs`);
  const rows = [];
  for (const meta of labs) {
    const def = await get(`/api/partners/${partnerGuid}/templates/${meta.templateGuid}/template-lab-guide-validations`);
    rows.push({ title: meta.title, ...auditLabDefinitions(def) });
  }
  const avg = (k) => Math.round(rows.reduce((s, r) => s + r[k], 0) / (rows.length || 1));
  const groundable = rows.filter((r) => r.coveragePct >= 60 && r.richnessPct >= 50).length;
  return {
    labCount: rows.length,
    avgCoveragePct: avg('coveragePct'), avgRichnessPct: avg('richnessPct'),
    groundableLabs: groundable, groundablePct: Math.round((groundable / (rows.length || 1)) * 100),
    existenceOnlyTotal: rows.reduce((s, r) => s + r.existenceOnly.length, 0),
    rows,
  };
}

if (require.main === module) {
  const [baseUrl, token, partnerGuid] = process.argv.slice(2);
  if (!baseUrl || !token || !partnerGuid) { console.error('usage: node expected-state-audit.js <baseUrl> <token> <partnerGuid>'); process.exit(1); }
  runAudit({ baseUrl, token, partnerGuid }).then((r) => {
    console.log(`\nEXPECTED-STATE AUDIT — ${r.labCount} labs`);
    console.log(`  avg step coverage : ${r.avgCoveragePct}%   (steps with >=1 validation)`);
    console.log(`  avg richness      : ${r.avgRichnessPct}%   (validations asserting more than existence)`);
    console.log(`  groundable labs   : ${r.groundableLabs}/${r.labCount} (${r.groundablePct}%)  [coverage>=60% AND richness>=50%]`);
    console.log(`  existence-only checks (false-pass-prone): ${r.existenceOnlyTotal}`);
    const worst = [...r.rows].sort((a, b) => (a.coveragePct + a.richnessPct) - (b.coveragePct + b.richnessPct)).slice(0, 5);
    console.log(`  weakest labs: ${worst.map((w) => `${w.labId}(cov ${w.coveragePct}%, rich ${w.richnessPct}%)`).join(', ')}`);
  }).catch((e) => { console.error('audit failed:', e.message); process.exit(1); });
}

module.exports = { runAudit, auditLabDefinitions, classifyValidation };
