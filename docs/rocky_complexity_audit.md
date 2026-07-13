# Rocky/Lab Doctor — Complexity Audit & Cleanup

> "If deleting a system does not significantly reduce user value, delete it." A brutal KEEP/DEFER/REMOVE
> pass across every subsystem, backed by a 6-agent adversarial red team (each independently arguing for
> maximum simplification against the real codebase, not summaries) — then **executed**, not just written
> up. Nothing was deleted irreversibly; this repo has no version control, so every cut was archived.
> **Created:** 2026-07-02. Companion to `docs/rocky_strategic_review.md`.

## Verdict in one line
The project was mistaking **volume and visual finish for validated value.** Every cut system below shared
one shape: real engineering effort spent making a demo *feel* rigorous, shipped and screenshotted before a
single real user saw it — and in three cases (self-heal, the risk radar, the companion's honesty-schema
conflict) the polish was actively dishonest, not just excessive.

---

## KEEP / DEFER / REMOVE, by category

### Memory / context storage
- **KEEP:** in-session conversation state (`src/conversation.js`) — ephemeral, dies with the session, no persistence, no privacy exposure.
- **KEEP:** the `ContextProvider` seam (`src/contextProvider.js`) — the interface that lets fixtures swap for real APIs. Small (68 lines), real architectural value.
- **REMOVE (already parked, reaffirmed):** longitudinal per-learner skill graph / mastery profile. Never built, and correctly so — CloudLabs learners are event-transient; a durable profile of a one-day relationship is a privacy liability with no near-term payoff. Don't build until a persistent-identity enterprise customer asks.

### Skill graph / learning systems
- **DEFER:** everything in this category. No skill graph exists in code (only in old strategy docs, now archived). Correct as-is — don't build ahead of evidence.

### Fleet intelligence
- **KEEP, cost-adjusted:** cross-lab pattern correlation (`detectFleetPatterns`) — the real differentiator, cheap (string-signature matching), no LLM cost. **Toned down the presentation**: was a persuasive red pulsing banner: now a plain text line. The capability is real; the theater around it wasn't earning its confidence.
- **DEFER:** expanding pattern-matching sophistication (more signature types, weighted correlation) until there's a real multi-hundred-lab catalog to correlate across — at 10-12 fixture labs, "fleet pattern" and "these two labs share a substring" are hard to tell apart.

### Detection mechanisms (Lab Doctor core)
- **KEEP, unconditionally:** the 6 telemetry-based classifiers (drift, validation-bug false-fail, validation-bug false-pass, guide-clarity, env-permission, transient-flake) in `labdoctor/analyze.js`. Deterministic, tested, evidence-backed, the actual product. The false-PASS detector — "a check silently passing wrong work" — is the single best idea in the codebase: closed-world (validator vs. its own expected output), zero LLM needed, catches a real defect class support tickets can't see.
- **CUT from 12 finding types to 2:** the "Synthetic Learner Probe" claimed 12 predictive finding types; only `RETIRED_SKU_TOKEN` and `DEPRECATED_CLI_ALIAS_OR_COMMAND` were deterministic token-matching (zero model risk, unit-tested, caught a real bug — Lab E's hardcoded `Standard_NC6s_v3`). The other 10 were an LLM asked to role-play a "naive learner" and guess where a guide breaks, with no execution, no telemetry, and no calibration data — indistinguishable in the UI from the real findings sitting next to them. **Reframed as a pre-launch lint**, restricted to labs with zero telemetry (real fleet data is strictly better evidence and shouldn't compete with a guess for triage attention).

### Predictive / risk scoring
- **CUT from 8-9 guessed-weight signals to 2 evidence-tagged flags.** The shipped `computeRisk()` had already silently diverged from its own design doc (documented 9 signals with defensible-sounding weights; implemented 7, with unlisted magic numbers and an undocumented "trending down" signal) — a provenance problem, not just a calibration one. With zero real outcomes to check against, a 0-100 score and a "~90-180 day" horizon estimate implied precision the system hadn't earned. Kept only: (1) a **verifiable fact** — the lab hardcodes a token already announced retired, and (2) an **observed-this-run inference** — the lab shares a fragile attribute with labs already drifting in this same telemetry pull. No score, no band, no horizon string — plain evidence, stated plainly.

### Self-heal / "re-validation"
- **KEEP the mechanism, FIX the honesty.** `applyApprovedFixes`/`simulatePostFixOutcome` (was `revalidate`) has real triage value: "if these 3 fixes are approved, does that recover 80% of lost completion or 10%?" is a genuinely useful prioritization signal. But the UI called it "Re-validated" with a checkmark and a pulse animation — for a mechanism that unconditionally sets `status=passed` and grades its own diagnosis, never executing anything against any real system. That's not an estimate with error bars, it's circular by construction, presented as proof. **Fixed**: renamed everywhere (function, API route, UI copy) to "preview projected impact... modeled, not executed, pending author merge." No checkmark, no pulse-as-proof.

### Ask / conversational surfaces
- **REMOVED entirely.** "Ask Lab Doctor" (a free-text chat console over the catalog JSON) was cut, not deferred. Every answer it could give was already rendered on screen (scores, findings, patterns) — it added an LLM call per question, zero test coverage, and a real (if narrow) prompt-injection path: probe-authored finding titles get embedded as "trusted analysis" in the console's grounding context, so untrusted guide text could reach a second LLM call laundered as fact. Never shown to a real content-lead or PM. Rebuild only if an actual user asks for natural-language querying — don't build it speculatively again.

### Companion behaviors / animation
- **REMOVED.** The EVE-style canvas rig (11-emotion × 13-tone table, 7 gesture presets, presence/hover state machine, drag-repositioning, an Easter egg, confetti, and an undisclosed "Knowledge Moments" fun-fact economy with its own wallet/cooldown governance) was ~230-260 of `rocky.html`'s 390 lines — built to visual polish with **zero real learners ever seeing it.** Worse: the emotion/tone vocabulary was a **required field in `/api/say`'s response schema** — the same call carrying the explicit "never assert unverified state" honesty gate — so every answer was asked to be theatrical (`tone: dramatic, mysterious, celebrating`) and epistemically rigorous in the same breath. That's not a style preference, it's a correctness risk on the one code path this project's credibility depends on. **Fixed**: `rocky.html` rewritten as a ~135-line grounded panel (real lab-status card, chat, quick chips, Focus-mode + Demo-scenario honesty toggles). `/api/say` now returns `{message}` only. The full animated version is preserved in `design/archive/companion-v1-eve-character/` for a future *evidence-backed* A/B — see `rocky_strategic_review.md` §1.2, which already called this exact conclusion before the audit confirmed it in code.
- **Also removed as dead code:** `flagship.html` (zero server routes ever served it — fully unreachable) and `index.html` (reachable only via a hidden `/classic` route no real user hit). Both were themselves animated SVG characters with their own joke/idle-loop systems, not the "plain panel" they were assumed to be — the new `rocky.html` is a fresh, minimal build, not a promotion of either archived file.

### Data collection / telemetry / logging
See the dedicated data-minimization section below — summary: one log eliminated (server-side persistence), one bounded (was unbounded), one kept as-is (already correctly redacted and low-volume).

### Support workflows
- **KEEP as-is:** escalation (`/api/report`, redacted `supportSummary()`) — real value, already minimized correctly, low volume.
- **KEEP:** the deterministic troubleshooting engine (`src/rocky.js` — `analyze`/`respond`, `ERROR_RULES`, scaffolded hint/guided/answer explainers). Tested, cheap, the trust foundation.

### AI / agent architecture
- **REMOVE (dead code):** the untested Anthropic provider branch in `src/llm.js`. Tests explicitly deleted `ANTHROPIC_API_KEY` to avoid exercising it; the SSE-parsing and response-shape code for that provider had **never once executed**. An untested fallback is worse than no fallback — it's false confidence that a "disaster recovery" path works. Deleted; `buildRequest()`'s `{url, headers, body}` return shape means re-adding a provider later is a small, contained change when there's an actual reason.
- **KEEP, made cheaper:** the LLM-based finding enrichment (`enrichFinding`) — real value (better author-facing fix drafts), but was called **eagerly, uncached, for every finding on every lab-detail page load**, re-spending tokens on static fixture data that never changes between requests. Added an in-memory cache keyed by (lab, finding) — measured **7.8s → 18ms** on a repeat fetch, a realistic 80-95%+ reduction in call volume under normal (repeat-visit) dashboard usage.
- **REMOVE:** the `/api/insight` endpoint (confirmed fully dead — zero callers anywhere in the repo) and the *actually-live* purely-entertainment path it was mistaken for: the `kind:'insight'` branch inside `/api/say`, driven by a client-side idle loop firing every 80-130 seconds (up to 9 unprompted LLM calls per session). Zero evidence it reduced abandonment or increased satisfaction, per the project's own strategy docs. Deleted both.
- **DEFERRED FINDING (not yet actioned):** two parallel, overlapping Q&A backends exist — `/api/chat` (deterministic-first `handleTurn`, tested, hint/guided/answer scaffolding) and `/api/say` (always an LLM call, used by the companion). The companion currently uses the *less* rigorously-engineered of the two. Converging them is a real architectural improvement but wasn't executed in this pass (higher risk, needs its own verification cycle) — flagged for the next work session.

### Documentation
- **34 files in `docs/` → 17. 7 in `design/` → 2.** Archived (not deleted) to `docs/archive/` / `design/archive/`: superseded strategy (`roadmap.md` directly contradicted `hackathon_recommendation.md`'s build status two days later, never reconciled — both archived), the ~4,000-line companion visual/behavioral spec sprawl for a character just removed from the live app, on-VM/whole-VM architecture docs for a track already parked by the strategic review, and empty unfilled-template scaffolding. See `docs/archive/README.md` for the full list and reasoning. **Canonical living set going forward:** `vision.md`, `rocky_strategic_review.md` (the only strategy doc — the next revision replaces it in place, it doesn't get a sibling), `decisions.md`, `registers.md`, `rocky_architecture_and_execution.md`, plus `telemetry_contract_rfc.md` + `expected_state_audit_plan.md` until those two questions are answered.

---

## Data minimization review

| Data | Verdict | Action taken |
|---|---|---|
| `logs/say-trace.jsonl` (full system+user prompt text, every `/api/say` call, forever) | **Eliminate server-side persistence.** The trace is returned to the caller in the same response — a durable server copy is 100% redundant with data the requester already has, and nothing in the codebase ever read the file back. | Removed the `fs.appendFileSync`. `trace` is still computed and returned to the client (the actual transparency feature) — just never written to disk. |
| `logs/interactions.jsonl` (self-telemetry, unbounded, keyed to a persistent `eventUserId`) | **Bound it.** A real forward-looking rationale exists (CloudLabs doesn't expose time-per-step/attempts natively), but unbounded raw per-learner rows tied to a persistent ID is the highest privacy-exposure-over-time risk in the codebase. | Capped at 2,000 lines, trims to the newest 1,000 on overflow. **Not yet done** (flagged for next pass): aggregate to per-stepGuid/per-findingType rollups on a schedule and drop raw rows once aggregated — the aggregate, not the raw stream, is the real flywheel asset. |
| `logs/reports.jsonl` (escalation tickets) | **Keep content, it's already correct** — the one file in the codebase that visibly applies its own redaction control before persisting, low-volume (write-only on explicit user escalation). No downstream consumer currently reads it back (a real ticketing system should replace this file, not extend it). | Left as-is; note that a retention window (60-90 days) should be added when this becomes more than a prototype log. |
| Companion emotion/tone fields in `/api/say` | **Removed from the schema entirely** — not a storage concern, a correctness one: the field list included values (`funny, dramatic, mysterious`) that actively competed with the same call's honesty instructions. | Response is now `{message, trace}`. |
| **What Rocky should never store** (confirmed, none currently violated after cleanup): raw screen/OCR/visual data (never built); full learner PII beyond a pseudonymous ID (redaction layer covers this); full conversation transcripts persisted indefinitely (fixed above); longitudinal per-learner skill/mastery profiles (never built, stays that way per the strategic review). |
| **What's computed, not stored:** health scores, risk flags, findings/diagnoses — all regenerated on demand from the current fixture/telemetry snapshot, nothing cached as a growing time series beyond the in-memory enrichment cache (which is keyed by content, not time, and has no TTL because the underlying fixture data is static for the process lifetime). |

---

## Simplified architecture

```
                     ┌─────────────────────────────┐
                     │   Cosmos-authored spec        │   (guide steps + validation defs
                     │   (fixtures today; the seam    │    — the ground truth)
                     │   for real APIs already exists)│
                     └───────────────┬─────────────┘
                                     ▼
                     ┌─────────────────────────────┐
                     │  labdoctor/analyze.js          │
                     │  6 deterministic classifiers    │   ← the actual product
                     │  + fleet-impact ranking          │
                     │  + 2 evidence-tagged risk flags  │
                     │  + preview-fix-impact model       │
                     │  (LLM: cached fix-draft refine    │      only)
                     └───────┬─────────────────┬───────┘
                             ▼                 ▼
                  ┌─────────────────┐  ┌──────────────────────┐
                  │ labdoctor.html    │  │ labdoctor/intel.js      │
                  │ table+drilldown    │  │ pre-launch lint          │
                  │ (no charts/no chat)│  │ (deterministic, new-labs │
                  │                    │  │  only, zero LLM calls)   │
                  └─────────────────┘  └──────────────────────┘

                     ┌─────────────────────────────┐
                     │   rocky.html (learner panel)   │
                     │   ~135 lines, no animation      │
                     │   → /api/say {message,trace}    │   (single LLM call site,
                     │   → /api/labstate                │    Azure-only, no persisted
                     └─────────────────────────────┘    trace)
```
Four boxes doing one job each, instead of eight boxes (companion rig, fun-fact economy, Ask console,
scored risk radar, self-heal-as-proof, dual LLM providers, three parallel companion HTML files, 34 docs)
each doing a job nobody had validated yet.

## Reduced component diagram (what got removed)
```
REMOVED / ARCHIVED                          KEPT
──────────────────────────────────────      ──────────────────────────────
✗ rocky.html canvas rig (~250 loc)          ✓ rocky.html grounded panel (~135 loc)
✗ flagship.html (dead code)                 ✓ labdoctor.html table+drilldown (~460 loc,
✗ index.html + /classic route                 down from 604 with charts/chat/theater)
✗ Knowledge Moments fun-fact economy        ✓ 6 telemetry classifiers (analyze.js)
✗ /api/insight + kind:'insight' loop        ✓ false-PASS detector (the best idea here)
✗ Anthropic provider branch (untested)      ✓ fleet-pattern correlation (toned down)
✗ Ask Lab Doctor console + route            ✓ 2-signal risk radar (was 8-9)
✗ 10/12 probe finding types                 ✓ 2-type pre-launch lint (was 12)
✗ 8-9 signal weighted risk score            ✓ preview-fix-impact model (renamed, honest)
✗ "revalidate" verification theater         ✓ enrichFinding, now cached
✗ say-trace.jsonl persistence               ✓ escalation reporting (already correct)
✗ 20 archived docs/specs                    ✓ 17 docs + 2 design files (canonical set)
```

## Reduced storage
- 1 log file's server-side persistence eliminated entirely (say-trace).
- 1 log file bounded (interactions: unbounded → capped at 2,000 lines).
- 0 new stores added.
- Docs: 34 → 17 (`docs/`), 7 → 2 (`design/`) live files — the rest archived, not lost.

## Reduced token consumption
- Eliminated: up to 9 unprompted "insight" LLM calls per idle session (100% of that volume — it was pure entertainment spend).
- Cut: enrichFinding from "every finding, every page load, no cache" to "cached per (lab, finding)" — measured 7.8s → 18ms on a repeat fetch.
- Cut: the pre-launch lint from "one LLM call per lab, reasoning over 12 speculative finding types" to "zero LLM calls, deterministic token matching" for the 2 types that survived.
- Removed: the Ask console's one-LLM-call-per-question path, entirely.
- Net effect: the LLM is now called only where its judgment is actually load-bearing — grounded learner answers, cached fix-draft refinement, and (rarely) the escalation report — not for jokes, speculative pre-launch guesses, or answering questions the UI already answers for free.

## Reduced operational cost & maintenance burden
- One LLM provider instead of two (100% of remaining `llm.js` code is now exercised by tests, versus a meaningful untested fraction before).
- One companion HTML file instead of three (no more "which one is real" ambiguity for the next reader/model).
- One Q&A console instead of two on the Lab Doctor side (Ask deleted).
- A risk-scoring formula that's checkable by inspection (2 signals, plain evidence) instead of one requiring a calibration program that didn't exist to justify 8-9 guessed weights.
- 17 canonical docs instead of 34 self-contradicting ones — an implementation model reading this repo cold now has one strategy doc to trust, not five that need reconciling.

## Revised roadmap (supersedes nothing in `rocky_strategic_review.md` — narrows near-term scope)
The strategic review's priority order stands (substrate → Lab Doctor on real data → point-of-failure
Troubleshooter pilot → Pre-Flight Check → Instructor Cockpit). This audit adds constraints on *how* to
build within that order:
- **Before adding any new scored/predictive feature:** it ships as plain evidence flags first (fact vs.
  inference, stated in words). A numeric score/band only earns its way in after a real outcome log exists
  to calibrate against.
- **Before adding any new LLM call site:** ask whether a deterministic check gets 80% of the value first
  (the retired-SKU lint is the template — it out-performed the 10-type LLM taxonomy sitting next to it).
- **Before adding any new UI surface (chat console, chart, banner):** it needs a named user who asked for
  it, or it's an A/B, not a default.
- **Before writing a new strategy doc:** check whether it supersedes an existing one — if so, archive the
  old one in the same edit, don't leave both live.
- **Companion character:** stays archived until Phase 2's evidence-backed A/B (per the strategic review)
  — completion, "keep Rocky on," satisfaction — actually runs. No further investment before that.

---

## What we were overengineering — brutally, plainly
1. **A character nobody had met.** Three parallel implementations, one fully dead, one hidden, the "live" one with a 143-cell emotion/tone matrix and its own fun-fact economy — for a feature whose entire job could be (and now is) done by a text panel with a name on it.
2. **A "test" that never tested anything.** Self-heal's checkmark and pulse animation claimed a capability — real re-validation — that doesn't exist anywhere in this codebase. That's the single most dangerous finding in the audit: not because it's complex, but because it's a QA tool that was, in one specific spot, lying about its own rigor.
3. **Manufactured precision.** A 9-signal weighted risk formula with zero real outcomes to calibrate it is not more sophisticated than a 2-flag plain-evidence list — it's less honest, because the score implies a confidence that was never earned. The shipped code had already drifted from its own design doc within days, and nobody noticed, because nobody was checking it against reality.
4. **Building the LLM's job when code could do it.** 10 of 12 "synthetic learner" finding types were a model guessing; the 2 that survived are regex-adjacent token matching that a linter could run in CI. The lesson generalizes: reach for deterministic code first, and only pay for a model call where judgment is genuinely required.
5. **A console for data already on the screen.** Ask Lab Doctor is the clearest case of building because it was buildable, not because anyone needed it — every fact it could surface was already rendered two rows above where you'd type the question.
6. **Documentation as a substitute for validation.** 34 strategy documents in 72 hours, several of them directly contradicting each other, several specifying in exhaustive detail a feature the project's own newest document had already called wrong. Volume of planning prose is not rigor — a small set of documents that get revised in place, checked against the code, and archived promptly when superseded is rigor.

The pattern underneath all six: **this project kept reaching for the next impressive-looking layer before
the previous one had a single real user.** The parts that survived this audit without a single objection —
the 6 telemetry classifiers, the false-PASS detector, the deterministic troubleshooting engine, the
redaction layer — are exactly the parts that were built plainly, tested, and grounded in real evidence from
the start. That's the standard everything else now has to meet before it's added back.
