# CloudLabs + Cosmos — Live Discovery & Rocky Re-Challenge

**Date:** 2026-07-04
**Primary method:** a live, systematic interview of the **Cosmos AI chat itself** (13 questions, driven through the authenticated browser session via CDP), cross-checked against the 246-fact evidence base from the prior deep research (internal Cosmos QA project + verbatim transcripts + docs + web).
**Evidence labels:** `LIVE` = Cosmos answered it in this interview; `LIVE+tools` = Cosmos used live CloudLabs tool calls (first 4 answers, before its CloudLabs sign-in expired); `RESEARCH` = corroborated by the prior 246-fact base; `UNVERIFIED` = neither could confirm.

> **Honesty note on method.** The first four live answers (instructor, support, events, guide-format) used live CloudLabs tool calls with real endpoint tables. Around question 5 Cosmos's CloudLabs sign-in **expired** ("Reconnect CloudLabs"), so the remaining live answers are Cosmos reasoning from its API-catalog knowledge — substantive and appropriately hedged, but not fresh tenant queries. A follow-up batch stalled on the browser-automation harness (a force-killed process left a half-open CDP socket); I stopped there because its topics were already covered by the combination of live batch-1 answers and the research base. Nothing below is fabricated — live claims are what Cosmos actually rendered on screen.

---

## The through-line

Talking to the live platform did **not** overturn the earlier analysis — it corroborated it, in the platform's own words. Cosmos, reasoning over its own tool catalog, independently ranked **false-pass detection** and **cross-lab pattern detection** in its top-five platform gaps, and summarized the core problem itself:

> *"The biggest gap is not more dashboards. It is the missing intelligence layer between cloud events, validation results, guide intent, learner struggle, and author fixes."* — Cosmos (LIVE)

That sentence is the whole strategy. CloudLabs is strong at **hosting and operating** labs and weak at **understanding learning quality**. The opportunity is the intelligence layer, not more observation (observation already exists).

---

## 1. Learner Journey

Receive launch link → CloudLabs allocates a subscription/sandbox, deploys resources, provisions a browser VM, injects credentials via placeholders (`GET-AZUSER-UPN`, etc.), attaches the guide + validations → learner follows a **document-centric** markdown/HTML guide (modules→exercises→steps) → **triggers a validation on demand** (there is no explicit "run validation" API in the catalog; likely a UI action) → sees pass/fail → completes or expires. `RESEARCH`+`LIVE`

**When a learner gets stuck, their help options today are effectively: none in-product.** `LIVE` Cosmos could not verify any learner-facing AI, in-lab hints, contextual guidance, error explanation, or even a learner "report a problem" flow inside the running lab. A `POST .../labs/{odl}/report` endpoint exists but its purpose is unconfirmed (could be usage/operational reporting). So a struggling learner's real path is: give up, or contact an instructor/support out-of-band.

---

## 2. Instructor Journey `LIVE+tools`

**Exists today (high confidence, tool-cited):** view registered learners + status + launch links (`cloudlabs_labs_users`); per-learner deployment status/DID/subscription (`cloudlabs_labs_instances`); aggregate running/failed/succeeded counts (`cloudlabs_dashboard_instance_stats`); **shadow/spectate a learner VM** (`cloudlabs_vm_shadow_url`); deployment failure/activity logs (`cloudlabs_deployment_activity_log`); validation results; hot-instance pools (`cloudlabs_hot_instances_list`).

**Does NOT exist / no evidence:** a live progress dashboard showing a learner's *current exercise/step*; real-time stuck-learner alerts; instructor broadcast messaging; raise-hand/help queues; class heatmaps; any AI instructor view or automatic "who's stuck" detection; cross-class analytics.

Cosmos's verdict: *"more like an operational support console than a modern classroom cockpit,"* and the biggest gap is **understanding learner struggle**, not observation plumbing.

---

## 3. Author Journey `LIVE`+`RESEARCH`

Cosmos's own diagnosis of author pain (unprompted, ranked):
1. **Authoring is split across many artifacts** (IaC, guide, validations, RBAC/policy, VM config, region/SKU/subscription) → the core problem is keeping them **aligned over time**; drift between guide↔environment↔validations is the dominant defect source.
2. **Validation authoring is hard** — brittle checks, false-fails, false-passes, checks tied to UI details that change.
3. **Guides are document-centric** → objectives/expected-outcomes buried in prose, weakly linked to validations.
4. **Cloud drift** — SKUs/regions/services/RBAC/quota/marketplace/model-names move after the author tested.
5. **Authors discover defects too late** — via learner/instructor complaints, failed deployments, support tickets, manual retesting; no strong pre-ship quality intelligence (no false-pass detection, no ambiguity detection, no content/validation mismatch detection).
6. **Testing as an expert, not a learner** — labs pass internal testing yet fail real learners.

"Where authors spend the most time: debugging why a lab fails in the real cloud; keeping validations accurate; keeping guide aligned with environment; retesting after cloud changes." Cosmos explicitly: *"this is why your Lab Doctor idea is compelling — it targets the exact gap between 'the lab exists' and 'the lab reliably teaches what it's supposed to teach.'"*

---

## 4. Support Journey `LIVE+tools`

**Support has data + controls, not diagnosis.** Available: deployment status/DID/subscription/email, deployment activity logs, VM shadow, validation results, and operational controls (reset user, reset cloud user, extend budget/duration, reassign, escalate internally). A `POST .../report` endpoint exists (purpose unconfirmed).

**Manual today (Cosmos, verbatim):** identifying root cause; determining learner-vs-content-vs-cloud fault; gathering evidence; correlating failures across learners; deciding whether a lab is broadly broken; writing tickets/escalations.

**No evidence of:** in-product learner "report issue" flow, ticket queue, automatic ticket creation, Zendesk/ServiceNow/Jira integration, automated triage, automatic root-cause analysis, evidence packaging, escalation routing. *"I see tools that provide data. I do not see tools that perform diagnosis."* — Cosmos. The platform cannot automatically answer: *why is this learner failing / how many are affected / is it happening across labs / is the validation itself wrong / what fix should the author make* — "exactly the areas where Lab Doctor appears to add the most value."

---

## 5. Lab Lifecycle `RESEARCH`

Author a Template (Cosmos Builder generates IaC + guide + validations + RBAC/policy + cost) → Publish (GitHub PR) → merge → wire into an ODL/Event (duration, vouchers, limits, capacity/subscription groups, hot instances) → learner launch (allocate → deploy → provision VM → inject creds → attach guide/validations → return launch URL) → use → cleanup (deallocate vs delete, policy-based). Automatic: provisioning, credential injection, cleanup. Manual: authoring, review/fix, publish approval, and — critically — quality judgment (Publish does not gate on Review quality; a 30-blocker package reached a PR).

---

## 6. Validation Lifecycle `LIVE`+`RESEARCH`

Validations are **first-class structured objects**: module→exercise→step, definitions authored/stored per step, results stored per learner per step. `LIVE` Read: `GET .../users/{eventUserGuid}/validation-results`. Authoring write: `POST .../validations/.../steps/{stepGuid}`. A **result-write** endpoint exists: `PUT .../event-users/{u}/validations/exercises/{e}/steps/{s}`. Trigger is **on-demand only** (no scheduled/interval validation); no explicit "execute" endpoint in the catalog — execution is likely handled by the lab runtime and results written to the store. Richness varies; the false-pass-prone pattern is the **existence-only check** ("resource exists" rather than "resource is correctly configured"), which passes wrong work. Validators generated by Cosmos are themselves a defect surface (wrong paths/kinds) — so a validation result is **not automatically trustworthy ground truth**.

---

## 7. Environment Lifecycle `LIVE`+`RESEARCH`

Redeem link → allocate subscription/sandbox (or assign a hot instance) → deploy resources from IaC → inject credentials → browser VM session → mid-lab controls (reset user, reset cloud, extend budget/duration) → expiry → deallocate/delete. **Diagnostics are reactive:** the deployment activity/error log is the main (and largely only) source when provisioning fails (quota/SKU/region/marketplace/RBAC). `LIVE` Cosmos found **no proven pre-flight readiness check** before learner handoff — hot instances mitigate operationally, but "assume reactive diagnostics, not preventive; you may need to build your own pre-flight or classify deployment-log failures fast after launch."

---

## 8. Authoring Lifecycle (Cosmos) `RESEARCH`

NL prompt → Builder generates Plan + all artifacts → Review flags blockers → Fix (single / Fix All) → Cost estimate → Publish (GitHub PR). Known-broken: Fix loop never converges (30→30→30→29; once 15→27); Review is non-deterministic, not deduped, stale; Publish gates only on lint; validators/guide/ARM generated unverified and mutually inconsistent; adoption stalls (6/7 labs never past "Plan ready"). *(This is your separate Cosmos track — documented for completeness, not as Rocky scope.)*

---

## 9. Existing AI Capabilities `LIVE`+`RESEARCH`

- **Author-facing:** Cosmos Builder (NL→lab package), Review/Fix, Cost, Publish; platform agents (Azure/AWS IaC Helper, Lab Guide Writer, Validation Script Writer); the Cosmos chat itself (grounded, tool-using, calibrated-honest).
- **Operator/support-facing:** the Cosmos agent tools (labs_users, labs_instances, deployment logs, shadow URL, spend, audit).
- **Learner-facing:** **none confirmed.** `LIVE` Cosmos: *"I cannot verify any shipped learner-facing AI inside a running lab… the gap appears real."*

---

## 10. Existing Platform Gaps — Cosmos's own ranked list `LIVE`

If CloudLabs/Cosmos built only five things, Cosmos picked: **(1) live learner-state intelligence, (2) automated diagnosis with evidence, (3) false-pass / silent-failure detection, (4) pre-flight environment readiness checks, (5) cross-lab pattern detection.** Also named: content↔environment↔validation alignment tooling, learner-facing in-lab guidance, instructor cockpit, closed-loop fix workflow, and integration maturity (webhooks/SCIM/LTI/eventing).

---

## Rocky Re-Challenge (against verified platform facts)

**Would Rocky actually work in the real CloudLabs ecosystem?**
Partially, and only in a reduced form. The premise is validated — there is genuinely **no learner-facing AI** slot filled today. But the flagship "behavior-aware, proactive smoke-detector" companion cannot work now: `LIVE`-confirmed there is no eventing (poll-only), no rich progress telemetry (no current-step/attempts/time/hints), no UI-injection point in the lab shell, and guides are document-centric so step *intent* is locked in prose. A reactive, guide-grounded, failure-triggered "Diagnose" answer **can** work on existing pull APIs (validation results + deployment logs + guide text).

**Which features fit perfectly:** reactive "Diagnose at failure" on a failed validation; honest abstention / grounding-with-refusal (mandatory, since validators are unreliable); one-click escalation with a pre-built diagnostic packet (support has no automated packaging today).

**Which features are unnecessary / would never be used:** live over-the-shoulder monitoring (Shadow VM already ships it); a bespoke drift-*detection* engine (Cosmos Tester + Drasi already detect); computer-vision/screen observation (no source needed; enterprise forbids screen capture); per-learner memory / skill graph (learners are event-transient — exist ~a day).

**Which assumptions were incorrect:** "Rocky sees live cloud state" (no credentials/inventory feed exists); "fleet telemetry with step timings/retries" (does not exist — poll-based validation results + deploy logs only); "proactive real-time intervention" (no event bus); "the guide gives machine-readable objectives/expected-outcomes" (prose only); "validators are ground truth" (they are a defect surface).

**Which opportunities are bigger than Rocky:** the **intelligence/diagnosis layer** Cosmos itself ranks #1–#3 — automated diagnosis with evidence, false-pass detection, and cross-lab pattern detection. These serve support, authors, and operations (who have budget), where Rocky serves learners (who don't pay and whose pain is unmeasured).

---

## Every Major Pain Point (CloudLabs + Cosmos)

**Learner:** no in-lab help of any kind; false "not completed" from buggy validators; env failures they can't fix; no way to report a problem in-product.
**Instructor:** no live current-step view; no stuck-learner detection; no alerts/messaging/help-queue; operational console, not a teaching cockpit.
**Author:** artifact alignment over time; brittle/weak validations (false-fail & false-pass); intent buried in prose; cloud drift; defects discovered late via complaints; non-converging Cosmos Fix loop; unusable blocker count; publish doesn't gate on quality.
**Support:** manual root-cause; manual fault attribution (learner vs content vs cloud); manual evidence gathering; no issue clustering; no ticket queue/triage; N learners from one broken lab = N tickets, not 1 incident.
**Operations/Platform:** reactive-only env diagnostics, no pre-flight; no cross-lab/fleet trend detection; no real-time eventing; thin integration maturity (no webhooks/SCIM/confirmed LTI); unverified auth model and rate limits.

---

## Opportunities, Ranked (User value / Business value / Eng effort / Strategic impact)

Scale: H/M/L. Effort is inverted (L effort = good).

| Opportunity | User | Business | Effort | Strategic | Net |
|---|---|---|---|---|---|
| **1. Automated diagnosis + evidence packaging** (support: why-failing, who's-affected, learner-vs-content-vs-cloud, draft fix) | H | H | **L–M** | H | **Top pick** — Cosmos gap #2; runs on existing pull APIs (logs+validation results); clear payer (support cost) |
| **2. False-pass / silent-failure detection** (fleet expected-vs-observed) | H | H | M | H | Cosmos gap #3; the differentiator; needs cross-session aggregation only |
| **3. Cross-lab pattern detection** (one cloud change broke N labs) | M | H | M | H | Cosmos gap #5; unique to owning the fleet; early-warning for ops |
| **4. Ticket→lab→step root-cause ledger** (the missing support baseline) | L | H | **L** | M | Cheapest; makes everything measurable; unblocks pricing an ops SKU |
| **5. Per-instance pre-flight env check** (before learner handoff) | H | H | M–H | H | Cosmos gap #4; attacks the ~70% env-failure class; needs a first-party env reader |
| **6. Rocky "Diagnose at failure"** (reactive, grounded, honest) | H | M | M | M | The one companion slice that works today; retention not revenue |
| **7. Escalation packet** (auto-attached redacted diagnostics) | M | M | **L** | M | Support has none today; small, high-satisfaction |
| **8. Instructor cohort console** (progress polling + shadow) | M | M | M | M | Buyer-visible; but instructor appetite unvalidated (0 interviews) |
| **9. Live learner-state intelligence** (current-step, struggle) | H | H | **H** | H | Cosmos gap #1 — but blocked on telemetry the platform doesn't emit |
| **10. Verified-competency / assessment SKU** | M | H | H | H | Big TAM, but gated on telemetry + persistent identity |

---

## The Five Questions

**1. What should we build?** The **diagnosis + reliability intelligence layer**, learner/lab-facing, on today's pull APIs: automated diagnosis with evidence-typed findings (drift / false-fail / false-pass / env / clarity / flake), fleet aggregation for false-pass and cross-lab patterns, and an escalation packet — surfaced to support/authors, with Rocky's reactive "Diagnose at failure" as the learner-facing thin edge. This is Lab Doctor's engine, pointed at the runtime signals that verifiably exist.

**2. Why?** Because the live platform (and its own AI) says the missing thing is the intelligence layer, not observation or a chat UI; because it runs on APIs that exist (validation results + deployment logs + guide) with no dependency on the eventing/telemetry/UI-injection that don't exist; and because the payer is clear (support cost + author velocity), unlike a learner companion whose value is unmeasured.

**3. What should we NOT build (yet)?** Proactive/real-time behavior monitoring (no event bus); in-VM instrumentation or "see live cloud state" (no credentials/inventory); computer vision; per-learner memory/skill graph; a competency SKU; a bespoke drift-*detection* engine (duplicates Cosmos Tester/Drasi); over-the-shoulder monitoring (duplicates Shadow VM).

**4. What should be deleted from the current plan?** The behavior-aware smoke-detector framing of Rocky; the "fleet telemetry with step timings/retries/hints" assumption (that data doesn't exist); "Rocky sees live cloud state"; the auto-heal→Cosmos-regeneration closed loop as a near-term Rocky feature (and anyway that's your separate Cosmos track); the instructor cockpit as a funded build until at least a few instructor interviews exist.

**5. What are we missing completely?** (a) The **support-cost baseline** — no real ticket/session/MTTD numbers exist, so every ROI figure is a placeholder; the ticket→lab→step ledger is the cheapest way to get it. (b) The **expected-state audit** — we still have not measured how many real labs even have validations rich enough to ground a diagnosis (runnable in ~2 days once CloudLabs is reconnected). (c) A confirmed **auth model + rate limits** for fleet-scale API access. (d) The **guide-intent grounding gap** — because objectives live in prose, any "is this right?" answer must parse guide text, not read a field.

---

## CloudLabs/Cosmos vs Rocky — Overlaps, Gaps, Missing pieces

- **Overlaps (don't rebuild):** Shadow VM ≈ Rocky live monitoring; Cosmos Tester/Drasi ≈ drift detection; existing validators ≈ environment-state checking; on-demand validate endpoints ≈ Rocky "check my work"; CloudLabs marketing already lists "AI Tutor / real-time progress / at-risk alerts" (several apparently unbuilt) — a positioning collision to be careful about.
- **Capability gaps:** automated diagnosis; false-pass detection; cross-lab intelligence; pre-flight checks; live learner-state; learner-facing help; closed-loop fix.
- **Missing integrations:** webhooks/eventing (none); SCIM (none); LTI/grade-passback (not proven); iframe/embed SDK (not proven); SSO protocol (unverified).
- **Missing data:** step-level progress, attempts, time-on-step, hints, current-step; machine-readable guide objectives/expected-outcomes; cloud resource inventory; structured env-failure fields.
- **Missing APIs:** a runtime "current context" call; a formal validation-results + deployment-diagnostics API with structured fields; a UI-injection/extension point; a real-time event stream.
- **Missing workflow:** detect→diagnose→draft-fix→approve→publish→verify as a tight loop; N-learner incidents collapsed to 1; a learner in-product "report a problem" path.

---

## Revised Roadmap (real-platform-grounded)

- **Phase 0 (now, existing pull APIs, no platform deps):** Diagnosis engine on validation-results + deployment-logs + guide; false-pass via fleet aggregation; escalation packet; ticket→lab→step ledger for the support baseline. Run the **expected-state audit** (reconnect CloudLabs first) to confirm grounding coverage.
- **Phase 1 (1 negotiated platform ask):** cross-lab pattern detection at fleet scale; Rocky "Diagnose at failure" surfaced to learners; per-instance pre-flight check (needs a first-party env reader).
- **Phase 2 (platform build — the 5-event telemetry contract + eventing):** live learner-state intelligence; proactive/behavior-aware companion; instructor cohort console (validate appetite first).
- **Phase 3 (data products):** verified-competency SKU, fleet drift intelligence — gated on Phase-2 telemetry + hardened identity.

Every phase gate is data, not vibes: Phase 0 proves diagnosis cuts triage time on real tickets and that labs are groundable; the ledger proves the support baseline before pricing.

---

## Final Recommendation

The live platform confirms it: **build the diagnosis/reliability intelligence layer, not the companion.** CloudLabs already has observation, provisioning, and validators; what it lacks — by its own AI's ranking — is the intelligence between cloud events, validation results, guide intent, and learner struggle. Lab Doctor's engine, pointed at the runtime signals that verifiably exist (validation results + deployment logs + guide), is that layer, is buildable on today's APIs, and has a payer (support + authors). **Rocky is one thin, reactive edge of it** — the "Diagnose at failure" answer — not the flagship. The flagship vision depends on telemetry, eventing, and a UI-injection point that do not exist yet, so those move to a later phase behind a negotiated platform contract. First cheap move that unblocks the money case: build the ticket→lab→step baseline and run the expected-state audit.
