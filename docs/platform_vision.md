# Lab Doctor — Platform Vision & Strategy
**Date:** 2026-07-05 · **Method:** 8 elite-lens idea generators (Datadog/GitHub/Palantir/OpenAI/Microsoft/SRE/strategist/contrarian), each pipelined into a dedicated destroyer armed with verified platform constraints and the project's anti-overbuild principles. 47 ideas generated, 6 killed outright, 41 survived (most in destroyer-modified form). Synthesis integrates independent asymmetry mining over the project's own evidence base. Full verdicts: workflow wf_032afa78-fae journal.

---

## 1. Final Vision

**Lab Doctor becomes the Reliability Layer for hands-on cloud learning** — the system that continuously *knows* whether every lab works, *proves* what it knows, *fixes* what it can, and *sells* that assurance.

Three planes, built in order:

- **EVIDENCE plane (built, proven):** scanner, diagnosis engine, continuous monitor, change intelligence, support attribution, digital twin. *"Every learner session is a test run; every claim carries provenance."*
- **ACTION plane (next):** the system stops only reporting and starts *touching reality* — writing corrective verdicts through the unused WRITE endpoint, sweeping labs before events, campaigning fixes across the fleet, ranking all work by error budget.
- **ASSURANCE plane (business):** reliability becomes the product customers buy — freshness SLAs, event-readiness certificates, run guarantees, fleet benchmarks. *Nobody else can underwrite these because nobody else owns the evidence loop.*

One strategic optionality bet rides alongside: **agent execution** (an internal agent that runs labs as authored) — the only path to the one defect class evidence-comparison can never catch (guide and validator wrong *the same way*), and the company's hedge for the agentic era.

## 2. Product Hierarchy

```
LAB DOCTOR PLATFORM
├── EVIDENCE (shipped)
│   ├── Real Catalog Scanner + CI Gate            ├── Diagnosis Engine (6 classifiers)
│   ├── Continuous Monitor (change-only alerts)   ├── Change Intelligence (live feeds → registry)
│   ├── Support Intelligence (ticket→cause)       └── Digital Twin (dev/validation substrate)
├── ACTION (next two quarters)
│   ├── Verdict Write-Back  — amnesty for regression victims; diagnosis notes in the native validation panel
│   ├── Event Readiness     — T-72h sweeps, deploy-path canaries, go/no-go certificates
│   ├── Fleet Fix Campaigns — Dependabot-style batched PRs per registry change, LABOWNERS-routed
│   ├── Error-Budget Queue  — two clean SLIs (deploy-success, incident-minutes) rank every fix
│   └── Validator Trust Tiers — an error budget for the ground-truth layer itself
├── ASSURANCE (revenue)
│   ├── Certified Fresh SLA — contractual content-rot detection/draft windows (scope-honest)
│   ├── Event Readiness Certification — rehearsal-backed SKU per event
│   ├── Lab Run Guarantee — attribution-backed auto-credits (only sellable with our fault attribution)
│   └── Fleet Reliability Benchmark — percentile ranking; the network-effect lock-in
└── OPTIONALITY
    ├── Sentinel Walker — internal lab-executing agent (ground truth for consistent-wrongness)
    ├── CloudBench / Rocky Gym — agent evaluation on live cloud with deterministic ground truth
    ├── Cloud Weather Station — the fleet as a provider-regression canary array (internal → external)
    └── Margin Sentinel — cost-per-validated-learner regressions as a first-class finding type
```

## 3. Technical Roadmap

**Next Month (all sandbox-provable or single-spike-gated):**
1. **WRITE-endpoint semantics spike** — one controlled test on a throwaway lab seat: does a pushed result carry a learner-visible message? Does it persist? Audit trail? *This single unknown gates the entire Action plane; four independent lenses' best ideas hang on it.*
2. Internal SLOs on the two clean SLIs (deploy-success rate, diagnosis-confirmed incident-minutes) + error-budget ranking of the fix queue — monitor history already computes the inputs.
3. Case ledger v0: log every finding→fix→outcome with signature + diff (a table, not a product — the corpus that later powers precedent retrieval, campaigns, and postmortems).
4. Validator Trust Tiers v0: score each validator from its own false-FAIL/false-PASS history; feed tier into diagnosis confidence honestly.
5. Event-calendar data ask (read-side): the one new data dependency the readiness cluster needs — a pull of upcoming event schedules per lab.

**Next Quarter:**
6. False-FAIL Amnesty runbook (destroyer-hardened form: only regression victims with a recorded prior PASS; reversion guard; human authorization per incident; "0 amnestied pairs fail post-fix re-validation" as the hard metric).
7. Validation-Panel Back-Channel: fleet-confirmed diagnosis notes surfaced through validation results — Rocky's first production surface, zero UI-injection dependency.
8. Event Readiness sweeps (T-72h): D-Day targeted re-validation (change-intel × bulk validate trigger), deploy-path canaries that understand T0 expectations (fresh instances legitimately fail work-validators), Null-Work validator certification on canary instances only — never real learner seats.
9. Fleet Fix Campaigns + lightweight LABOWNERS routing; Event War-Room view (readiness + incidents + Shadow queue in one screen).
10. Intent Ledger pilot (reviewed LLM extraction of per-step objective/expected-outcome into versioned sidecars, top-20 labs; CI re-extraction on guide diffs) + Validator Coverage Map from it.

**Next 6 Months:** production cutover (the DevTools capture remains the key); Certified Fresh SLA external on one quarter of internal SLO data; Margin Sentinel on first-party billing; Fleet Ontology as thin joins (org exposure × event proximity — not a graph platform); postmortem corpus + recurrence detector; Sentinel Walker v1 on scratch subscriptions (5 labs, golden-run diffs).

**Next 12 Months:** Fleet Reliability Benchmark (legal-gated cross-org percentiles); Cloud Weather internal → provider conversations; CloudBench pilot; MACC/co-sell packaging; Registry-as-a-Service concierge probe (2–3 friendly Microsoft-courseware repos, zero new software) before ANY SaaS build.

## 4. Business Roadmap
Land internal (support cost ↓, author velocity ↑, incident-minutes ↓) → prove with one quarter of SLO data → sell assurance (Certified Fresh, Readiness Certification, Run Guarantee) → lock in with the benchmark's network effect (percentile rankings only Spektra can compute) → optional data products (Cloud Weather, CloudBench) once fleet telemetry is production-fed. Pricing spine: free scanner/CI tier as the wedge; per-monitored-session ops tier; per-event certification SKU; SLA tiers gated on canary coverage + proven burn-rate precision ≥90%.

## 5. Innovation Roadmap (the bets, with their honest gates)
| Bet | Gate | Why it matters |
|---|---|---|
| Verdict Write-Back family | WRITE-endpoint spike | Remediation + learner reach with zero platform asks |
| Event Readiness family | event-schedule read access | Converts detection into *prevented* incidents at the moment of maximum value |
| Sentinel Walker / CloudBench | scratch-subscription budget | The consistent-wrongness blind spot + the agentic hedge |
| Cloud Weather Station | production telemetry at fleet scale | The only asset that grows strictly with fleet size and is unreplicable |
| Intent Ledger | extraction accuracy audit on 20 labs | Manufactures the structured-guide model the platform lacks |

## 6. Top 10 Features (ranked)
1. WRITE-endpoint spike → **False-FAIL Amnesty** (regression-victims-only form)
2. **Validation-Panel Back-Channel** (Rocky's production debut, no UI ask)
3. **Event Readiness sweeps + certificates** (T-72h go/no-go)
4. **Error-budget-ranked fix queue** (two clean SLIs, internal first)
5. **Fleet Fix Campaigns** (batched registry-driven PRs + LABOWNERS)
6. **Validator Trust Tiers** (error budget for ground truth itself)
7. **Case ledger + auto-drafted postmortems** (corpus now, products later)
8. **Intent Ledger** (reviewed guide-intent extraction → coverage map)
9. **Margin Sentinel** (cost regressions as findings; first-party billing)
10. **Certified Fresh SLA** (external, after one internal quarter)

## 7. Top 10 Risks
1. Writing a wrong PASS (amnesty) manufactures the system's own worst defect — mitigated by prior-PASS scoping + human gate + reconcile metric
2. SLI confounding (learner error read as lab fault) — killed the naive SLI; only two clean ones survive
3. Event-schedule data may not be pullable (gates the readiness family) — ask early
4. WRITE endpoint semantics unverified (message visibility/persistence) — the spike exists to kill this cheaply
5. Merge capacity, not detection, is the proven bottleneck — campaigns without LABOWNERS routing just pile up PRs
6. Harvester rot / silent staleness — freshness SLOs are non-negotiable
7. Twin-vs-production payload gap (observed{} richness) — cutover audit before any learner-touching action
8. Turf: Cosmos Tester at authoring, Lab Doctor at runtime — keep the boundary explicit or lose sponsorship
9. Copycat scanner (a weekend project) — the moat is the loop + case history + write access, never the scanner; message discipline required
10. Over-trust in validators as ground truth — Trust Tiers exist precisely to keep the system honest about its own sensors

## 8. Top 10 Opportunities
1. The unused WRITE endpoint (4 independent lenses converged) 2. The event calendar as forcing function 3. Error budgets as the universal prioritizer 4. Validator trust scoring 5. The case-history moat (compounds with every fix) 6. First-party billing → cost findings 7. Fleet-as-canary-array (grows strictly with scale) 8. Reviewed-extraction to manufacture structure the platform lacks 9. Attribution-backed guarantees (only sellable with our fault attribution) 10. Agent-evaluation ground truth (labs = eval environments with deterministic verdicts)

## 9. Top 10 Differentiators
1. Contradiction epistemology (never guesses — shows both facts) 2. Restraint as a feature (clean repos, sub-threshold silence, steady-state silence) 3. FP-audited claims (0/42, institutionalized) 4. Human-gated action loop proven on real PRs 5. Co-owned intent+outcome+content (structurally unavailable to third parties) 6. Fleet statistics no single tester can produce 7. Deterministic-first with LLM-drafts-only doctrine 8. Provenance labels on every surface 9. Two self-feeding loops already running 10. The digital twin — we can prove behavior before reality arrives

## 10. The Single Most Important Next Step
**Run the WRITE-endpoint semantics spike.** One controlled write to a throwaway lab seat answers: visibility, persistence, audit. If yes → the Action plane opens (amnesty, back-channel, Rocky's production surface — the highest-value cluster from 47 ideas). If no → four ideas die for the price of one afternoon, exactly how this project prefers to learn. Either outcome is the cheapest maximum-information move on the board.

---
*Killed with cause (for the record): Lab Checks API (platform theater for an audience of one) · Verifiable Skill Attestations (cannot attest WHO with transient identity) · Precedent embeddings over a corpus of two · Deprecation Radar wedge-SaaS (moat evaporates outside the fleet) · SLO freeze gates (statistical theater) · Herd Immunity (already built — it's the monitor).*
