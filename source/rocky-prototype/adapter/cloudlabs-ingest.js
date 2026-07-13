// CloudLabs ingestion adapter — pulls per-learner data from partner-API-shaped endpoints and
// normalizes it into the engine's catalog/telemetry shape. Built and validated against the Digital
// Twin (including its chaos modes); production cutover is config-only ({baseUrl, token, partnerGuid})
// plus whatever payload-shape corrections a real capture reveals — ALL shape mapping lives in this file.
//
// Hardening (each behavior chaos-tested in test/chaos.test.js):
//  - 429: honored Retry-After (capped), bounded retries with exponential backoff
//  - 5xx: retried with backoff; timeouts (per-request AbortSignal) retried the same way
//  - 401: NEVER retried — fail fast with an actionable AuthError (token refresh is a human/config act)
//  - malformed payloads: tolerated at learner level (recorded + skipped), never crash an ingest
//  - lab-level failures: isolated — one bad lab never kills the catalog run (returned in `errors`)

const DEFAULTS = { concurrency: 4, retries: 3, backoffMs: 400, timeoutMs: 10000, maxRetryAfterMs: 5000 };

class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError'; } }

function makeClient({ baseUrl, token, fetchImpl = fetch, ...rest }) {
  const cfg = { ...DEFAULTS, ...rest };
  let authDead = false; // once the token is rejected, everything fails fast — no pointless hammering
  async function request(path, init = {}) {
    if (authDead) throw new AuthError('token already rejected — refresh credentials and re-run');
    let lastErr;
    for (let a = 0; a <= cfg.retries; a++) {
      try {
        const res = await fetchImpl(baseUrl + path, {
          method: init.method || 'GET',
          headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
          ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        });
        if (res.status === 401 || res.status === 403) { authDead = true; throw new AuthError(`auth rejected (HTTP ${res.status}) at ${path} — token expired or unauthorized`); }
        if (res.status === 429) {
          const ra = Math.min(cfg.maxRetryAfterMs, (Number(res.headers.get('retry-after')) || 1) * 1000);
          throw Object.assign(new Error('HTTP 429'), { retryable: true, waitMs: ra });
        }
        if (res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { retryable: true });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
        return await res.json();
      } catch (e) {
        if (e.name === 'AuthError') throw e;
        const timedOut = e.name === 'TimeoutError' || e.name === 'AbortError';
        lastErr = e;
        if (!(e.retryable || timedOut) || a === cfg.retries) throw lastErr;
        await new Promise((r) => setTimeout(r, e.waitMs || cfg.backoffMs * Math.pow(2, a)));
      }
    }
    throw lastErr;
  }
  const get = (path) => request(path);
  return { get, request, cfg };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

// ---- payload guards: shape problems become recorded skips, never crashes ----
const asArray = (x) => (Array.isArray(x) ? x : null);
const asObject = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);

// A written-back verdict (human override via the WRITE endpoint) must NEVER erase the machine
// evidence beneath it: diagnosis keeps using the ORIGINAL status, or an amnesty would silently mask
// the very defect it compensated for and the next sweep would see a "recovered" lab that isn't fixed.
const machineVerdict = (x) => (x.writtenBack && x.writtenBack.previousStatus ? { ...x, status: x.writtenBack.previousStatus } : x);

// Group per-learner rows into engine cohorts: learners with an identical result signature form one
// cohort (the engine aggregates by cohort count; identical-signature grouping is lossless for it).
function toCohorts(learners) {
  const groups = new Map();
  for (const u of learners) {
    const machineRows = (u.validationResults || []).map(machineVerdict);
    const sig = JSON.stringify({
      r: machineRows.map((x) => [x.validationId, x.status, x.observed ?? null, x.firstAttempt ?? null]),
      reached: u.reachedStep, retries: u.retries || {}, errs: (u.deploymentLog || []).filter((e) => e.level === 'error').map((e) => e.code),
    });
    if (!groups.has(sig)) groups.set(sig, { count: 0, label: `cohort-${groups.size + 1}`, reachedStep: u.reachedStep, timings: u.timings || {}, retries: u.retries || {}, validationResults: machineRows.map((x) => ({ ...x })), errors: (u.deploymentLog || []).filter((e) => e.level === 'error').map((e) => ({ code: e.code, message: e.message })) });
    groups.get(sig).count++;
  }
  return [...groups.values()];
}

// Ingest one lab: definitions + per-learner results/progress/logs → engine-shaped lab object.
async function ingestLab(client, partnerGuid, labMeta) {
  const P = `/api/partners/${partnerGuid}`;
  const defs = await client.get(`${P}/templates/${labMeta.templateGuid}/template-lab-guide-validations`);
  const guide = await client.get(`${P}/templates/${labMeta.templateGuid}/guide`);
  const users = asArray(await client.get(`${P}/labs/${labMeta.onDemandLabGuid}/users`)) || [];
  const skipped = [];
  const learners = (await mapLimit(users, client.cfg.concurrency, async (u) => {
    try {
      const [resultsRaw, progressRaw, logRaw] = await Promise.all([
        client.get(`${P}/labs/${labMeta.onDemandLabGuid}/users/${u.eventUserId}/validation-results`),
        client.get(`${P}/labs/${labMeta.onDemandLabGuid}/progress/users/${u.eventUserId}`),
        client.get(`${P}/labs/${labMeta.onDemandLabGuid}/users/${u.eventUserId}/deployment-activity-log`),
      ]);
      const results = asArray(resultsRaw);
      const progress = asObject(progressRaw);
      if (!results || !progress) { skipped.push({ eventUserId: u.eventUserId, reason: 'malformed payload' }); return null; }
      return { eventUserId: u.eventUserId, validationResults: results, reachedStep: progress.reachedStep, timings: progress.timings || {}, retries: progress.retries || {}, deploymentLog: asArray(logRaw) || [] };
    } catch (e) {
      if (e.name === 'AuthError') throw e; // auth is fatal for the whole run — bubble it
      skipped.push({ eventUserId: u.eventUserId, reason: e.message });
      return null;
    }
  })).filter(Boolean);
  return {
    labId: labMeta.onDemandLabGuid, title: labMeta.title, cloud: labMeta.cloudPlatform || 'azure',
    expectedRegion: guide.expectedRegion, author: 'ingested', lastAuthored: null,
    steps: guide.steps, validations: (defs.validations || []).map(({ simulated, ...v }) => v),
    telemetry: { cohorts: toCohorts(learners) },
    _provenance: {
      source: 'api-ingest', learners: learners.length, skipped, complete: skipped.length === 0, ingestedVia: 'adapter/cloudlabs-ingest.js',
      writtenBackRows: learners.reduce((n, u) => n + (u.validationResults || []).filter((r) => r.writtenBack).length, 0), // human-overridden verdicts (diagnosis uses machine verdicts)
    },
  };
}

// Ingest a whole catalog. One bad lab never kills the run; auth death stops it immediately.
async function ingestCatalog({ baseUrl, token, partnerGuid, labFilter, ...rest }) {
  const client = makeClient({ baseUrl, token, ...rest });
  let labList = await client.get(`/api/partners/${partnerGuid}/labs`);
  if (labFilter) labList = labList.filter(labFilter);
  const labs = [], errors = [];
  await mapLimit(labList, 2, async (meta) => {
    try { labs.push(await ingestLab(client, partnerGuid, meta)); }
    catch (e) {
      errors.push({ labId: meta.onDemandLabGuid, error: e.message, fatal: e.name === 'AuthError' });
      if (e.name === 'AuthError') throw e;
    }
  }).catch((e) => { if (e.name !== 'AuthError') throw e; });
  const authDied = errors.some((x) => x.fatal);
  return { labs, errors, authDied, provenance: { source: 'api-ingest', labCount: labs.length, failedLabs: errors.length } };
}

// Per-learner rows for ONE lab — the amnesty engine's read dependency (it needs individual grain,
// not cohorts). Same hardening as ingest; malformed learners are skipped and recorded.
async function fetchLearnerRows({ baseUrl, token, partnerGuid, labId, ...rest }) {
  const client = makeClient({ baseUrl, token, ...rest });
  const P = `/api/partners/${partnerGuid}`;
  const users = asArray(await client.get(`${P}/labs/${labId}/users`)) || [];
  const skipped = [];
  const learners = (await mapLimit(users, client.cfg.concurrency, async (u) => {
    try {
      const results = asArray(await client.get(`${P}/labs/${labId}/users/${u.eventUserId}/validation-results`));
      if (!results) { skipped.push({ eventUserId: u.eventUserId, reason: 'malformed payload' }); return null; }
      return { eventUserId: u.eventUserId, email: u.email, status: u.status, validationResults: results };
    } catch (e) {
      if (e.name === 'AuthError') throw e;
      skipped.push({ eventUserId: u.eventUserId, reason: e.message });
      return null;
    }
  })).filter(Boolean);
  return { learners, skipped, complete: skipped.length === 0 };
}

// Production-shaped verdict writer for action/amnesty.js executeAmnesty(): PUT one validation
// result with mandatory provenance. Same client hardening; retries are safe (PUT is idempotent).
// Points at the twin today; after the semantics spike, only {baseUrl, token} change.
function makeVerdictWriter({ baseUrl, token, partnerGuid, ...rest }) {
  const client = makeClient({ baseUrl, token, ...rest });
  return async function writeVerdict(w) {
    if (!w.reason || !w.writtenBy) throw new Error('verdict writes require reason and writtenBy');
    return client.request(
      `/api/partners/${partnerGuid}/labs/${w.labId}/users/${w.eventUserId}/validation-results/${w.validationId}`,
      { method: 'PUT', body: { status: w.status, reason: w.reason, writtenBy: w.writtenBy } }
    );
  };
}

module.exports = { ingestCatalog, ingestLab, toCohorts, makeClient, AuthError, fetchLearnerRows, makeVerdictWriter };
