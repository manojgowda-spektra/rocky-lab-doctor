# RFC: CloudLabs Learner-Telemetry Contract v1 (the five events)

> The single highest-leverage infrastructure ask in the Rocky/Lab Doctor program.
> Audience: CloudLabs platform engineering. Owner: Manoj. Status: DRAFT for review.
> **Created:** 2026-07-02. Strategy context: `rocky_strategic_review.md` §1.1.

## Problem
Lab Doctor (autonomous lab QA) and the learner Troubleshooter are proven in prototype, but they run on
*assumed* telemetry. The confirmed platform surface today is poll-based: per-learner validation results
and deployment activity logs. There is no step-level signal, no retry counts, no help-seeking signal, and
no push channel. Without a small, well-defined event stream, catalog QA stays reactive and every
"proactive" feature is a polling hack.

## Proposal: five events, tiny payloads, pseudonymous
All events share an envelope: `{ eventId, ts, labId, odlId, eventUserId (pseudonymous), schemaVersion }`.
No PII, no free-text learner content, no screen data.

1. **`step_started`** — `{ stepGuid }`
   Emitted when the guide UI advances to a step. *Unlocks:* time-on-step, confusion hotspots, cockpit heatmap.
2. **`validation_run`** — `{ validationId, stepGuid, status: passed|failed, attempt: n, observed?: {…} }`
   Emitted on every validation execution (not just final state). *Unlocks:* retry counts, flake-vs-real
   disambiguation, false-pass/false-fail detection. `observed` = the checker's structured result where available.
3. **`error_seen`** — `{ source: deployment|portal|validation, code, stage? }`
   Emitted when a deployment/validation error is recorded. *Unlocks:* env-class detection (quota/authz/terms/SKU) in real time.
4. **`help_requested`** — `{ surface: panel|companion|guide, kind: diagnose|hint|question, stepGuid }`
   Emitted by *our* surfaces (we own this one). *Unlocks:* deflection measurement (resolved-and-completed), struggle signal.
5. **`session_ended`** — `{ reason: completed|expired|abandoned, lastStepGuid }`
   *Unlocks:* honest completion/abandonment, Time-to-Green.

## Phasing (no event bus required to start)
- **Phase 0 — derive, no new infra (now):** we poll validation results + deployment logs on an interval and
  synthesize `validation_run`/`error_seen` deltas ourselves. Coarse but real. We emit `help_requested`
  from our own UI. Gaps: `step_started`, true `attempt` counts, `session_ended` fidelity.
- **Phase 1 — emit at source (~1 sprint, the ask):** guide UI emits `step_started`; the validation runner
  emits `validation_run` per attempt with `observed`; lifecycle emits `session_ended`. Transport: whatever
  is cheapest internally — webhook, queue, or an append log we can poll; we adapt.
- **Phase 2 — push channel:** only if/when scale demands it.

## Privacy & governance (default answers)
Pseudonymous `eventUserId`; per-learner data governed and consented at the event/tenant level; fleet
analytics are aggregate-only; retention 90 days raw / indefinite aggregate; no keystrokes, no screen
capture, no VM content. This contract is deliberately *telemetry-only* — it is the privacy-light
alternative to on-VM observation.

## What it unlocks (why one sprint pays for itself)
Production Lab Doctor (MTTD weeks→minutes on the real catalog) · resolved-and-completed support-deflection
measurement · the Instructor Cockpit (live class heatmap) · Time-to-Green as a customer-facing metric ·
the fleet flywheel (per-lab hotspots feeding Cosmos authoring).

## The ask
1. Review the five schemas; tell us what already exists vs. what needs instrumentation.
2. Confirm Phase-0 polling of validation results/deploy logs at ~30s intervals is acceptable (auth + rate limits).
3. Estimate Phase 1 (guide UI + validation runner emission) — we believe ~1 sprint.
