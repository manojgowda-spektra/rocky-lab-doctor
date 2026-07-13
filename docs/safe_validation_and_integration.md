# Safe Real-World Validation & Integration Strategy
**Date:** 2026-07-10 · **Evidence base:** the live Cosmos AI interview + 246-fact research base
(`cloudlabs_cosmos_live_discovery.md`, 2026-07-04) — Cosmos AI *is* the domain expert consulted; its
verified answers are cited below. Where the platform gave no evidence, the item is marked **UNVERIFIED**
rather than assumed. Re-interviewing Cosmos live requires the authenticated browser session (not available
in this environment); the recorded interview is the source of record until then.

---

## 1. The environment questions, answered honestly

| Question | Answer | Evidence |
|---|---|---|
| Is there a sandbox environment? | **No evidence one exists.** Cosmos never surfaced a sandbox; none appears in the API catalog. | UNVERIFIED — ask platform team |
| Is there a dev environment? | **No evidence.** | UNVERIFIED — ask platform team |
| Is there a test tenant? | **Not as a platform feature — but the platform-native equivalent exists:** a partner can create their **own ODL/event** and register only team-owned seats. That *is* a test tenant, made of the platform's own primitives. | RESEARCH (lab lifecycle §5 of discovery) |
| Partner testing environment? | Same answer: a self-created, self-populated event under our partner account. | RESEARCH |
| Staging environment? | **No evidence.** Publish flow goes guide-repo → GitHub PR → merge → wired to ODL. The PR **is** the staging surface for content; there is no staged runtime. | RESEARCH §5 |
| Demo catalog? | Our 8 cloned real repos + the 12-lab digital twin serve this role today; no platform-provided demo catalog surfaced. | LIVE+RESEARCH |
| What data is safe to use? | Guide/content repos (read-only git) — already in use. Twin data — ours. Public feeds — public. Own-seat runtime data from a self-created event — safe with partner consent. **Real learner data — only historical, only with approval, only redacted.** | — |
| What APIs are safe to consume? | Read-only GETs: labs list, event users, per-learner validation-results, deployment activity log, progress. All poll-based (no eventing exists — confirmed LIVE). | LIVE+tools §2, §4 |
| What APIs should NOT be touched? | `PUT …/event-users/{u}/validations/…` (write; semantics **unverified** — the spike exists to test it safely), `POST …/report` (purpose **unconfirmed**), the **validate-all-users bulk trigger against any live event** (could disrupt in-progress learners), and any endpoint at fleet-polling volume until **rate limits are confirmed (UNVERIFIED)**. | LIVE §6, discovery §155 |
| Approvals normally required? | (a) Partner-account owner consent for a test event; (b) platform/eng team blessing for undocumented endpoints + rate-limit guidance; (c) data-privacy sign-off for ANY real-learner pull, even read-only; (d) support-team owner for ticket exports; (e) event-owner consent for historical event data. | — |

## 2. The validation ladder (each rung gates the next)

### LOW RISK — running today, zero production contact
| # | Activity | Why safe |
|---|---|---|
| L1 | Static scanning of cloned real repos (read-only git) | No API, no learners; already produced 104 findings + 5 PRs |
| L2 | Digital twin (seeded, labelled SIMULATED) | Ours entirely; already found 2 real engine bugs |
| L3 | Public feeds (endoflife.date, Azure Updates) | Public data |
| L4 | Cosmos AI chat consultation | Read-only Q&A; the platform's own expert |
| L5 | CI gate on our own forks | Our repos, human-merged |

### MEDIUM RISK — the next step; needs partner consent, no real learners
| # | Activity | Controls |
|---|---|---|
| M1 | **Create a "Rocky QA" event** under our partner account; register ONLY team-owned seats; run 2–3 labs ourselves as learners | The platform-native test tenant. Consumes some subscription quota/credit — budget it. |
| M2 | Point the ingestion adapter (built, chaos-tested) at M1's seats — read-only GETs, conservative polling, existing 429/backoff handling | First REAL API payloads → closes the #1 unknown: real `observed{}` richness vs the twin's assumption |
| M3 | Bulk validate-all-users trigger **on the M1 event only** | Never against a live event |
| M4 | Historical pull from ONE **completed** real event (event-owner + privacy approval; emails hashed at ingest; throttled) | Runs the expected-state audit on real validation richness — the groundability question |

### HIGH RISK — explicitly gated; each needs named approval
| # | Activity | Gate |
|---|---|---|
| H1 | **WRITE-endpoint spike**: one `PUT validation-results` against ONE throwaway seat in the M1 event | Platform-team blessing (undocumented write path), even though the seat is ours. Unlocks the whole Action plane. |
| H2 | Polling live in-progress events with real learners | Privacy sign-off + rate-limit confirmation + read-only credentials |
| H3 | Live amnesty (writing real learner verdicts) | H1 passed + five gates + named human per case + platform approval. **Never before all of those.** |

**NEVER without a formal contract:** writes to real learner records outside H3's gates; bulk triggers on live events; unthrottled fleet polling; any learner PII leaving the redaction pipeline.

The ladder's principle: **each rung produces the evidence that justifies the next.** M2's payloads prove the adapter's shape-mapping before any real-learner pull; M4's audit proves labs are groundable before anyone pays for diagnosis; H1's semantics prove write-back before amnesty exists anywhere near production.

## 3. Integration strategies

### 3.1 CloudLabs (runtime platform)
- **Value:** the entire diagnosis layer at fleet scale — Cosmos's own #2/#3/#5 gaps.
- **Effort:** LOW-MED — the adapter is built and chaos-tested; cutover is `{baseUrl, token}` config plus whatever one real captured call reveals about payload shapes.
- **Risks:** auth model + rate limits UNVERIFIED; poll-only (no eventing) bounds freshness to sweep cadence.
- **Dependencies:** partner API credentials; one DevTools capture of an authenticated call; M1 event.
- **Adoption path:** internal ops dashboard first (nobody else has to change behavior) → support pilot → author-facing.

### 3.2 Cosmos (authoring platform)
- **Value:** Rocky supplies what Cosmos Review lacks — **runtime evidence**. Cosmos flags authoring-time blockers; Rocky reports what actually broke learners. The deprecation registry could also gate Cosmos publish.
- **Effort:** MED — an export/feed of findings keyed by templateGuid.
- **Risks:** **turf** — Cosmos Tester owns authoring-time QA. Position Rocky strictly as the *runtime* evidence supplier, never a rival reviewer.
- **Dependencies:** Cosmos team buy-in; templateGuid↔repo mapping.
- **Adoption path:** a read-only "runtime findings" panel in Cosmos Review fed by Rocky's JSON; no workflow change asked of authors.

### 3.3 Author workflows
- **Value:** pre-diagnosed defects with drafted fixes; campaigns collapse 104 findings into ~10 decisions.
- **Effort:** LOW — proven: 5 real PRs, 2 merged, CI gate armed on one repo.
- **Risks:** merge capacity is the real bottleneck (proven); PR pile-up erodes goodwill.
- **Dependencies:** LABOWNERS routing; repo-owner engagement.
- **Adoption path:** CI gate rolls repo-by-repo, **advisory first, then armed**; campaigns land as a fortnightly digest, not a PR flood.

### 3.4 Support workflows
- **Value:** N tickets → 1 incident (twin: 74→24); auto-assembled, redacted evidence packets; "learner vs content vs cloud" attribution — Cosmos confirmed support does ALL of this manually today.
- **Effort:** LOW-MED — Listener is built; needs a real ticket export (CSV is enough).
- **Risks:** ticket text quality; the honesty rule (a lab is blamed only when fleet evidence confirms) must survive contact with messy real tickets.
- **Dependencies:** support-team owner; 2-week ticket export.
- **Adoption path:** shadow-mode pilot with ONE support engineer — Rocky triages in parallel, human keeps deciding; **measure the triage-time delta.** That number is the business case.
- **This is the recommended first real-world pilot** — lowest risk, clearest payer, already built.

### 3.5 QA processes
- **Value:** continuous fleet QA replacing point-in-time manual retesting; T-72h event-readiness sweeps.
- **Effort:** MED — monitor is built; readiness sweeps need the event calendar (ask pending).
- **Risks:** alert fatigue if tuned wrong (mitigated: alerts only on change — designed in).
- **Dependencies:** event-schedule read access; M1 event for calibration.
- **Adoption path:** ops watches the monitor for one cycle; then readiness sweeps before one real event; then it's the default pre-event step.

### 3.6 Content publishing
- **Value:** rot cannot re-enter the catalog — the gate blocked a planted regression in 4s.
- **Effort:** LOW — the gate is self-contained (scanner+registry+baseline per repo).
- **Risks:** false-positive blocking a legitimate PR would burn trust instantly (mitigated: baseline diff = NEW findings only; word-boundary + fence hardening; 0/42 FP audit).
- **Dependencies:** repo-owner opt-in per repo.
- **Adoption path:** advisory (warn) → armed (block) after 2 clean weeks per repo; registry updates flow from change intelligence with human vouching.

---

*Enhancement selection, readiness assessment and next milestone: see the session record — gap hunt run
wf_ee3884b3-3d7 grounds the "what still escapes detection" answer in the actual code and repos.*
