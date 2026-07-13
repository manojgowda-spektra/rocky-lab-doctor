# Architecture — Rocky × CloudLabs Integration

> **Status:** DISCOVERY DRAFT — a hypothesis informed by the firsthand Cosmos AI session (2026-06-30, Contoso tenant), NOT a committed design. No build decisions are ratified.
> **Last Updated:** 2026-06-30
> **Architect:** AI Session (pending human review)

---

## Purpose

Capture how Rocky could integrate into CloudLabs, grounded in how the platform actually works. Endpoint names below come from the Cosmos AI's API catalog and **must be confirmed against live API docs/payloads** before building. Raw source: `research/cosmos_session_2026-06-30/`.

---

## Part 1 — How CloudLabs Works (the platform model)

### Core concepts & relationships
```
Partner (tenant/org)
  owns → Template (reusable blueprint: cloud deploy def + VM/browser setup + lab guide + validations)
            published as → ODL (on-demand lab: consumable offering) / Event (scheduled group delivery)
                              registers → Event User (a learner within a specific offering)
                                            launches → Lab Instance / Deployment (the actual env for one learner)
                                                         contains: cloud environment + (browser-based) VM workspace
                                                                   + attached lab guide + validations
Lab Cluster = infra grouping/orchestration unit for capacity & multi-learner delivery
```

### Lab lifecycle
1. **Author** a Template (IaC + VM/browser image + guide + validation scripts) — this is what Cosmos Builder generates.
2. **Publish** as an ODL/Event (duration, vouchers, limits, capacity via subscription groups).
3. **Launch:** learner (event user) redeems access → CloudLabs allocates a subscription, deploys cloud resources, provisions/prepares the **browser-based VM workspace**, attaches guide+validations, returns a launch URL.
4. **Use:** learner works in the browser VM, follows guide (modules → exercises → steps); validations check correctness.
5. **Cleanup:** on expiry, CloudLabs deallocates/deletes resources and reports status.

### Key fact for Rocky
**CloudLabs is first-party in control of BOTH** (a) the learner's VM/browser workspace (where Rocky's UI would live) **and** (b) the cloud subscription (where resource-state grounding lives). Instructor **"shadowing"** of sessions already exists. So the capabilities Rocky needs that don't exist yet are *build-required but first-party feasible* — no third-party dependency.

---

## Part 2 — What the platform exposes today (evidence-based)

### EXISTS (pull APIs) ✅
| Capability | Endpoint(s) |
|---|---|
| Lab guide content/structure | `GET /api/partners/{partnerGuid}/labGuide/{labGuideGuid}/partner-lab-guide` ; `.../template-lab-guides/{onDemandLabGuid}` |
| Validation definitions (module→exercise→step; deployable/executable) | `GET .../templates/{templateGuid}/template-lab-guide-validations` ; `.../cloud-platforms/{cloudPlatformGuid}/validations` ; `.../validations/steps/{stepGuid}/deploy-step` |
| Per-learner progress + validation results (pass/fail) | `GET .../labs/{ondemandLabGuid}/progress/users/{eventUserId}` ; `POST .../lab-cluster/{labClusterGuid}/lab-cluster-validation-progress` ; `.../lab-cluster-user-validation-status` |
| Deployment identifiers + activity/error log | `cloudlabs_labs_instances`, `cloudlabs_labs_users`, `cloudlabs_deployment_activity_log` |

### DOES NOT EXIST yet (build-required) ⚠️
- Real-time event feed (no webhook/SSE/WebSocket; no "current step"/live activity)
- Cloud credentials / resource-inventory feed (no native Azure/AWS/GCP query path for external systems)
- Drift-results API/export
- **Learner-facing AI assistant** (all AI today is author/operator-facing) ← Rocky's gap
- Structured guide semantic model exposed (expected outcomes, hints, linked validations as first-class fields)

---

## Part 2b — Expanded platform findings (2 parallel Cosmos AI agents, 2026-06-30)

All grounded in the CloudLabs API/tool catalog the Cosmos AI can see (Contoso tenant). No OpenAPI/trust docs were attached, so auth scheme, certifications, and exact payloads are **unconfirmed — verify with CloudLabs platform/trust teams**. Raw transcripts: `research/cosmos_session_2026-06-30/answer_A1..A6, B1..B6`.

### Auth & tenancy
- APIs are **partner-scoped**: `/api/partners/{partnerGuid}/...`; resources narrowed by `onDemandLabGuid`, `eventUserId/eventUserGuid`, `cloudUserId`, `deploymentGuid`. Tenant isolation boundary = `partnerGuid`/`tenantId` (mapped via `cloudlabs_tenants_list`).
- RBAC signals: routes carry `{currentLoginEmail}`/`{currentRoleId}`; permission check `.../labs/{onDemandLabGuid}/permission-status`. Audit log exists: `POST .../AuditLog/GetAllAuditLogsByRecord` (`cloudlabs_audit_by_record`).
- **UNCONFIRMED:** auth scheme (API key vs OAuth2 client-creds vs bearer), token issuer, rate limits. Likely one **org-level credential per integration**, not per-learner tokens.

### Eventing
- **None today** — no webhook/SignalR/WebSocket/SSE/queue in the visible surface. Integration = **polling** (`cloudlabs_labs_instances`, `cloudlabs_dashboard_instance_stats`, deployment-status + activity-log, `lab-cluster-user-validation-status`). *Lead confirmed a platform event bus can be prioritized — see Part 3 asks.*

### Learner workspace & UI surface
- Browser-based remote access via **per-learner launch URLs** (`.../VmLaunchURL/{vmName}`, `.../vmShadowLaunchURL/{vmName}`); remoting backend (Guacamole/DCV/RDP-HTML5/W365) **unconfirmed** (abstracted behind launch URL).
- **No supported UI-injection extension point** into the runtime shell today. A cluster-level `save-customization` (branding) exists. Lab guide is a **first-class platform concept**, rendered by the platform → the guide pane is the natural Rocky surface (needs an official injection point added).
- **`cloudlabs_vm_shadow_url`** exists — staff can "shadow" a learner's VM session (relevant to instructor-aggregate + staff-mode observation).

### Guide & validation model
- Validation modeled as **modules → exercises → steps** (executable/deployable). Guide *content* format likely Markdown/HTML (**unconfirmed**). Contextual help best bound to the step model or guide renderer.

### Analytics gap (important)
- Queryable: per-user validation-results, progress summary/detail, users-stats, instance lifecycle. **NOT exposed:** time-per-step, validation attempt counts, drop-off, hints used. → **Rocky must generate its own engagement telemetry**, not rely on existing analytics.

### Agent/tool framework (warm start — see ADR-006)
- Reusable **Cosmos Agent** model: declarative prompt + centrally-registered, policy-gated **MCP tools**, with **human approval for writes**. Key tools (verbatim): `reference_search/_read/_list`, `web_search`, `ask_user_question`, `send_email`, `cloudlabs_labs_users`, `cloudlabs_labs_instances`, `cloudlabs_deployment_activity_log`, `cloudlabs_vm_shadow_url`, `cloudlabs_templates_*`, `cloudlabs_odl_deploy`, `cloudlabs_dashboard_cloud_spend`, `cloudlabs_audit_by_record`, `cloudlabs_metadata_*`, `multi_tool_use.parallel`. **No confirmed external/public SDK** → build inside Cosmos is the safe assumption.

### Validation triggering
- Per-learner **on-demand**: `POST .../users/{eventUserGuid}/validate`, `POST/GET .../users/{eventUserGuid}/validation-results`, bulk `GET .../labs/{onDemandLabGuid}/validate-all-users`. **No scheduled/interval validation** → any proactive "check your work" must be **Rocky-initiated**.

### Cost / metering (Rocky-relevant)
- Cloud spend tracked per tenant/lab/**user** (`cloud-spend-stats`, `user-level-cloud-spend`, `total-cloud-cost`, `resource-usage`, `vm-usage`, `capacity-and-limits`, `cloud-provider-billing-type`).
- **Per-user OpenAI credit already exists:** `GET .../cloud-user/{cloudUserId}/sync-open-ai-credit`, `POST .../user/{eventUserId}/extend-open-ai-credit` → Rocky should **read/respect/extend** this credit; precedent for an in-lab AI cost model already in place.

### Customer integrations
- Confirmed: **custom/white-label portal** framework (`.../custom-portal/...`, `sign-up-fields`, `map-to-portal`), launch/deep-link URLs, reporting dashboards, data exports (`users/export`, `export-user-data`), CSV import.
- **NOT confirmed:** LMS/LTI, SAML/OIDC SSO, webhooks, iframe/embed SDK. (Absence in catalog ≠ absence in product — verify.)

### Governance open items (must get from CloudLabs trust/compliance, not the catalog)
- Certifications (SOC2/ISO/GDPR/FERPA), AI inference region/data-residency, model-provider/retention, PII handling beyond email+IDs, RBAC role model, audit retention/immutability. **Gate for enterprise + any PII access.**

---

## Part 3 — Rocky Integration Architecture (phased)

This phasing is corroborated independently by both the discovery board review and the Cosmos AI. It maps directly to ADR-002 (telemetry-first) and ADR-003 (earn proactivity).

### UI injection — ranked
1. **Platform lab-guide pane / sidecar** — best v1 (first-class, no hacks, lives where the learner already reads).
2. **Platform-level overlay/shell** — best long-term.
3. **Inside the VM image** (desktop sidecar) — strong for CLI/IDE workflows; operationally heavy (image mgmt, cross-platform).
4. **Browser extension** — useful for portal coaching; brittle against portal UI changes.

### Context sources — ranked (telemetry-first)
1. Guide + current step + validation results (platform APIs) — *the moat's "intent" + "validation" vertices, available today*
2. Session/deployment status + diagnostics
3. Step-progression telemetry/events (needs build)
4. VM/browser instrumentation (needs build; privacy-sensitive)
5. Visual/screen observation (last resort — cost/latency/privacy)

### Phase plan
| Phase | Name | Adds | Rocky can… |
|---|---|---|---|
| **P1** | Guide-aware Rocky | Inject in guide pane; consume guide structure + current step + validation results + session status | Explain the current step, define "what success looks like," interpret validation failures, answer lab-content questions. **Easiest credible v1.** |
| **P2** | Session-aware Rocky | Progression telemetry + runtime event bus + deployment diagnostics + Rocky memory/session-notes layer | Notice stalls, warn on common mistakes, adapt hints to history, help with provisioning errors *before* the learner starts. (Unlocks earned proactivity per ADR-003.) |
| **P3** | In-VM Rocky | VM telemetry agent and/or browser extension | Observe portal/CLI actions, just-in-time hints, correlate behavior with steps |
| **P4** | Actionable Rocky | Controlled action APIs (run validation, open correct page, prefill commands, low-risk remediation w/ confirmation) | Active copilot, not just advisor — *carefully, to avoid automating learning away* |

### Highest-leverage NEW platform capabilities CloudLabs should add (priority order)
1. **Runtime Context API** — one call: current step + step objective + expected outcome + latest per-step validation results for an active session
2. **Validation Results API** (formalize what exists) + **deployment diagnostics API** (stage, error category, remediation hints)
3. **UI extension points** in the runtime shell (assistant panel / "Ask Rocky about this step")
4. **Structured guide semantic model** (modules/exercises/steps + prerequisites + expected outcomes + hints + linked validations + resource refs)
5. **Step-progression telemetry**, then a **runtime event bus/webhooks** (session launched, deploy ok/fail, step changed, validation pass/fail, expiry) — *removes polling; the single most important capability for real-time help*
6. **Rocky session-memory/annotation layer** (what was told, trouble spots, inferred task, next action)
7. Later/harder: VM telemetry agent → browser extension framework → in-VM app → (last) live computer-use stream → agent action permissions

---

## Part 4 — Design principles (carried from ADRs)
1. **Telemetry-first, vision-last** (ADR-002) — corroborated by Cosmos AI's own ranking.
2. **Earn proactivity; default to precise silence** (ADR-003) — P1 is reactive/guide-aware; proactivity arrives in P2 with telemetry.
3. **Agent vs. avatar decoupled** (ADR-001) — the integration is about the context engine; UI skin is separate.
4. **Telemetry-only / least-privilege / consented** (constraints SC-001…003) — especially for P3 instrumentation.

---

## Open Architecture Questions
- Confirm endpoint names + validation payload schema against live API.
- Does CloudLabs control provisioning subscriptions enough for a first-party environment-read service? (Almost certainly yes.)
- Is a runtime event bus on the roadmap, or must P2 poll?
- Auth model for a learner-context API (per-session, least-privilege tokens)?

---

## Change Log
| Date | Version | Author | Change |
|---|---|---|---|
| 2026-06-30 | 0.1 | AI Session | Initial integration architecture from firsthand Cosmos AI session |
