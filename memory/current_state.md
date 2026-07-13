# Current Project State — Rocky

> **Last Updated:** 2026-06-30
> **Updated By:** AI Session
> **Project Health:** GREEN

---

## Overall Status

| Field | Value |
|---|---|
| **Phase** | D0 Discovery COMPLETE → D1 Validation + P1 definition |
| **Health** | GREEN |
| **Mode** | Discovery done; foundational decisions made; not yet building |
| **Readiness verdict** | ~80/100 (up from 76 — biggest unknown ASM-003 partially validated by firsthand platform research) |
| **Blocking Issues** | None blocking; several items to CONFIRM with CloudLabs platform/trust teams (auth scheme, certifications/AI-residency, learner-facing agent hosting, guide format) |

---

## Foundational Decisions (made 2026-06-30)
- **ADR-001 ACCEPTED** — decouple agent (intelligence) from avatar (configurable skin; enterprise-off, students-on).
- **ADR-002 ACCEPTED** — telemetry-first, vision-last.
- **ADR-003 ACCEPTED** — earn proactivity; default silence.
- **ADR-004 ACCEPTED** — v1 = **P1 Guide-aware → P2 Session-aware**; defer P3 (in-VM) / P4 (actionable). ("All but medium risk.")
- **ADR-005 ACCEPTED** — serve **self-paced learners/students first** (design for enterprise from day one).
- **ADR-006 PROPOSED** — build Rocky as a **scoped learner-facing Cosmos Agent** reusing governed read tools + existing per-user OpenAI-credit rails.
- **Platform support: GREENLIT** by lead — Runtime Context API, event bus, and an official guide-pane UI injection point can be prioritized.

---

## What Is Known (firsthand, 2026-06-30)
- Full CloudLabs platform model + lifecycle mapped (`docs/architecture.md`).
- EXISTS (pull APIs): lab guide, validation definitions, per-learner pass/fail validation results, on-demand validation trigger, progress, deployment activity/error log, cloud-spend per user, **per-user OpenAI credit**, **VM shadow URL**, reusable **Cosmos Agent + MCP tool framework** with approvals/audit.
- DOES NOT EXIST yet (build-required, first-party feasible): real-time event feed, cloud-resource-inventory/credentials feed, drift export, **learner-facing AI**, UI-injection point, engagement telemetry (time-per-step/attempts/drop-off/hints).
- UNCONFIRMED (need platform/trust docs): auth scheme + rate limits, certifications + AI data-residency + PII rules, VM remoting backend, guide content format, LMS/LTI/SSO/webhooks, learner-facing agent hosting in Cosmos.

---

## Current Blockers / To-Confirm
| Item | Owner | Why it matters |
|---|---|---|
| Auth scheme + rate limits for the partner APIs | CloudLabs platform | Integration design |
| Certifications + AI data-residency + PII handling | CloudLabs trust/compliance | Enterprise gate; any PII access (ASM-002) |
| Can Cosmos host a learner-facing, lab-session-scoped agent? | CloudLabs platform | ADR-006 feasibility |
| Guide content format + step model extensibility | CloudLabs platform | P1 guide-pane help binding |

---

## Immediate Next Options
1. Draft the **P1 "Guide-aware Rocky" spec** (surface, tool scope, context flow on existing APIs).
2. Resume the **Wizard-of-Oz** brainstorm (TASK-D1-01, still open).
3. Compile a **platform/trust confirmation checklist** to send the CloudLabs teams.

---

## Recent Decisions
| Date | Decision | Ref |
|---|---|---|
| 2026-06-30 | ADR-001/002/003 ratified; ADR-004/005 accepted; ADR-006 proposed | decisions.md |

---

## State Change History
| Date | By | New State | Reason |
|---|---|---|---|
| 2026-06-30 | AI Session | Discovery complete; foundational decisions made; platform reality mapped firsthand | Board review + 2 Cosmos sessions (6 + 12 questions) |
