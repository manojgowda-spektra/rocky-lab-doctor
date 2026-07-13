# Roadmap — Rocky

> **Last Updated:** 2026-06-30
> **Current Phase:** Discovery & Validation (NOT building)
> **Next Milestone:** Validate critical assumptions (ASM-001…004, 010)

---

## Purpose

Rocky is in **discovery**. This is NOT a build roadmap — it's a *learning* roadmap. The goal of each phase is to validate or kill assumptions before committing engineering. Build phases are deliberately left undefined until validation gates pass.

---

## Phase D0 — Discovery (CURRENT)

**Goal:** Decide whether Rocky should exist and on what terms. ✅ Largely complete.

| Status | IN PROGRESS |
|---|---|
| Deliverables | Board-level review ✅ · Project knowledge base ✅ · Vision/risks/ADRs documented ✅ |

**Exit criteria:**
- [x] Strategic verdict reached (Great idea / 76 / conditional)
- [x] Three reframes captured as PROPOSED ADRs
- [x] Risk/assumption log established
- [ ] Project lead ratifies ADR-001/002/003

---

## Phase D1 — Critical Validation (NEXT)

**Goal:** Test the CRITICAL assumptions cheaply before any build.

| Status | NOT STARTED |
|---|---|

**Experiments / learning goals:**
- [ ] **Wizard-of-Oz pilot** in 2–3 live workshops — human plays "Rocky." Measure time-to-unblock, satisfaction, which questions arise, false-interrupt tolerance. (Validates ASM-001, ASM-010, ASM-011) — *design being brainstormed now*
- [ ] **Cosmos read-API spike** — confirm Cosmos can emit per-lab spec + validation + drift to a learner-facing runtime. (Validates ASM-003)
- [ ] **Enterprise security interviews** (5 buyers) — what observation model is acceptable? (Validates ASM-002)
- [ ] **Unit-economics model** — cost per lab-hour, telemetry-first vs vision. (Validates ASM-007)
- [ ] **Persona split data** — % junior/student vs senior/professional. (Informs ADR-001/003 defaults)

**Exit criteria:**
- [ ] No CRITICAL assumption is invalidated (or each has a viable mitigation)
- [ ] Demand for in-moment help is demonstrated, not assumed

---

## Phase D2 — Grounding Proof-of-Concept

**Goal:** Prove telemetry-first grounding works for ONE lab without computer vision.

| Status | NOT STARTED |
|---|---|

**Learning goals:**
- [ ] Environment-grounded debugging (IDEA-001) on one Azure lab via Cosmos validation + resource graph
- [ ] Measure teaching-hallucination rate against validation logic (ASM-004)
- [ ] Confirm grounded answers beat generic AI for that lab

**Exit criteria:**
- [ ] Grounded Rocky demonstrably more accurate/relevant than generic AI for the test lab
- [ ] Hallucination rate within acceptable bound

---

## Phase D3 — Pedagogy & Persona Validation

**Goal:** Test that scaffolding improves outcomes and persona-tuned UX satisfies both juniors and seniors.

| Status | NOT STARTED |
|---|---|

**Learning goals:**
- [ ] Controlled study: scaffolded help vs answer-giving → transfer/competency (ASM-012)
- [ ] Test enterprise-minimal skin vs student-character skin (ADR-001, ASM-006)
- [ ] Test reactive vs earned-proactive (ADR-003)

---

## Build Phases — DELIBERATELY UNDEFINED

No build roadmap until D1–D3 validation gates pass. Defining build phases now would be premature commitment against unvalidated assumptions.

---

## Milestones

| Milestone | Status |
|---|---|
| Discovery verdict reached | ✅ 2026-06-30 |
| ADRs ratified by lead | NOT REACHED |
| WoW pilot run | NOT REACHED |
| Cosmos read-API confirmed | NOT REACHED |
| Critical assumptions validated | NOT REACHED |
| Go/No-Go on build | NOT REACHED |

---

## Risk Register (top)

| Risk | Mitigation | Ref |
|---|---|---|
| Clippy trap | Earned proactivity | ADR-003 / ASM-001 |
| Enterprise surveillance veto | Telemetry-only mode + governance | ASM-002 / SC-001 |
| Vision-first cost/latency | Telemetry-first | ADR-002 / ASM-003 |
| Teaching-hallucination | Validation-logic grounding | ASM-004 / PC-001 |
| Rebuilding on aesthetics, not pain | WoW pilot demand test | ASM-010 |
