# Rocky v1 — "Guide-aware Rocky" Build Spec (P1)

> **Status:** DRAFT for review · **Created:** 2026-06-30
> **Scope phase:** P1 (per ADR-004). The low-risk, buildable-now foundation.
> **Decisions in force:** ADR-001 (agent≠avatar), ADR-002 (telemetry-first), ADR-003 (earn proactivity), ADR-004 (P1→P2, defer P3/P4), ADR-005 (students first), ADR-006 (build as scoped Cosmos Agent).

---

## 1. Goal

Give a self-paced learner an in-lab companion that **explains the current step, tells them what success looks like, interprets why a validation or deployment failed, and answers lab-content questions** — grounded in the actual lab, not generic AI. Earn trust with precision before adding any proactivity.

**One-sentence pitch:** *The only assistant that knows this lab's objective, sees this learner's validation/deployment state, and teaches instead of spoiling.*

---

## 2. In scope (P1) / Out of scope (later phases)

**In scope:**
- Reactive Q&A in a panel beside the lab guide (ADR-003: reactive-first).
- Explain the current step + "what does success look like here."
- Interpret a **validation pass/fail** result for the learner.
- Explain a **deployment failure** in plain language (from the activity/error log).
- Answer questions about the lab's content/concepts, grounded in the guide + validation model.
- Spoiler control (hint → guided → answer), default = scaffold.
- Self-generated interaction telemetry (for the data flywheel + future competency signal).

**Out of scope (deferred):**
- Proactive interruptions / stall detection → **P2** (needs event stream + precision).
- Watching the screen / browser / CLI → **P3**.
- Taking actions (run validation for the user, open pages, prefill commands) → **P4**.
- Real-time "what are they doing right now" → needs platform events (P2).

---

## 3. Audience & presentation (ADR-001, ADR-005)

- **Primary audience:** self-paced learners / students.
- **Avatar:** decoupled. Default skin = **clean assistant panel**; the Rocky character is an *optional* skin (more expressive for students, off/minimal for enterprise). The character is never required for function.
- **Posture:** present but quiet — opens collapsed; the learner invokes it. No auto-popping in P1.

---

## 4. Architecture (ADR-006: scoped Cosmos Agent)

```
Learner (in lab) ──▶ Rocky panel (guide pane surface)
                          │  (learner identity + ODL/deployment IDs passed in)
                          ▼
                 Rocky Agent (scoped Cosmos Agent)
                   │  least-privilege READ tools only
                   ▼
   CloudLabs management APIs (existing, pull):
     • lab guide content + step model
     • validation definitions (module→exercise→step)
     • per-learner validation results  /progress/users/{eventUserId}
     • deployment activity/error log
                   │
                   ▼
          LLM (via existing per-user OpenAI-credit rails)
```

- **Build as a new learner-facing Cosmos Agent** reusing the existing agent/tool framework (declarative prompt + policy-gated tools + audit). *Depends on platform confirming a learner-scoped agent runtime — checklist item A2.*
- **Cost:** read/respect/extend the existing **per-user OpenAI credit** (`sync-open-ai-credit` / `extend-open-ai-credit`).

---

## 5. Context inputs (telemetry-first, all existing APIs)

| Context | Source (existing) |
|---|---|
| Lab objective, steps, instructions | lab guide endpoints + step model |
| Expected outcome / checks per step | validation definitions (`template-lab-guide-validations`) |
| Did this learner pass/fail a step | `GET /labs/{ondemandLabGuid}/progress/users/{eventUserId}`, `lab-cluster-user-validation-status` |
| Why a deployment failed | `cloudlabs_deployment_activity_log` (stages, failure reason, resource/provider errors) |
| Learner + lab identity | `cloudlabs_labs_users`, `cloudlabs_labs_instances` (eventUserId, ODL/DID) |

No computer vision. No new platform API required for P1 (P2 will add the Runtime Context API + event stream to make this cleaner/real-time).

---

## 6. Tool scope (least privilege)

**Allow (read):** `reference_*`, lab-guide read, validation-definition read, per-learner progress/validation-result read, `cloudlabs_deployment_activity_log`, `cloudlabs_labs_users`, `cloudlabs_labs_instances`.
**Staff-mode only:** `cloudlabs_vm_shadow_url`.
**Exclude (destructive/admin):** `cloudlabs_templates_delete`, `cloudlabs_template_publish`, `cloudlabs_vouchers_create`, `cloudlabs_odl_deploy`, any write/delete.

---

## 7. Pedagogy & anti-hallucination (ADR-002, constraints PC-001/002)

- **Ground every claim** in the lab guide + validation logic; if unsure, say so and point to the guide — never invent steps or fabricate Azure/AWS/GCP specifics.
- **Scaffold by default:** hint → guided → answer. "Just give me the answer" is an explicit, logged learner choice.
- **Spoiler control dial** exposed to the learner (and configurable per lab/audience).
- **Cloud-aware:** branch guidance by Azure/AWS/GCP (provisioning, console, validation differ).

---

## 8. Privacy & guardrails (constraints SC-*, checklist B3)

- **Session-scoped context only:** current lab + this learner's progress/validation; no roster, no other learners, no broad tenant search.
- **Redact secrets before the model:** credentials, tokens, connection strings, ARM/Terraform vars, pasted console output.
- **Minimize PII:** avoid sending email/full name/IP/DID/voucher/subscription IDs into prompts.
- **Disclose & dismiss:** tell the learner what Rocky can see; always disable-able.
- **Audit:** Rocky actions logged via the existing audit facility.
- *(B1/B2/B3 trust confirmations gate enterprise rollout — see checklist.)*

---

## 9. Rocky must generate its own engagement telemetry

CloudLabs does **not** expose time-per-step, attempt counts, drop-off, or hints-used. P1 logs its own: questions asked, step context, assistance level used, whether the learner recovered, time-to-resolution. This seeds the **data flywheel** and the future **competency signal** (P2+), and feeds proactivity-trigger design.

---

## 10. Success metrics (P1 pilot)

| Metric | Why |
|---|---|
| Time-to-unblock (when Rocky used) | Core value |
| Lab completion w/ Rocky vs without | Outcome |
| **"Would you keep Rocky on?"** | Retention / anti-annoyance proxy |
| Hallucination/incorrect-guidance rate (vs validation logic) | Trust gate |
| Spoiler-dial usage distribution | Pedagogy signal |
| % help served in-product vs learner leaving to ChatGPT | Disintermediation recapture |

---

## 11. Dependencies & open items

- **A2** learner-scoped agent runtime in Cosmos (or fall back to an external service reusing the same APIs).
- **A1** auth scheme + rate limits (sizing the poll loop).
- **A4** guide content format (how cleanly to bind per-step help).
- **B1/B2/B3** trust confirmations (gate enterprise; shape redaction).
- All tracked in `docs/platform_trust_confirmation_checklist.md`.

---

## 12. Suggested build milestones

1. **Spike:** one Azure lab — fetch guide + validation results + activity log for a test learner; prove grounded "explain this step / why did it fail" beats generic AI. (No UI yet.)
2. **Agent:** stand up the scoped Cosmos Agent with the read-tool allowlist + redaction + spoiler dial.
3. **Surface:** minimal panel beside the guide (interim placement until the official injection point lands).
4. **Pilot:** 1 lab, small self-paced cohort, measure §10. Reactive only.
5. **Gate to P2:** if precision + "keep it on" are strong → add Runtime Context API + event stream → earned proactivity.

---

## 13. Open questions
- External service vs in-Cosmos agent if A2 is delayed?
- Which flagship lab for the pilot spike (step 1)?
- Poll interval / cost tradeoff given no event stream yet.
