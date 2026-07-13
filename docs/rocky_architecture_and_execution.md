# Rocky — Architecture & Execution Plan

> How Rocky actually works in a real CloudLabs/Cosmos environment. Grounded in the firsthand Cosmos API
> findings (`research/technical_notes.md`), the whole-VM reference architecture (`design/whole-vm-awareness-reference-architecture.html`),
> and ADR-002 (telemetry-first), ADR-003 (earn proactivity), ADR-006 (build-as-Cosmos-agent), and the trust-grounding fix.
> **Created:** 2026-07-01. Legend: ✅ exists today · ⚙️ build-required (first-party feasible) · 🔵 future/R&D.

---

## The one-paragraph thesis
Rocky is a **layered agent**: *Perceive → Ground → Reason → Act*. It perceives lab state from CloudLabs APIs (and, later, the desktop via an on-VM agent), grounds every claim in the **Cosmos-authored lab spec** (guide + validation logic) plus **real observed state**, reasons with an in-tenant LLM gated by a cheap deterministic pre-filter, and acts through a governed tool set. The hard problems are **not** "knowing thousands of labs" (Cosmos already structures each one) — they're **live environment awareness, trust/grounding, and doing it at scale without wasting tokens.**

---

## 1. CloudLabs / Cosmos integration

**Systems Rocky talks to:**
1. **CloudLabs platform APIs** (partner-scoped) — the authoritative source of lab structure + learner state.
2. **Cosmos knowledge** — the per-lab spec (guide, validation logic, pitfalls) authored by Builder/Tester; also the existing **Cosmos Agent + MCP tool** framework Rocky can extend.
3. **Cloud control plane** (Azure Resource Graph / ARM; AWS/GCP equiv) — to see what the learner *actually* created. ⚙️ via a first-party read service (CloudLabs never hands raw creds to clients).
4. **LLM** — in-tenant Azure OpenAI, metered by the **per-user OpenAI-credit** system CloudLabs already has ✅.
5. **On-VM Rocky Agent** 🔵 — desktop/app awareness inside the lab VM (P3).

**APIs (✅ confirmed to exist from the Cosmos session):**
- Lab guide: `GET /api/partners/{p}/labGuide/{guid}/partner-lab-guide`, `labGuide/masterDoc`, git-backed `listGitDocs/...`
- Validation definitions (module→exercise→step, deployable): `.../templates/{t}/template-lab-guide-validations`
- Per-learner validation results: `.../labs/{odl}/progress/users/{eventUserId}`, `.../lab-cluster-validation-progress`, `.../lab-cluster-user-validation-status`
- Trigger validation: `POST .../users/{eventUserGuid}/validate`, bulk `validate-all-users`
- Deployment activity/error log: `cloudlabs_deployment_activity_log`, `.../deployment-activity-log`
- Instance identifiers: `cloudlabs_labs_instances` (deploymentId, cloudUserId, subscriptionFriendlyName, eventUserEmail, status)
- Cost/limits: `cloud-spend-stats`, `capacity-and-limits`; **AI credit**: `sync-open-ai-credit`, `extend-open-ai-credit`

**APIs that must be built (⚙️, all first-party feasible):**
- **Runtime Context API** — one call → {current step, objective, expected outcome, latest per-step validation results} for an active session. (Today you must stitch guide + validation + progress yourself.)
- **Event stream / webhooks** — validation pass/fail, deployment status change, session launched/expiring, step change. (Today: **no event bus — polling only.**)
- **Live environment read service** — least-privilege, lab-scoped query of the learner's deployed resources (Resource Graph). (Today: **no cloud-credential/resource feed.**)
- **Drift-results export** — Cosmos Tester computes drift at authoring; expose it at runtime.

**Events consumed:** today **none** (poll). Target: the four event types above.

**Permissions:** one **partner-scoped, least-privilege, read-mostly** API credential + a **per-session scoped token**; the cloud-read service uses a controlled service principal on the *provisioning* subscriptions (Rocky reads state, never receives raw creds); on-VM agent runs least-privilege, outbound-only. Auth scheme itself is **unconfirmed** (likely Bearer) — checklist item to confirm.

**How it gets lab context:** at session start, load the **Template spec from Cosmos** (guide + validations + expected resources). **How it knows learner state:** progress/validation-results APIs (+ deploy log) — polled today, event-driven later; live resource state via the read service.

```
                         ┌──────────────────────── ROCKY AGENT ────────────────────────┐
  CloudLabs Platform ───▶│ PERCEIVE   lab state (APIs) · desktop (on-VM UIA) · cloud RG │
  Cosmos (guide/valid)──▶│ GROUND     per-lab spec + RAG + observed state (typed facts) │
  Cloud Resource Graph ▶ │ REASON     deterministic pre-filter → in-tenant LLM          │
  On-VM Agent (P3) ─────▶│ ACT        speak / point / guide / validate / escalate       │
                         └───────┬───────────────────────────────┬──────────────────────┘
                          per-user OpenAI credit           governed MCP tools + audit
```

---

## 2. The "thousands of labs" problem — and why it's the easy part

**Assumption challenged:** you don't hard-code per-lab knowledge or pre-build a giant global knowledge graph. **Cosmos already authored every lab as structured data** (guide + module→exercise→step validations + expected resources). Rocky just **loads the one lab the learner launched, on demand, and caches it per template.**

- **Read the guide before/at start** ✅ — fetch guide master-doc + validation defs.
- **Process challenge guides** ✅ — same pipeline.
- **Build lab memory/context** ✅ — a per-session **Lab Context Object (LCO)**.
- **Knowledge graph** — a *lightweight per-lab* structured object (steps→expected resources→validations→pitfalls), **not** a heavy global KG. A cross-lab KG is a 🔵 optimization, not a requirement.
- **Embeddings / RAG** ✅ — chunk guide + validation descriptions + Cosmos pitfall notes → **vector index cached by `templateGuid`** (built once per lab, reused across all its learners). Retrieve at query time.

**Rule:** Rocky answers lab-specifics **only** from retrieved LCO + observed state. Not in context → it says so. So "thousands of labs" scales trivially — you load one lab per session, cache per template; no manual curation because Cosmos produced the structure.

---

## 3. Lab-understanding pipeline — "Intelligent Document Processing using Azure AI Foundry"

On launch (event or poll surfaces `templateGuid + onDemandLabGuid + eventUserId`):

1. **Resolve identity & lab** — map the event-user to the template/ODL.
2. **Fetch the spec** — guide master-doc (+ git docs), validation definitions (module→exercise→step), ARM/expected-resource definitions.
3. **Parse into the LCO:** objective; ordered step list; per-step **expected outcome**; **expected Azure resources** (Foundry hub/project, storage, Document Intelligence, model deployment) from ARM + validation targets; **validation checks** per step; **known pitfalls** (from Cosmos + drift data); troubleshooting notes.
4. **Index** — chunk + embed the guide/validations/pitfalls → per-`templateGuid` vector store (cached; built once).
5. **Seed the state tracker** — pull current progress/validation results so Rocky knows where the learner is *right now*.
6. **Ready gate** — Rocky will not answer lab-specifics until the LCO is loaded (prevents blind answers).

**Storage:** LCO in session memory; embeddings cached at template level; a **learner profile** persists across sessions (skill, recurring mistakes, pace).

---

## 4. Environment awareness — which tech, for what (telemetry-first, ADR-002)

| Signal | Technology | Tier |
|---|---|---|
| Lab step / validation / progress / deploy status | **CloudLabs APIs** (structured, authoritative) | 🥇 primary ✅ |
| What the learner actually built (region, SKU, config) | **Azure Resource Graph / ARM read** (first-party service) | 🥇 ⚙️ |
| Which app / dialog / error is on the VM desktop | **On-VM agent: UI Automation / accessibility tree + window/process/event hooks** (gives element bounding boxes → enables pointing) | 🥇 🔵 |
| Terminal / custom-UI text UIA can't read | **OCR** (Windows.Media.Ocr / Tesseract), active-window only | 🥈 🔵 |
| Opaque / non-accessible UIs, holistic "what's on screen" | **Vision-language model on a redacted screenshot** | 🥉 last-resort 🔵 |
| Driving/inspecting an in-VM browser | **Playwright** (niche) | situational 🔵 |
| In-page (today) | Page Visibility / focus / activity | limited ✅ |

**Honest:** cross-app/screen awareness needs the **on-VM agent** (you own the VM image → first-party). Computer vision is the *expensive fallback*, not the default — accessibility + platform telemetry cover the large majority.

---

## 5. Scan frequency & performance (no wasted tokens)

**Assumption challenged:** don't poll on a fixed timer, and never call the LLM on a schedule.

- **Event-driven first** (once the event bus exists ⚙️): react to validation pass/fail, deploy status, and on-VM UIA focus/error events. Idle cost ≈ 0.
- **Adaptive polling** where events don't exist yet: progress/validation/deploy-status every ~10–20s, **backing off when stable/idle**, **tightening right after a user action or a failure**. UIA events are effectively free (no pixel polling).
- **AI calls only on triggers**, gated by a **deterministic pre-filter** (rules / tiny model) that answers "is anything notable / worth an LLM call?" Cheap scans (API polls, UIA reads, rule checks) run often; **expensive scans (VLM screenshot, big-model reasoning) fire only when the pre-filter says so**, and within the **per-user OpenAI-credit budget** + the anti-Clippy budget wallet.

| Cheap (frequent) | Expensive (gated) |
|---|---|
| API polls, UIA reads, deterministic rules, small-model classify | VLM/OCR on screenshot, main-LLM reasoning, RAG synthesis |

---

## 6. Detecting user struggle

Combine signals into a **struggle score** (weighted): time-on-step vs. expected · repeated validation failures (results API) · repeated deploy failures (deploy log) · repeated/again clicks or command failures (on-VM) · inactivity · repeated similar questions (conversation memory) · retry count.

**Decide to help** when: score > threshold **AND** confidence high **AND** not recently helped for this issue **AND** not in Focus/DND. **Reactive-first** — Rocky *offers* ("want a hand?"), doesn't auto-fix. **Anti-annoy:** budget wallet (≤1/min, ≤~8/session), backoff on dismissal, gaze-before-voice, one offer per distinct issue.

---

## 7. Detecting broken labs (the product-improvement engine)

Core technique: **compare expected (Cosmos spec/validation/guide) vs. observed (resource-graph + UIA + validation results + deploy log).** Classify divergences:

| Symptom | Signal |
|---|---|
| Guide/instruction issue | Learner followed the step, resource-graph shows they did it "right," yet validation fails — **especially across many learners** (fleet signal) |
| Validation bug | Resource IS correct (resource-graph confirms) but validation reports fail |
| Wrong screenshot / outdated UI | Guide references a UI element UIA/vision can't find on the current portal → runtime **drift** (extends Cosmos's authoring-time drift detection) |
| Expired / quota / permission / subscription | Deploy-log error codes + cloud-read |

**Single-user detection + fleet aggregation** → labs with high failure/struggle rates get flagged to the authoring team, feeding Cosmos's drift/pitfall library. **This closed loop is the real moat**, not the avatar.

---

## 8. License / access issues — end-to-end

1. **Identify:** parse deploy-log error codes (`SkuNotAvailable`, `QuotaExceeded`, `AuthorizationFailed`, `MarketplacePurchaseRequired`, region/policy) + cloud-read (role assignments, quota, region availability).
2. **Verify:** cross-check against the lab's expected config (Cosmos) and real cloud state — confirm it's real and persistent, not transient.
3. **Suggest fix:** grounded, scaffolded, tied to the specific code (accept marketplace terms · request quota · assign the missing role · use the lab's region/SKU).
4. **Verify fix:** re-trigger the validation (`.../validate`) or re-query resource state → confirm resolved; if not, escalate with diagnostics.

---

## 9. Self-healing before escalation — three categories

| Class | Examples | Rocky's role |
|---|---|---|
| **A — Rocky-auto (read-only/safe)** | transient retry, re-run a validation, re-read state, interpret an error, point to the right control | Does it itself; user unaware |
| **B — User-guided** | wrong region/RG, self-assignable role, accept marketplace terms, recreate a resource, fix a config value, re-run a command | Rocky guides → user acts → Rocky **verifies** |
| **C — Support-required** | subscription/quota beyond user control, validation bugs, guide errors, expired environment, capacity | Escalate with full bundle |

**Loop:** detect → analyze → (auto or guided) → verify → retry → confirm → **escalate only** after guided attempts fail or the issue is Class C. (🔵 optional: low-risk **auto-fix with explicit confirmation**, P4, tightly gated.)

---

## 10. Support escalation architecture

Rocky auto-assembles a **support-ready, secret-redacted bundle** (already prototyped: `/api/report` + `supportSummary`):
- user / event-user id + email (per policy) · lab (template/ODL) + current step · error message(s) + codes · **redacted** logs (deploy activity) · **redacted** screenshots (on-VM) · action timeline · troubleshooting attempted + results · **Rocky's analysis + suspected root cause + confidence score** · resource/deployment IDs.

Flow: Rocky files to the support system (ticket API — e.g., Zoho Desk / CloudLabs support) with the bundle → returns a ticket id → keeps the learner informed. **Secrets redacted before sending** (the redaction layer). Tickets aggregate into the product-improvement flywheel. **The learner never has to explain the issue.**

---

## 11. Hallucination prevention — trust-first (core already built)

- **Evidence gating** ✅ (built this session): Rocky asserts only state it has real evidence for; **honest-by-default**; demo/simulation clearly labeled; no lab/validation connected → "I don't have that yet."
- **Grounding:** answers restricted to retrieved LCO (RAG) + observed state; system prompt forbids inventing steps/resources/cloud specifics; "not in context → say unsure + point to the guide."
- **Typed facts / provenance** ✅ (trace built): every answer distinguishes **Observed** (UIA / resource-graph / validation result) vs **Retrieved** (guide/Cosmos RAG) vs **Inference** vs **Assumption** vs **Unknown**, and logs a provenance trace.
- **Validation results come ONLY from the validation API** — never the model.
- 🔵 **Post-response verifier:** a check that any state claim maps to real evidence before display; unverifiable claims are downgraded to questions ("did the deployment finish?") rather than assertions.

---

## 12. Future vision — the world-class architecture (+ assumption challenges)

**Ideal:** an **on-VM first-party Rocky Agent** (UIA-first perception, vision fallback) + a platform **event mesh** + **Runtime Context API** + **live resource-read service** + **Cosmos knowledge/RAG** + **in-tenant LLM** (small-model pre-filter → big-model reasoning) + **learner-profile memory** + a **fleet analytics / data-flywheel** that feeds Cosmos authoring. The "roles" you listed (mentor / teacher / troubleshooter / **lab validator** / support engineer / knowledge assistant) are **one agent with tools + policies**, not separate systems.

**The biggest challenges to your framing:**
1. **The companion UX is not the enterprise value — the AI Lab Validator + data flywheel is.** Rocky continuously comparing expected vs. observed across the fleet auto-detects broken labs and feeds Cosmos → lab quality compounds. That + **support deflection** is where the ROI lives; the lovable character drives engagement/adoption.
2. **Don't over-invest in computer vision.** Accessibility (UIA) + platform telemetry cover ~80–90%. Vision is the costly last resort. Leading with vision blows cost/latency/privacy.
3. **Don't build a giant global knowledge graph.** Per-lab Cosmos spec + RAG scales to thousands of labs with zero manual curation. A cross-lab KG is a later optimization.
4. **Don't poll on timers or call the LLM on a schedule.** Event-driven + adaptive polling + deterministic pre-filter is the scalable pattern.
5. **The on-VM agent is the real unlock** (you own the VM image) — prioritize it over browser tricks; it's first-party and governable.
6. **Trust-first (provenance + evidence-gating) is non-negotiable** for a *teaching* tool — a confident wrong answer teaches the wrong thing. (Already the foundation.)
7. **Consider on-demand/event-triggered Rocky, not always-on per learner,** for cost at fleet scale — spin up reasoning only when signals warrant.

**The flywheel (the thing to actually build toward):**
```
Learner session → Rocky observes (grounded) → helps + logs telemetry
      → fleet analytics detect broken labs / common pitfalls
      → Cosmos authoring improves guides + validations + drift
      → next learner has a better lab + a smarter Rocky   ↺
```
