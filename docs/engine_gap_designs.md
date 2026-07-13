# Engine Detection Gaps — Verified Designs (not yet implemented)
**Date:** 2026-07-11 · **Source:** detection-gap hunt (workflow wf_ee3884b3-3d7). Every gap below was
**reproduced by running the real modules** — first by the finder agent, then independently by an
adversarial verifier. None is hypothetical. They are *designed-only* in this pass for one deliberate
reason: each changes fixture/twin-visible scoring, which invalidates the freshly ground-truthed demo
numbers — so they ship together in their own change, with test updates and a demo-number re-capture,
not as a side effect of another feature.

## G1 — Observability-blind "healthy" verdict (rank: build-next, HIGH)
**Reproduced:** a 10-lab false-pass world with pass/fail-only payloads (no `observed{}` — the documented
worst-case production payload) returns **10/10 labs healthy, score 100, zero findings** through the real
`analyzeLab`. The identical world with rich payloads is caught 10/10. Root cause: `analyze.js` gates the
false-pass detector on `hasKeys(c.observed, expected)` — no observed keys, no check, **no disclosure**.
**Why it matters:** the engine's worst sin is claiming health it cannot verify. This is the "never fake
green" doctrine applied to the engine itself.
**Design:** per validation with rich `expected{}`, compute *runtime observability* = fraction of PASSED
results carrying the expected keys. If a lab's rich validations have passes but ~0% observability, emit a
`unverifiable` finding (medium): "N validations report PASS but carry no observed state — health cannot be
verified from this payload," and surface a `groundedness` % on the lab report. Never claim broken — claim
*blind*, which is the honest statement.
**Ripple:** `test/sim.test.js` pass/fail-only world assertions change (deliberately — the documented
behavior improves from "silently healthy" to "says it's blind"); fixture labs unaffected (fixture passes
carry observed).

## G2 — Dead validator (rank: build-next, MEDIUM)
**Reproduced:** an orphaned validation (valid stepGuid, rich expected) on a healthy 24/30-learner twin lab
yields `attempts=0`, zero findings, score 100. Root cause: both classifier loops
`if (vs.attempts === 0) continue;` — a validator that never executes is invisible forever.
**Design:** when `totalLearners >= MIN_AFFECTED` and a validation has `attempts === 0`, emit
`dead-validator` (medium): "defined but never executed for any of N learners" with draftFix
target=validation. **Ripple check before shipping:** confirm no fixture-catalog validation fires it
(would shift demo scores).

## G3 — Sub-threshold recurrence (rank: design-only, needs persistence)
**Reproduced:** 8 consecutive sweeps of the twin's own `nearMiss` scenario (1–2 wrong-region learners per
sweep, deliberately below MIN_AFFECTED=4) accumulate **13 wrong-region learners with the identical wrong
value — zero alerts, healthy/100 throughout**. Per-snapshot thresholding can never catch a slow bleed.
**Design:** the monitor (which already owns time) persists per `(labId, validationId, canonical
wrong-observed-value)` tallies of sub-threshold failures across sweeps; alert when cumulative distinct
learners ≥ MIN_AFFECTED within a window. Lives in `monitor/sweeper.js`/ledger, NOT `analyze.js` (keeps the
engine stateless). Honest label: "accumulated across N sweeps."

## G4 — Flapping validator (rank: design-only)
**Reproduced:** alternating inject/heal for 10 sweeps emits **10 raw alerts** (4 regression + 5 recovery)
with zero flap classification — alert spam where the diagnosis should be "this validator/lab oscillates."
**Design:** count appearance→clearance cycles per stable finding key over a rolling window; on the 2nd
cycle in K sweeps, suppress the individual alerts and emit one `flapping` finding referencing the cycle
count. Feeds validator trust tiers (a flapping check is an untrustworthy sensor).

## Cross-artifact gaps SHIPPED this pass (for the record)
`INJECT_TOKEN_LOSS`, `ASSET_CASE_MISMATCH`, `LOCALE_POINTER_DRIFT` — see `scan-real.js` + `test/scan-locale.test.js`.
Two more from the same hunt remain design-only: **localization structural drift** (whole sections absent
from translations — needs careful FP thinking: intentional locale differences exist) and **cross-file
deployment-config contradiction** (SETUP.md vs .env.sample vs bicep naming different model deployments —
verified real in OpenAIWorkshop; rule needs a config-key equivalence map to stay deterministic).

## Shipping order recommendation
G1+G2 together (one engine change, one test-update pass, one demo re-capture) → G3 (monitor persistence) →
G4 (rides on G3's window machinery) → structural drift + config contradiction (new scanner rules).
