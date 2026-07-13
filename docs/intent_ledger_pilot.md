# Intent Ledger — Pilot Result (gate evidence)
**Date:** 2026-07-05 · **Vision gate being tested:** "extraction accuracy audit" (Innovation Roadmap: the Intent Ledger bet proceeds only if reviewed extraction is accurate enough to be worth human review time).

## What ran
`intent/extract.js` — LLM extraction of per-task intent sidecars `{objective, expectedOutcome, verifiableFacts[{fact, quote}]}` from **two REAL production lab guides** (RTIAD Lab 2, Fabric-Analytics Lab 5), followed by a **mechanical faithfulness audit**: every fact must carry a quote that appears verbatim (whitespace-normalized) in the source task. Unanchored facts count against the score.

## Result
| Guide | Tasks | Facts | Quote-anchored | Structural fails |
|---|---|---|---|---|
| RTIAD Lab-2 (April 2026) | 5 | 38 | **100%** | 0 |
| Fabric-Analytics Lab-5 | 13 | 91 | **100%** | 0 |

Spot-check quality (Task 1, RTIAD Lab 2): extraction captured the Event Hub namespace **including the CloudLabs `<inject key="DeploymentID">` templating token verbatim**, the event hub name, the SAS key name, the skip-test-connection checkbox state, the exact Eventstream name, and the observable end-state ("becomes Active and shows sample data in preview"). That is validation-authoring-grade structure — the exact material a Validator Coverage Map needs.

## Honest limits
- Mechanical faithfulness ≠ semantic accuracy. The audit proves quotes are real, not that extraction is complete or correctly interpreted. **Human review remains the gate**; the pilot measured whether that review can be FAST (answer: yes — reviewer sees fact and verbatim source side by side).
- n=2 guides, both task-heading format. The full gate per the vision is 20 labs incl. other formats (MCW HOL style). The `generic-h2` fallback splitter exists but is unproven.
- Outputs are drafts in `intent/drafts/*.intent.json` + `intent/pilot-report.json`; nothing downstream consumes them yet, by design.

## Why this matters
The platform has no machine-readable model of what each guide step intends. This pilot shows we can manufacture one at ~18 LLM calls per guide with a deterministic re-audit that can run in CI on guide diffs. Unlocks (in gate order): Validator Coverage Map (which intents have no check), richer expected-state audits, T-72h readiness sweeps that know what "done" looks like per step.

## Recommended next
Manoj reviews the two drafts (10 minutes). If quality holds: extend to 20 labs incl. one MCW-format guide, add the CI re-extraction trigger on guide diffs, and start the Validator Coverage Map from the sidecars.
