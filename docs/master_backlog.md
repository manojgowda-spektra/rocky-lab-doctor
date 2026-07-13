# Master Backlog — Post-Hackathon Productization

**Date:** 2026-07-05 · **Foundation:** the hosted hackathon build (labdoctor-rocky.azurewebsites.net; scanner + Lab Doctor + Rocky; 28 tests / 28 preflight; 2 real PRs merged/open)
**Rule:** every item was challenged against six questions — real problem? · evidence of need? · supported by existing APIs? · measurable value? · strengthens moat? · worth the cost? Items failing ≥2 questions don't get built.
**Evidence tiers referenced:** LIVE (Cosmos interview) · QA (internal Cosmos-QA project) · HACK (proven in hackathon build) · UNVERIFIED (named unknown).

---

## P1 — Build Now

### 1.1 Scanner CI Gate (published-lab quality monitoring, v1)
Make the Real Catalog Scanner a CI check on lab repos: baseline file, new-finding diff, non-zero exit, GitHub Action.
- **Why it matters:** content rot re-enters the moment we stop scanning. A CI gate makes the 106-finding cleanup *permanent* — no new deprecated model, stale name, or broken image can merge. LIVE-verified: no internal tool or CI does this anywhere (7/8 repos had zero CI).
- **Business value:** prevention at near-zero cost; converts the hackathon demo into a deployed control. Every gated PR is a measurable catch.
- **Effort:** ~1 day (scanner is built; needs CI wrapper + baseline diff + workflow YAML + pilot install).
- **Risk:** Low. Deterministic, self-contained, no platform APIs.
- **Success metric:** installed on ≥1 real repo; first PR blocked/annotated by a genuine new finding; zero false-positive blocks in the first month.

### 1.2 Real-Data Ingestion Adapter (his #1 priority — built to the credential boundary)
Adapter that polls `validation-results` + `deployment_activity_log` + progress for N real labs and normalizes into the engine's telemetry shape. Plus a **payload probe** script that, given one captured request (auth header + one response), verifies our fixture schema against reality.
- **Why:** the entire runtime product ("fixtures richer than the platform") becomes real or dies here. Every classifier is already written and tested against this seam (HACK).
- **Business value:** unlocks diagnosis/false-fail/cross-lab on production labs — the capabilities Cosmos itself ranked top-5 missing (LIVE).
- **Effort:** ~3–5 days code; **blocked on one input:** a DevTools capture of any authenticated `/api/partners/...` call (settles auth scheme + payload richness — both UNVERIFIED after two research passes).
- **Risk:** Medium — payload may be pass/fail-only (weakens false-pass detection; false-fail unaffected). Rate limits unknown → centralized poll + backoff from day one.
- **Success metric:** the **IDP ground-truth test** — engine catches the QA-confirmed validator bugs from real session data. Named before running; no goalpost moves.

### 1.3 Expected-State Audit Runner
Tool that reads real validation *definitions* for the top-N labs and computes: step-coverage % (steps with ≥1 validation) and richness % (validations with structured expected{} beyond existence).
- **Why:** it's the ceiling on everything — grounding, diagnosis, false-pass. Planned since 2026-07-02, never run (QA/LIVE both flag existence-only checks as the false-pass-prone class).
- **Business value:** go/no-go evidence for the runtime product; also quantifies the platform's own validation debt (a finding leadership can act on).
- **Effort:** ~1–2 days; same credential boundary as 1.2 (definitions API is confirmed to exist).
- **Risk:** Low (read-only). Finding may be bad news — that's the point.
- **Success metric:** coverage/richness numbers for ≥25 real labs, in a one-page report.

### 1.4 Support Diagnosis Pilot (support intelligence workflow, v1)
The hackathon console + escalation packet, pointed at real cases: for each incoming lab issue, support gets the auto-assembled packet (deployment errors + validation state + fault attribution + redacted).
- **Why:** LIVE-verified — support has data but "no tools that perform diagnosis"; evidence gathering is manual.
- **Business value:** triage-minutes-per-ticket is the first real ROI number this project will ever produce (all current figures are placeholders).
- **Effort:** ~2–3 days after 1.2 lands; pilot process work with 1–2 support people.
- **Risk:** Medium — depends on support-team cooperation and real ticket flow (UNVERIFIED volume).
- **Success metric:** measured before/after triage time on ≥20 real cases; deflection counted only as resolved-and-completed.

### 1.5 Ticket→Lab→Step Ledger (v0)
A dead-simple intake: every support case tagged with {labId, stepGuid, defect-class} using the engine's taxonomy. JSONL/spreadsheet, not a system.
- **Why:** no support baseline exists anywhere (QA: every ROI number is illustrative). This creates it while costing almost nothing.
- **Business value:** ranks all future work by real ticket cost; prices any future ops SKU credibly.
- **Effort:** ~0.5 day tooling + a process agreement.
- **Risk:** Low tech / medium process (people must actually tag).
- **Success metric:** 4 weeks of tagged cases → first real tickets-per-lab distribution.

## P2 — Build Later (real, but gated)

| Feature | Gate | Notes |
|---|---|---|
| Cross-lab patterns at fleet scale | 1.2 live on ≥10 labs | Engine exists (HACK); needs real breadth |
| Scheduled fleet re-validation sweeps | permission + cost check | `validate-all-users` exists (LIVE) — we can be the scheduler the platform lacks; runs against learner envs, so approval first |
| Fix-PR automation (finding → drafted PR) | scanner CI adopted | Manual loop proven (2 real PRs, HACK); automate once volume justifies |
| Rocky "Diagnose at failure" learner surface | UI injection point OR custom-portal embed confirmed | The brain ships in 1.4; the learner face waits for a sanctioned surface (LIVE: none exists) |
| Per-instance pre-flight env check | first-party env reader | Attacks the ~70% env-failure class; no read path exists today (LIVE) |
| Instructor cohort console | ≥3 instructor interviews | Zero instructor input exists; don't design blind (QA) |
| Deprecation-registry auto-feed | scanner CI adopted | Curated JSON is fine at current scale; feed from Azure retirement pages later |

## P3 — Research (cheap questions before any build)

1. **DevTools capture of one authenticated partner-API call** (Manoj, ~15 min in a CloudLabs session) — unblocks 1.2 + 1.3; settles auth + payload richness, the two oldest unknowns in the project.
2. **Power BI report contents** (`/api/menu/{tenant}/reports`, Manoj, ~5 min) — closes the last overlap unknown (is there any existing lab-quality report?).
3. **Instructor interviews** (3 × 30 min) — gates the cockpit.
4. **Real support-ticket volume/cost** (ask support lead) — sizes 1.4/1.5 value.
5. **Cost Truth / FinOps opportunity** — strong new-product-lens case (first-party billing, AI-token blind spot QA-confirmed) but a different buyer and team; research who owns it before any code.
6. **Who owns the marketed "AI Tutor" claim** — positioning question before any learner-facing release.

## P4 — Remove (challenged and failed)

Rocky animations/personality-tuning · vision/OCR · whole-VM agents · skill graphs · learner memory (learners are event-transient — LIVE) · complex multi-agent systems · proactive/behavior-aware nudging (no telemetry — LIVE) · bespoke drift-detection engine (duplicates Cosmos Tester + Drasi) · "Ask Lab Doctor" console (deleted once; stays dead) · risk-radar expansion beyond 2 flags (no outcome data to calibrate) · Proving Ground / Agent Gym / CloudBench (vision shelf until the substrate exists) · any Cosmos-authoring fixes (Manoj's separate track).

---

## Selected next workstream: **1.1 Scanner CI Gate**

**Why this one first:** it is the only P1 item with zero external dependencies — no credentials, no support-team cooperation, no platform asks. It converts the hackathon's most credible asset (real findings, real PRs) into a *permanently deployed control* this week, while 1.2/1.3 wait only on a 15-minute DevTools capture. Discipline = ship the unblocked thing, unblock the blocked thing, build nothing else.

**Definition of done:** self-contained CI scanner (no deps) + baseline diff + GitHub Action, tested locally both ways (clean pass + injected-rot fail), installed via PR on one real repo.
