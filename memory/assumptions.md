# Assumptions & Risk Log — Rocky

> **Last Updated:** 2026-06-30
> **Open Assumptions:** 8 (all unvalidated — discovery phase)

---

## Purpose of This Document

Every load-bearing belief and risk for Rocky, logged so we don't build on an invalid foundation. In discovery, almost everything is an assumption. The job of the next phase is to validate or kill these.

---

## Status / Risk Legend

| Status | Meaning |
|---|---|
| OPEN | Made, not yet verified |
| VALIDATED / INVALIDATED / MOOT | Outcome states |

| Risk | If wrong... |
|---|---|
| CRITICAL | Project should not proceed as framed |
| HIGH | Significant rework |
| MEDIUM | Moderate rework |

---

## Critical Risk-Assumptions (from board review: R1–R8)

### ASM-001 — Proactivity can be made precise enough (the Clippy risk / R1)
| Field | Value |
|---|---|
| Status | OPEN · Risk: CRITICAL |
| Affects | Whole UX; adoption/retention |
| Verify how | WoW pilot trigger logging; measure false-interrupt rate |
**Assumption:** We can deliver proactive nudges precise enough that value > annoyance.
**If wrong:** Users disable Rocky after a day → gimmick reputation. **Mitigation:** reactive-first, earn proactivity per-trigger (ADR-003).

### ASM-002 — Enterprises will accept an observation model (surveillance dread / R2)
| Field | Value |
|---|---|
| Status | OPEN · Risk: CRITICAL |
| Affects | Highest-value buyer (enterprise) |
| Verify how | Security buyer interviews (do early) |
**Assumption:** With right governance (residency, redaction, telemetry-only mode), enterprises accept Rocky observing lab/cloud state.
**If wrong:** Blocked from top segment. **Mitigation:** telemetry-only tier; on-prem/region inference.
**EVIDENCE (2026-06-30):** CloudLabs catalog shows partner/tenant isolation + RBAC (`currentRoleId`) + audit log — good foundation. BUT certifications, AI inference data-residency, model-provider/retention, and PII-handling rules are **NOT determinable from the API catalog** — must be obtained from CloudLabs trust/compliance docs. Confirmed PII surfaced today: learner **email + IDs** (`/users/export`, `cloud-user-details`, `ExtendedUserAttribute`). Remains a HARD GATE for enterprise + any PII access. Also relevant: a per-user OpenAI-credit system already exists → AI cost-governance precedent (helps ASM-007).

### ASM-003 — Telemetry-first delivers most value without vision (R3)
| Field | Value |
|---|---|
| Status | **PARTIALLY VALIDATED** (2026-06-30 Cosmos AI session) · Risk: CRITICAL |
| Affects | Architecture, cost, trust |
| Verify how | ~~Cosmos read-API spike~~ → confirmed pull APIs exist; remaining: live cloud-state + real-time |
**Assumption:** Tiers 1–2 (Cosmos spec/validation + cloud state) cover most value.
**EVIDENCE:** Lab guide + validation definitions + **per-learner pass/fail validation results** ARE available via pull APIs today → the "intent + validation" layer of the moat is REAL and vision-free. BUT: real-time event feed, live cloud-resource-state access, and drift export do **NOT** exist today (all build-required, first-party feasible since CloudLabs controls VM + subscription). **Refined conclusion:** telemetry-first is viable for the pedagogical/objective layer now; "stuck-now" real-time + live environment grounding need new platform capabilities (Runtime Context API + event bus + first-party environment-read). See `docs/architecture.md`, `research/technical_notes.md`.

### ASM-004 — Rocky can be grounded enough to avoid teaching-hallucinations (R4)
| Field | Value |
|---|---|
| Status | OPEN · Risk: CRITICAL |
| Affects | Trust, pedagogy |
| Verify how | Grounded prototype vs. validation logic; measure error rate |
**Assumption:** Cosmos validation logic is structured enough to ground Rocky's teaching.
**If wrong:** Confident-but-wrong tutor destroys trust. **Mitigation:** cite sources; refuse-when-unsure; validation-logic grounding.

### ASM-005 — Team builds intelligence, not the robot (avatar capture / R5)
| Field | Value |
|---|---|
| Status | OPEN · Risk: HIGH |
| Affects | Resource allocation |
| Verify how | Roadmap discipline; agent/avatar decoupling (ADR-001) |
**Assumption:** We keep effort on the context engine, not avatar polish.
**If wrong:** Vanity over value; underbaked intelligence.

### ASM-006 — One brain can serve very different personas (R6)
| Field | Value |
|---|---|
| Status | OPEN · Risk: HIGH |
| Affects | UX defaults, adoption |
| Verify how | Persona split data; configurable skins/proactivity |
**Assumption:** Persona-tuned skins (enterprise-minimal ↔ student-character) + proactivity dial satisfy both juniors and seniors.
**If wrong:** Delights one segment, insults another.

### ASM-007 — Unit economics close at workshop scale (R7)
| Field | Value |
|---|---|
| Status | OPEN · Risk: HIGH |
| Affects | Business viability |
| Verify how | Cost-per-lab-hour model, telemetry-first vs vision |
**Assumption:** Cost per lab-hour stays below the value/revenue it generates at peak concurrency.
**If wrong:** Cost exceeds lab revenue. **Mitigation:** telemetry-first, tiered models, context caching.

### ASM-008 — We can defend against provider co-option (R8)
| Field | Value |
|---|---|
| Status | OPEN · Risk: HIGH |
| Affects | Long-term differentiation |
| Verify how | Track provider companion features; lean into multi-cloud + neutrality + pedagogy |
**Assumption:** Multi-cloud neutrality + pedagogy + competency signal defend against MS/AWS/Google embedding their own companions.

---

## Foundational Demand Assumptions

### ASM-010 — The pain is real enough to change behavior
| Field | Value |
|---|---|
| Status | OPEN · Risk: CRITICAL |
| Verify how | WoW pilot + interviews + analytics on alt-tab-to-AI behavior |
**Assumption:** "It feels traditional" maps to measurable pain (stuck cliff, copy-paste learning) that learners will change behavior to relieve.
**If wrong:** We rebuilt on aesthetics, not pain.

### ASM-011 — Same users who want help will tolerate the observation that enables it
| Field | Value |
|---|---|
| Status | OPEN · Risk: HIGH |
| Verify how | Pilot consent rates + interviews |
**Assumption:** Help-seekers accept the trade (observation → better help).
**If wrong:** Value and trust populations diverge.

### ASM-012 — Scaffolded help improves transfer, not just satisfaction
| Field | Value |
|---|---|
| Status | OPEN · Risk: MEDIUM |
| Verify how | Controlled pedagogy study |
**Assumption:** Socratic/scaffolded assistance produces real competency gains (basis for the competency SKU).

---

## Open Questions (unresolved)

1. What can CloudLabs + Cosmos emit *today* to a learner-facing runtime?
2. Does Cosmos already have a chat/inference API to build on?
3. What observation model will enterprise security accept?
4. What % of learners are junior/student vs. senior/professional?
5. Is Cosmos's per-lab knowledge structured enough to prevent hallucinations?
6. Does the competency signal hold up as *defensible* assessment to enterprise buyers?

---

## Assumption Review Schedule

| ID | Risk | Review | Next |
|---|---|---|---|
| ASM-001, 002, 003, 004, 010 | CRITICAL | Before any build commitment | After validation experiments |

---

## Log

| Date | Change |
|---|---|
| 2026-06-30 | Initial risk/assumption log (R1–R8 + demand assumptions) from discovery review |
