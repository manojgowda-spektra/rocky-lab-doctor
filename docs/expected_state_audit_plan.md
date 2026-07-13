# Expected-State Audit — Plan (top-50 labs)

> Measures the number that sets every feature's ceiling: how much of the real catalog is *groundable*.
> Runnable NOW with existing API access (contoso tenant). Owner: implementation model, ~2 days.
> **Created:** 2026-07-02. Strategy context: `rocky_strategic_review.md` §1.1.

## Question being answered
For the top-50 labs by traffic: **what fraction of steps can Rocky/Lab Doctor actually ground an answer in?**
"Groundable" = the step has ≥1 validation whose `expected` state is machine-checkable (not existence-only).

## Method
Pull per lab via the documented APIs (lab guide master-doc + `template-lab-guide-validations`), then score:

| Metric | How | Why it matters |
|---|---|---|
| Steps / validations count | guide + validation defs | size of the surface |
| **Step coverage %** | steps with ≥1 validation ÷ steps | the headline ceiling |
| **Richness %** | validations with structured `expected{…}` beyond existence ÷ validations | false-pass exposure; grounding depth |
| Existence-only checks | `expected` = exists/running only | the false-pass-prone class |
| Region/SKU pinned? | guide text scan (reuse `labTags()`) | drift exposure |
| Deprecation hits | token match vs `labdoctor/azure-deprecations.json` | already-broken-by-retirement |
| Guide age | lastAuthored vs today | decay prior |
| Vague verifications | "confirm it worked"-style steps with no validation | clarity debt |

## Deliverables
1. `docs/expected_state_audit_results.md` — scorecard table + the two headline numbers
   (**catalog step-coverage %** and **richness %**), worst-10 labs, and the top-5 systematic gaps
   (e.g. "region never pinned in expected{}", "HTTP checks assert existence not status").
2. A CSV for the content team.
3. A one-paragraph verdict: is the substrate good enough for the Phase-1 pilot, and what must Cosmos
   authoring add (this becomes the expected-state schema-extension ask).

## Guardrails
- Read-only; contoso tenant only; redact before storing anything.
- If top-50-by-traffic is unavailable, take the 50 most recently run labs and label the sample accordingly.
- Report *facts with counts*, not vibes — this document goes to the Cosmos team.
