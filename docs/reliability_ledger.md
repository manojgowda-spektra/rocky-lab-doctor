# Reliability Ledger (`ledger/ledger.js`)
**Status:** built + proven on the digital twin (2026-07-04) · vision-roadmap items 2/3/4 of "Next Month" delivered in one substrate.

## What it is
The case-history layer on top of the continuous monitor. A **case** opens when a loud finding key appears on a lab and closes when it clears. Everything downstream is *derived* from that one append-only history — no new sensors, no new guesses:

| Derivation | Meaning | Semantics |
|---|---|---|
| **Incident-minutes SLI** | the "diagnosis-confirmed" SLI from the vision doc — clean by construction, because a case only exists when the engine asserted a contradiction (never raw fail rates) | case covers sweeps `[opened .. closed-1]`; concurrent cases on one lab never double-count a sweep; learner cost per sweep = MAX across covering cases (same learners may be hit by both defects) |
| **Error budget** | 95% objective per lab over the window; `burnRate = usedSweeps / allowedSweeps` | budget math is per-lab; fleet view counts labs over budget |
| **Fix queue** | THE prioritizer — one honest number, not a severity vibe-sort | open cases ranked by `learners × ageSweeps` (learner-sweeps of blocked lab time) |
| **Validator trust tiers** | an error budget for the ground-truth layer itself | only the check's OWN confirmed faults (false-fail / false-pass) count against it — a validator is not blamed for drift/quota it merely *reported*. A = clean (implicit), B = 1 case, C = repeat offender |
| **Precedent-adjusted confidence** | "this validator has done this before" | +0.04 per PRIOR case on the same validator, capped at 0.97, returned as a separate labeled value — the engine's deterministic confidence is never mutated, and a case is never its own precedent |

## Honesty rules encoded
- Labs absent from a snapshot stay open: **unknown ≠ recovered**.
- A recurrence opens a **new** case linked via `recurrenceOf` — history is append-only.
- Platform incidents link member cases by id; the cases stay per-lab (the fix is per-lab even when the cause is shared).
- Deploy-success rate (the second clean SLI) is **deliberately not computed here**: it needs per-session deploy outcomes, which arrive at production cutover. Shipping a modeled version would blur REAL/SIMULATED — the exact failure the project forbids.

## Real vs simulated
The ledger logic is real product code, source-agnostic (consumes monitor snapshots only). All numbers currently shown come from the **scripted digital-twin timeline** and are labeled SIMULATED in the UI. Production cutover changes the data source, not the module.

## Validation
- `test/ledger.test.js` (4 tests): lifecycle over the scripted timeline (open at detection sweep, incident linking, close at recovery, SLI distinct-sweep math, queue ranking); trust tier B→C on recurrence with precedent boost exactly +0.04 and cap; restraint (env/drift cases never touch trust; clean labs never enter the ledger; steady state adds nothing); key-parser round-trip.
- `preflight.js`: 4 live checks over `/api/monitor/advance` through the sweep-6 recovery.
- Surface: `web/public/monitor.html` "Reliability ledger" panel (queue / error budget / validator trust), fed by `ledger` on `/api/monitor/state|advance`.

## Assumptions (bounded, documented)
- A-L1: 1 sweep = 1 monitoring interval; minutes use a configurable `sweepIntervalMinutes` (default 60). Wall-clock accuracy inherits the sweep schedule.
- A-L2: trust tiers count confirmed *cases*, not affected learners — a validator that false-fails 4 learners twice is worse than one that false-fails 40 once (repeatability beats magnitude for a sensor).
- A-L3: `learners` on a case is the count at detection; growth during the case is not yet tracked (production per-sweep counts can tighten this).
