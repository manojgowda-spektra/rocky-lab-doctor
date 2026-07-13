# Lab Doctor — Proactive Intelligence Design (grounded)

> Buildable design for the Synthetic Learner Probe, Predictive Risk Radar, and Ask Lab Doctor console.
> Synthesized from a 5-agent research workflow (`labdoctor-proactive-intel`, web + Microsoft Learn).
> **Created:** 2026-07-02.

## Guiding principle
Enforce honesty **structurally, not via prompt pleas.** Prompts alone leave a documented default-correctness bias and ~30% false-positive habit (WebTestBench) and a ~73% abstention ceiling (RefusalBench). The real backstops are the output **schema** and a deterministic **post-processor**.

## 1. Synthetic Learner Probe
A naive, literal first-time learner reasoning over ONE step at a time — the "curse of knowledge" detector. It never executes anything, so it can never produce OBSERVED evidence.

**Structural honesty guarantees (in code, not the model):**
- **`evidence_type ∈ {PREDICTED, INFERRED, NEEDS_TELEMETRY}` — OBSERVED is unreachable by construction.** Only the downstream fleet-join may stamp OBSERVED. A prediction later corroborated by telemetry is upgraded to *"Predicted, corroborated by Observed (n=…)"* — the strongest artifact (the **AMBER handshake**).
- **Mandatory verbatim anchor:** every finding carries a `quoted_trigger` that must be a verbatim substring of the step/validator text. A post-processor drops any finding that fails this — kills vibes-based findings.
- **Staleness → abstention:** high-staleness claims (recent portal UI, preview features, this-week capacity) are forced to `NEEDS_TELEMETRY`; the model may only flag with a named `resolving_signal`.
- **Rewarded abstention:** `NEEDS_TELEMETRY` is a positively-scored output, not a failure (I-CALM / "Rewarding Doubt").
- **Deterministic-in-code checks (LLM confirms, never originates):** resource-graph diff (a step consuming a resource no prior step produces ≈ 0.9-confidence PREDICTED); retired-SKU / deprecated-alias token match against an injected reference list; a readability/clarity linter.
- **Short-horizon per-node calls only** (map → per-step predict → per-validation audit → cross-step → calibrate → rank). Never "here's the whole lab, what's wrong" (reproduces the <30% completeness / long-horizon collapse).
- **Fixes are drafts, human-approved, never auto-applied** — detection and remediation are separate stages.

**Highest-yield module = the Validation Auditor** (closed-world: validator definition vs documented expected output — two artifacts the author already wrote). Predicts false-FAIL, false-PASS, and brittle-match risk at near-zero false-positive risk.

**Finding taxonomy (predictable from spec alone):** VALIDATOR_FALSE_FAIL_FORMAT_MISMATCH, VALIDATOR_FALSE_PASS, MISSING_PREREQUISITE_OR_ORDERING_GAP, CURSE_OF_KNOWLEDGE_IMPLICIT_STEP, GUIDE_CLARITY_AMBIGUITY, VAGUE_VERIFICATION, BRITTLE_EXACT_MATCH, DEPRECATED_CLI_ALIAS_OR_COMMAND, RETIRED_SKU_TOKEN, PLATFORM_DEFAULT_FLIP, MISSING_PROPAGATION_WAIT, STALE_UI_NAVIGATION_TARGET, NEEDS_TELEMETRY.

**Real Azure drift seeds (from the research, citable):** NCv3-series VM retirement (2025-09-30); `allowBlobPublicAccess` defaults false on new storage accounts (Aug 2023); `az vm image accept-terms` removed → `az vm image terms accept`; Azure AD → Microsoft Entra ID portal rename (2023-08+); `minimumTlsVersion` unset via CLI/ARM but 1.2 via portal; `az vm create` Gen2/Trusted-Launch default; portal Fluent UI refresh (Jun 2025) drifting screenshots.

## 2. Predictive Risk Radar (deterministic weighted hazard)
`RiskScore = 100 × Σ(wᵢ·Sᵢ)`, weights sum to 1. Signals (weight): preview-dependence **0.20**, deprecation-clock proximity **0.18**, shared-root-cause blast-radius **0.16**, region/SKU drift pressure **0.13**, guide-age × dependency-velocity (**multiplicative**) **0.10**, screenshot/UI-click density **0.08**, validation-fragility history **0.07**, marketplace/third-party image **0.05**, expected-state surface size (amplifier) **0.03**.

**Two overrides beat pure summation:** (1) age×velocity is multiplicative internally (old-but-stable doesn't score); (2) **DEPRECATION OVERRIDE** — a dated retirement within ~180 days (or a hardcoded retired-SKU token) floors the band at **IMMINENT**.

**Horizon bands:** IMMINENT (≥70 or override) ≈ 0–90d · ELEVATED (45–69) ≈ this quarter · WATCH (25–44) ≈ ~6mo · STABLE (<25). Score is fully deterministic + auditable; the LLM only *narrates* it. Every signal carries an evidence class (Observed / Inferred).

## 3. Ask Lab Doctor console
Answer **only** from the analyzed-catalog JSON. **Cite every claim** with `source_ids` that must resolve in the data; **tag provenance** (Observed / Predicted / Inferred / Unverified) from the source record's own type — never upgrade Inferred/Predicted → Observed. **Abstain on *insufficient* context, not just empty** (partial data must not raise confidence). Never assert unverified state (fixed/passing/deployed). Fixes are drafts behind a required human-approval transition.

**Post-processing backstop (do not skip):** ID resolution (strip claims whose source_ids aren't in the JSON), provenance integrity, state-assertion scan (forbid "is fixed"/"now passing"), number grounding (every number must appear in the source). Route the fix button to **"Review draft," never "Apply."**

## Build order (from the recommendations)
1. Deterministic normalizer (stable step/validation anchors) + Validation Auditor + resource-graph diff + retired-SKU matcher — highest yield, zero model risk, fully auditable.
2. Enforce honesty structurally (unreachable OBSERVED, verbatim anchor, staleness→abstain).
3. Short-horizon per-node LLM calls only.
4. AMBER handshake: synthetic PREDICTED → fleet ENGINE confirms/kills → auto-upgrade corroborated, auto-demote contradicted.
5. Risk radar as deterministic weighted hazard + horizon; LLM narrates only.
6. Ask console gated with a three-band CONFIRMED/TENTATIVE/ABSTAIN structure; abstention free and rewarded.
7. Calibration loop from day one (gold set per verdict type, RefusalBench-style abstention eval, ECE/Brier tracking).
