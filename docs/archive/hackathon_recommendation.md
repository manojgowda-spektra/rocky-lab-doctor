# Hackathon Recommendation — "Lab Doctor" (Self-Healing Labs)

> The highest-value CloudLabs/Cosmos build: turn every learner session into continuous, autonomous lab QA.
> Rocky (the companion) is the sensor + demo face; **Lab Doctor is the moat.**
> **Created:** 2026-07-01. **MVP built:** 2026-07-02.

---

## ✅ Build status — live (50 tests pass; deterministic + live Azure LLM; verified via screenshots)
- **Engine:** `source/rocky-prototype/labdoctor/analyze.js` — fleet aggregation → anomaly rules → fleet-impact ranking → health score → LLM classify + author-ready fix draft (grounded, provenance, confidence). Deterministic-first (works with no LLM).
  - **Classifiers:** region **drift** (with downstream-symptom absorption), **validation-bug false-FAIL** (correct learners failing a check), **validation-bug false-PASS** (the *silent* one — passing wrong work), **guide-clarity**, **env-permission/quota**, **transient flake** (correctly *downgraded*, never flagged broken).
  - **Self-heal (engine-backed, honest):** `applyApprovedFixes()` applies approved fixes' forward effect to a telemetry COPY and re-analyzes → real before/after; guarded so a heal can never fabricate a false-pass. Never mutates the catalog; labelled *projected — pending author merge*.
  - **Cross-lab fleet intelligence:** findings carry a root-cause `signature`; `detectFleetPatterns()` correlates the same cause across labs (the moat).
- **Proactive intelligence** (`labdoctor/intel.js`):
  - **🔮 Synthetic Learner Probe** — an LLM agent walks a lab's spec and *predicts* breakage **before any learner runs it** (the answer to Microsoft Drasi's synthetic-user, but grounded + it drafts the fix). Everything labelled **PREDICTED**, calibrated confidence, abstains when the lab looks fine.
  - **🔭 Predictive Risk Radar** — deterministic forecast of which *currently-healthy* labs break next (shares a drifting SKU family / region-selectable step / old guide / declining trend).
  - **💬 Ask Lab Doctor** — a conversational analyst grounded ONLY in the analyzed catalog; cites labs, distinguishes observed vs. predicted, refuses to invent, drafts content-team notes.
- **API:** `/api/labhealth/catalog` (health, healed projection, fleet patterns, risk radar, trends), `/api/labhealth?lab=<id>` (`&enrich=0` skips LLM), `POST /api/labhealth/revalidate`, `GET /api/labhealth/probe?lab=`, `POST /api/labhealth/ask`.
- **UI:** `web/public/labdoctor.html` — premium Catalog Health dashboard: 🛰️ **fleet-pattern banner**, worst-first catalog with **trend sparklines**, lab detail (evidence, diagnosis, before/after fix diff, confidence), **⚡ Approve all & re-validate** self-heal animation, projected-health + **draft-only/human-approves** gate.
- **Data:** `fixtures/lab-catalog.json` — **10 labs** with fleet telemetry + drift-over-time history: 3 broken (region-drift ×2 = a fleet pattern, false-PASS), 1 watch (quota), plus healthy + a transient correctly *not* flagged broken.
- **Tie-in:** `/` serves the flagship Rocky companion (`/classic` = the earlier build); Rocky ↔ Lab Doctor reciprocal links; `?demo=1` lands the character in the matching broken-lab scenario; `?lab=…&heal=1` deep-links a shareable "after" view.

### Demo runbook (two acts, ~4 min)
1. `cd source/rocky-prototype && node web/server.js` → open **`http://localhost:5173/labdoctor.html`**.
2. **Act 1 — the fleet wow:** Catalog Health opens on *"3 of 10 labs failing right now — before a single ticket,"* the **🛰️ fleet-pattern banner** (*"2 labs, same root cause → a platform-level change, not an authoring mistake"*), sparklines showing the drift. Open **"Lock Down a Storage Account"** → *"silently PASSING learners whose work is wrong"* — **100% completion, yet BROKEN.** Open the broken web-app lab → 3 ranked evidence-backed fixes; hit **⚡ Approve all & re-validate** → watch health climb **36 → 100** (draft-only, human-approved, pending author merge).
3. **Act 2 — the heart:** **"See what the learner saw"** → the flagship Rocky character on the same broken lab, taking the learner's side. **"🩺 Lab Doctor →"** returns.
4. **Close on the numbers:** MTTD weeks→minutes · manual QA −50% · broken-lab tickets −30–45% · *the labs test themselves — and heal themselves.*

---

## The pick (decisive)
Build **Lab Doctor**: an autonomous agent that ingests a lab's **Cosmos-authored spec** (guide + validation definitions) plus **learner telemetry** (validation results, deployment/error logs, step timings) and produces a **Lab Health report with ranked, evidence-backed findings and author-ready fixes** — evolving toward **self-healing labs** (detect → draft fix → re-validate). Demo it with **Rocky** as the learner-facing face (takes the learner's side on a broken lab, auto-escalates with diagnostics), then flip to the **Catalog Health** view where Lab Doctor already flagged the same lab and drafted the fix.

**Why not "the companion"?** AI tutors/companions are crowded (Khanmigo, Copilot, countless hackathon bots) — it won't earn *"why didn't we think of this."* Lab Doctor is novel, unglamorous-but-valuable, measurable, grounded in data CloudLabs uniquely owns, and it's the moat.

---

## Structured evaluation

**Problem.** CloudLabs has thousands of labs that silently rot as cloud UIs, SKUs, regions, and policies change. Breakage is caught *reactively* — by frustrated learners and support tickets — often weeks late. Manual QA doesn't scale to thousands of labs; drift is detected at authoring time but not continuously at runtime; and validation bugs (false pass/fail) quietly erode trust.

**Why it matters.** Every broken lab = abandoned learners + support tickets + churn + brand damage, multiplied across the fleet. QA effort scales linearly with the catalog. This is a real, expensive, growing pain that hits learner outcomes, support cost, and product quality simultaneously.

**Proposed solution.** Treat **every learner session as a live test.** Lab Doctor compares **expected** (Cosmos spec: guide steps + validation defs + expected resources) vs **observed** (per-learner validation results + deploy/error logs + timings), classifies divergences (guide issue / validation bug / drift / env-permission), ranks them by **fleet impact**, and **auto-drafts author-ready fixes** (guide edit or validation correction) via the LLM — grounded, with provenance + confidence. Continuous, automatic, fleet-driven QA. Self-healing = draft the fix and re-validate.

**Expected impact.** Mean-time-to-detect a broken lab: **weeks → minutes.** Manual QA hours: **−50%+.** Support tickets from broken labs: **−30–45%.** Catalog health becomes a managed, trending metric. (Learner-side: fewer learners hit broken labs; the companion recovers the ones who do.)

**Technical architecture.**
```
Cosmos spec (guide + validation defs + expected resources) ─┐
Learner telemetry (validation results, deploy/error logs, timings) ─┤
                                                                     ▼
         ┌──────────────── LAB DOCTOR ENGINE ────────────────┐
         │ 1. Normalize → per-step expected-vs-observed diff   │  (deterministic)
         │ 2. Anomaly detect: high-failure step, validation    │
         │    false pass/fail, drift, env/permission codes     │
         │ 3. Fleet aggregation (rank by learners affected)    │
         │ 4. LLM classify + DRAFT FIX (grounded, provenance,  │  (gated LLM)
         │    confidence) → Cosmos Builder-format edit          │
         └───────────────┬───────────────────────┬─────────────┘
                         ▼                        ▼
              Lab Health report            Catalog Health dashboard
              (findings + fixes)           (per-lab score, trend)
                         │
                         ▼  (stretch: self-heal)
              Cosmos Builder draft → Tester re-validate → before/after score
```
Reuses: the existing Node server, the Cosmos API knowledge, the in-tenant LLM, and the **trust/provenance layer** (every finding tagged Observed vs Inferred + confidence). Rocky (existing prototype) is the learner-facing sensor/face.

**Implementation approach (hackathon MVP).**
1. **Data:** 2 sample labs — one deliberately broken (region drift + a validation bug + one confusing step) — with representative learner outcomes (real via APIs where possible, else seeded).
2. **Engine:** `labdoctor/analyze.js` — deterministic expected-vs-observed diff + anomaly rules → findings; then an LLM pass to classify + draft fixes with grounding + confidence + provenance.
3. **API:** `/api/labhealth?lab=` → `{score, findings:[{type, step, evidence, confidence, suggestedFix}]}`; `/api/labhealth/catalog` → list.
4. **UI:** a premium **Catalog Health** view (labs + health scores + trend) → lab detail (findings, evidence, drafted fixes, "apply → Cosmos draft"). Rocky presents the finding (not a dry dashboard).
5. **Demo tie-in:** learner side (Rocky on the broken lab: *"this isn't you — the validation's buggy, I've flagged it,"* auto-escalates) → platform side (Lab Doctor already flagged it + drafted the fix + health before/after).
6. **Trust:** every finding shows provenance + confidence (judges love the no-hallucination rigor).
- **Stretch:** run across ~20 labs to show scale; the self-heal re-validate loop.

**Risks & mitigation.**
- *False positives (bad fix/drift alerts)* → fleet-aggregate (not single-user) triggers; confidence thresholds; **human-approves** every authoring change (Rocky proposes, author accepts).
- *Grounding/hallucinated fixes* → drafts must cite the exact guide step + validation + evidence; provenance-tagged; validation results come only from the API.
- *Data availability in hackathon* → seed representative telemetry; show the pipeline is real against the documented APIs.
- *"It's a dashboard"* → lead with the live agentic detection + the Rocky story, not a static grid.

**Demo value.** High. Two acts: (1) emotional — Rocky takes a stuck learner's side on a broken lab; (2) impressive — *"watch it scan the catalog and find the 3 broken labs with fixes, before anyone filed a ticket."* Ends on a measurable claim (MTTD weeks→minutes, QA −50%, tickets −40%). This is the *"why didn't we think of this"* moment: **the labs test themselves.**

**Future roadmap.** MVP (detect + draft) → fleet aggregation + Catalog Health as a product → self-healing (auto-draft → Cosmos Builder → Tester re-validate) → predictive ("this lab will break when Azure ships the portal change") → the full flywheel feeding Cosmos authoring.

---

## Scorecard (vs the 6 criteria)
| Idea | User | Business | Complexity | Effort | Demo | Long-term |
|---|---|---|---|---|---|---|
| Companion/Tutor | High | Med | Med | Low (have it) | High(emotional) | Med (adoption) |
| **Lab Doctor** | Med(indirect) | **High** | Med | Med | **High**(ROI+wow) | **High**(moat) |
| Self-healing (full) | Med | High | High | High | Very High | High |

**Chosen:** Lab Doctor MVP (detect + draft), Rocky as the face, self-heal as stretch. Highest business + long-term + differentiation, buildable in hackathon time on existing assets.

---

## Competitive validation (workflow `labdoctor-market-research`, 7 agents — COMPLETE)
Full memo: [docs/labdoctor_market_gap.md](labdoctor_market_gap.md). Headlines:
- **The white space is real.** The full loop (telemetry → diagnose → rank by fleet impact → draft author-ready fix) **exists nowhere in the hands-on-lab domain.** Analytics that *show* problems are crowded; systems that *fix content* live only in adjacent domains (docs-as-code PRs, AIOps infra, generative quiz items) and none is triggered by fleet learner telemetry over a lab's guide+validator artifact.
- **Decisive near-miss:** Skillable already runs automated scoring scripts that check environment state — the exact primitive we need — **but aims it at grading the learner, never the lab.** Feasibility proven, gap marked.
- **Biggest threat = Microsoft Drasi** (ran Copilot as a "synthetic user" over 200+ sessions, found 18 issues) — **detection only, no fix-drafting, no fleet ranking.** That's exactly our increment. Don't compete on detection.
- **Category to own: "Autonomous Lab QA."** Moat = vertical integration of four ingredients (lab execution + authored ground truth + fleet telemetry + generative engine) — every rival holds one or two; CloudLabs owns all four.
- **Differentiation line:** *"Anyone can watch a lab fail. Only CloudLabs can close the loop — it alone owns the labs, the authored ground truth of what 'correct' means, the fleet-wide failure signal, and the engine that drafts the fix back in-format. Every flag is evidence-backed by the lab's own validation scripts, not a heuristic guess."*

### Three constraints the research forces into the build (not just the pitch)
- **C1 — Never silently mutate.** Silent healing makes a broken lab show green — the incumbents' documented Achilles heel. Fixes are **drafts** (diff + evidence + confidence); a human approves. The API and UI are built around *approval*, not auto-apply.
- **C2 — The triage/RCA layer is the value center, not the healer.** ~70%+ of failures are timing/env/data/runtime (labs skew even further toward env/permission/async-provisioning); only ~28% are locator-style. Invest in **classification + fleet ranking**, not auto-repair.
- **C3 — Disambiguate flake from drift via fleet aggregation, never one session.** Strongest signal: **a step that *successful* learners fail ⇒ the validator is the bug, not the learner.** This becomes an explicit anomaly rule in the engine.
