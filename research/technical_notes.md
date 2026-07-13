# Technical Notes — Rocky

> **Last Updated:** 2026-06-30
> **Status:** FEASIBILITY HYPOTHESES (pre-architecture; do NOT treat as design)

---

## Purpose of This Document

Capture feasibility thinking and the key technical theses from the discovery review. No architecture is committed yet (we are pre-build). The central engineering stance is **telemetry-first, computer-vision-as-fallback** (see ADR-002).

---

## Thesis 1 — Context Acquisition: telemetry-first, vision-last

How Rocky "knows what's happening," cheapest/most-reliable → hardest:

| Tier | Source | Reliability | Cost/Latency | Privacy | Notes |
|---|---|---|---|---|---|
| 1 | **Cosmos lab spec + validation logic + drift map** | High | Low | Low | Proprietary; the moat. Knows objective, expected outcome, common pitfalls |
| 2 | **Cloud resource graph** (Azure Resource Graph, AWS Config, GCP Asset Inventory) via MCP agents | High | Low-Med | Med (cloud creds) | "Did they create the right resource in the right region/RG?" |
| 3 | **Browser/DOM context** (managed browser / extension) | Med-High | Low | Med | "User is on the VM-creation blade" |
| 4 | **VM activity signals** (foreground window, process list) | Med | Low | Higher | OS-level; privacy-sensitive |
| 5 | **Screen vision (screenshot → VLM)** | Low-Med (fine UI) | High | Highest | FALLBACK ONLY. Expensive, slow, brittle, creepy |

**Key insight:** Most of the perceived "magic" (Rocky knows you made a mistake) comes from Tiers 1–2, which **already largely exist in Cosmos**. Leading with Tier 5 (vision) is the classic mistake — it blows cost/latency/trust and is unnecessary.

---

## Thesis 2 — Cosmos is a warm start, not a cold start

Cosmos already provides (per public Lab Builder docs):
- **Builder:** generates ARM templates + lab guides + **validation logic** per lab.
- **Tester:** end-to-end live runs, step capture, **drift detection**.
- **Agents:** MCP tools, sub-agents, scheduled runs.

**Highest-leverage integration:** a **learner-facing read API** exposing, per active lab session:
- lab objective + task flow + current expected step
- validation logic / expected end-state per step
- known common mistakes / pitfalls
- the drift map (where the guide ≠ current portal)

If this API exists (or can be built), Rocky gets ~60–70% of its value with **zero computer vision**. **This is the #1 thing to confirm with the Cosmos team.**

---

## Thesis 3 — Memory architecture (3 layers)

| Layer | Scope | Holds |
|---|---|---|
| Working memory | Current lab session | Objective, steps done, errors hit, current state |
| Learner profile | Across labs | Skill level, recurring mistakes, pace, preferred assistance level |
| Knowledge base (Cosmos/RAG) | Global | Lab structures, validation logic, pitfall library, docs |

Well-trodden RAG + agent-state pattern; non-trivial at workshop scale (thousands concurrent).

---

## Thesis 4 — Pedagogy as a technical feature

Spoiler control is an engineered behavior, not a prompt afterthought:
- **Hint → Guided → Answer** escalation, gated by learner profile + objective.
- Default to Socratic scaffolding; "give me the answer" is an explicit, logged user choice.
- Grounds in Cosmos validation logic to avoid **teaching-hallucinations** (the worst failure mode — a confident-but-wrong tutor teaches the wrong thing).

---

## Major Technical Challenges / Unknowns

| Challenge | Why hard | Mitigation hypothesis |
|---|---|---|
| Proactive precision | False interrupts kill adoption (Clippy) | Reactive-first; high-confidence triggers only; tunable dial (ADR-003) |
| Grounding / anti-hallucination | Wrong teaching destroys trust | Cosmos validation logic as ground truth; cite sources; refuse when unsure |
| Unit economics at scale | LLM cost/lab-hour × thousands concurrent | Telemetry-first; tiered models; cache lab-level context |
| Enterprise security/governance | Screen/state observation + data egress | On-prem/region inference, redaction, telemetry-only mode; interview buyers early |
| Multi-cloud parity | 3 providers' state APIs differ | Abstraction layer over resource graphs |
| Latency | A slow companion feels worse than none | Telemetry beats vision; stream responses |

---

## Open Technical Questions (for next sessions)

1. What can CloudLabs + Cosmos emit *today* to a learner-facing runtime? (Determines vision-free value.)
2. Does Cosmos already have a chat/inference API Rocky should build on rather than rebuild?
3. What's the realistic cost-per-lab-hour, telemetry-first vs. vision-first, at peak concurrency?
4. What observation model will enterprise security accept (egress, residency, redaction)?
5. Can MCP agents query learner cloud state with least-privilege, lab-scoped creds safely?

---

## Spikes To Consider (not commitments)

- **Cosmos read-API spike** — expose one lab's spec+validation to a prototype Rocky; measure value without vision.
- **Resource-graph grounding spike** — detect "wrong resource/region" from cloud state alone.
- **Cost model spike** — simulate token cost per lab-hour at workshop scale.

---

## FIRSTHAND FINDINGS — Cosmos AI session (2026-06-30, Contoso tenant)

Source: drove the Cosmos author-facing AI chat directly (Playwright over CDP) and asked about CloudLabs' real API/data surface. The chat is grounded in CloudLabs' actual API/tool catalog, cites endpoints, and hedges appropriately (low hallucination). Endpoint names are as reported by the chat — **confirm against live API docs/payloads before building**.

### What EXISTS today (pull/polling APIs) ✅
- **Lab guide content/structure:**
  `GET /api/partners/{partnerGuid}/labGuide/{labGuideGuid}/partner-lab-guide`
  `GET /api/partners/{partnerGuid}/labGuide/{templateGuid}/template-lab-guides/{onDemandLabGuid}`
- **Validation DEFINITIONS** (modeled as module → exercise → step; steps are **deployable/executable** → carry machine-readable check logic):
  `GET /api/partners/{partnerGuid}/templates/{templateGuid}/template-lab-guide-validations`
  `GET /api/partners/{partnerGuid}/templates/{templateGuid}/cloud-platforms/{cloudPlatformGuid}/validations`
  `GET .../validations/steps/{stepGuid}/deploy-step`
- **Per-learner progress + validation RESULTS at runtime** (pass/fail by exercise/step):
  `GET /api/partners/{partnerGuid}/labs/{ondemandLabGuid}/progress/users/{eventUserId}`
  `POST /api/partners/{partnerGuid}/labs/{ondemandLabGuid}/progress/summary`
  `POST /api/partners/{partnerGuid}/lab-cluster/{labClusterGuid}/lab-cluster-validation-progress`
  `POST /api/partners/{partnerGuid}/lab-cluster/{labClusterGuid}/lab-cluster-user-validation-status`
  `PUT .../lab-cluster/{labClusterGuid}/event-users/{eventUserId}/validations/exercises/{exerciseGuid}/steps/{stepGuid}`
- **Deployment identifiers + activity/error log:** `cloudlabs_labs_instances` (deploymentId, deploymentUniqueId, cloudUserId/"Cloud DID", subscriptionFriendlyName, eventUserEmail, status), `cloudlabs_labs_users`, `cloudlabs_deployment_activity_log` (read-only deploy activity/errors).

### What does NOT exist today (would require platform build) ⚠️
- **No real-time event feed** — no webhook/SSE/WebSocket, no "current active step," no "learner is doing X now," no fine-grained activity (browser nav, commands, portal clicks). *Integration today = poll progress + correlate to guide/validation structure → derived view, not live telemetry.*
- **No cloud credentials / resource-inventory feed** — CloudLabs does not hand out subscription/tenant IDs, service principals, or tokens for Azure Resource Graph/ARM/AWS/GCP. To inspect what a learner actually built, you need privileged access to the provisioning subscriptions **out of band** (CloudLabs controls provisioning, so this is buildable first-party — but net-new).
- **No drift-results API/export** — Cosmos Tester drift findings are internal-only.
- **No learner-facing AI assistant today** — all AI surfaces (Builder, Tester, chat, scheduled agents) are author/operator-facing. **This is exactly Rocky's gap.**
- Exact validation payload fields (expectedState, expectedOutcome text, script body, result timestamps, failure reason) unconfirmed without a live payload.

### Implication for Rocky's telemetry-first thesis (ASM-003)
Telemetry-first is **viable for the objective/pedagogical layer** (lab structure + objectives + validation model + per-learner pass/fail) — that data is real and pull-accessible today. But three capabilities Rocky wants are **build-required, not off-the-shelf**:
1. **Real-time "stuck now" signal** → needs new eventing OR client-side (browser/VM) observation.
2. **Live environment grounding** (the #1 killer feature, IDEA-001) → needs first-party privileged read into provisioning subscriptions (+ the existing deployment activity/error log helps).
3. **Drift-absorbing guidance** (IDEA-002) → needs drift results exposed.

Net: the moat's "intent + validation" vertices are **already real**; the "live state" vertex and "real-time" dimension are **buildable but not yet exposed**. Good news — all are first-party to CloudLabs (no third-party dependency).

### Recommended Cosmos/CloudLabs upgrades to enable Rocky (priority order)
1. **Learner-context read API** — one call returning, for an active session: current step, step objective, expected outcome (human-readable), and latest per-step validation results. (Stitches existing pieces into Rocky's core context.)
2. **Validation event stream** — push/webhook on validation pass/fail + deployment errors (turns polling into real-time "stuck" detection without screen-watching).
3. **First-party environment-read service** — privileged, lab-scoped, least-privilege query of the learner's actual deployed resources (powers grounded debugging) — telemetry-only, no creds handed to clients.
4. **Expose drift results** per step (powers drift-absorbing guidance).
5. **Expose validation definition expected-state + human-readable outcome** as first-class fields (improves grounding, reduces hallucination).

---

## Open Technical Questions (updated)

1. ~~What can CloudLabs/Cosmos emit today?~~ → **Answered above** (pull APIs yes; real-time/cloud-state/drift no).
2. Exact validation payload schema (expected state, outcome text, timestamps, failure reason)? — needs live payload.
3. Does CloudLabs control the provisioning subscriptions such that a first-party environment-read service is feasible? (Almost certainly yes — confirm.)
4. Is real-time eventing on the CloudLabs roadmap, or must Rocky observe client-side?
5. Auth model: how does an integrating system obtain partnerGuid scope + per-event credentials safely?

---

## Update Log

| Date | Updated By | Key finding |
|---|---|---|
| 2026-06-30 | AI Session | Telemetry-first thesis; Cosmos read-API is the #1 unlock; vision is fallback |
| 2026-06-30 | AI Session | Firsthand Cosmos AI session: pull APIs for guide/validation/progress EXIST; real-time feed, cloud-state access, drift export, and learner-facing AI do NOT (all buildable first-party) |
