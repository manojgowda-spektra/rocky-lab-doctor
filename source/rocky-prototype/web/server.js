// Rocky Web — tiny zero-dependency server. Serves the animated UI and proxies
// chat to the agent (so the model key stays server-side). Run: node web/server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const { FixtureContextProvider } = require('../src/contextProvider');
const { Conversation } = require('../src/conversation');
const { handleTurn } = require('../src/agent');
const { analyze } = require('../src/rocky');
const { analyzeLab, analyzeCatalog, enrichFinding, simulatePostFixOutcome, observedMatchesExpected } = require('../labdoctor/analyze');
const { probeLab } = require('../labdoctor/intel');
const { generateWorld, injectScenario, healLab } = require('../sim/fleetgen');
const { buildLedger, collapseIncidents, buildPacket } = require('../support/intel');
const { createMonitor } = require('../monitor/sweeper');
const { createCaseLedger } = require('../ledger/ledger');
const { buildCampaignPlan } = require('../labdoctor/campaigns');
const { buildAmnestyPacket, executeAmnesty, reconcileAmnesty } = require('../action/amnesty');
const { redact } = require('../src/redact');
const { isConfigured, provider, chat } = require('../src/llm');

const PORT = Number(process.env.PORT || process.env.ROCKY_PORT || 5173); // App Service injects PORT
const LIVE_DATA = process.env.ROCKY_LIVE === '1'; // false on the fixture demo — gates Rocky from asserting mock data as the user's real, verified state
const PUBLIC = path.join(__dirname, 'public');
const REPORTS = path.join(__dirname, '..', 'logs', 'reports.jsonl');

// Where the real production lab repos live on the demo machine (env-overridable for other hosts).
const REAL_LABS_DIR = process.env.REAL_LABS_DIR || 'C:/Users/ManojGowda/OneDrive - Spektra Systems LLC/Desktop/Labs';
const SCAN_FILE = path.join(__dirname, '..', 'labdoctor', 'real-scan-results.json');
function loadRealScan() { try { return JSON.parse(fs.readFileSync(SCAN_FILE, 'utf8')); } catch { return null; } }

// Lazy singleton for the support-intel demo world (SIMULATED, deterministic seed).
let _supportWorld = null;
function supportWorld() {
  if (_supportWorld) return _supportWorld;
  const world = generateWorld({ healthy: 6, drift: 6, falseFail: 6, envQuota: 6, clarity: 6, falsePass: 4 }, { seed: 42 });
  const reports = Object.fromEntries(world.labs.map((l) => [l.labId, analyzeLab(l)]));
  const ledger = buildLedger(world.tickets, reports);
  const collapse = collapseIncidents(ledger, reports);
  _supportWorld = { world, reports, ledger, collapse, seed: 42 };
  return _supportWorld;
}

// Continuous-monitoring demo world (SIMULATED): a scripted fleet timeline advanced sweep-by-sweep.
// The script mirrors test/monitor.test.js: silent break -> platform event -> steady -> recovery.
let _mon = null;
function monitorState() {
  if (_mon) return _mon;
  const world = generateWorld({ healthy: 10 }, { seed: 77, coverageGapChance: 0 });
  const ids = world.labs.map((l) => l.labId);
  const script = {
    3: [{ ev: 'inject', lab: ids[0], scenario: 'falsePass', note: 'a validation silently starts passing wrong work' }],
    4: [{ ev: 'platform', labs: ids.slice(1, 5), scenario: 'drift', note: 'one region/SKU change hits 4 labs at once' }],
    6: [{ ev: 'heal', lab: ids[1], note: 'author merges the drafted fix' }],
    8: [{ ev: 'inject', lab: ids[6], scenario: 'envQuota', note: 'subscription quota exhausts' }],
  };
  _mon = { world, ids, monitor: createMonitor(), caseLedger: createCaseLedger(), sweep: 0, script, log: [] };
  return _mon;
}
function monitorAdvance() {
  const m = monitorState();
  m.sweep++;
  for (const e of (m.script[m.sweep] || [])) {
    if (e.ev === 'inject') injectScenario(m.world, e.lab, e.scenario, m.sweep * 100);
    else if (e.ev === 'heal') healLab(m.world, e.lab, m.sweep * 100);
    else if (e.ev === 'platform') for (const id of e.labs) {
      const lab = m.world.labs.find((l) => l.labId === id);
      lab.expectedRegion = 'westus2'; lab.wrongRegion = 'eastus'; lab.sku = 'Standard_D4s_v5';
      injectScenario(m.world, id, 'drift', m.sweep * 100);
    }
    m.log.push({ sweep: m.sweep, note: e.note });
  }
  const snap = m.monitor.sweep(m.world.labs, m.sweep);
  m.caseLedger.record(snap); // reliability ledger: cases/SLI/trust derive from the same sweeps
  return snap;
}

// ---- FALSE-FAIL AMNESTY demo (SIMULATED, in-process mirror of the platform WRITE endpoint) ----
// A validator regresses into failing correct work; the reliability ledger confirms a fleet case;
// the amnesty engine drafts exactly who gets their verdict restored under five gates. Execution
// writes through an IN-PROCESS writer that mutates the twin world — a faithful mirror of the unused
// production PUT endpoint, never production itself. Production execution stays gated on the spike.
// Everything here is labeled SIMULATED; the same action/amnesty.js code runs in the tests over real HTTP.
let _amnesty = null;
function amnestyScenario() {
  if (_amnesty) return _amnesty;
  const world = generateWorld({ healthy: 8 }, { seed: 91, coverageGapChance: 0 });
  const ids = world.labs.map((l) => l.labId);
  const mon = createMonitor();
  const led = createCaseLedger();
  led.record(mon.sweep(world.labs, 1)); // baseline: validator working
  led.record(mon.sweep(world.labs, 2));
  injectScenario(world, ids[0], 'falseFail', 300); // the regression
  led.record(mon.sweep(world.labs, 3));
  const lab = world.labs.find((l) => l.labId === ids[0]);
  const learners = world.learnersByLab[ids[0]];
  const c = led.cases.find((x) => x.labId === ids[0] && x.type === 'validation-bug' && !x.subtype);
  const vid = c && c.validationIds[0];
  // Tamper two failing learners so the UI can show WHY the gates exclude them (never write to these):
  //   one with wrong work (state-mismatch = genuine failure), one with no observed evidence.
  const failing = learners.filter((u) => (u.validationResults || []).some((r) => r.validationId === vid && r.status === 'failed'));
  if (failing.length >= 2) {
    const wrongRow = failing[0].validationResults.find((r) => r.validationId === vid);
    if (wrongRow && wrongRow.observed) wrongRow.observed = Object.fromEntries(Object.keys(wrongRow.observed).map((k) => [k, '__wrong__']));
    const noEvRow = failing[1].validationResults.find((r) => r.validationId === vid);
    if (noEvRow) delete noEvRow.observed;
  }
  const packet = buildAmnestyPacket({ lab, learners, ledgerCases: led.cases, monitorHistory: mon.history });
  _amnesty = { world, ids, mon, led, lab, learners, caseId: c && c.caseId, packet, executed: null, reconcile: null };
  return _amnesty;
}
function amnestyView() {
  const a = amnestyScenario();
  return {
    simulated: true, provenance: 'SIMULATED (digital twin, in-process mirror of the platform WRITE endpoint)',
    gatedNote: 'Production execution is gated on the WRITE-endpoint semantics spike. This runs against a simulated mirror only.',
    labId: a.lab.labId, labTitle: a.lab.title, caseId: a.caseId,
    gates: ['fleet-confirmed', 'regression-only', 'state-proven', 'human-gated', 'reversion-guarded'],
    packet: a.packet, executed: a.executed, reconcile: a.reconcile,
  };
}

let ctx, convo, catalog;
async function init() {
  ctx = await new FixtureContextProvider(path.join(__dirname, '..', 'fixtures', 'lab-context.json')).getContext();
  convo = new Conversation();
  catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'lab-catalog.json'), 'utf8'));
}

const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});

function findingsSummary() {
  try { return analyze(ctx).findings.map((f) => ({ type: f.type, severity: f.severity, reportable: !!f.reportable })); }
  catch { return []; }
}
function labState() {
  return { lab: ctx.lab, currentStep: ctx.currentStep, validations: ctx.validations, findings: findingsSummary(), model: isConfigured() ? provider() : 'off' };
}

// Build a support-ready diagnostic summary so the user never has to explain the issue.
function supportSummary() {
  const f = findingsSummary();
  const failed = (ctx.validations || []).filter((v) => v.status === 'failed');
  const errors = (ctx.deploymentActivityLog || []).filter((e) => e.level === 'error');
  // SC-005: redact secrets/PII before this leaves the server (report/log/client).
  return redact({
    lab: ctx.lab?.title, step: `${ctx.currentStep?.stepGuid} — ${ctx.currentStep?.title}`,
    requiredRegion: ctx.lab?.expectedRegion,
    failingValidations: failed.map((v) => `${v.validationId}: ${v.description}`),
    errors: errors.map((e) => `${e.code}: ${e.message}`),
    likelyRootCause: f.filter((x) => x.severity === 'root-cause').map((x) => x.type).join(', ') || 'unknown',
    findings: f,
  });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// Cache for LLM finding-enrichment, keyed by (labId, findingId, evidence). The underlying evidence
// doesn't change between requests, so a fresh completion on every dashboard reload is pure waste — see
// docs/rocky_complexity_audit.md. Persisted to disk so a server restart (or reboot before the demo)
// doesn't reintroduce cold multi-second clicks; the evidence hash in the key self-invalidates when
// fixtures change. Contains only lab diagnostics — no learner input, nothing to redact.
const CACHE_FILE = path.join(__dirname, '..', 'logs', 'enrich-cache.json');
const enrichCache = new Map();
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')))) enrichCache.set(k, v); } catch { /* no cache yet */ }
function saveEnrichCache() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(enrichCache))); } catch { /* non-fatal */ }
}
async function cachedEnrich(lab, finding) {
  const key = `${lab.labId}:${finding.id}:${JSON.stringify(finding.evidence)}`;
  if (enrichCache.has(key)) return enrichCache.get(key);
  const result = await enrichFinding(lab, finding, chat, isConfigured);
  enrichCache.set(key, result);
  saveEnrichCache();
  return result;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // ---- API ----
  if (p === '/api/labstate') { return json(res, labState()); }

  // ---- LAB DOCTOR — autonomous lab QA over the catalog ----
  if (p === '/api/labhealth/catalog') { return json(res, analyzeCatalog(catalog)); }

  // Preview-fix-impact: models the best-case ceiling if the approved fixes are merged, on a COPY of the
  // telemetry (never mutates the catalog; C1, a human approved every fix). This is a MODEL, not a test —
  // no real re-execution happens; see docs/rocky_complexity_audit.md for why it's named/framed this way.
  if (p === '/api/labhealth/preview-fix-impact' && req.method === 'POST') {
    const { lab: labId, approved } = await readBody(req);
    const lab = (catalog.labs || []).find((l) => l.labId === labId);
    if (!lab) return json(res, { error: 'unknown lab', labId });
    return json(res, simulatePostFixOutcome(lab, Array.isArray(approved) ? approved : []));
  }

  // Synthetic Learner Probe — deterministic-first pre-launch check, restricted to labs with zero
  // telemetry (there's no better evidence yet to compete with; see labdoctor/intel.js).
  if (p === '/api/labhealth/probe') {
    const labId = url.searchParams.get('lab');
    const lab = (catalog.labs || []).find((l) => l.labId === labId);
    if (!lab) return json(res, { error: 'unknown lab', labId });
    return json(res, await probeLab(lab));
  }

  // Real Catalog Scan — deterministic findings from scanning REAL production lab repos (markdown only).
  // Results are cached to disk so a host without the repos folder still serves the real findings
  // (labeled with scannedAt). If the folder IS present, /run re-scans live (<1s for ~325 files).
  // Ecosystem change intelligence — impact report (real feeds × real repos), cached from the last
  // changeintel run; regenerate with: node changeintel/run.js <labs-root>
  if (p === '/api/labhealth/ecosystem') {
    try { return json(res, { available: true, ...JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'labdoctor', 'impact-report.json'), 'utf8')) }); }
    catch { return json(res, { available: false }); }
  }

  // Fix Campaign plan — REAL findings batched by cause (dry-run: ranks work, never opens PRs).
  // Computed on demand from the cached real scan so it always reflects the latest rescan.
  if (p === '/api/labhealth/campaigns') {
    const scan = loadRealScan();
    if (!scan) return json(res, { available: false });
    return json(res, { available: true, ...buildCampaignPlan(scan) });
  }

  if (p === '/api/labhealth/real-scan') {
    const scan = loadRealScan();
    if (!scan) return json(res, { available: false });
    return json(res, { available: true, canRescan: fs.existsSync(REAL_LABS_DIR), ...scan });
  }
  if (p === '/api/labhealth/real-scan/run' && req.method === 'POST') {
    if (!fs.existsSync(REAL_LABS_DIR)) return json(res, { error: 'labs folder not available on this host — serving cached scan', available: false });
    const t0 = Date.now();
    await new Promise((resolve) => require('child_process').execFile('node', [path.join(__dirname, '..', 'labdoctor', 'scan-real.js'), REAL_LABS_DIR], { timeout: 120000 }, () => resolve()));
    const scan = loadRealScan();
    if (!scan) return json(res, { available: false });
    return json(res, { available: true, canRescan: true, rescanMs: Date.now() - t0, ...scan });
  }

  // ---- SUPPORT INTELLIGENCE (digital-twin fleet, explicitly SIMULATED) ----
  // Deterministic in-process world (seed 42): tickets -> ledger -> incident collapse -> packets.
  // Real-data cutover = swap the ticket loader + reports source; the intel layer is unchanged.
  if (p === '/api/support/overview') {
    const w = supportWorld();
    return json(res, { simulated: true, seed: w.seed, stats: w.collapse.stats, incidents: w.collapse.incidents, tickets: w.ledger });
  }
  // ---- CONTINUOUS MONITOR (scripted twin timeline, SIMULATED) ----
  if (p === '/api/monitor/state') {
    const m = monitorState();
    return json(res, { simulated: true, sweep: m.sweep, history: m.monitor.history.map((s) => ({ sweepId: s.sweepId, broken: s.broken, labCount: s.labCount, alerts: s.alerts })), fleet: m.monitor.history.length ? m.monitor.history[m.monitor.history.length - 1].perLab : {}, eventLog: m.log, ledger: m.caseLedger.view() });
  }
  if (p === '/api/monitor/advance' && req.method === 'POST') {
    const snap = monitorAdvance();
    return json(res, { simulated: true, ...snap, ledger: monitorState().caseLedger.view() });
  }
  if (p === '/api/monitor/reset' && req.method === 'POST') { _mon = null; monitorState(); return json(res, { simulated: true, reset: true }); }

  // ---- FALSE-FAIL AMNESTY (SIMULATED demo of the Action plane) ----
  if (p === '/api/amnesty/scenario') return json(res, amnestyView());
  if (p === '/api/amnesty/execute' && req.method === 'POST') {
    const body = await readBody(req);
    const a = amnestyScenario();
    // The human gate, enforced live: a NAMED authorizer is required. A truthiness check alone would
    // let whitespace or a non-string truthy value through (found by adversarial review) — so trim and
    // type-check, and the writer is never reached without a real name.
    const authorizedBy = (typeof body.authorizedBy === 'string' ? body.authorizedBy.trim() : '');
    if (!authorizedBy) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'amnesty requires an explicit authorizedBy — packets are drafts, humans execute' })); }
    if (!a.executed) {
      // In-process writer = faithful mirror of the production PUT: mutates the learner row, preserves
      // the machine verdict beneath it (writtenBack.previousStatus) so the defect is never masked.
      const writer = async (w) => {
        const u = a.learners.find((x) => x.eventUserId === w.eventUserId);
        const row = u && (u.validationResults || []).find((r) => r.validationId === w.validationId);
        if (!row) throw new Error('unknown row');
        const previousStatus = row.status; row.status = w.status;
        row.writtenBack = { reason: w.reason, writtenBy: w.writtenBy, previousStatus };
        return { simulated: true, written: true, previousStatus, newStatus: w.status };
      };
      a.executed = await executeAmnesty(a.packet, writer, { authorizedBy: authorizedBy.slice(0, 80) });
      // Reversion guard — HONEST re-validation, not a re-read of our own write. Simulate the validator
      // being fixed and re-run by re-deriving each amnestied verdict from the learner's OWN observed
      // state vs the validator's expected state (ground truth), independent of the status amnesty just
      // wrote. Because the eligible learners were state-proven, they genuinely pass — but this guard
      // CAN contradict (any pair whose observed state didn't actually match would fail and halt it),
      // so it is a real check. (Feeding the amnesty-mutated learners here would make halt structurally
      // impossible — a fake green — which is exactly what this avoids.)
      const expByVid = Object.fromEntries((a.lab.validations || []).map((v) => [v.validationId, v.expected || {}]));
      const revalidated = a.learners.map((u) => ({
        ...u,
        validationResults: (u.validationResults || []).map((r) =>
          r.writtenBack ? { ...r, status: observedMatchesExpected(r.observed || {}, expByVid[r.validationId] || {}) ? 'passed' : 'failed' } : r),
      }));
      a.reconcile = reconcileAmnesty(a.executed, revalidated);
    }
    return json(res, amnestyView());
  }
  if (p === '/api/amnesty/reset' && req.method === 'POST') { _amnesty = null; return json(res, { simulated: true, reset: true }); }

  // ---- INTENT LEDGER pilot (REAL guides, LLM-extracted, mechanically quote-audited) ----
  if (p === '/api/intent/pilot') {
    try {
      const dir = path.join(__dirname, '..', 'intent', 'drafts');
      const report = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'intent', 'pilot-report.json'), 'utf8'));
      const guides = fs.readdirSync(dir).filter((f) => f.endsWith('.intent.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      const facts = guides.reduce((n, g) => n + g.summary.facts, 0);
      const grounded = guides.reduce((n, g) => n + g.summary.grounded, 0);
      return json(res, {
        available: true, provenance: 'REAL lab guides · LLM-extracted · mechanically quote-audited', ranAt: report.ranAt, note: report.note,
        summary: { guides: guides.length, tasks: guides.reduce((n, g) => n + g.summary.tasks, 0), facts, grounded, faithfulnessPct: facts ? Math.round((100 * grounded) / facts) : 0 },
        guides,
      });
    } catch { return json(res, { available: false }); }
  }

  if (p === '/api/support/packet') {
    const w = supportWorld();
    const t = w.world.tickets.find((x) => x.ticketId === url.searchParams.get('ticket'));
    if (!t) return json(res, { error: 'unknown ticket' });
    const learner = (w.world.learnersByLab[t.labId] || []).find((u) => (u.deploymentLog || []).length || (u.validationResults || []).some((r) => r.status === 'failed')) || null;
    return json(res, buildPacket(t, w.reports[t.labId], learner));
  }

  if (p === '/api/labhealth') {
    const labId = url.searchParams.get('lab');
    const lab = (catalog.labs || []).find((l) => l.labId === labId);
    if (!lab) return json(res, { error: 'unknown lab', labId });
    const report = analyzeLab(lab);
    // Refine each actionable finding's fix via the LLM (grounded, draft-only, provenance). Cached per
    // (lab, finding) since the underlying evidence is static — avoids re-spending tokens on every reload.
    // Low/transient findings keep their deterministic draft (cheap + they're not defects).
    const enrich = url.searchParams.get('enrich') !== '0' && isConfigured();
    if (enrich) {
      report.findings = await Promise.all(report.findings.map((f) =>
        (f.severity === 'low' || f.severity === 'info')
          ? Promise.resolve({ ...f, diagnosis: f.draftFix.summary, fixSource: 'deterministic', provenance: { evidence: f.evidence, rule: f.type, fixIsDraftOnly: true, humanApprovalRequired: true } })
          : cachedEnrich(lab, f)));
    } else {
      report.findings = report.findings.map((f) => ({ ...f, diagnosis: f.draftFix.summary, fixSource: 'deterministic', provenance: { evidence: f.evidence, rule: f.type, fixIsDraftOnly: true, humanApprovalRequired: true } }));
    }
    report.enriched = enrich;
    report.model = isConfigured() ? provider() : 'off';
    return json(res, report);
  }

  if (p === '/api/chat' && req.method === 'POST') {
    const { message } = await readBody(req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    try {
      const r = await handleTurn({ input: String(message || ''), ctx, conversation: convo, onToken: (t) => send({ token: t }) });
      send({ done: true, level: r.level, usedLLM: r.usedLLM, intent: r.intent, struggle: convo.struggle, findings: findingsSummary() });
    } catch (e) {
      send({ done: true, error: e.message });
    }
    return res.end();
  }

  if (p === '/api/diagnostics') { return json(res, supportSummary()); }

  if (p === '/api/report' && req.method === 'POST') {
    const body = await readBody(req);
    const ticket = 'ROCKY-' + String(Date.now()).slice(-5);
    const summary = supportSummary(); // auto-captured — user doesn't explain it
    try { fs.mkdirSync(path.dirname(REPORTS), { recursive: true }); fs.appendFileSync(REPORTS, JSON.stringify({ ticket, ts: new Date().toISOString(), reason: body.reason || 'escalated', summary }) + '\n'); } catch {}
    return json(res, { ticket, summary });
  }

  // Simulate the user applying Rocky's fix (e.g., recreating resources in the right region).
  if (p === '/api/applyfix' && req.method === 'POST') {
    const { region } = await readBody(req);
    const target = region || ctx.lab?.expectedRegion;
    for (const v of ctx.validations || []) {
      if (v.observed?.region) v.observed.region = target;
      if (/region|exists|running|vnet|vm/i.test(v.description) && v.status === 'failed' && !/license/i.test(v.description)) v.status = 'passed';
    }
    // Region fixed → the SKU/region deployment error (and the app-config failure downstream of it) no longer applies.
    ctx.deploymentActivityLog = (ctx.deploymentActivityLog || []).filter((e) => !(e.level === 'error' && /SkuNotAvailable|not available in location|AppSettingsApplyFailed/i.test((e.code || '') + ' ' + (e.message || ''))));
    return json(res, labState());
  }

  // Grounded answer endpoint. Honest-by-default: no fixture "evidence" is fed to the model unless
  // LIVE_DATA or an explicit, labeled scenario simulation. Trace is returned to the caller for
  // transparency but never persisted server-side (it's fully redundant with what the client already has).
  if (p === '/api/say' && req.method === 'POST') {
    if (!isConfigured()) return json(res, { message: null });
    const { message = '', kind = 'answer', scenario = false } = await readBody(req);
    const useEvidence = LIVE_DATA || scenario;
    let findings = []; if (useEvidence) { try { findings = analyze(ctx).findings; } catch {} }
    const gate = LIVE_DATA ? '' : (scenario
      ? " DATA MODE: SIMULATION — the context is a DEMO scenario for illustration only; frame it as a simulated example, never as the user's real verified state."
      : " DATA MODE: NO LIVE DATA — you are NOT connected to any lab, validation checker, or Azure environment, and you have NO evidence about the user's real state. If asked whether a step is done/correct, or about their resources/progress, clearly say you don't have an active lab or validation results yet and cannot verify it — offer to help once a lab or validation is connected. NEVER invent or assume status.");
    const sys = `You are Rocky, a grounded AI lab companion. Respond with ONLY a JSON object: {"message": string}. The message is 1-2 SHORT sentences (under ~28 words), natural spoken tone, warm but plain, teach-don't-spoil, grounded ONLY in the provided lab context. Output nothing except the JSON object.${gate}`;
    // Failing checks must carry OBSERVED vs EXPECTED, not just descriptions — descriptions name the
    // required state, so without observed values the model can invert the root cause (e.g. blame the
    // SKU in the *correct* region when the resources actually landed in the wrong one).
    const failing = useEvidence ? (ctx.validations || []).filter((v) => v.status === 'failed').map((v) =>
      (v.observed && v.observed.region && v.expected && v.expected.region)
        ? `${v.description} — FAILED (expected region "${v.expected.region}", observed "${v.observed.region}")`
        : `${v.description} — FAILED`).join('; ') : '';
    const deployErrors = useEvidence ? (ctx.deploymentActivityLog || []).filter((e) => e.level === 'error').map((e) => redact(`${e.code || 'error'}: ${e.message || ''}`)).join(' | ') : '';
    // Root cause comes from the deterministic engine's findings (evidence-gated, never hardcoded), so
    // the model can't endorse a plausible-but-wrong fix like "try a smaller VM size".
    const rm = findings.find((f) => f.type === 'region-mismatch');
    const rootCause = rm
      ? ` ROOT CAUSE (from the deterministic engine): resources were created in "${rm.actual}" but the lab requires "${rm.expected}". Any SkuNotAvailable error is a symptom of the wrong region, not of the VM size. The fix is recreating the resources in "${rm.expected}" — NOT changing the VM size. If the learner proposes a fix that doesn't address this (e.g. picking a smaller or different VM size), plainly say it will not fix the lab and point back to the region.`
      : '';
    const ctxLine = useEvidence
      ? `Lab${scenario ? ' (SIMULATED demo scenario)' : ''}: "${ctx.lab && ctx.lab.title}". Current step: ${ctx.currentStep && ctx.currentStep.title}. Required region: ${ctx.lab && ctx.lab.expectedRegion}. Failing checks: ${failing || 'none'}. Deployment errors: ${deployErrors || 'none'}. Engine findings: ${findings.map((f) => f.type).join(', ') || 'none'}.${rootCause}`
      : `No live lab, validation results, deployment, or telemetry is connected. There is NO evidence about the user's current state.`;
    const usr = kind === 'proactive'
      ? `${ctxLine}\nThere is a problem needing attention. Proactively and briefly offer to help — concerned but reassuring, like a teammate who has your back.`
      : `${ctxLine}\nThe learner said: "${message}". Reply helpfully, grounded in the context. If they're stuck on the failing checks, guide them toward the fix without just handing it over.`;
    const trace = {
      ts: new Date().toISOString(), userInput: message || ('(kind=' + kind + ')'), kind,
      live: LIVE_DATA, scenario, evidenceUsed: useEvidence,
      dataSource: LIVE_DATA ? 'cloudlabs-live-apis' : (useEvidence ? 'demo-fixture(simulated):fixtures/lab-context.json' : 'none — no live lab/validation connected'),
      memoryUsed: 'none — /api/say is stateless (no conversation or cross-session memory)',
      toolsCalled: useEvidence ? ['analyze(ctx) — deterministic engine over the loaded context'] : [],
      ragUsed: false, screenshotAnalysis: false, hardcodedScenario: useEvidence && !LIVE_DATA,
      evidenceFound: useEvidence ? {
        findings: findings.map((f) => f.type),
        failingValidations: failing || 'none',
        deploymentErrors: (ctx.deploymentActivityLog || []).filter((e) => e.level === 'error').map((e) => e.code),
      } : 'none',
    }; // returned to the caller only — never persisted server-side (see docs/rocky_complexity_audit.md)
    try {
      const raw = await chat([{ role: 'user', content: usr }], { system: sys, json: true });
      let o; try { o = JSON.parse(raw); } catch { o = { message: (raw || '').trim() }; }
      return json(res, { message: (o.message || '').toString().trim(), trace });
    } catch (e) { return json(res, { message: null, trace }); }
  }

  if (p === '/api/inject' && req.method === 'POST') {
    const { type } = await readBody(req);
    if (type === 'license' && !(ctx.validations || []).some((v) => v.validationId === 'V-010')) {
      ctx.deploymentActivityLog.push({ ts: new Date().toISOString(), stage: 'compute', level: 'error', code: 'MarketplacePurchaseRequired', message: "The Marketplace image requires license terms to be accepted for this subscription before deployment." });
      ctx.validations.push({ validationId: 'V-010', stepGuid: ctx.currentStep?.stepGuid || 'S-03', description: 'Marketplace license terms accepted', status: 'failed' });
    }
    return json(res, labState());
  }

  if (p === '/api/reset' && req.method === 'POST') {
    try { await init(); } catch (e) { return json(res, { error: 'reset failed — check fixtures JSON: ' + e.message }); }
    return json(res, labState());
  }

  // ---- static ----
  // "/" is the unified front door (home.html). The animated companion lives at /rocky.html (deep-linked
  // as /rocky.html?demo=1). Every other page is a "hat" reached from home or the in-page nav.
  let file = p === '/' ? '/home.html' : p;
  const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(full, (err, data) => {
    if (err) {
      // No dead ends: an unknown path (a judge clicking something odd) gets a friendly page home,
      // not a bare "Not found". API-shaped 404s stay JSON so callers can handle them.
      if (p.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'unknown endpoint', path: p })); }
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end('<!doctype html><meta charset="utf-8"><title>Not found · Rocky</title><body style="margin:0;height:100vh;display:grid;place-content:center;text-align:center;font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#080b11;color:#eaf2f6"><div><div style="font-size:34px">🤖</div><h1 style="font-weight:750;font-size:20px;margin:14px 0 6px">This page took a wrong turn.</h1><p style="color:#8b98a6;margin:0 0 18px">That route doesn\'t exist — but Rocky does.</p><a href="/" style="display:inline-block;background:#2ee6c8;color:#04120f;text-decoration:none;font-weight:650;padding:10px 18px;border-radius:9px">← Back to Rocky</a></div></body>');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

function json(res, obj) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

// A throw anywhere in the async request handler must never kill the demo server.
process.on('unhandledRejection', (e) => console.error('[rocky] unhandled rejection:', e && e.message ? e.message : e));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${PORT} is already in use — a Rocky server is probably already running.`);
    console.error(`    Either use the existing window (its cache is already warm), or close it and rerun,`);
    console.error(`    or start on another port:  set ROCKY_PORT=5174 && node web\\server.js\n`);
    process.exit(1);
  }
  throw err;
});

init().then(() => server.listen(PORT, () => {
  console.log(`\n🤖  Rocky Web running at  http://localhost:${PORT}`);
  console.log(`    Model: ${isConfigured() ? provider() : 'OFF (deterministic mode)'}  |  Ctrl+C to stop\n`);
})).catch((e) => { console.error('Failed to start — check the fixtures JSON:', e.message); process.exit(1); });
