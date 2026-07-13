# CloudLabs + Cosmos: Evidence-Based Understanding, Fit Assessment & Strategy

**Date:** 2026-07-04
**Method:** 8 parallel evidence extractors over (a) the internal Cosmos-AI QA project, (b) verbatim Cosmos AI session transcripts, (c) Rocky project docs, (d) public web; then a 4-lens adversarial challenge panel (fit / support / author / new-product). 246 cited facts; load-bearing claims spot-verified against source files.

**Evidence tiers used throughout:** `verbatim-internal` (direct quotes/endpoints from internal docs), `qa-observed` (firsthand test observations), `public-doc` (public web), `inferred` (deduction). Where a claim is assumption, it is labelled. **Nothing internal-only (private repos, live API payloads, real ticket data) was fabricated — the biggest unknowns are listed in §12.**

---

## The one-paragraph reframe (read this first)

The Rocky/Lab Doctor thesis was: *"labs rot in production; detect it from fleet telemetry and a learner companion."* The evidence overturns the premise. **Labs are not primarily rotting in production — they are born broken at authoring time, before any learner touches them, and Cosmos cannot reliably fix them.** Meanwhile the fleet-telemetry substrate both products need does not exist (no eventing, poll-only, no step/retry/help signals, no learner-AI surface, no UI-injection point, no cloud-state access, unknown auth). The highest-value, lowest-risk, shippable-now opportunity is therefore **not** the runtime companion or the runtime fleet monitor. It is **Lab Doctor's engine repointed at Cosmos's pre-publish artifact bundle** — a deterministic cross-artifact quality gate that catches the exact defects the QA project already proved, runs on files already on disk, converges where Cosmos's own Fix loop demonstrably never does, and fills the literal open slot where Publish has no quality gate. That unblocks the generative-authoring strategy the whole company is betting on.

---

## 1. CloudLabs Architecture Understanding

**Object model (confirmed, verbatim-internal + public-doc, corroborated by two independent web passes):**
Partner (tenant/customer boundary; owns templates, capacity, users) → **Template** (reusable blueprint = IaC + VM/browser config + lab guide + validations + metadata) → published as **ODL / Event / Hackathon / POC / Demo** (delivery object: title, duration, vouchers, limits, hot instances) → **Event User** (one person's participation record in one offering; transient — exists ~a day) → **Lab Instance/Deployment** (the actual per-learner env). **Lab Cluster** = infra grouping for capacity/placement; it also scopes the runtime validation APIs (`labClusterGuid` appears in validation-status paths — an extra resolve hop nobody would guess from the learner-facing model).

**A lab instance has three layers:** (A) real cloud resources (Azure/AWS/GCP) deployed from IaC into a CloudLabs-managed subscription; (B) access surface — a browser-based remote-desktop VM and/or portal access via per-learner launch URLs; (C) control plane — registration, deployment, launch links, status, validation, time limits, cleanup.

**Lifecycle:** author a Template → publish as ODL/Event → on launch CloudLabs allocates a subscription, deploys resources, provisions the browser VM, wires identity, returns a launch URL → learner works → on expiry, deallocate/delete (policy-based; essential for cost control).

**Provisioning specifics (verbatim-internal):** ARM parameter files carry runtime placeholder tokens (`GET-AZUSER-UPN`, `GET-AZUSER-PASSWORD`, `GET-ODL-ID`, `GET-DEPLOYMENT-ID`, `GEN-PASSWORD`). Per-learner governance is generated per lab: a custom RBAC role + Azure Policy constraining the sandbox. VM config is via Custom Script Extension → bootstrap PS1 (installs tooling, writes env vars, uploads sample files, places starter scripts at paths validators expect). Resource groups follow `rg-X-$DID` (deployment-ID suffix). Hot instances / pre-warmed capacity exist.

**Critical structural fact:** first-party control of BOTH the learner VM/browser workspace AND the cloud subscription. Instructor **Shadow VM** (read-only over-the-shoulder spectate) already ships. So capabilities are build-required but have no third-party dependency.

**Confirmed hard limits:** learners are **event-transient** (per-learner longitudinal skill graphs are called "fiction" for the current user base). Async provisioning makes timing-flake rampant. Env-class failures (quota, SKU-region, marketplace terms, RBAC propagation) are the most painful and least learner-fixable class.

---

## 2. Cosmos Architecture Understanding

**What Cosmos is (verbatim-internal):** an internal Spektra tool (beta; self-labelled "AI can make mistakes") that generates complete CloudLabs lab packages from a natural-language prompt. UI sections are each a distinct agent: **Home → Builder (generate + chat) → Review (with embedded Fix) → Cost → Publish → Agents.**

**The authoring pipeline:** NL prompt → Builder generates **Plan + all artifacts** (ARM `deploy-01.json` + params, bootstrap `psscript-01.ps1`, Lab Guide markdown, ~6–10 PowerShell validators, custom RBAC role, Azure Policy, cost inputs) → Review audits for blockers → Fix applies fixes (single / "Fix All") → Cost estimates per-session Azure cost → **Publish pushes the package as a GitHub PR to main.**

**The load-bearing design rule (Cosmos's own words):** *"All artifacts must agree on six conventions or the lab fails"* — resource names, container names, deployment names, RG naming, VM file paths, env var names. This is the fault line the whole system runs along.

**Agent framework:** declarative-prompt agents bound to centrally-registered, policy-gated MCP tools with human approval required for writes. Registered tools include `reference_*`, `web_search`, `cloudlabs_labs_users/_instances`, `cloudlabs_deployment_activity_log`, `cloudlabs_vm_shadow_url`, `cloudlabs_templates_*`, `cloudlabs_odl_deploy`, `cloudlabs_dashboard_cloud_spend`, `cloudlabs_audit_by_record`. The Agents page lists Cosmos AI (Run + Chat) plus four platform agents (Azure IaC Helper, Lab Guide Writer, AWS IaC Helper, Validation Script Writer — Chat only).

**The three-part self-framing:** Builder (authoring), Tester (drift detection), Agents (workspace assistants). **All author/operator-facing. No learner-facing AI exists anywhere in the running lab.**

### The damning part — Cosmos's real quality (all `qa-observed`, spot-verified):

- **Detection works; remediation is broken.** Cosmos's own Review agent independently found the deepest cross-artifact bugs. But **Fix All never converges**: 3 rounds held blockers at 30 → 30 → 30 → 29 → 30, and one run *increased* them 15 → 27. "Fixing A breaks B" is proven with named files and reproduced identically across two different labs — it's systemic.
- **Review output is not trustworthy as a metric:** findings aren't deduped by root cause (one defect → 5–6 findings), aren't version-keyed (persist after edits — reported "ARM template missing" while listing 12 findings about that same file), and the agent is **non-deterministic on identical inputs** (resolved/new split shifts run-to-run with zero changes).
- **Publish does not gate on quality.** A 30-blocker (6 Critical) package reached an open PR to main; the only gate is a lint-force toggle. Structural "green" = artifact existence, not correctness.
- **Validators are themselves a defect surface, not ground truth.** They're generated in the same unverified pass and reference wrong paths/RG names/resource kinds — so "validation failed" can mean a broken validator, and "passed" can mean nothing worked (a validator checks a resource *exists*, never that it's *wired*).
- **The headline failure:** starter scripts **fake the AI** — regex/placeholders instead of calling Document Intelligence / Azure OpenAI — while the full expensive AI stack is deployed and billed but never used. The guide tells learners they're using services the code never calls.
- **Cost is unreliable:** the estimator missed the VM and storage account, silently hand-typed a VM price into the headline number when the pricing API failed, and omits AI-token / Doc-Intelligence consumption — the dominant cost of AI labs.
- **Adoption is stalling at the same spot:** of 7 labs across 4 users on the Contoso tenant, **6 never progressed past "Plan ready."** The funnel breaks right after planning.

---

## 3. User Journey Analysis

**Learner journey (confirmed):** access via registration/invite/voucher/event → launch → CloudLabs provisions env + browser VM + injects credentials → learner follows a markdown guide (modules → exercises → steps) → runs per-step PowerShell validators on demand → completes/expires. **There is no learner-facing AI in this loop today** — the slot Rocky targets is genuinely empty.

**Where it breaks for learners (evidence):** the IDP lab's concrete chain — guide says "Open Azure AI Foundry Project" → no project was ever deployed → Exercises 5 & 7 fail; separately, validators checking wrong paths mean learners who did the work correctly are shown "not completed." Feasibility assessment: **6 of 7 exercises "Risky/Partial," only Getting Started "Likely" to work.**

**Instructor journey:** almost entirely **unknown**. Shadow VM exists; the strategic review says "CloudLabs is event-heavy and nobody has designed for the instructor." Zero instructor interviews were conducted — detection latency, triage behavior, escalation paths for a broken-lab-mid-class, and surveillance tolerance are all open.

**Content-author journey:** NL prompt → Plan → generate → wrestle with a non-converging Fix loop and an untrustworthy blocker count → (often) stall at "Plan ready" → or force-publish a defective package. Manoj's real QA is a **manual 4-layer process performed OUTSIDE the platform** (UI test, artifact presence, a cross-artifact consistency matrix, learner-feasibility walkthrough) precisely because Cosmos's Review can't be trusted — and he verifies suspicions by interrogating the Cosmos chat.

---

## 4. Support Workflow Analysis

**Reality:** every support-cost number in the business case is explicitly **illustrative/parametric** (100k sessions/mo, 4% ticket rate, ~$18+20min/ticket, ~$25k/mo saved). **No real CloudLabs ticket volume, cost-per-ticket, session count, QA hours, or MTTD baseline exists in any document.** The public support SLA promises first-response only (4h standard), **no resolution commitment.**

**Industry QA models (confirmed):** manual pre-launch QA (Skillable — silent on re-testing), author-built opt-in CI (Instruqt `instruqt track test`), or reactive learner complaints (Qwiklabs/Pluralsight/MS Learn). Everyone stops at detection or grades the *learner*; nobody runs an autonomous detect-rank-fix loop on the *lab*.

**The correct deflection definition (internal, important):** resolved-and-completed (validation passes after help), never "didn't file a ticket" — the latter rewards learners who give up.

---

## 5. API & Telemetry Inventory

**Exists today (pull APIs, verbatim-internal):**
- Lab guide content: `GET .../labGuide/{labGuideGuid}/partner-lab-guide`; some guides Git-backed (`listGitDocs...`).
- Validation *definitions*: `GET .../templates/{templateGuid}/template-lab-guide-validations`, `.../cloud-platforms/{cpGuid}/validations`, deployable-step endpoints.
- Validation *authoring* (write): `POST .../validations/modules/{m}/exercises/{e}/steps/{s}`.
- Per-learner progress + pass/fail results: `GET .../labs/{odl}/progress/users/{eventUserId}`, `POST .../lab-cluster/{lc}/lab-cluster-validation-progress`, `.../lab-cluster-user-validation-status`.
- **Validation-result WRITE:** `PUT .../lab-cluster/{lc}/event-users/{u}/validations/exercises/{e}/steps/{s}` — an external system can *push* per-learner per-step results INTO CloudLabs. (Not assumed anywhere in the Rocky/Lab Doctor design — a latent capability.)
- On-demand validation trigger: `POST .../users/{u}/validate`, bulk `validate-all-users`. **No scheduled/interval validation.**
- Deployment diagnostics: `cloudlabs_labs_instances`, `cloudlabs_labs_users`, `cloudlabs_deployment_activity_log` (stages, failure reason, resource/provider errors).
- Cloud spend: `cloud-spend-stats`, `user-level-cloud-spend`, `vm-usage`, `resource-usage`, `capacity-and-limits`.
- **Per-user OpenAI credit system in production:** `sync-open-ai-credit`, `extend-open-ai-credit` — an existing in-lab AI cost-metering rail.
- Governance: partner/tenant isolation, RBAC (`currentRoleId`), audit log; customer integration = white-label portal + launch/deep-link URLs + CSV/exports.

**Does NOT exist (confirmed absent, build-required):**
- **Any eventing** — no webhook, SSE, WebSocket, SignalR, or queue. Polling is the only "real-time" (the learner's own Resources tab refreshes every ~15 min).
- **Behavioral telemetry** — no time-per-step, attempt counts, drop-off, or hints-used. Any behavior-aware product must generate its own.
- **Cloud-state access for external systems** — no subscription IDs/credentials/service principals, no resource-inventory feed. To inspect what a learner built you must bring your own cloud creds and correlate via `eventUserEmail`/`deploymentId`.
- **Learner-runtime AI surface / UI-injection point / learner-scoped Cosmos agent runtime** — no sanctioned place to render a companion; confirmed gap in Cosmos's own words.
- **Drift-results API/export** — Cosmos Tester detects drift but results are internal-only.
- **A structured guide semantic model** — guides may be only rendered HTML/Markdown, not step-level machine-readable fields.
- **Even the API auth scheme and rate limits are unconfirmed** after two research passes.

**Proposed but not built:** the 5-event telemetry contract (`step_started`, `validation_run`, `error_seen`, `help_requested`, `session_ended`). Only `help_requested` is emitted from a surface Spektra owns; the other four must be negotiated with CloudLabs engineering. Phase-0 workaround = poll validation results + deploy logs at ~30s and synthesize deltas.

---

## 6. Rocky Fit Assessment

**Verdict: PARTIAL FIT.** A narrow, reactive, guide-grounded slice fits; the flagship "behavior-aware smoke detector" does not fit the real platform. Lab Doctor fits materially better than the Rocky companion.

**Fits perfectly:** (a) Lab Doctor's detect-from-three-boring-sources engine (validation results + deploy logs + guide structure — all poll-tolerant pull APIs); (b) a pre-launch **lint/quality gate** (fills the real hole where Publish doesn't gate); (c) Rocky's reactive, failure-triggered "Diagnose" on a failed validation row (triggered by a result the API already returns; the review itself names "inside the failure" as the best help moment); (d) grounding-with-refusal / honest abstention (demanded by the evidence that validators and Cosmos review are unreliable); (e) fleet-aggregation to disambiguate flake vs drift; (f) cost metering on the existing OpenAI-credit rail.

**Unrealistic today (each blocked by a confirmed-absent capability):** proactive real-time intervention (no event bus), any behavior-aware feature (no telemetry), in-VM instrumentation / "sees live cloud state" (no creds/inventory; shadow URL is human-only), any injected in-lab UI panel (no injection point), learner-scoped Cosmos-Agent hosting (confirmed gap), "continuous/autonomous" monitoring (validation is on-demand only), and the **auto-fix → Cosmos-regeneration closed loop** (depends on an unconfirmed Builder write API *and* feeds drafts into a Fix engine that demonstrably doesn't converge).

**Unnecessary:** computer-vision/screen observation (Tiers 1–2 give ~60–70% of value with zero vision; enterprise requires a no-screen-capture mode anyway); per-learner memory / skill graph (learners are event-transient); building a bespoke drift-*detection* engine (Cosmos Tester + Microsoft's Drasi already do detection — "the detection half is not a moat"); any over-the-shoulder Rocky feature (Shadow VM already ships it).

**Duplicates existing capability:** Rocky live-monitoring ≈ Instructor Shadow VM; Lab Doctor drift detection ≈ Cosmos Tester / Drasi; environment-state checking ≈ Skillable Scored Labs + CloudLabs' own validators; Rocky "check your work" ≈ existing on-demand validate endpoints; Lab Doctor fix-drafting ≈ the (broken) Cosmos Fix agent. **Positioning collision:** CloudLabs marketing already advertises an "AI Tutor with on-demand hints," "Live Portal Testing," "real-time progress," and "at-risk alerts" — several of which the API investigation found unbuilt.

**Genuinely new value:** (a) the closed loop through the authored artifact (validators → fleet outcomes → Cosmos regeneration) — "exists nowhere"; (b) fleet-impact *ranking* + flake/drift disambiguation; (c) auto-*drafted* fixes (CloudLabs claims detection, not auto-fix); (d) an *exposure/consumption* layer over signals locked inside Cosmos; (e) auditing the *lab* not the *learner* (inverts the whole industry); (f) a per-instance **Pre-Flight env check** at launch (targets the ~70% env-class failures; exists nowhere); (g) a learner-facing grounded companion at all.

**Redesign:** real-time Rocky → reactive Diagnose companion; behavioral monitoring → Phase-0 poll-synthesis + negotiated telemetry contract; autonomous self-healing → **detect-rank-DRAFT with human approval, never auto-feed Cosmos Fix**; continuous monitoring → scheduled batch ingest + **own the pre-publish gate**; learner-scoped agent → external service on pull APIs; "sees live cloud state" → a net-new first-party privileged env-read service or drop it; competency SKU → shelve until telemetry + persistent identity exist; deflection metric → resolved-and-completed.

---

## 7. Product Gap Analysis (CloudLabs+Cosmos vs. Rocky)

**What CloudLabs is missing:** a pre-publish quality gate that blocks broken labs; any eventing/behavioral telemetry; a learner-facing AI surface + UI-injection point; a first-party env-state reader for validating what got deployed; true per-session cost truth (incl. AI tokens); an instructor cohort-ops console (marketed but unbuilt).

**What Cosmos is missing:** a Fix loop that converges; a trustworthy, deduped, version-keyed findings ledger; a ground-truth step (it never deploys/runs what it generates); validators that are verified rather than generated-and-hoped; AI-consumption cost accounting; a "deployed-but-not-consumed" check so it stops shipping labs that fake the AI.

**What users struggle with:** labs that are broken on arrival (6/7 exercises), false "not completed" from buggy validators, no in-lab help, env failures they can't fix.

**What authors struggle with:** a non-converging Fix loop, an unusable blocker count, no visibility into what Fix changed, and a Publish step that lets defects through — so they stall at "Plan ready" or ship broken.

**What instructors struggle with:** unknown (no research) — but no cohort console and no broken-lab-mid-class escalation path.

**What support struggles with:** no baseline (no ticket→lab→step attribution), reactive-only, a first-response-only SLA, and no way to collapse N learner tickets from one broken lab into one incident.

---

## 8. Top 10 Missing Features Across CloudLabs/Cosmos

1. **Pre-publish quality gate** that actually blocks defective labs (today only a lint toggle).
2. **Cross-artifact consistency checker** enforcing the six conventions across ARM/bootstrap/validators/guide.
3. **Deployed-but-not-consumed detector** (catch the "fake AI / expensive stack never called" class).
4. **Convergent, deterministic fixer** for the mechanical mismatch class (replace non-converging Fix All).
5. **Trustworthy findings ledger** (root-cause dedup + file-hash-keyed auto-invalidation → a monotonic "am I done?" signal).
6. **Author-time golden deploy-and-run harness** (the only true ground truth — Cosmos never runs what it generates).
7. **True per-session cost accounting** incl. AI tokens + budget caps + pre-launch cost lint.
8. **Per-instance Pre-Flight env check** before the learner gets the launch URL.
9. **Instructor/operator cohort-ops console** on Shadow VM + progress polling.
10. **A 5-event telemetry contract + eventing** (unblocks every behavior-aware feature).

---

## 9. Top 10 Biggest Opportunities (ranked by evidence strength × shippability)

1. **Cross-Artifact Consistency Compiler = the deterministic pre-publish gate.** Every proven deep defect (TECH-001/002/003/006) is an instance of the six-conventions rule Cosmos itself declares. Runs on files already on disk — no telemetry, no runtime API, no event bus. Converges where Fix All never does. *This is Manoj's manual Layer-3 matrix, automated.* Lowest effort, highest leverage.
2. **Lab Cost Truth (FinOps).** The only high-value idea NOT blocked on telemetry. Prices sessions from the real Azure bill Spektra owns (incl. AI tokens), enforces caps on existing credit rails. First-dollar revenue; its byproduct (a first-party privileged billing/env reader) is substrate for #6/#8/Lab Doctor.
3. **Deployed-But-Not-Consumed Detector.** New classifier catching the most reputationally damaging + cost-wasting defect (fake-AI labs). Quality story and dollars story in one.
4. **Trustworthy Findings Ledger.** Cheap normalization layer over Review output → the monotonic progress signal authors lack (prime suspect for the 6/7 stall).
5. **Author-Time Golden Deploy-and-Run Gate.** The only true ground-truth layer; makes "validation passed" mean something. Higher effort (scratch subscriptions), so Phase-2.
6. **Live Event Command Center** (instructor cohort ops on Shadow VM + polling) — the most buyer-visible surface; fulfils a marketing promise. Instructor appetite unvalidated.
7. **Rocky's "Is it me or the lab?" Diagnose button** — the one high-value support move in the companion; correct-attribution at the failure moment.
8. **Ticket→Lab→Step root-cause ledger** — the missing support-cost baseline; makes everything else measurable and priceable.
9. **Per-instance Pre-Flight env check** — attacks the ~70% env-class failures; gated on a first-party env reader (#2's byproduct).
10. **Fleet Cloud-Drift Intelligence / Verified-Competency SKU** — real data-product upside, but gated on telemetry + persistent identity. Long-horizon.

---

## 10. What We Should Build Next

**Build the Cross-Artifact Consistency Compiler as a deterministic pre-publish gate for Cosmos**, seeded directly from Lab Doctor's engine and Manoj's manual matrix. Concretely: parse the artifact bundle (ARM outputs, bootstrap references, validator targets, guide tokens), enforce the six conventions, add the deployed-but-not-consumed check, emit a **deduped, file-hash-keyed, monotonic** findings list with **draft fixes + evidence + confidence** (human-approved, never silent), and make IT the Publish gate. Zero new platform APIs, no telemetry, funded by internal authoring-quality budget, and it directly attacks the 6/7 adoption stall. Run **Cost Truth** in parallel as the first-revenue wedge and the source of the first-party env reader.

Rocky the companion is **deferred to a single slice**: the reactive "Diagnose at failure" button, built on existing pull APIs, gated on grounding, measured as resolved-and-completed — and its *epistemology* (honest-by-default, refuse-when-unsure) is ported into the authoring QA layer, which is exactly what Cosmos Review/Fix lack.

---

## 11. Revised Roadmap

- **Phase 0 (now, no platform deps): Cosmos Reliability Gate.** Consistency Compiler + deployed-but-not-consumed detector + findings ledger, wired as the Publish gate. Parallel: Cost Truth v1 (billing→session attribution on existing spend/credit endpoints). Deliverable: no defective lab reaches a PR to main; every session has a true cost.
- **Phase 1 (1 sprint of platform work): Ground Truth + Diagnose.** Author-time golden deploy-and-run harness (scratch subscriptions). Rocky "Diagnose at failure" on existing validation-result APIs. Begin the ticket→lab→step ledger for the real support baseline.
- **Phase 2 (negotiated platform work): Telemetry + Runtime.** The 5-event contract + eventing; Lab Doctor becomes a *runtime* fleet monitor (its original vision) now that signals exist; Live Event Command Center; per-instance Pre-Flight (needs the first-party env reader from Cost Truth).
- **Phase 3 (data products): Fleet Drift Intelligence, Verified-Competency SKU, Assessment-as-a-Service** — gated on Phase-2 telemetry + hardened identity.

**Every phase gate is now data, not vibes:** Phase 0 proves the gate cuts blockers-to-zero and unstalls authoring; the ticket ledger proves the support baseline before pricing an ops SKU; the expected-state audit (still unrun) proves catalog groundability before any runtime bet.

---

## 12. Biggest Remaining Unknowns (must-close before betting)

- **No real operational numbers:** ticket volume/rate/cost, session count, QA hours, MTTD, catalog break-rate — every ROI figure is a placeholder.
- **The expected-state audit was never run** (top-50 labs: step-coverage % and richness %). Runnable now on the contoso tenant in ~2 days. Gates any grounding/runtime bet.
- **Zero instructor interviews** — the cockpit's entire premise is unvalidated.
- **API auth scheme, rate limits, compliance posture (SOC2/ISO/PII/AI-residency)** unconfirmed — gate enterprise + PII access + poll-loop sizing.
- **Builder write API existence** unconfirmed — gates the closed-loop-to-Cosmos vision.
- **Public web pass caveat:** competitor capability claims (Skillable/Instruqt/Drasi) and CloudLabs marketing features are vendor-stated, not independently verified; some marketed features (AI Tutor, real-time progress) appear unbuilt.

---

## Final Recommendation (the honest answer to "Rocky, Lab Doctor, or something else?")

**Something else — but it's adjacent to Lab Doctor, not a new invention.**

- **Rocky (companion) is the weakest bet.** It's the most exciting demo and the worst platform fit: its flagship vision collides with confirmed reality on every axis (no events, no telemetry, no UI injection, no learner runtime, no cloud state, unknown auth), learner pain is entirely assumed, and it sits in a red-ocean AI-tutor market. Keep only the reactive Diagnose slice and its epistemology.
- **Lab Doctor is stronger — but not in its designed form.** The runtime fleet monitor is blocked on telemetry that doesn't exist ("the flywheel is a story, not a pipeline"). Its *engine* is the asset.
- **The bigger opportunity everyone missed:** the reliability crisis is at **authoring time, not runtime.** Cosmos — the generative engine the whole company is betting on — produces labs that fail 6 of 7 exercises, can't fix them (Fix All never converges), and ships them anyway (no publish gate). Whoever makes Cosmos-generated labs actually deployable and correct unblocks the entire AI-authoring strategy. That is Lab Doctor's engine, repointed from "monitor production" to "gate authoring," and it's shippable now with zero platform dependencies.

**Reliability is the product. The authoring gate is the flagship. Cost Truth is the first dollar. Rocky is a later feature.**
