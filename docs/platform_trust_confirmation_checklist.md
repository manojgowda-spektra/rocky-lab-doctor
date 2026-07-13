# Platform & Trust Confirmation Checklist — Rocky

> **Purpose:** Questions to confirm with the CloudLabs **platform/engineering** and **trust/compliance** teams before committing Rocky's build. Each item gives a plain-English question, why it matters, and what the Cosmos AI could/couldn't tell us.
> **Created:** 2026-06-30
> **Source:** firsthand Cosmos AI sessions (Contoso tenant); raw transcripts in `research/cosmos_session_2026-06-30/`.
> **Legend:** Cosmos status — ✅ answered · 🟡 partial · ❌ couldn't verify (needs a human).

---

## Section A — For the Platform / Engineering lead

### A1. API authentication & rate limits  ❌
**Ask:** How does a service authenticate to the CloudLabs partner APIs (`/api/partners/{partnerGuid}/...`) — an API key, or a login/bearer token (OAuth2 / Azure AD-Entra)? How is a token issued and scoped to a partner, and are there per-minute call limits?
**Why we need to know:** Rocky must securely connect to CloudLabs to read lab + progress data; we can't build or size that connection without the login method and rate limits.
**What Cosmos said:** Couldn't verify. Inferred a `Authorization: Bearer <token>` header (not an API-key-in-path), with `{partnerGuid}` as a scope selector authorized server-side — explicitly "an architectural inference, not confirmed." No rate-limit values available.

### A2. Learner-scoped agent runtime  ❌ (confirmed gap)
**Ask:** Can we run an AI agent *for a learner* during a live lab — scoped to that event user and their specific deployed lab — or is our Cosmos Agent framework author/operator-only today? If not available, can a learner-facing agent runtime be added?
**Why we need to know:** Our cheapest path is to build Rocky on the existing agent/tool framework (ADR-006); if it can't serve learners yet, that's net platform work we must plan and schedule.
**What Cosmos said:** Not today. Cosmos Agents are positioned for author/operator workflows; an in-lab, learner-scoped agent runtime and a learner-facing chat surface are a *"feature gap / not first-class today."* A learner+lab-state-personalized agent "would require a mechanism to pass event-user identity, ODL/deployment IDs, and validation/progress context into a runtime" that doesn't exist turnkey.

### A3. Runtime Context API · push events · UI injection point  ❌ (confirmed gap)
**Ask:** Can we get (a) a single "current lab context" call for an active learner (current step + objective + latest validation results), (b) **push events** when a validation passes/fails or a deployment status changes, and (c) an official way to **inject Rocky's UI panel** into the learner's lab-guide/runtime shell? If not, what's the closest supported mechanism — and can these three be prioritized?
**Why we need to know:** These three are the enablers for the medium-risk "session-aware" Rocky (P2): real-time help instead of polling, and a first-class place for Rocky to live. You've greenlit platform changes — this is the concrete ask.
**What Cosmos said (confirmed this run, PA3):** (a) No learner-runtime "current session context" API — closest is a **management-API lookup** (`cloudlabs_labs_users` + `cloudlabs_labs_instances`, resolve ODL via `cloudlabs_labs_list`). (b) **No webhooks/event bus** for validation or deployment status — implement your own **poller** over instance state. (c) **No UI-injection/plug-in surface** — only lab-guide authoring + template/ODL metadata; `cloudlabs_vm_shadow_url` gives read-only spectate of a learner VM. So all three need new platform work (greenlit).

### A4. Lab-guide content format & per-step model  🟡
**Ask:** What's the exact storage format of lab-guide *content* — HTML, Markdown, or structured JSON? Is the module → exercise → step structure available for the **guide** (not just validations), and can custom metadata or a help panel be attached per step?
**Why we need to know:** Rocky's v1 (P1, guide-aware) needs to bind help to each step; the format and step model determine how cleanly we can attach contextual help.
**What Cosmos said (PA4, live Contoso catalog):** Guide content is exposed as a **"master document"** — `POST .../labGuide/masterDoc`, `.../lab-guide-details`, `.../preview-master-doc`, `GET .../labGuide/{labGuideGuid}/partner-lab-guide`, `.../templateDetails/{templateGuid}`, plus **Git-backed** docs (`listGitDocs/{org}/{repo}/{branch}`, `listGitDocsBulk/{templateGuid}`). Exact format (Markdown vs structured JSON) **not provable without a payload sample**; guide module/exercise/step likely via `lab-guide-details`; **no dedicated per-step custom-metadata / help-panel field** found. Git-backed guides would make parsing/grounding easier for Rocky — worth confirming.

---

## Section B — For the Trust / Compliance lead

### B1. Security & compliance certifications  ❌
**Ask:** Do we have official proof of certifications — a SOC 2 Type II report, ISO 27001 certificate, a signed DPA (GDPR) — and do we support FERPA (our learners may be students)?
**Why we need to know:** If Rocky touches learner data, customers' security/procurement teams require this proof before approving it — it decides which customers we can sell Rocky to.
**What Cosmos said:** Couldn't verify and refused to claim any certification without an official trust document/DPA/questionnaire. (Note: public CloudLabs marketing references SOC 2 Type II / ISO 27001 / GDPR / Microsoft SSPA — confirm the authoritative artifacts and their scope/date.)

### B2. AI inference region, model provider, data retention/training  ❌
**Ask:** For Rocky's AI, which region will inference run in, which model provider do we use (e.g. Azure OpenAI / OpenAI / Anthropic), and can we confirm learner prompts/answers are **not stored or used to train** any model?
**Why we need to know:** Data residency and a "no training on customer data" guarantee are usually hard requirements in education/enterprise contracts — we can't promise them until we know.
**What Cosmos said:** Couldn't verify; declined to guess on residency, providers, or retention — "those are product/security commitments and need a CloudLabs source of truth."

### B3. Learner PII stored + what Rocky may access  🟡
**Ask:** Cosmos could only describe what a platform like this *usually* stores. Can you confirm the **real** list of learner data CloudLabs stores, and define exactly what Rocky will/won't be allowed to see — e.g. limited to the current lab session, with names/emails/secrets stripped before the AI sees them?
**Why we need to know:** Rocky sits right next to the learner, so we must know the real data it can reach (not assumptions) to avoid exposing PII or another learner's information.
**What Cosmos said (best-practice, not verified):** Likely PII = name, email, org, registration/voucher/launch history, progress/scores, deployment & cloud user IDs, session/activity logs, IP/device, and free-text the learner types. Recommended rule: *"an in-lab AI may access only de-identified, session-scoped learning context and sanitized telemetry needed to help with the current exercise, unless the learner or an authorized instructor explicitly invokes a higher-privilege support workflow"* — default-deny on roster/email/IDs, redact secrets (creds, tokens, ARM/Terraform vars) before processing, scope to current learner+session, audit any support mode, no training reuse.

---

## Business inputs still needed from Manoj (not platform/trust)
- **Timeline / pilot:** is there a specific lab or workshop to target for a first Rocky trial?
- **Team & ownership:** who builds Rocky, and is the Cosmos team a partner or a dependency?
- **Budget envelope:** target LLM cost per lab-hour (ties to the existing per-user OpenAI-credit rails).

---

## Status summary
| Item | Owner | Cosmos | Needs human confirm? |
|---|---|---|---|
| A1 Auth & rate limits | Platform | ❌ | Yes |
| A2 Learner-scoped agent | Platform | ❌ gap | Yes (+ build) |
| A3 Context API / events / injection | Platform | ❌ gap | Yes (+ build, greenlit) |
| A4 Guide format / step model | Platform | 🟡 | Yes (verify) |
| B1 Certifications | Trust | ❌ | Yes |
| B2 AI residency / retention | Trust | ❌ | Yes |
| B3 Learner PII rules | Trust | 🟡 | Yes |
