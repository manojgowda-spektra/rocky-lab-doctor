# Constraints — Rocky

> **Last Updated:** 2026-06-30
> **Version:** 0.1 (discovery)

---

## Purpose

Non-negotiable boundaries Rocky must operate within. Before proposing an approach, verify it doesn't violate these. Several are *hypotheses to confirm* in discovery (marked ⚠), but they constrain thinking now.

---

## Security & Privacy Constraints

| ID | Constraint | Reason | Notes |
|---|---|---|---|
| SC-001 | ⚠ Must support a **telemetry-only / no-screen-capture mode** | Enterprise surveillance dread (ASM-002) | Likely a hard gate for regulated buyers |
| SC-002 | Lab/cloud observation must be **consented and disclosed** to the learner | Trust, GDPR | No silent watching |
| SC-003 | Cloud state access via **least-privilege, lab-scoped credentials** | Blast-radius containment | MCP agents must not over-scope |
| SC-004 | ⚠ Support **data residency / region-pinned or on-prem inference** options | Enterprise compliance | Validate with buyers |
| SC-005 | No secrets/PII in logs or model context | Security policy | Redaction layer |
| SC-006 | Learner data handling must align with CloudLabs' SOC 2 Type II / ISO 27001 / GDPR / Microsoft SSPA posture | Existing certifications must not be jeopardized | Inherit platform governance |

---

## Pedagogical Constraints

| ID | Constraint | Reason |
|---|---|---|
| PC-001 | Rocky must **ground teaching in Cosmos validation logic**; refuse/hedge when unsure | Teaching-hallucinations are catastrophic (ASM-004) |
| PC-002 | Default behavior is **scaffolding, not spoiling**; full answers require explicit, logged learner choice | Protect learning outcomes (IDEA-003) |
| PC-003 | Default proactivity is **low/reactive**; proactive triggers are precision-gated | Clippy risk (ADR-003) |

---

## Product / UX Constraints

| ID | Constraint | Reason |
|---|---|---|
| UX-001 | The avatar/character must be **configurable and off-by-default for enterprise** | Persona mismatch, enterprise seriousness (ADR-001) |
| UX-002 | Rocky must be **dismissible/disable-able** by the learner at any time | Autonomy, anti-annoyance |
| UX-003 | Must meet **accessibility** standards (screen-reader compatible; respect reduced-motion) | Inclusion; animated character must not break a11y |

---

## Technical Constraints

| ID | Constraint | Reason |
|---|---|---|
| TC-001 | ⚠ **Telemetry-first**; computer vision is fallback only | Cost/latency/privacy/reliability (ADR-002) |
| TC-002 | Must operate **multi-cloud** (Azure, AWS, GCP) | CloudLabs is multi-cloud; neutrality is a moat (ASM-008) |
| TC-003 | Should **build on Cosmos** (validation logic, drift, MCP agents) rather than rebuild | Warm start; avoid duplication |
| TC-004 | Must run inside Windows & Linux lab VMs | Platform reality |

---

## Business / Economic Constraints

| ID | Constraint | Reason |
|---|---|---|
| BC-001 | ⚠ **Cost per lab-hour must stay below value/revenue generated** at peak workshop concurrency | Unit economics (ASM-007) |
| BC-002 | Must not jeopardize existing CloudLabs compliance certifications | Enterprise trust |
| BC-003 | Must integrate with existing CloudLabs LMS API / platform, not fork it | Leverage installed base |

---

## Constraint Conflicts (watch)

| A | B | Tension | Resolution path |
|---|---|---|---|
| SC-001 (telemetry-only mode) | IDEA-001/004 (rich grounding) | Less observation → less context for debugging/nudges | Tiered modes; degrade gracefully |
| UX-001 (enterprise character off) | Brand memorability | Less delight for enterprise | Persona skins |

---

## Pre-Implementation Constraint Check
- [ ] Telemetry-only mode possible for this feature? (SC-001)
- [ ] Consented + least-privilege? (SC-002/003)
- [ ] Grounded in validation logic? (PC-001)
- [ ] Proactivity precision-gated? (PC-003)
- [ ] Multi-cloud? (TC-002)
- [ ] Economics modeled? (BC-001)

---

## Log
| Date | Change |
|---|---|
| 2026-06-30 | Initial constraints from discovery review (security, pedagogy, economics, neutrality) |
