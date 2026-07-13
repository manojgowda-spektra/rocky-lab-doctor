# Architecture Decision Records (ADRs) — Rocky

> **Last Updated:** 2026-06-30
> **Total Decisions:** 6
> **Note:** ADR-001/002/003 were RATIFIED on 2026-06-30 by lead delegation (Manoj asked the AI to decide avatar/scope/audience and confirmed platform changes can be prioritized). ADR-004/005/006 added from the same session + firsthand Cosmos platform research.

---

## Purpose

Records significant decisions with rationale so they aren't re-litigated. Never delete — mark DEPRECATED/SUPERSEDED.

---

## Decision Index

| ID | Title | Status | Date | Category |
|---|---|---|---|---|
| ADR-001 | Decouple the agent (intelligence) from the avatar | **ACCEPTED** | 2026-06-30 | Product/UX |
| ADR-002 | Telemetry-first, computer-vision-as-fallback | **ACCEPTED** | 2026-06-30 | Architecture |
| ADR-003 | Earn proactivity; default to precise silence | **ACCEPTED** | 2026-06-30 | Product/UX |
| ADR-004 | v1 = P1 Guide-aware → P2 Session-aware; defer P3/P4 (medium-risk ceiling) | **ACCEPTED** | 2026-06-30 | Scope |
| ADR-005 | Serve self-paced learners/students first | **ACCEPTED** | 2026-06-30 | Product |
| ADR-006 | Build Rocky as a scoped, learner-facing Cosmos Agent reusing governed tools | **PROPOSED** | 2026-06-30 | Architecture |

---

## ADR-001: Decouple the agent (intelligence) from the avatar — ACCEPTED
The intelligence/context-engine is the moat; the floating-robot avatar is a configurable presentation skin (off/minimal for enterprise, full character for students). Avoids the Clippy trap and enterprise rejection. *Decided by lead delegation 2026-06-30.*

## ADR-002: Telemetry-first, computer-vision-as-fallback — ACCEPTED
Acquire context from structured sources (Cosmos lab spec/validation/progress + cloud state) before any screen vision. Independently corroborated by the Cosmos AI's own integration ranking. *Decided 2026-06-30.*

## ADR-003: Earn proactivity; default to precise silence — ACCEPTED
Reactive-first; proactivity is a tunable, precision-gated dial unlocked per-trigger. Enterprise default low/off. *Decided 2026-06-30.*

---

## ADR-004: v1 = P1 Guide-aware → P2 Session-aware; defer P3/P4

| Field | Value |
|---|---|
| Date | 2026-06-30 · Status: ACCEPTED · Decider: AI (lead delegation: "all but medium risk") · Category: Scope |

### Context
Lead asked for the fullest version achievable **without exceeding medium risk**. The phased model (P1 Guide-aware → P2 Session-aware → P3 In-VM → P4 Actionable) maps cleanly to a risk gradient: P1 = low, P2 = medium, P3 = high (privacy/infra), P4 = highest (safety/automation).

### Decision
Target **P1 then P2** as the committed scope. **P1** (guide-pane assistant: explain current step, interpret validation pass/fails, answer lab-content Qs) ships on near-existing capabilities. **P2** (stall detection, precise proactive nudges, deployment-error help grounded in `deployment_activity_log`, session memory) follows, enabled by platform additions (Runtime Context API + event bus). **Defer P3 (in-VM/browser instrumentation) and P4 (actionable/automation)** until P1/P2 prove value and the privacy/safety model is validated.

### Consequences
**Positive:** captures the bulk of user value at ≤ medium risk; fast credible v1; avoids surveillance/Clippy/automation hazards early. **Negative:** no live "watching the screen" or auto-remediation in v1/v2 (acceptable — those are the high-risk tiers). 
**Review trigger:** revisit P3 only after P2 telemetry + precision are proven and a consented observation model passes enterprise security review.

---

## ADR-005: Serve self-paced learners / students first

| Field | Value |
|---|---|
| Date | 2026-06-30 · Status: ACCEPTED · Decider: AI (lead delegation) · Category: Product |

### Context
Personas diverge sharply (junior/student vs senior/enterprise). Lead delegated the choice.

### Decision
**Primary first audience = self-paced learners / students.** Highest unblocking pain (no instructor present), most tolerant of a friendly character, clearest place to prove completion/competency lift. Design for enterprise from day one (telemetry-only mode, character-off skin per ADR-001) but optimize the first release for self-paced learners.

### Consequences
**Positive:** fastest path to demonstrable value; character/proactivity can be more generous for this audience. **Negative:** enterprise monetization (competency SKU) comes later. 
**Review trigger:** if early data shows enterprise pull is stronger, re-sequence.

---

## ADR-006: Build Rocky as a scoped, learner-facing Cosmos Agent reusing governed tools

| Field | Value |
|---|---|
| Date | 2026-06-30 · Status: PROPOSED · Decider: TBD · Category: Architecture |

### Context
Firsthand platform research (2 parallel agents, 2026-06-30) found Cosmos already has a **reusable agent + tool framework**: declarative-prompt agents bound to centrally-registered, policy-gated MCP tools, with human-approval workflows for write actions, and an existing **per-user OpenAI credit** system (`sync-open-ai-credit`, `extend-open-ai-credit`). Relevant read tools already exist: `cloudlabs_labs_users`, `cloudlabs_labs_instances`, `cloudlabs_deployment_activity_log`, `cloudlabs_vm_shadow_url`, `reference_*`, plus per-learner progress/validation APIs. No external/public agent SDK was confirmed.

### Decision (proposed)
Build Rocky as a **new learner-facing Cosmos Agent** with a **least-privilege read tool scope** (`reference_*`, progress/validation read, `cloudlabs_labs_instances`, `cloudlabs_deployment_activity_log`; `vm_shadow_url` only in staff/instructor mode), **excluding** destructive/admin tools (`templates_delete`, `template_publish`, `vouchers_create`, `odl_deploy`). Reuse the existing per-user OpenAI-credit rails for cost governance. This avoids rebuilding the agent/tool/governance layer.

### Alternatives Considered
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Build inside Cosmos as a scoped agent | Reuses tools, governance, approvals, credit metering; warm start | Cosmos agents are author-facing today → needs a learner-facing surface + learner-scoped policy | **CHOSEN (proposed)** |
| Build a separate external Rocky service | Full control of UX/latency | Rebuilds auth, tools, governance, metering; slower; duplicates moat infra | Rejected for v1 |

### Consequences
**Positive:** fastest path; inherits tenant isolation, audit, approval gates, and OpenAI-credit metering. **Negative:** depends on Cosmos exposing a learner-facing agent runtime + surface (platform work — but lead confirmed platform changes can be prioritized). 
**Open:** confirm whether Cosmos's agent runtime can serve learner identities at lab-session scope; confirm the agent/tool framework's exact extensibility.
**Review trigger:** if learner-facing agent hosting proves infeasible in Cosmos, fall back to an external service reusing the same APIs.

---

<!-- Template for new ADRs: copy an existing block and renumber. Never delete; mark SUPERSEDED. -->
