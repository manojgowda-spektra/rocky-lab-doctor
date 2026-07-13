// CloudLabs Digital Twin — seeded synthetic fleet generator.
// Produces a "world": labs in the engine's catalog shape + per-learner expansion for the twin API +
// correlated support tickets + a GROUND-TRUTH ledger of exactly which defect classes were seeded where.
// Everything is deterministic from the seed (reproducible stress tests, no Date.now/Math.random).
//
// SIMULATED DATA ONLY — never presented as production. Field names for the API view follow the
// documented CloudLabs object model (Partner→Template→ODL→EventUser→Instance) and verbatim endpoint
// vocabulary; response payload shapes are our best documented inference (see docs/digital_twin.md).

// Engine thresholds this generator is calibrated against (labdoctor/analyze.js):
//   MIN_AFFECTED = 4 · env failRate >= 0.35 · flake: resolvedOnRetry >= 4 && hardFail < 0.25
//   clarity: meanDwell >= 1.7x median (or worst >= 3x) && maxRetries >= 3 && learners >= 4 && eventually passes
const MIN = 4;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGION_PAIRS = [['westus2', 'eastus'], ['eastus2', 'centralus'], ['westeurope', 'northeurope'], ['centralindia', 'southindia']];
const SKUS = ['Standard_D4s_v5', 'Standard_B2ms', 'Standard_E4s_v5', 'Standard_F4s_v2'];
const TOPICS = ['Deploy a Web App', 'Secure a Storage Account', 'Build a VNet Topology', 'Provision AKS', 'Configure Key Vault', 'Set up Azure Functions', 'Deploy Cosmos DB', 'Build an Event Hub Pipeline', 'Configure Load Balancer', 'Host a Container App'];
const FIRST = ['ava', 'liam', 'mia', 'noah', 'zoe', 'kai', 'ivy', 'leo', 'ana', 'raj', 'lin', 'sam'];

function makeRng(seed) { const r = mulberry32(seed); return { f: r, int: (a, b) => a + Math.floor(r() * (b - a + 1)), pick: (arr) => arr[Math.floor(r() * arr.length)] }; }

// ---- base lab skeleton: steps + validations (expected{} richness is controllable for the audit) ----
function baseLab(rng, idx, opts = {}) {
  const [expectedRegion, wrongRegion] = rng.pick(REGION_PAIRS);
  const sku = rng.pick(SKUS);
  const nSteps = rng.int(3, 5);
  const steps = [], validations = [];
  // richness: fraction of validations that carry a structured expected{} beyond existence
  const richness = opts.richness !== undefined ? opts.richness : rng.pick([0.9, 0.7, 0.5, 0.3]);
  for (let s = 1; s <= nSteps; s++) {
    const stepGuid = `S-${String(s).padStart(2, '0')}`;
    steps.push({ stepGuid, title: `Step ${s}`, instruction: s === 1 ? `Create resource group 'rg-sim${idx}' in ${expectedRegion}, then deploy a ${sku} VM.` : `Complete task ${s} of the exercise.` });
    // step 2 of some labs gets NO validation at all (audit: coverage gap)
    if (s === 2 && rng.f() < (opts.coverageGapChance !== undefined ? opts.coverageGapChance : 0.35)) continue;
    const vid = `V-${String(s).padStart(2, '0')}`;
    const rich = rng.f() < richness;
    validations.push({
      validationId: vid, stepGuid,
      description: s === 1 ? `Resource group 'rg-sim${idx}' is in region ${expectedRegion}` : `Task ${s} output is correct`,
      ...(rich ? { expected: s === 1 ? { region: expectedRegion } : { configured: true } } : { expected: { exists: true } }),
    });
  }
  return {
    labId: `SIM-${String(idx).padStart(4, '0')}`, templateGuid: `TPL-SIM-${String(idx).padStart(4, '0')}`,
    title: `${rng.pick(TOPICS)} (${idx})`, cloud: 'azure', expectedRegion, wrongRegion, sku,
    author: 'sim-author', lastAuthored: '2026-05-15',
    steps, validations, telemetry: { cohorts: [] },
  };
}

const lastStep = (lab) => lab.steps[lab.steps.length - 1].stepGuid;
const allPass = (lab, opts = {}) => lab.validations.map((v) => ({ validationId: v.validationId, status: 'passed', observed: expectedObserved(v), ...(opts.retry ? { firstAttempt: 'failed' } : {}) }));
function expectedObserved(v) { const o = {}; for (const [k, val] of Object.entries(v.expected || {})) o[k] = val; return o; }
function timings(rng, lab, base = 200) { const t = {}; for (const s of lab.steps) t[s.stepGuid] = base + rng.int(-40, 60); return t; }

// ---- scenario builders: each seeds ONE defect class calibrated to the engine's thresholds ----
const SCENARIOS = {
  healthy(rng, lab) {
    lab.telemetry.cohorts.push(
      { count: rng.int(12, 30), label: 'Completed cleanly', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: {}, validationResults: allPass(lab) },
      { count: rng.int(1, 3), label: 'Genuine learner miss', reachedStep: lab.steps[1].stepGuid, timings: timings(rng, lab), retries: {}, validationResults: [{ validationId: lab.validations.at(-1).validationId, status: 'failed', observed: {} }] },
    );
    return [];
  },
  // sub-threshold drift (< MIN learners): the engine must show RESTRAINT and not flag it
  nearMiss(rng, lab) {
    const v1 = lab.validations[0];
    lab.telemetry.cohorts.push(
      { count: rng.int(1, MIN - 2), label: 'Wrong region (tiny)', reachedStep: lab.steps[0].stepGuid, timings: timings(rng, lab), retries: {}, validationResults: [{ validationId: v1.validationId, status: 'failed', observed: { region: lab.wrongRegion } }] },
      { count: rng.int(14, 28), label: 'Completed cleanly', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: {}, validationResults: allPass(lab) },
    );
    return [];
  },
  drift(rng, lab) {
    const v1 = lab.validations[0]; const vLast = lab.validations.at(-1);
    const n = rng.int(MIN, 26);
    lab.telemetry.cohorts.push(
      { count: n, label: `Deployed to ${lab.wrongRegion}`, reachedStep: lab.steps[0].stepGuid, timings: timings(rng, lab), retries: { [v1.validationId]: 2 },
        validationResults: [
          { validationId: v1.validationId, status: 'failed', observed: { region: lab.wrongRegion } },
          { validationId: vLast.validationId, status: 'failed', observed: {} }, // downstream symptom — must be ABSORBED, not double-reported
        ],
        errors: [{ code: 'SkuNotAvailable', message: `The requested VM size '${lab.sku}' is currently not available in location '${lab.wrongRegion}' for this subscription. Please try another size or deploy to a different location.` }] },
      { count: rng.int(2, 6), label: 'Clean pass (picked region manually)', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: {}, validationResults: allPass(lab) },
    );
    return ['drift'];
  },
  falseFail(rng, lab) {
    const v = lab.validations.find((x) => Object.keys(x.expected).some((k) => k !== 'exists')) || lab.validations[0];
    lab.telemetry.cohorts.push(
      { count: rng.int(MIN, 14), label: 'Correct work, check failed anyway', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: { [v.validationId]: 3 },
        validationResults: [{ validationId: v.validationId, status: 'failed', observed: expectedObserved(v) }] },
      { count: rng.int(6, 16), label: 'Completed cleanly', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: {}, validationResults: allPass(lab) },
    );
    return ['false-fail'];
  },
  falsePass(rng, lab) {
    // needs an expected{} with a comparable value; force-rich the first validation
    lab.validations[0].expected = { region: lab.expectedRegion };
    const v = lab.validations[0];
    const wrongObserved = { region: lab.wrongRegion };
    lab.telemetry.cohorts.push(
      { count: rng.int(MIN, 22), label: 'Marked complete — but state is wrong', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: {},
        validationResults: [{ validationId: v.validationId, status: 'passed', observed: wrongObserved }, ...allPass(lab).filter((r) => r.validationId !== v.validationId)] },
      { count: rng.int(1, 3), label: 'Actually did it right', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: {}, validationResults: allPass(lab) },
    );
    return ['false-pass'];
  },
  envQuota(rng, lab) {
    const v = lab.validations[0];
    const fails = rng.int(MIN, 10);
    const passes = Math.max(1, Math.floor(fails * rng.f() * 1.5)); // keep failRate >= 0.35
    lab.telemetry.cohorts.push(
      { count: fails, label: 'Blocked by subscription quota', reachedStep: lab.steps[0].stepGuid, timings: timings(rng, lab), retries: { [v.validationId]: 2 },
        validationResults: [{ validationId: v.validationId, status: 'failed', observed: {} }],
        errors: [{ code: 'QuotaExceeded', message: `Operation could not be completed as it results in exceeding approved standardDSv5Family Cores quota (0 of 8 available) in region ${lab.expectedRegion}.` }] },
      { count: passes, label: 'Ran fine', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: {}, validationResults: allPass(lab) },
    );
    return ['env'];
  },
  flake(rng, lab) {
    lab.telemetry.cohorts.push(
      { count: rng.int(MIN, 20), label: 'Passed on retry (propagation delay)', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: { [lab.validations[0].validationId]: 1 },
        validationResults: [{ validationId: lab.validations[0].validationId, status: 'passed', observed: expectedObserved(lab.validations[0]), firstAttempt: 'failed' }, ...allPass(lab).slice(1)] },
      { count: rng.int(8, 18), label: 'Completed cleanly', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: {}, validationResults: allPass(lab) },
    );
    return ['flake'];
  },
  clarity(rng, lab) {
    const slowStep = lab.steps[Math.min(2, lab.steps.length - 1)].stepGuid;
    const vOnStep = lab.validations.find((v) => v.stepGuid === slowStep) || lab.validations.at(-1);
    const t1 = timings(rng, lab); t1[slowStep] = rng.int(1200, 1900); // >= 3x the ~200s median
    lab.telemetry.cohorts.push(
      { count: rng.int(MIN, 14), label: 'Struggled then succeeded', reachedStep: lastStep(lab), timings: t1, retries: { [vOnStep.validationId]: rng.int(3, 5) }, validationResults: allPass(lab) },
      { count: rng.int(6, 14), label: 'No trouble', reachedStep: lastStep(lab), timings: timings(rng, lab), retries: {}, validationResults: allPass(lab) },
    );
    return ['clarity'];
  },
  newDeprecated(rng, lab) {
    lab.telemetry.cohorts = []; // zero telemetry — a brand-new lab; only the pre-launch lint can see it
    lab.steps[1].instruction = `Deploy a text-embedding-ada-002 model and connect it to the app.`;
    return ['deprecated-content'];
  },
  compound(rng, lab) {
    const gt = [...SCENARIOS.drift(rng, lab), ...SCENARIOS.falsePass(rng, lab)];
    return gt;
  },
};

// per-learner expansion for the twin API (production serves per-learner rows; cohorts are our engine's shape)
function expandLearners(rng, lab) {
  const learners = [];
  let i = 0;
  for (const c of lab.telemetry.cohorts) {
    for (let k = 0; k < (c.count || 0); k++) {
      i++;
      const name = `${rng.pick(FIRST)}${rng.int(100, 999)}`;
      learners.push({
        eventUserId: `EU-${lab.labId}-${String(i).padStart(3, '0')}`,
        email: `${name}@sim.example.com`, cohortLabel: c.label,
        reachedStep: c.reachedStep, timings: c.timings || {}, retries: c.retries || {},
        validationResults: (c.validationResults || []).map((r) => ({ ...r })),
        deploymentLog: (c.errors || []).map((e) => ({ level: 'error', code: e.code, message: e.message, stage: 'deploy' })),
        deploymentId: `DID-${rng.int(100000, 999999)}`,
        status: c.reachedStep === lastStep(lab) ? 'Succeeded' : 'Active',
      });
    }
  }
  return learners;
}

const TICKET_TEXT = {
  drift: 'My deployment keeps failing with SkuNotAvailable — the lab says one region but nothing deploys.',
  'false-fail': "I did the step exactly as written but the validation keeps saying failed.",
  env: 'I get a quota exceeded error the moment I try to deploy — nothing I do helps.',
  'false-pass': null, // by definition: silent — nobody complains about a passing check
  clarity: "I'm stuck on this step, the instructions don't match what I see.",
  noise: 'I forgot my password / how do I restart the lab timer?',
};
function makeTickets(rng, lab, groundTruth) {
  const tickets = [];
  let t = 0;
  for (const cls of groundTruth) {
    const text = TICKET_TEXT[cls];
    if (!text) continue;
    const n = rng.int(1, 4);
    for (let k = 0; k < n; k++) tickets.push({ ticketId: `SIMT-${lab.labId}-${++t}`, labId: lab.labId, stepGuid: lab.steps[0].stepGuid, class_hint: cls, text, simulated: true });
  }
  if (rng.f() < 0.3) tickets.push({ ticketId: `SIMT-${lab.labId}-${++t}`, labId: lab.labId, stepGuid: null, class_hint: 'noise', text: TICKET_TEXT.noise, simulated: true });
  return tickets;
}

// ---- public: generate a world ----
// mix: {scenarioName: count}; opts: {seed, payloadRichness: 'rich'|'passfail'}
function generateWorld(mix, opts = {}) {
  const seed = opts.seed || 42;
  const rng = makeRng(seed);
  const labs = [], groundTruth = {}, learnersByLab = {}, tickets = [];
  let idx = 0;
  for (const [name, count] of Object.entries(mix)) {
    if (!SCENARIOS[name]) throw new Error(`unknown scenario: ${name}`);
    for (let k = 0; k < count; k++) {
      idx++;
      const lab = baseLab(rng, idx, opts);
      const gt = SCENARIOS[name](rng, lab);
      // payloadRichness 'passfail': strip observed{} from all results — the documented worst-case
      // production payload (unverified richness). Tests which classifiers survive that world.
      if (opts.payloadRichness === 'passfail') for (const c of lab.telemetry.cohorts) for (const r of c.validationResults || []) delete r.observed;
      lab._scenario = name;
      labs.push(lab);
      groundTruth[lab.labId] = gt;
      learnersByLab[lab.labId] = expandLearners(rng, lab);
      tickets.push(...makeTickets(rng, lab, gt));
    }
  }
  return { simulated: true, seed, partnerGuid: 'SIM-PARTNER-0001', labs, groundTruth, learnersByLab, tickets };
}

// ---- world evolution (for continuous-monitoring simulation) ----
// Replace a lab's current telemetry window with a new scenario's output — "the fleet changed between
// sweeps". Ground truth and per-learner expansion stay in sync so monitors can be scored exactly.
function injectScenario(world, labId, scenarioName, seed) {
  const lab = world.labs.find((l) => l.labId === labId);
  if (!lab) throw new Error(`unknown lab ${labId}`);
  if (!SCENARIOS[scenarioName]) throw new Error(`unknown scenario ${scenarioName}`);
  const rng = makeRng((seed || world.seed) + labId.split('').reduce((s, c) => s + c.charCodeAt(0), 0));
  lab.telemetry.cohorts = [];
  const gt = SCENARIOS[scenarioName](rng, lab);
  lab._scenario = scenarioName;
  world.groundTruth[labId] = gt;
  world.learnersByLab[labId] = expandLearners(rng, lab);
  return gt;
}
const healLab = (world, labId, seed) => injectScenario(world, labId, 'healthy', seed);

module.exports = { generateWorld, SCENARIOS, makeRng, injectScenario, healLab };
