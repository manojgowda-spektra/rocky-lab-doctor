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
const { isConfigured, provider, chat, askLLM } = require('../src/llm');
const { checkupScan } = require('../labdoctor/checkup');

const PORT = Number(process.env.PORT || process.env.ROCKY_PORT || 5173); // App Service injects PORT
const LIVE_DATA = process.env.ROCKY_LIVE === '1'; // false on the fixture demo — gates Rocky from asserting mock data as the user's real, verified state
const PUBLIC = path.join(__dirname, 'public');
const REPORTS = path.join(__dirname, '..', 'logs', 'reports.jsonl');

// Where the real production lab repos live on the demo machine (env-overridable for other hosts).
const REAL_LABS_DIR = process.env.REAL_LABS_DIR || 'C:/Users/ManojGowda/OneDrive - Spektra Systems LLC/Desktop/Labs';
const SCAN_FILE = path.join(__dirname, '..', 'labdoctor', 'real-scan-results.json');
function loadRealScan() { try { return JSON.parse(fs.readFileSync(SCAN_FILE, 'utf8')); } catch { return null; } }

// FACTS — the single source for the demo's static verified claims (PR counts, test counts, audits).
// Scan-derived numbers stay live from /api/labhealth/*; pages read BOTH so a rescan can never
// contradict the narration. See docs/DEMO_MASTER_SCRIPT.md.
// Fallback is {} (no .static) ON PURPOSE: pages guard with `f && f.static`, so a missing/corrupt
// facts.json renders dashes — never the string "undefined" in a stat tile.
const FACTS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'facts.json'), 'utf8')); } catch { return {}; } })();

// Build stamp — lets check-ready.js prove the server on :5173 is THIS checkout, not a stale one.
const BUILD = (() => {
  let commit = null;
  // stdio 'pipe' on stderr: outside a git checkout (e.g. a copy running on a lab VM) git prints
  // "fatal: not a git repository" — harmless, but it must not be the first thing on screen.
  try { commit = require('child_process').execSync('git rev-parse --short HEAD', { cwd: __dirname, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  return { version: require('../package.json').version, commit, startedAt: new Date().toISOString() };
})();

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

// ---- BACKSTAGE feed — the demo's live "what's actually happening" narration ----
// Every meaningful API action logs one plain-English event here; backstage.html tails it on a side
// screen so the audience can watch the engine think while the presenter clicks the normal UI.
// In-memory ring buffer, demo-only telemetry: never persisted, cleared on demand.
const backstage = [];
let bsId = 0;
function bs(kind, title, detail, prov, ms) {
  backstage.push({ id: ++bsId, ts: new Date().toISOString(), kind, title, detail: detail || '', prov: prov || '', ms: ms == null ? null : ms });
  if (backstage.length > 300) backstage.splice(0, backstage.length - 300);
}

// ---- WINGMAN — the presenter's silent Q&A copilot -------------------------------------------
// wingman.html (on the presenter's PC) transcribes the room's questions via the browser's speech
// recognition and POSTs them here; a DETERMINISTIC keyword matcher over copilot-kb.json returns
// suggested answers instantly (no AI key needed — on-message: the engine asserts). The phone view
// (wingman-view.html) polls /feed so the answers live on a screen the share can never show.
// If an LLM key is configured later, /heard ALSO drafts a free-form answer, clearly tagged 'ai'.
// One normalization pipeline for BOTH transcripts and KB phrases: lowercase, expand contractions
// (with or without the apostrophe — speech transcripts drop it), strip punctuation, and apply a
// minimal plural stem so "hallucinates"/"invents" match "hallucinate"/"invent a problem".
const wingStem = (w) => (w.length >= 4 ? (w.endsWith('ies') ? w.slice(0, -3) + 'y' : (!w.endsWith('ss') && w.endsWith('s') ? w.slice(0, -1) : w)) : w);
const wingNorm = (s) => {
  let t = String(s || '').toLowerCase()
    .replace(/\b(does|do|is|are|was|were|did|has|have|had|would|should|could|wo|ca)n'?t\b/g, '$1 not')
    .replace(/\bwon'?t\b/g, 'will not').replace(/\bcan'?t\b/g, 'can not')
    .replace(/\b(what|it|that|there)'?s\b/g, '$1 is')
    .replace(/[^a-z0-9\s-]/g, ' ');
  return ' ' + t.split(/\s+/).filter(Boolean).map(wingStem).join(' ') + ' ';
};
const KB = (() => {
  try {
    const entries = JSON.parse(fs.readFileSync(path.join(__dirname, 'copilot-kb.json'), 'utf8')).entries || [];
    // Normalize phrases/keywords through the SAME pipeline as transcripts, so apostrophes etc.
    // can't silently kill a phrase ("chat doesn't work" must match "chat doesn t work").
    for (const e of entries) {
      e._ph = (e.ph || []).map((p) => wingNorm(p));
      e._kw = (e.kw || []).map((k) => wingNorm(k).trim());
    }
    return entries;
  } catch { return []; }
})();
const wing = { feed: [], id: 0, scene: null };
function wingPush(ev) {
  // NOTE: wing.id is NEVER reset (clear only empties the feed) — ids stay monotonic so the
  // phone view's since-cursor and late AI drafts can't collide across a mid-session clear.
  wing.feed.push({ id: ++wing.id, ts: new Date().toISOString(), ...ev });
  if (wing.feed.length > 120) wing.feed.splice(0, wing.feed.length - 120);
  return wing.feed[wing.feed.length - 1];
}
function wingMatch(text) {
  const norm = wingNorm(text); // space-padded → phrase hits are word-bounded ('aws' ≠ 'flaws')
  const tokens = new Set(norm.split(/\s+/).filter(Boolean));
  const scored = [];
  for (const e of KB) {
    let score = 0;
    for (const ph of e._ph || []) if (norm.includes(ph)) score += 3;
    for (const kw of e._kw || []) if (tokens.has(kw)) score += 1;
    if (score >= 2) scored.push({ score, id: e.id, a: e.a, n: e.n || '', src: e.src || '' });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}
// Crude but effective question detector: keeps the presenter's own narration from flooding the
// phone's Q&A panel. Interrogative word early on, "question" anywhere, or an inverted opener.
function wingIsQuestion(text) {
  const t = wingNorm(text).trim().split(/\s+/);
  if (t.slice(0, 8).some((w) => ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'question'].includes(w))) return true;
  return ['can', 'could', 'would', 'should', 'does', 'do', 'did', 'is', 'are', 'will', 'was', 'were'].includes(t[0]);
}
function lanUrls() {
  const os = require('os');
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces() || {})) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}/wingman-view.html`);
    }
  }
  return out;
}

let ctx, convo, catalog;
async function init() {
  ctx = await new FixtureContextProvider(path.join(__dirname, '..', 'fixtures', 'lab-context.json')).getContext();
  convo = new Conversation();
  catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'lab-catalog.json'), 'utf8'));
}

const readBody = (req, cap = 16384) => new Promise((resolve) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > cap) { try { req.destroy(); } catch {} resolve({}); } }); // default 16 KB — chat-sized payloads; /api/checkup passes a larger cap for uploaded guides
  req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});

function findingsSummary() {
  try { return analyze(ctx).findings.map((f) => ({ type: f.type, severity: f.severity, reportable: !!f.reportable })); }
  catch { return []; }
}
function labState() {
  // deploymentLog rides along so the sim page paints its terminal FROM the fixture — the screen
  // can never contradict the evidence the engine (and Rocky's answers) actually reason over.
  return { lab: ctx.lab, currentStep: ctx.currentStep, validations: ctx.validations, findings: findingsSummary(), deploymentLog: ctx.deploymentActivityLog || [], model: isConfigured() ? provider() : 'off' };
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
  if (p === '/api/facts') { return json(res, FACTS); }
  if (p === '/api/version') { return json(res, BUILD); }
  // Q&A knowledge base, read-only — powers the printable Q&A sheet (/qa.html)
  if (p === '/api/qa') { return json(res, { entries: KB.map(({ id, ph, a, n, src }) => ({ id, q: (ph && ph[0]) || id, a, n: n || '', src: src || '' })) }); }

  // ---- BACKSTAGE feed endpoints ----
  if (p === '/api/backstage') {
    const since = Number(url.searchParams.get('since') || 0);
    return json(res, { events: backstage.filter((e) => e.id > since), lastId: bsId });
  }
  if (p === '/api/backstage/note' && req.method === 'POST') {
    const b = await readBody(req);
    bs(String(b.kind || 'learner').slice(0, 16), String(b.title || '').slice(0, 120), String(b.detail || '').slice(0, 240), String(b.prov || '').slice(0, 24));
    return json(res, { ok: true });
  }
  if (p === '/api/backstage/clear' && req.method === 'POST') { backstage.length = 0; return json(res, { ok: true }); }

  // ---- WINGMAN routes (presenter Q&A copilot; see block above) ----
  if (p === '/api/wingman/info') {
    return json(res, { kbEntries: KB.length, phoneUrls: lanUrls(), llmConfigured: isConfigured() });
  }
  if (p === '/api/wingman/scene' && req.method === 'POST') {
    const b = await readBody(req);
    wing.scene = { i: Number(b.i) || 0, n: Number(b.n) || 16, t: String(b.t || '').slice(0, 120), say: String(b.say || '').slice(0, 900), tag: String(b.tag || '').slice(0, 12), ts: new Date().toISOString() };
    return json(res, { ok: true });
  }
  if (p === '/api/wingman/heard' && req.method === 'POST') {
    const b = await readBody(req);
    const text = String(b.text || '').slice(0, 600);
    const source = b.source === 'typed' ? 'typed' : 'voice'; // allowlist — this field is rendered on the phone
    if (!text.trim()) return json(res, { ok: false });
    const suggestions = wingMatch(text);
    const isQuestion = source === 'typed' || wingIsQuestion(text);
    // Presenter narration guard: voice snippets that are neither question-shaped nor matched
    // are dropped (pure noise); question-shaped no-matches still surface (→ "use the armor").
    if (source === 'voice' && !isQuestion && !suggestions.length) return json(res, { ok: true, skipped: true, suggestions: [] });
    const ev = wingPush({ kind: 'q', text, source, isQuestion, suggestions });
    // Optional AI draft — strictly additive, clearly tagged, never blocks the deterministic answer.
    if (isConfigured() && b.wantAi !== false && isQuestion) {
      // Numbers are TEMPLATED from facts.json + the live scan cache, never hardcoded in the prompt —
      // a rescan can't make the AI contradict the screen.
      const sc = loadRealScan(); const st = FACTS.static || {};
      const nums = sc && sc.totals
        ? `${sc.totals.findings} defects/${sc.repoCount} repos/${sc.totals.files} files, ${st.pullRequests} PRs (${st.pullRequestsMerged} merged), ${st.falsePositiveAudit ? st.falsePositiveAudit.falsePositives + '/' + st.falsePositiveAudit.sampled : '0/42'} false alarms, ${st.ciBlockSeconds}s CI block`
        : 'see /receipts.html for the live numbers';
      askLLM(
        `You are Rocky's presenter assistant during a live demo. Answer the audience question in 2-3 short spoken sentences the presenter can read aloud. Be honest: real numbers are ${nums}; fleet dashboards and learner stories are a labeled digital twin. Never invent numbers. If unsure say what is verified and what is not.`,
        text
      ).then((ans) => { if (ans) wingPush({ kind: 'ai', qId: ev.id, text: String(ans).slice(0, 700) }); }).catch(() => {});
    }
    return json(res, { ok: true, id: ev.id, suggestions, isQuestion });
  }
  if (p === '/api/wingman/feed') {
    const since = Number(url.searchParams.get('since') || 0);
    return json(res, { scene: wing.scene, events: wing.feed.filter((e) => e.id > since), last: wing.id });
  }
  // clear empties the feed but PRESERVES the id counter (see wingPush) — resetting it would
  // strand any phone view whose since-cursor is ahead of the new ids (silent Q&A death).
  if (p === '/api/wingman/clear' && req.method === 'POST') { wing.feed.length = 0; wing.scene = null; return json(res, { ok: true }); }

  // ---- DEMO SAMPLE LABS — one-click "select a lab" for the guided demo (demo.html).
  // Serves staged copies of REAL guides from Demo-Uploads/ so the presenter never needs a
  // file dialog. Same content, same pipeline (/api/checkup) as an upload.
  if (p === '/api/demo/samples') {
    const base = path.join(__dirname, '..', '..', '..', 'Demo-Uploads');
    const SAMPLES = [
      { id: 'challenge05', title: 'AI-Developer · Challenge 05', desc: 'A real production guide — tells learners to deploy a retired AI model', badge: 'BROKEN', files: ['Challenge-05.md'] },
      { id: 'rtiad', title: 'RTIAD Workshop · Lab 1 (EN + JA)', desc: 'A real guide pair — the Japanese translation lost its credential tokens', badge: 'BROKEN', files: ['RTIAD-mini/English/Labguide/Lab-1---April-2026.md', 'RTIAD-mini/Japanese/Labguide/Lab-1---April-2026.md'] },
      { id: 'clean', title: 'CAF Infra Security · Intro', desc: 'A real guide with nothing wrong — Rocky should say so', badge: 'CLEAN', files: ['clean-lab-guide.md'] },
    ];
    const id = url.searchParams.get('id');
    if (!id) return json(res, { samples: SAMPLES.map(({ id, title, desc, badge }) => ({ id, title, desc, badge })) });
    const s = SAMPLES.find((x) => x.id === id);
    if (!s) return json(res, { error: 'unknown sample' }, 404);
    try {
      const files = s.files.map((f) => ({ path: f, content: fs.readFileSync(path.join(base, f), 'utf8') }));
      return json(res, { id: s.id, title: s.title, files });
    } catch (e) { return json(res, { error: 'sample files missing — restore the Demo-Uploads folder at the repo root (git checkout -- Demo-Uploads)' }, 500); }
  }

  // ---- GUIDE CHECKUP — upload any lab guide (or folder), same engine scans it live ----
  if (p === '/api/checkup' && req.method === 'POST') {
    const b = await readBody(req, 8 * 1024 * 1024);
    // 25k entries: media entries are path-only (~40 bytes) so a complete image inventory is cheap;
    // guide CONTENT volume is already bounded by the 8MB body cap and the client's 500-guide cap.
    const raw = Array.isArray(b.files) ? b.files.slice(0, 25000) : [];
    const files = raw.map((f) => ({
      path: String(f.path || '').slice(0, 400),
      content: typeof f.content === 'string' ? f.content.slice(0, 2 * 1024 * 1024) : undefined,
    })).filter((f) => f.path);
    if (!files.length) return json(res, { error: 'no files received (or the upload exceeded the 8 MB limit — try just the Labguide subfolder)' }, 400);
    const t0 = Date.now();
    let rep;
    try { rep = checkupScan(files); }
    catch (e) { return json(res, { error: 'scan failed: ' + (e && e.message || 'unknown') }, 500); }
    bs('engine', `Guide checkup: scanned ${rep.mdFiles} uploaded guide file${rep.mdFiles === 1 ? '' : 's'}`,
      `${rep.findingCount} finding${rep.findingCount === 1 ? '' : 's'} — same deterministic checks as the repo scan, zero AI calls`, 'REAL', Date.now() - t0);
    return json(res, rep);
  }

  // ---- LAB DOCTOR — autonomous lab QA over the catalog ----
  if (p === '/api/labhealth/catalog') {
    const t0 = Date.now();
    const rep = analyzeCatalog(catalog);
    bs('engine', `Fleet sweep: analyzed ${rep.labCount} labs`, `${rep.broken} broken · ${rep.learnersAffected} learners in impacted labs · fleet health ${rep.catalogHealth}/100 — pure comparison of authored spec vs telemetry, zero AI calls`, 'FIXTURE', Date.now() - t0);
    return json(res, rep);
  }

  // Preview-fix-impact: models the best-case ceiling if the approved fixes are merged, on a COPY of the
  // telemetry (never mutates the catalog; C1, a human approved every fix). This is a MODEL, not a test —
  // no real re-execution happens; see docs/rocky_complexity_audit.md for why it's named/framed this way.
  if (p === '/api/labhealth/preview-fix-impact' && req.method === 'POST') {
    const { lab: labId, approved } = await readBody(req);
    const lab = (catalog.labs || []).find((l) => l.labId === labId);
    if (!lab) return json(res, { error: 'unknown lab', labId });
    const sim = simulatePostFixOutcome(lab, Array.isArray(approved) ? approved : []);
    bs('engine', `Fix impact MODELED for "${lab.title}"`, `health ${sim.before.score} → ${sim.after.score} IF fixes are approved — a projection on a copy of the data, nothing executed, nothing mutated`, 'MODELED');
    return json(res, sim);
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
    const plan = buildCampaignPlan(scan);
    bs('engine', `Grouped ${plan.stats.findings} REAL findings by root cause → ${plan.stats.campaigns} campaigns`, `top 3 campaigns cover ${plan.stats.top3CoveragePct}% · dry-run only: ranks work, never opens PRs`, 'REAL');
    return json(res, { available: true, ...plan });
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
    bs('engine', `Watcher sweep ${snap.sweepId}: re-analyzed the fleet, diffed vs previous sweep`,
      snap.alerts.length
        ? snap.alerts.filter((a) => !a.foldedInto).map((a) => `${a.type.toUpperCase()}${a.labTitle ? ': ' + a.labTitle : a.labIds ? ': ' + a.labIds.length + ' labs folded into ONE incident' : ''}`).join(' · ')
        : 'no change since last sweep → deliberate silence (no alert spam)',
      'SIMULATED');
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
    if (!authorizedBy) {
      bs('gate', 'Amnesty write REFUSED — no named human', 'HTTP 400: the human gate is code, not policy. The writer function was never called.', 'SIMULATED');
      res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'amnesty requires an explicit authorizedBy — packets are drafts, humans execute' }));
    }
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
      bs('action', `Amnesty executed by "${authorizedBy.slice(0, 40)}" — ${a.executed.written} verdict(s) restored`, 'Writes went to the SIMULATED mirror of the platform endpoint; each preserved the machine verdict beneath it, so the defect stays visible until truly fixed', 'SIMULATED');
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
    const tDiag = Date.now();
    const report = analyzeLab(lab);
    bs('engine', `Diagnosed "${report.title}" — ${report.findings.length} finding(s)`,
      report.findings.length
        ? report.findings.slice(0, 3).map((f) => `${f.subtype || f.type}: ${f.affectedLearners || 0} learners`).join(' · ') + ' — each asserted from expected-vs-observed contradiction, before any AI runs'
        : 'no contradictions between authored spec and telemetry — lab is healthy',
      'FIXTURE', Date.now() - tDiag);
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
    bs('action', `Escalation ticket ${ticket} auto-built`, `Root cause "${summary.likelyRootCause}" + failing checks + error log attached — secrets REDACTED before anything leaves the box. The learner explained nothing.`, 'FIXTURE');
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
    const stillFailing = (ctx.validations || []).filter((v) => v.status === 'failed').length;
    bs('action', `Fix applied: resources recreated in ${target}`, `Validations re-checked: ${stillFailing} still failing${stillFailing ? ' (the escalated license issue stays red on purpose — Rocky never pretends)' : ' — all green, verified'}`, 'FIXTURE');
    return json(res, labState());
  }

  // Grounded answer endpoint. Honest-by-default: no fixture "evidence" is fed to the model unless
  // LIVE_DATA or an explicit, labeled scenario simulation. Trace is returned to the caller for
  // transparency but never persisted server-side (it's fully redundant with what the client already has).
  if (p === '/api/say' && req.method === 'POST') {
    const { message = '', kind = 'answer', scenario = false } = await readBody(req);
    if (!isConfigured()) {
      bs('ai', 'Rocky asked — AI model is OFF', `"${String(message).slice(0, 70)}" → no model configured; the UI falls back to the engine's deterministic evidence card. Nothing is invented.`, scenario ? 'SIMULATED' : '');
      return json(res, { message: null });
    }
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
    const tSay = Date.now();
    bs('engine', 'Evidence assembled for Rocky\'s answer', useEvidence
      ? `Engine findings attached: ${findings.map((f) => f.type).join(', ') || 'none'} · failing checks + deploy errors included · the model can only NARRATE these facts, never invent verdicts`
      : 'No live lab connected → the model is told it has NO evidence and must abstain', scenario ? 'SIMULATED' : '');
    try {
      const raw = await chat([{ role: 'user', content: usr }], { system: sys, json: true });
      let o; try { o = JSON.parse(raw); } catch { o = { message: (raw || '').trim() }; }
      bs('ai', 'Model narrated the reply', `"${String(message).slice(0, 60)}" → answered strictly from the attached evidence`, scenario ? 'SIMULATED' : '', Date.now() - tSay);
      return json(res, { message: (o.message || '').toString().trim(), trace });
    } catch (e) {
      bs('ai', 'Model call failed — honest degradation', `${String(e.message).slice(0, 90)} → UI shows the deterministic evidence card instead`, '', Date.now() - tSay);
      return json(res, { message: null, trace });
    }
  }

  if (p === '/api/inject' && req.method === 'POST') {
    const { type } = await readBody(req);
    bs('learner', `Simulated incident injected: ${type}`, 'A deliberate failure added to the demo lab so the diagnosis flow can be shown end-to-end', 'FIXTURE');
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
  // "/" is the demo home (home.html — the act map). The flow pages carry the shared act strip
  // (nav.js). The animated companion lives INSIDE cloudlabs-sim.html (Act 1); retired pages are
  // in web/attic/ and are deliberately NOT served.
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

function json(res, obj, code = 200) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

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
