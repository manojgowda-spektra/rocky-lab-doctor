# Rocky — Product Strategy: from "capable" to "exceptional"

> What makes Rocky memorable and defensible once the technical architecture exists. Opinionated.
> **Created:** 2026-07-01. Companion doc to `docs/rocky_architecture_and_execution.md`.

## The one-line bet
The companion is the **adoption engine**; the **self-improving lab catalog (fleet validator + data flywheel)** is the **durable, defensible, monetizable value.** Build the companion to earn the observation rights and the love — but the moat is turning every learner session into lab-quality intelligence.

---

## 1. Differentiation — strip the character, what remains?
Copilot / ChatGPT / Claude are **pull-based, environment-blind, and journey-stateless** — a genius in another room you have to go visit. Rocky's defensible value with the robot removed:
- **The intersection no general AI can reach:** (lab intent from Cosmos) × (your live environment state) × (pedagogy). Copilot can't see your Azure subscription state or know the lab's expected outcome.
- **Grounded + verifiable** — it *knows vs. guesses* (trust-first provenance). Generic AI guesses confidently.
- **Proactive + situated** — acts at the moment of confusion, inside the environment, before you ask.
- **Closes the loop to product quality** (validator/flywheel) — no assistant does this.
- **One companion across the whole VM**, not a chat box in a tab.

**Why users miss it:** not the jokes — it removes the *"stuck and alone"* feeling and the tab-switch to ChatGPT. They miss the sense that *something understood their specific situation and had their back.* Rocky doesn't compete on "smart" (commoditized) — it competes on **"knows my situation and is here."**

## 2. Memory — how far
Three layers, with discipline (remember *actionable patterns*, not a hoard):
- **Session (working):** current lab, steps done, errors, what's been said (no repeats).
- **Learner profile (durable):** learning style (hint-first vs answer-first), pace, skill per domain, recurring mistakes, labs completed, topics mastered/struggled, preferences (verbosity, humor, DND habits).
- **Never:** raw screens/PII hoarding or creepy over-personalization. Consented, learner-owned, portable.
Yes, it becomes a better mentor over time — because it remembers your *trajectory* (calibrate scaffolding, skip what you know, pre-warn your weak spots). That's the thing a stateless assistant structurally cannot do. **Guardrail:** memory must drive concrete adaptation; privacy/governance is the gate.

## 3. Learning profile / skill map
A per-learner **skill graph** (domains as nodes: Networking, Storage, RBAC, Foundry, PowerShell, K8s…), each with an **evidence-weighted, decaying mastery score** from: labs completed, validation pass rates per topic, hints used, time-vs-expected, retries, questions. (This is *open learner modeling* from ITS research.) Adapt: strong → less help + more challenge; weak → more scaffolding + pre-warnings + fundamentals. Show the learner their own map (transparent + motivating). **Challenge:** skills are contextual and fade — use it to *adapt help*, never to *rank/judge*; handle cold-start via first-lab inference + optional self-declared level.

## 4. Predictive assistance (react → predict)
The highest-leverage upgrade, powered by three inputs: **fleet stats** ("step 7 fails for 40% due to RBAC propagation"), **this learner's profile** ("you struggled with RBAC last time"), **Cosmos known pitfalls**. A per-step **risk model** + the learner's progress → a brief, reassuring **pre-warning** *before* the painful step. **Challenge:** predictions must be **calibrated, rare, and reassuring** — over-warning is noise and can prime anxiety/failure ("everyone fails here"). Only high-confidence, genuinely-tricky steps. This is arguably Rocky's most memorable capability.

## 5. Fleet intelligence (the flywheel)
10k learners on a lab → aggregate: most-failed step, most-retried validation, most-confusing instruction (longest pauses / most questions), most-common ticket, most-misunderstood concept. Two payoffs: **(a) better runtime help** (tuned pre-warnings/hints) and **(b) better labs** (feeds Cosmos authoring). This is the **proprietary, compounding data moat** — unavailable to any generic AI because they don't own the labs, the intent, or the fleet. Architecture: anonymized telemetry → analytics store → per-lab "hotspot" model → feeds runtime + a QA dashboard. Aggregate/anonymous; per-learner data stays governed.

## 6. Rocky as teacher (understand, not click)
Pedagogy layer, disciplined so it never lectures:
- **Just-in-time "why" micro-lessons** (≤1–2 sentences, at the relevant moment): "You're adding a managed identity so the app reaches Storage without a stored password."
- **Socratic prompts** occasionally ("what do you think this VNet protects?") before revealing.
- **Consequence framing:** "skip this role assignment and it deploys fine but 403s at runtime."
- **Scaffolding + fading** via the skill map (more early, less as mastery grows).
- **Optional depth** ("tell me more") — never forced.
Rule: teach *at the point of relevance, briefly, optionally.* The skill map decides *when* a concept is worth explaining (new to this learner) vs. skipping.

## 7. Multi-persona vs single adaptive — verdict
**One adaptive personality, not multiple personas.** Rocky's tone/behavior already adapt via the structured-voice engine (emotion+tone+context). Fragmenting into separate characters is inconsistent, confusing, and breaks the bond that makes it memorable. BUT expose a few **user-selectable intent modes** that change *behavior/guardrails, not identity*: **Exam Mode** (no answers, only checks — assessment integrity), **Challenge Mode** (harder, less help), **Explain-More/Architect** (design-level depth). Think "spoiler dial," not "different Rockys." Consistency = trust = memorability.

## 8. Ten "wow" moments (moments, not features)
1. **The pre-save** — before a painful step: "RBAC can take a few minutes here — totally normal, don't panic."
2. **The one-line clarity** — collapses a confusing concept into a sentence that finally clicks.
3. **The invisible catch** — "you're about to deploy to East US, but this lab needs West US 2" *before* the failure.
4. **The root-cause reveal** — "it failed because marketplace terms weren't accepted, not your config." (Saves an hour.)
5. **The broken-lab detection** — "this isn't you — the validation has a bug on step 4; I've flagged it, here's how to proceed." (Takes your side.)
6. **The welcome-back** — "last time you nailed networking but RBAC tripped you up — quick refresher first?"
7. **The teach-not-tell** — asks the question so *you* solve it, then: "exactly — you got that yourself."
8. **The silent competence** — never needed until you did; then instantly right, then out of the way.
9. **The escalation done for you** — "couldn't fix this one; filed a ticket with all logs + my analysis. You don't have to explain anything."
10. **The genuine delight** — a perfectly-timed, on-topic joke or a celebration after a brutal deployment.
Pattern: **wow = it understood my specific situation and prevented pain, revealed truth, taught me, or took my side.** Felt understanding, not features.

## 9. AI Lab Validator — the biggest business value (expand)
Reframe Rocky as a **continuous, fleet-scale QA engine for the lab catalog.** Roles:
- **Lab QA Engineer** — every session is a live test (expected vs observed).
- **Drift Detector** — runtime drift (portal UI changed → guide stale); extends Cosmos authoring-time drift.
- **Validation Auditor** — false pass/fail detection (resource correct but check fails, or vice versa).
- **Instruction Quality Reviewer** — flags confusing/ambiguous steps (pauses, retries, questions) + suggests rewrites.
- **Support Ticket Reducer** — deflects common issues; unresolved ones cluster into author signals.
Architecture: runtime observations → per-session lab-health events → **fleet aggregation** → a **Lab Health dashboard** (per lab: step pass rates, drift alerts, validation anomalies, confusion hotspots, ticket clusters, a **health score**) → routed to Cosmos authoring (auto-draft fixes via Builder).
**Why it's the biggest value:** the companion helps one learner at a time (**linear**); the validator improves *every lab for every future learner* and cuts support cost (**compounding, leveraged**), and it monetizes to the **buyer** (catalog quality + support cost), not just the learner. CloudLabs has thousands of labs that rot as clouds change — Rocky makes QA **continuous, automatic, fleet-driven.** Sell **"self-validating, self-maintaining labs."** Uniquely yours (needs the intent + fleet + observation you own).

## 10. If I were CTO — roadmap + what NOT to build
**Phase 1 — Grounded, honest, single-lab companion (browser).** Runtime Context API + Cosmos RAG per lab + validation-grounding + trust/provenance + reactive help + escalation-with-diagnostics. *Prove the moat: grounded beats generic.*
**Phase 2 — Proactive + memory + fleet v1.** Event stream, struggle scoring, adaptive polling, learner profile/skill map, **predictive pre-warnings from fleet stats**, teaching micro-lessons, **Lab Health dashboard v1 (validator MVP).** *Memorable + business value begins.*
**Phase 3 — On-VM agent (whole-VM awareness).** UIA-first perception, desktop presence, real environment grounding + pointing, deeper troubleshooting. Gated on trust/security answers.
**Phase 4 — Autonomy + closed authoring loop.** Guided/auto-fix (with confirmation), Cosmos auto-drafts guide/validation fixes from fleet signals, Exam/Challenge modes, cross-lab skill graph, scale hardening.

**Intentionally NOT build:**
- ❌ Computer-vision-first (accessibility covers it; vision = costly/creepy last resort).
- ❌ Global cross-lab knowledge graph upfront (per-lab RAG scales; KG premature).
- ❌ Voice/TTS early (demo-flashy, low value, noisy in shared settings).
- ❌ Auto-modifying the user's cloud resources without confirmation (trust/safety).
- ❌ Heavy gamification/streaks (feels manipulative in enterprise learning).
- ❌ Multiple separate personas (one adaptive character).
- ❌ Always-on heavy per-learner reasoning (event-triggered for fleet cost).
- ❌ Building our own models (frontier models + our **data** is the moat, not the model).

**Biggest long-term opportunity (honest bet):** not the companion — the **self-improving lab catalog.** Rocky as the fleet-scale validator + flywheel makes thousands of labs continuously self-correcting and cuts support cost. The companion is the *delivery vehicle and adoption engine* (it earns observation rights + learner love); the *compounding, defensible, monetizable* value is **every learner session becoming lab-quality intelligence** — which a competitor with a generic assistant can never replicate, because they don't own the labs, the intent, or the fleet.
