// CloudLabs Digital Twin — mock partner-API server. SIMULATED DATA ONLY.
// Speaks the documented CloudLabs endpoint vocabulary (Partner→Template→ODL→EventUser model, verbatim
// path styles from the platform discovery) and serves PER-LEARNER rows, exactly the granularity the
// real platform exposes — so the ingestion adapter built against this twin is a base-URL+auth swap away
// from production. Response payload SHAPES are documented inference (never observed live); every
// response carries simulated:true and X-Simulated headers so twin data can never masquerade as real.
//
// Usage: node sim/twin-server.js [port=5199] [seed=42] [chaosSpec]   Auth: Authorization: Bearer sim-token
// chaosSpec (deterministic, seeded fault injection for adapter hardening), e.g.:
//   "429:0.2,500:0.15"        20% rate-limited (with Retry-After), 15% server errors
//   "slow:0.3@1500"           30% of responses delayed 1500ms
//   "malformed:0.2"           20% of validation-results payloads are structurally wrong
//   "auth-expire:40"          after 40 requests, everything returns 401 (token expiry mid-ingest)

const http = require('http');
const { generateWorld, makeRng, injectScenario } = require('./fleetgen');

const PORT = Number(process.argv[2] || process.env.TWIN_PORT || 5199);
const SEED = Number(process.argv[3] || 42);
const CHAOS = (() => {
  const spec = process.argv[4] || process.env.TWIN_CHAOS || '';
  const c = { p429: 0, p500: 0, pSlow: 0, slowMs: 0, pMalformed: 0, authExpireAfter: Infinity };
  for (const part of spec.split(',').filter(Boolean)) {
    const [k, v] = part.split(':');
    if (k === '429') c.p429 = Number(v);
    else if (k === '500') c.p500 = Number(v);
    else if (k === 'slow') { const [p, ms] = v.split('@'); c.pSlow = Number(p); c.slowMs = Number(ms || 1000); }
    else if (k === 'malformed') c.pMalformed = Number(v);
    else if (k === 'auth-expire') c.authExpireAfter = Number(v);
  }
  return c;
})();
const chaosRng = makeRng(SEED + 1000); // separate stream: chaos never perturbs world generation
let requestCount = 0;
const MIX = { healthy: 6, nearMiss: 4, drift: 6, falseFail: 6, falsePass: 6, envQuota: 6, flake: 6, clarity: 6, newDeprecated: 3, compound: 3 };

const world = generateWorld(MIX, { seed: SEED });
const byId = Object.fromEntries(world.labs.map((l) => [l.labId, l]));
const writeAudit = []; // every accepted write, in order — the twin's audit-trail oracle (/sim/write-audit)

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'X-Simulated': 'true' });
  res.end(JSON.stringify(obj));
}
const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // ---- deterministic fault injection (adapter chaos hardening) ----
  requestCount++;
  if (requestCount > CHAOS.authExpireAfter) return json(res, 401, { error: 'token expired', simulated: true });
  if (CHAOS.p429 && chaosRng.f() < CHAOS.p429) { res.writeHead(429, { 'Retry-After': '1', 'X-Simulated': 'true' }); return res.end('{"error":"rate limited"}'); }
  if (CHAOS.p500 && chaosRng.f() < CHAOS.p500) return json(res, 503, { error: 'transient upstream failure', simulated: true });
  if (CHAOS.pSlow && chaosRng.f() < CHAOS.pSlow) await new Promise((r) => setTimeout(r, CHAOS.slowMs));

  // bearer-auth mirror: the discovery's best-inference auth scheme (documented assumption A-1)
  if ((req.headers.authorization || '') !== 'Bearer sim-token') return json(res, 401, { error: 'unauthorized', hint: 'Authorization: Bearer sim-token' });

  const seg = p.split('/').filter(Boolean); // api partners :pg ...
  if (seg[0] !== 'api' || seg[1] !== 'partners' || seg[2] !== world.partnerGuid) {
    if (p === '/sim/ground-truth') return json(res, 200, { simulated: true, groundTruth: world.groundTruth }); // test oracle — never consumed by the adapter
    if (p === '/sim/tickets') return json(res, 200, { simulated: true, tickets: world.tickets });
    if (p === '/sim/write-audit') return json(res, 200, { simulated: true, writes: writeAudit }); // test oracle for the WRITE endpoint
    // POST /sim/inject {labId, scenario, seed} — evolve the world mid-run (regression/recovery
    // timelines over the wire). Oracle namespace: tests only, never part of the mirrored API.
    if (p === '/sim/inject' && req.method === 'POST') {
      const body = await readBody(req);
      const lab = byId[body.labId]; if (!lab) return json(res, 404, { error: 'unknown lab' });
      try { return json(res, 200, { simulated: true, labId: body.labId, injected: body.scenario, groundTruth: injectScenario(world, body.labId, body.scenario, body.seed || 1) }); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    return json(res, 404, { error: 'not found' });
  }

  // GET /api/partners/{pg}/labs — list ODLs
  if (seg.length === 4 && seg[3] === 'labs') {
    return json(res, 200, world.labs.map((l) => ({ onDemandLabGuid: l.labId, title: l.title, templateGuid: l.templateGuid, cloudPlatform: l.cloud, state: 'Published', simulated: true })));
  }
  // GET .../labs/{odl}/users — event users
  if (seg.length === 6 && seg[3] === 'labs' && seg[5] === 'users') {
    const lab = byId[seg[4]]; if (!lab) return json(res, 404, { error: 'unknown lab' });
    return json(res, 200, (world.learnersByLab[lab.labId] || []).map((u) => ({ eventUserId: u.eventUserId, email: u.email, status: u.status, deploymentId: u.deploymentId, simulated: true })));
  }
  // PUT .../labs/{odl}/users/{eu}/validation-results/{vid} — the twin's mirror of the UNUSED
  // production WRITE endpoint (verified to exist; semantics UNVERIFIED — the spike's job). Twin
  // semantics are documented assumptions: A-W1 the write persists; A-W2 every write is audited
  // (/sim/write-audit); A-W3 the response echoes previous->new status. The twin also ENFORCES our
  // own provenance discipline: writes without reason + writtenBy are rejected, so no pipeline code
  // can ever be written that skips the human-gate fields.
  if (req.method === 'PUT' && seg.length === 9 && seg[3] === 'labs' && seg[5] === 'users' && seg[7] === 'validation-results') {
    const lab = byId[seg[4]]; if (!lab) return json(res, 404, { error: 'unknown lab' });
    const u = (world.learnersByLab[lab.labId] || []).find((x) => x.eventUserId === seg[6]);
    if (!u) return json(res, 404, { error: 'unknown user' });
    const body = await readBody(req);
    if (!['passed', 'failed'].includes(body.status)) return json(res, 400, { error: 'status must be passed|failed' });
    if (!body.reason || !body.writtenBy) return json(res, 400, { error: 'writes require reason and writtenBy (provenance is not optional)' });
    const row = u.validationResults.find((r) => r.validationId === seg[8]);
    if (!row) return json(res, 404, { error: 'unknown validation for this user' });
    const previousStatus = row.status;
    row.status = body.status;
    // visible on subsequent reads, INCLUDING the machine verdict it replaced — so downstream
    // diagnosis can keep using original evidence and a write-back can never mask the defect it fixed
    row.writtenBack = { reason: body.reason, writtenBy: body.writtenBy, previousStatus };
    writeAudit.push({ labId: lab.labId, eventUserId: u.eventUserId, validationId: seg[8], previousStatus, newStatus: body.status, reason: body.reason, writtenBy: body.writtenBy, requestNo: requestCount });
    return json(res, 200, { simulated: true, written: true, validationId: seg[8], previousStatus, newStatus: body.status, audited: true });
  }
  // GET .../labs/{odl}/users/{eu}/validation-results — per-learner per-step results
  if (seg.length === 8 && seg[3] === 'labs' && seg[5] === 'users' && seg[7] === 'validation-results') {
    const lab = byId[seg[4]]; if (!lab) return json(res, 404, { error: 'unknown lab' });
    const u = (world.learnersByLab[lab.labId] || []).find((x) => x.eventUserId === seg[6]);
    if (!u) return json(res, 404, { error: 'unknown user' });
    if (CHAOS.pMalformed && chaosRng.f() < CHAOS.pMalformed) return json(res, 200, { unexpected: 'shape', results: null, simulated: true }); // structurally wrong on purpose
    return json(res, 200, u.validationResults.map((r) => ({ validationId: r.validationId, status: r.status, ...(r.observed !== undefined ? { observed: r.observed } : {}), ...(r.firstAttempt ? { firstAttempt: r.firstAttempt } : {}), ...(r.writtenBack ? { writtenBack: r.writtenBack } : {}), simulated: true })));
  }
  // GET .../labs/{odl}/progress/users/{eu} — progress detail (reachedStep + timings + retries)
  if (seg.length === 8 && seg[3] === 'labs' && seg[5] === 'progress' && seg[6] === 'users') {
    const lab = byId[seg[4]]; if (!lab) return json(res, 404, { error: 'unknown lab' });
    const u = (world.learnersByLab[lab.labId] || []).find((x) => x.eventUserId === seg[7]);
    if (!u) return json(res, 404, { error: 'unknown user' });
    return json(res, 200, { eventUserId: u.eventUserId, reachedStep: u.reachedStep, timings: u.timings, retries: u.retries, simulated: true });
  }
  // GET .../labs/{odl}/users/{eu}/deployment-activity-log
  if (seg.length === 8 && seg[3] === 'labs' && seg[5] === 'users' && seg[7] === 'deployment-activity-log') {
    const lab = byId[seg[4]]; if (!lab) return json(res, 404, { error: 'unknown lab' });
    const u = (world.learnersByLab[lab.labId] || []).find((x) => x.eventUserId === seg[6]);
    if (!u) return json(res, 404, { error: 'unknown user' });
    return json(res, 200, u.deploymentLog.map((e) => ({ ...e, simulated: true })));
  }
  // GET .../templates/{tg}/template-lab-guide-validations — validation DEFINITIONS (for the audit)
  if (seg.length === 6 && seg[3] === 'templates' && seg[5] === 'template-lab-guide-validations') {
    const lab = world.labs.find((l) => l.templateGuid === seg[4]); if (!lab) return json(res, 404, { error: 'unknown template' });
    return json(res, 200, { templateGuid: lab.templateGuid, onDemandLabGuid: lab.labId, steps: lab.steps.map((s) => ({ stepGuid: s.stepGuid, title: s.title })), validations: lab.validations.map((v) => ({ ...v, simulated: true })), simulated: true });
  }
  // GET .../templates/{tg}/guide — guide text (steps + instructions)
  if (seg.length === 6 && seg[3] === 'templates' && seg[5] === 'guide') {
    const lab = world.labs.find((l) => l.templateGuid === seg[4]); if (!lab) return json(res, 404, { error: 'unknown template' });
    return json(res, 200, { title: lab.title, expectedRegion: lab.expectedRegion, steps: lab.steps, simulated: true });
  }
  return json(res, 404, { error: 'not found', path: p });
});

server.listen(PORT, () => console.log(`🧪 CloudLabs DIGITAL TWIN (simulated) on http://localhost:${PORT}  seed=${SEED}  labs=${world.labs.length}  learners=${Object.values(world.learnersByLab).reduce((n, a) => n + a.length, 0)}`));
