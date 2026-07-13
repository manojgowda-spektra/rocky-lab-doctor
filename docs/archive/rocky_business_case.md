# Rocky — Business Case & Board Pitch

> Why leadership should fund Rocky: measurable value, ROI model, risks, 3-year vision, and the one bet.
> Numbers are ILLUSTRATIVE and PARAMETRIC — plug CloudLabs' real figures into the formulas.
> **Created:** 2026-07-01.

## The pitch in one paragraph
CloudLabs' cost and quality both scale with the catalog: thousands of labs that rot as clouds change, learners who get stuck and churn, and support that grows linearly with usage. **Rocky attacks all three at once** — it unblocks learners (completion + satisfaction), deflects and accelerates support (cost), and turns every session into fleet intelligence that keeps the catalog self-correcting (quality + maintenance). The companion drives adoption; the **validator + flywheel** is the compounding moat competitors can't copy because they don't own the labs, the intent, or the fleet.

## North Star + supporting KPIs
- **North Star:** **Unblocked Completion Rate** = % of started labs completed *with demonstrated competency* while Rocky is enabled. (Fuses engagement, outcome, and value.)
- **Business co-metric:** **Catalog Health Score** (fleet) + **Support Cost per 1,000 sessions.**

---

## Measurable value — what/how/data/dashboard/KPI

### Learner
| Measure | How | KPI for leadership |
|---|---|---|
| Completion rate | started vs completed (validation) | +8–12 pts target |
| Time-to-complete | step timestamps | −15–25% |
| Abandonment | started, no completion, exit after stuck | −20–30% |
| Stuck-recovery rate | struggle-signal → later success | new metric; >50% |
| Satisfaction / NPS | in-lab microsurvey + "keep Rocky on?" | +10–15 NPS |
| Competency | post-lab check / validation depth | new signal |

### Operations
| Measure | How | KPI |
|---|---|---|
| Tickets / 1,000 sessions | ticket system + session count | −30–45% |
| Deflection rate | issues Rocky resolved/guided vs escalated | 30–45% |
| MTTR | ticket open→close; Rocky bundle attached | −40% (diagnostics pre-attached) |
| % tickets with Rocky diagnostics | escalation bundles | ~100% of escalations |
| Agent hours saved | deflected tickets × handle time | reported monthly |

### Product / Catalog
| Measure | How | KPI |
|---|---|---|
| Per-lab health score | pass rate by step + drift + anomalies + hotspots | dashboard |
| Mean-time-to-detect lab issue | first divergence → flag | weeks → <1 day |
| Drift alerts | runtime UI/guide mismatch | count + lead time |
| Validation-bug detections | resource-correct-but-fail (and inverse) | count |
| Manual QA hours | before/after | −50%+ |

### Business
| Measure | How | KPI |
|---|---|---|
| Gross renewal / retention | CRM | +1–2 pts |
| Win-rate / differentiation | sales-cited "Rocky" in wins | qualitative + count |
| Cost per session (AI+infra) | metering | trend down w/ scale |
| Adoption | % sessions Rocky-enabled | >70% |

### Data Rocky collects (grounded, consented, aggregated)
Step timings · validation results · error codes · hints/interactions · struggle scores · resolutions · escalations · outcomes · drift/anomaly events. Per-learner data governed + consented; fleet data anonymized/aggregated.

### Dashboards
Learner Outcomes · Support Ops · **Catalog Health** (the crown jewel) · Executive (North Star + renewal + ROI + adoption).

---

## ROI story (parametric — worked example)
**Assumptions (illustrative):** 100,000 lab sessions/month · baseline completion 70% · 4% of sessions → a support ticket (4,000/mo) · loaded cost/ticket ≈ $18 + 20 min agent time · ~2,000 labs in catalog · AI cost ≈ $0.05/session (deterministic-first + gated).

**Costs (monthly, illustrative):**
- AI credits: 100k × $0.05 = **$5,000**
- Infra (event bus, RAG store, dashboards): **~$8–15k**
- Team (amortized build): the real investment — engineers/PM/DS.

**Benefits (monthly, illustrative):**
- **Support deflection:** 35% of 4,000 = 1,400 fewer tickets → **~467 agent-hours** + **~$25k** direct handling saved. MTTR −40% on the rest (diagnostics pre-attached).
- **Completion/outcome:** +10 pts on 100k = **~10,000 more completed labs/month** → higher satisfaction + the outcome customers pay for.
- **Catalog QA:** MTTD weeks→hours across 2,000 labs → **−50% manual QA hours** + fewer learners hitting broken labs (which themselves generate tickets + churn).
- **Renewal uplift:** +1–2 pts gross renewal on a large ARR base **dwarfs every operational number** — this is the real prize.

**Punchline:** *"Even at conservative support-deflection + QA savings, Rocky's operational savings (~$25k+/mo direct + ~460 agent-hours) roughly offset its run cost. The completion lift and catalog-health improvements are upside. And a 1–2 point renewal improvement — driven by outcomes + differentiation — is worth more than all operational savings combined."* Plug real session volume, ticket rate, and ARR to size it.

---

## Risk register (brutally honest)
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Privacy / observation perception** (esp. on-VM) | High | High | Consent + telemetry-only mode + redaction-before-cloud + in-tenant inference + trust docs (Recall lessons); governance gate before P3 |
| **Hallucination / wrong-confident answers** | Med | High | Trust-first: evidence-gating (built), grounding-only, provenance trace, validation from API only, post-verifier |
| **User annoyance (Clippy)** | Med | Med | Budget wallet, earn proactivity, gaze-before-voice, DND, dismissal backoff |
| **Token / AI cost blowout** | Med | Med | Deterministic-first, small-model pre-filter, RAG cache per template, per-user credit cap, event-driven |
| **Scaling (fleet, concurrency)** | Med | Med | Event-driven + adaptive polling, cache, stateless reasoning, autoscale |
| **Validator false positives** (bad drift/QA alerts) | Med | High | Confidence thresholds, fleet-aggregate (not single-user) triggers, human-in-loop for authoring changes |
| **Security (agent + cloud read)** | Med | High | Least-privilege, signed on-VM agent, no raw creds, scoped read service, audit |
| **Maintenance burden** (per-lab) | Med | Med | Auto from Cosmos spec (no per-lab hand-tuning); RAG cached per template |
| **Platform complexity / scope creep** | Med | Med | Phased; one moat (validator+flywheel); "won't build" list enforced |
| **Ground-truth data gaps** (see final challenge) | High | High | Invest in the expected-state model in Cosmos authoring — the real prerequisite |

---

## 3-year vision
**Year 1 — Trust + Wedge.** Grounded companion + AI Troubleshooter live on top labs; provenance/evidence-gating; escalation-with-diagnostics; **Lab Health dashboard MVP.** Proof: measurable support deflection + completion lift on piloted labs; adoption + "keep Rocky on" > target.
**Year 2 — Proactive + Fleet + Presence.** Memory/skill-map; **predictive pre-warnings** from fleet stats; on-VM agent (whole-VM awareness) GA for Windows labs; **validator across the catalog**; Cosmos closed-loop **auto-drafts fixes**; self-improving labs visible in metrics.
**Year 3 — Self-maintaining catalog + adaptive learning.** Labs auto-detect + auto-draft fixes (human-approved); personalized adaptive difficulty per learner; competency/certification signal; guided auto-fix (confirmed); Rocky a platform capability partners depend on.

**Year-3 "years ahead" line:** *CloudLabs labs self-heal, learners rarely get stuck, support is a fraction of usage-scaled cost, and every session makes the catalog smarter — a compounding data advantage no competitor with a generic assistant can match.*

---

## The ONE thing to build exceptionally well first
**→ The AI Troubleshooter — i.e., the trustworthy, grounded observe→diagnose core.**

Not the flashy companion, not the validator directly. Reasoning:
- It delivers the **clearest immediate ROI** (support deflection + unblocking → completion).
- It **forces you to nail the hard, defensible part** — grounding, trust, environment awareness — that *everything else depends on*.
- The **validator and fleet intelligence are literally this engine aggregated** — you cannot build them well without it; build them first and they rest on sand (false alerts from weak grounding).
- It **earns the observation rights** (a genuinely helpful troubleshooter is welcomed watching) that unlock the flywheel.
So the single capability that, built world-class, unlocks the most long-term value is the **grounded troubleshooting core** — it's simultaneously the near-term wedge and the seed of the moat. (The validator is the highest long-term value, but the troubleshooter is how you earn the right and the data to build it.)

---

## The most important thing we're underestimating
**Rocky's ceiling equals Cosmos's structured-truth ceiling.** Every valuable thing Rocky does — grounding, troubleshooting, drift/validation, prediction, the validator — depends on a **complete, machine-readable "expected-state model": what SHOULD be true at each step of each lab.** Cosmos has validation definitions, but the leverage is in a *rich, consistent expected-state model across the whole catalog.* This is unglamorous authoring/data work, not AI — so teams will underestimate it and over-invest in the shiny model. **The highest-leverage investment is the ground-truth/expected-state data in Cosmos**, because it's the substrate the entire moat is built on. Secondary underestimate: **observation-rights & governance** — the flywheel only exists if you're *allowed* to observe at fleet scale; nail consent/privacy early or the moat never materializes.
