# Final Build Strategy — Verified-Facts Only

**Date:** 2026-07-04
**Basis:** live Cosmos AI interview (13 answers, authenticated session), 246-fact evidence dossier (internal Cosmos QA + verbatim transcripts + docs + public web), and the working prototype (28 tests, 25 preflight checks). No assumptions — every capability cited below is verified; every unknown is labelled.
**Scope:** the learner/lab-facing project (Rocky + Lab Doctor). Cosmos-authoring fixes are Manoj's separate track and are excluded.

---

## The verified foundation (what we may build on)

**APIs that exist today (pull, poll-based):**
- Per-learner validation results: `GET .../users/{eventUserGuid}/validation-results`
- Validation definitions (structured module→exercise→step): `GET .../template-lab-guide-validations`
- **On-demand validation trigger**: `POST .../users/{eventUserGuid}/validate` + bulk `validate-all-users` — meaning *we* can schedule fleet re-validation sweeps even though the platform has no scheduler
- Validation-result **write**: `PUT .../event-users/{u}/validations/exercises/{e}/steps/{s}`
- Deployment diagnostics: `cloudlabs_labs_instances`, `cloudlabs_deployment_activity_log` (stages, failure reasons, provider errors)
- Progress detail/leaderboard, lab users/launch state, guide content (document-centric master-doc/Git), cloud-spend + per-user OpenAI-credit endpoints, shadow-VM URL, audit log

**Hard limits (all confirmed live):** no eventing of any kind (poll only); no behavioral telemetry (no current-step, attempts, time-on-step, hints); no learner-facing AI surface or UI-injection point in the lab shell; no cloud-state/credential access for external systems; guide *intent* (objectives/expected outcomes) locked in prose; auth scheme and rate limits unconfirmed; no pre-flight environment check; support has data + controls but **no diagnosis layer, no ticket integration, no issue clustering, no cross-lab aggregation**.

**Prototype assets that survive contact with these facts:** the six deterministic classifiers, fleet aggregation, ranked evidence-typed findings, draft fixes, the escalation packet with redaction, the deterministic troubleshooter, honest-by-default grounding. All engine — none of it depends on the missing platform capabilities. What does not survive: the proactive/behavior-aware companion framing, in-lab UI, "sees live cloud state," per-learner memory.

---

## The seven questions

### 1. Ignoring Rocky entirely — the most valuable product
**Lab Reliability Intelligence** — productized Lab Doctor: automated diagnosis with evidence ("why is this learner failing: lab bug / env failure / learner error?"), false-fail & false-pass detection via fleet comparison, cross-lab pattern detection, and auto-built escalation packets — surfaced to support and lab operators. This is not our preference projected onto the platform: **Cosmos itself ranked automated diagnosis, false-pass detection, and cross-lab patterns in its top-five platform gaps**, and stated "I see tools that provide data; I do not see tools that perform diagnosis." Every input it needs (validation results, deployment logs, guide + validation definitions) is a verified pull API.

### 2. If we build only one thing
**The real-data ingestion adapter** — point the existing engine at the actual APIs for 10–20 real labs on the contoso tenant. It is the single highest-information act available: it converts the prototype from fixtures to reality, produces the expected-state audit as a byproduct (reading real validation definitions *is* the audit), and validates or kills everything downstream. Until this exists, every other plan is speculation; after it exists, the roadmap writes itself from observed signal quality.

### 3. Shippable today, no platform changes
- Poll-based ingestion (validation results + deployment logs, ~30s cadence) feeding the six classifiers
- **Scheduled fleet QA sweeps** — we call `validate-all-users` on a timer we control (needs permission + cost check; endpoint verified)
- False-**fail** detection (successful learners failing a step ⇒ the check is the bug) — needs only pass/fail across sessions
- Cross-lab pattern detection (same signature across labs)
- Escalation packet: auto-assembled, redacted diagnosis attached to any support case
- Ticket→lab→step root-cause ledger (support-side tagging; no platform work)
- Expected-state audit (~2 days once CloudLabs sign-in is reconnected)
- The troubleshooter's diagnosis brain — exposed to **support/instructors** through our own console (like the prototype's UI)

### 4. Rocky features that REQUIRE platform changes
| Feature | Blocked on |
|---|---|
| Any in-lab learner panel/sidecar | UI-injection point (none exists; only cluster-level branding) |
| Proactive nudges / smoke-detector | Event bus + telemetry (none; poll-only) |
| Stuck/struggle detection, time-on-step | The 5-event telemetry contract (not negotiated) |
| "Sees live cloud state" / in-VM help | First-party env reader / credentials (no path exists) |
| Step-intent answers as data | Structured guide model (intent is prose; partial workaround: parse guide text ourselves) |
| Cross-session learner memory | Persistent identity (learners are event-transient) |

### 5. Rocky features deliverable immediately
The **brain, not the face**: reactive Diagnose-at-failure (fault attribution from validation results + deployment logs), honest abstention, scaffolded explanations (hint→guided→answer), and one-click escalation with a redacted diagnostic packet. Since no learner surface exists, deliver them **to the people who help learners** — support and instructors — via our own console. Same engine, existing buyer, zero platform dependency. The learner-facing chat becomes a later skin over a proven brain, once an injection point ships.

### 6. Shortest path to measurable business value
1. **Week 1:** Reconnect CloudLabs; inspect live payloads in DevTools (settles auth scheme, rate limits, and — critically — whether validation results carry observed values/timestamps, which gates how strong false-pass detection can be).
2. **Week 1–2:** Run the expected-state audit (step-coverage % and richness % across top labs) — the go/no-go on grounding.
3. **Weeks 2–5:** Build the ingestion adapter; run the engine on real labs. **Acceptance test with known ground truth:** the Cosmos-QA IDP lab has confirmed validator-path bugs — if the engine catches them from real session data, detection is proven on reality, not fixtures.
4. **Weeks 5–8:** Support pilot: attach auto-diagnosis packets to real cases; start the ledger; **measure triage-minutes-per-ticket before/after and broken-lab MTTD.**

That is ~6–8 weeks to a *measured* number — the first real evidence in this project's business case, replacing the illustrative $25k/month placeholder.

### 7. Where I'd invest the next 3 months as CTO
- **Month 1 — Connect to reality.** Payload inspection, auth, audit, ingestion adapter, engine on 10–20 real labs, IDP ground-truth test. Kill criterion: if <40% of steps are groundable and payloads are pass/fail-only, descope to env-failure diagnosis + false-fail only (still valuable, still real).
- **Month 2 — Prove value on support.** Diagnosis packets on live cases, root-cause ledger, cross-lab patterns at fleet scale, harden classifiers against real noise (fixtures were cleaner than reality — expect false positives; measure precision).
- **Month 3 — Decide from data, then scale one bet.** If triage-time savings are real: productize as the ops offering, and make **one** platform ask — the 5-event telemetry contract — as the negotiated gateway to Phase 2 (learner surface, proactivity, instructor cockpit). If not: the ledger + audit will say precisely why, and cheaply.

Team size: 1–2 engineers. This phase is ingestion, correlation, and measurement — not new invention.

---

## Prioritized roadmap

**Phase 0 — Reality (weeks 1–2).** Reconnect + live payload inspection → auth/rate-limit/schema facts. Expected-state audit → groundability numbers. *Gate: audit results decide classifier scope.*

**Phase 1 — Diagnosis on real data (weeks 2–8).** Ingestion adapter → engine on real labs → IDP ground-truth test → support pilot with escalation packets → ticket→lab→step ledger → measured triage delta. *Gate: measured value or measured reason why not.*

**Phase 2 — Scale what worked (months 3–4).** Fleet-wide sweeps (scheduled `validate-all-users`, permission + cost-gated), cross-lab early-warning, ops console hardening, pricing informed by the ledger. Single platform ask: the 5-event telemetry contract. *Gate: telemetry contract agreed.*

**Phase 3 — The learner surface (after telemetry + injection point exist).** Rocky's Diagnose-at-failure moves in-lab; proactivity earns its precision gate; instructor cockpit only after real instructor interviews.

**Explicitly cut from the current plan:** behavior-aware smoke-detector framing; in-lab UI now; live cloud-state claims; vision/OCR; per-learner memory/skill graph; competency SKU (needs telemetry + persistent identity); building drift-detection (Cosmos Tester/Drasi already detect); anything duplicating Shadow VM.

---

## Final recommendation

**Build the intelligence layer as the product; keep Rocky as its future face.** The verified platform is strong at hosting and observing labs and has *nothing* that diagnoses — and its own AI ranks diagnosis, false-pass detection, and cross-lab patterns as the top gaps. Our engine already does these on fixtures; the entire next phase is connecting it to reality and measuring it on real support work. That path uses only verified APIs, needs no platform changes, has a clear payer, and produces the first real numbers this project has ever had. The companion ships later, thin and reactive, on top of a brain that has already proven itself where the money is.

**Carried uncertainties (named, not hidden):** validation-result payload richness (gates false-pass strength — settle in week 1); auth/rate limits (week 1); learner pain still unmeasured (irrelevant to Phase 1, which serves support); the real support baseline (the ledger creates it).
