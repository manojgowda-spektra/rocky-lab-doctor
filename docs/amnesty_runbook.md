# False-FAIL Amnesty — Runbook & Engineering Record
**Status:** engine + wire path built and proven on the digital twin (2026-07-05). Production execution is GATED on the WRITE-endpoint semantics spike (one controlled write to a throwaway seat). Everything below the spike is done.

## What this is
When a validator regresses into failing correct work, the learners it wronged get their earned verdict restored — through the platform's own (currently unused) `PUT validation-results` endpoint. This is the Action plane's first capability and the vision's #1 feature, built in its destroyer-hardened form.

## The five gates (all enforced in code, `action/amnesty.js`)
1. **Fleet-confirmed** — an OPEN false-fail case must exist in the reliability ledger for (lab, validator). Individual-learner judgment never triggers a write; MIN_AFFECTED stands.
2. **Regression-only** — monitor history must contain a sweep BEFORE the case where the defect was absent (`lastCleanSweep`). Born-broken validators are never amnestied: nothing was taken away, so nothing is restored.
3. **State-proven** — the learner's own `observed` state must match the validator's `expected` state (the engine's exact contradiction, per-learner grain). Missing/empty observed ⇒ INELIGIBLE (`no-evidence`): absence of evidence is not evidence of correctness. Wrong state ⇒ `state-mismatch`: that failure is genuine.
4. **Human-gated** — `buildAmnestyPacket()` only drafts. `executeAmnesty()` throws without `authorizedBy`; every write carries reason + evidence chain + author. The twin's endpoint additionally REJECTS writes without provenance, so pipeline code that skips the gate cannot exist.
5. **Reversion-guarded** — `reconcileAmnesty()` re-checks every amnestied pair after the fix ships. ONE contradicted pair (fixed validator still fails them) halts the pipeline. Vanished seats are `unknown`, never silently confirmed. Vision metric asserted in tests: 0 amnestied pairs fail post-fix re-validation.

## The second-order discovery (found by the twin, closed in the adapter)
**Amnesty writes change the telemetry the engine reads.** Flipping FAIL→PASS would erase the fleet evidence, the next sweep would see a fake "recovery," and the system would mask the very defect it compensated for — while the validator keeps wronging new learners.

Closure (all tested in `test/amnesty.test.js` wire-path e2e):
- Write-backs carry `writtenBack: {reason, writtenBy, previousStatus}` and are visible on reads.
- The adapter's `toCohorts` normalizes written-back rows to their **machine verdict** for diagnosis (`machineVerdict`); learner-facing status stays PASSED.
- Result: learners restored, false-fail finding survives, monitor raises **no recovery**, case stays open until the validator is actually fixed. Ingest provenance counts `writtenBackRows` so overrides are never invisible.
- Idempotence falls out: a rebuilt packet post-amnesty has zero eligible pairs (their status is no longer `failed`).

**Spike implication:** the production endpoint must expose (or we must be able to reconstruct) the pre-write status. If production reads do NOT distinguish written-back verdicts, we keep our own write log (the executed-packet record is exactly that) and the adapter joins against it. Either way the invariant holds; only the join source changes.

## Operating procedure (production, post-spike)
1. Monitor opens a false-fail case → ledger confirms regression (gates 1–2 automatic).
2. On-call runs `buildAmnestyPacket` → reviews the draft: eligible pairs with evidence, ineligible with reasons, `repeatOffender` flag if the case is a recurrence.
3. Named human executes with `authorizedBy` → writes go through `makeVerdictWriter` (same hardening as ingest: timeout, retry on 5xx — PUT is idempotent — AuthError fail-fast, provenance mandatory).
4. Fix the validator (the amnesty NEVER substitutes for the fix; the case stays open).
5. After fix ships and the case closes, run `reconcileAmnesty` against fresh learner rows. Contradiction ⇒ halt + human review of every amnesty on that validator.

## Component map
- `action/amnesty.js` — gates, packet, execution, reconcile (pure logic + injected writer)
- `adapter/cloudlabs-ingest.js` — `fetchLearnerRows` (read dependency), `makeVerdictWriter` (write dependency), `machineVerdict` normalization in `toCohorts`
- `sim/twin-server.js` — `PUT .../validation-results/{vid}` (mirrors the unused production endpoint; assumptions A-W1 persist / A-W2 audited / A-W3 echo previous→new), `/sim/write-audit` oracle, `/sim/inject` mid-run evolution
- `test/amnesty.test.js` — 4 tests: gate pipeline + human gate + reversion guard; never-events (born-broken, false-pass, sub-threshold); WRITE endpoint provenance/persistence/audit; full wire path incl. no-masking invariant

## What the spike must answer (unchanged from the vision doc)
1. Is a written result learner-visible (does the panel row change)? 2. Does it persist across re-validation/refresh? 3. Is there an audit trail / does anything else consume this field? Plus, now: 4. Do reads expose that a verdict was written vs machine-produced?
