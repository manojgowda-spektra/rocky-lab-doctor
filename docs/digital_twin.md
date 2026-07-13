# CloudLabs Digital Twin — Test & Validation Ecosystem

**Date:** 2026-07-05 · **Rule:** simulated data is labeled `simulated:true` + `X-Simulated` headers everywhere; twin data can never masquerade as production. Real data (the 8 production repos, the scan results, the PRs) stays in its own path.

## Why it exists
Production access is off-limits by decision. The twin lets development, testing, validation, and demos continue at full speed — and it already paid for itself on day one: the compound scenario **exposed a real engine defect** (false-pass masked by drift absorption on the same validation), which is now fixed and regression-guarded.

---

## Components

### 1. Synthetic Fleet Generator — `sim/fleetgen.js`
- **Purpose:** produce reproducible lab fleets with *known* defects for engine scoring.
- **Simulates:** labs (steps, validation definitions with controllable richness, guide text), learner cohorts with per-learner expansion, deployment error logs, timings/retries, and correlated support tickets.
- **Scenarios:** `healthy`, `nearMiss` (sub-threshold drift — tests restraint), `drift` (with downstream-symptom absorption), `falseFail`, `falsePass`, `envQuota`, `flake`, `clarity`, `newDeprecated` (zero-telemetry lab with deprecated content), `compound` (drift + false-pass on one lab).
- **Validates:** every classifier's recall against seeded truth; restraint on healthy/near-miss labs; ticket realism (false-pass produces *no* tickets — that's the class's defining property).
- **Realism:** calibrated to the engine's real thresholds (MIN_AFFECTED=4, fail-rate ≥0.35, flake/clarity rules); error messages mirror real ARM phrasing; counts/regions/SKUs randomized per seed. Not real learner behavior — parameterized approximation.
- **Assumptions:** cohort-level behavior patterns approximate real fleets; defect classes occur as seeded (real fleets will mix them more messily — the `compound` scenario partially covers this).
- **Reproducibility:** fully seeded PRNG (mulberry32); no wall-clock, no Math.random.

### 2. Twin API Server — `sim/twin-server.js`
- **Purpose:** a stand-in for the CloudLabs partner API so integration code can be built and tested now.
- **Simulates:** the documented endpoint vocabulary — labs list, event users, **per-learner** validation-results, progress detail (reachedStep/timings/retries), deployment-activity-log, template validation definitions, guide content — plus bearer-token auth (401 without it). Sim-only extras (`/sim/tickets`, `/sim/ground-truth`) live off the API namespace and are never consumed by the adapter.
- **Validates:** the ingestion adapter's full dataflow, auth handling, and per-learner→cohort grouping.
- **Realism:** endpoint *paths and object model* follow the verified platform discovery (Partner→Template→ODL→EventUser). **Response payload field names are documented inference** — the discovery confirmed endpoints exist but never captured live response JSON.
- **Assumptions (numbered, to be settled by one future DevTools capture):** **A-1** auth is a bearer token; **A-2** results are per-learner at validation/step granularity; **A-3** results may carry `observed{}` (the optimistic case — see worst-case test below); **A-4** progress exposes reachedStep/timings/retries (timings/retries are known-missing in production per discovery — the twin is *richer* here; the adapter tolerates their absence).

### 3. Ingestion Adapter — `adapter/cloudlabs-ingest.js` *(product code, not sim)*
- **Purpose:** the real P1 integration component, built now instead of waiting for credentials.
- **Validates against the twin:** catalog listing → per-learner pulls → signature-grouping into cohorts → engine-shaped output with `_provenance: api-ingest`.
- **Production cutover:** config-only (`baseUrl`, `token`, `partnerGuid`) plus payload-shape corrections isolated in this single file. Backoff on 429/5xx built in (rate limits unknown).

### 4. Ground-Truth Scoring — `test/sim.test.js`
- **Purpose:** the engine's report card. Current: **restraint 10/10, drift 9/9, false-fail 6/6, false-pass 9/9, env 6/6, flake 6/6, clarity 6/6** (seed 42), stable across 5 additional seeds (no fixture-overfitting).
- **Also documents the production worst case:** in a **pass/fail-only payload world** (no `observed{}`), env/flake/clarity survive; drift/false-fail/false-pass are payload-gated. This is now a *measured* product limitation, not a guess.

### 5. Expected-State Audit Runner — `audit/expected-state-audit.js` *(product code)*
- **Purpose:** the P1 audit tool — step-coverage % and richness % per lab, groundable-lab %; existence-only checks flagged as the false-pass-prone class.
- **Validated against the twin:** designed richness spread detected (coverage 91%, richness 57%, groundable 69%, 78 existence-only checks on seed 42). Ready to run against production definitions the day access is granted.

### 6. End-to-End Pipeline Test — `test/twin-e2e.test.js`
- **Purpose:** proves the exact production dataflow — API → adapter → engine → verdicts — reproduces ground truth over HTTP with auth, including cohort compression (learners > cohorts).

### 7. Repo-Quality Test Environment *(scanner side)*
- The Real Catalog Scanner + CI gate are validated against **real repos** (they need no simulation); the CI gate's lifecycle (baseline → clean pass → injected rot fails) is exercised in a synthetic throwaway repo. Golden-repo edge-case suite (code fences, self-aware lines, template vars, paren filenames) lives in the scanner-hardening history and CI wrapper tests.

---

## What the twin deliberately does NOT simulate
Live portal UI, VM sessions, actual cloud provisioning, Cosmos Builder behavior (Manoj's separate track), eventing/webhooks (production has none — poll-only is *accurate*), instructor tooling. No component pretends these exist.

## Standing rules
1. Twin results are never quoted as production numbers; provenance labels flow through (`simulated:true`, `_provenance.source`).
2. Every payload-shape assumption is numbered (A-1…A-4) and dies the day one real DevTools capture arrives — the adapter is the only file that changes.
3. New engine features must add a twin scenario + ground-truth check before shipping (the compound scenario's catch is the precedent).
