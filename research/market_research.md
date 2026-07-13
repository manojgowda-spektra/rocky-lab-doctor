# Market Research — Rocky

> **Last Updated:** 2026-06-30
> **Status:** INITIAL HYPOTHESES (validate during discovery)

---

## Purpose of This Document

Frame the opportunity for Rocky within CloudLabs' existing market. We are not entering a new market — we are deepening the value of an existing platform and defending it against AI-driven disintermediation.

---

## Market Context

CloudLabs already serves: ISVs, K-12 & Higher Ed, enterprises, and runs workshops, hackathons, trials, POCs, and training at scale across Azure/AWS/GCP, Windows & Linux. It carries SOC 2 Type II, ISO 27001:2022, GDPR, and Microsoft SSPA compliance, and offers an LMS-integration API. Rocky rides on this installed base — distribution is not the bottleneck; value and trust are.

---

## The Core Market Insight

**AI is already disintermediating CloudLabs at the moment of confusion.** Learners leave the product (alt-tab to ChatGPT/Copilot) precisely when they're stuck — the highest-value, highest-intent moment. Rocky's market opportunity is to **recapture that moment inside the product**, where it holds context generic AI cannot access.

This reframes Rocky from "nice feature" to "defensive necessity + offensive differentiator."

---

## Opportunity Segmentation

| Segment | Pain intensity | Rocky value | Willingness to pay |
|---|---|---|---|
| **Self-paced learners (junior/student)** | High (no one to ask) | Unblock + teach | Indirect (platform stickiness) |
| **Enterprise L&D** | Medium-High (can't verify competency) | Competency signal + governance | **High** (new SKU potential) |
| **Workshop/hackathon hosts** | High (question flood) | Instructor aggregate insight | Medium (event value) |
| **Senior professionals (POC/eval)** | Low-Medium (just want debugging) | Precise environment debugging | Indirect |

> Note: the **buyer with budget (enterprise L&D)** values competency verification, while the **user with pain (junior learner)** values unblocking. Rocky must serve both — but the monetization story leans on the competency signal.

---

## Two Problems, Two Value Cases (do not conflate)

| Problem | Buyer cares about | Primary metric |
|---|---|---|
| **A. Unblocking / support load** | Cost, completion, NPS | Time-to-unblock, support deflection |
| **B. Learning depth / competency** | Skill transfer, verifiable competency | Mastery, transfer, assessment validity |

Most AI-tutor products die pitching A (cheap, low WTP) while promising B (hard, high WTP). Decide explicitly which is funded first. **Recommendation: ship A to earn trust and prove precision; build toward B for monetization.**

---

## Market Validation Evidence (TO GATHER)

| Evidence needed | Method | Status |
|---|---|---|
| Learners actually leave to use generic AI when stuck | Session analytics / interviews / WoW pilot | NOT GATHERED |
| Unblocking measurably improves completion | Wizard-of-Oz pilot | NOT GATHERED |
| Enterprises will pay for a competency signal | L&D buyer interviews | NOT GATHERED |
| Scaffolded help improves transfer (not just satisfaction) | Controlled pedagogy study | NOT GATHERED |

### Counter-Evidence to Actively Seek (challenge ourselves)
- Maybe learners are satisfied with current guides and don't feel acute pain → "rebuild on aesthetics" trap.
- Maybe seniors uniformly reject observation → enterprise gate closes.

---

## Pricing Hypotheses (early, unvalidated)

| Model | Idea | Note |
|---|---|---|
| Platform-included | Rocky as a differentiator in base CloudLabs | Drives retention/win-rate |
| Competency SKU | Premium add-on: verified competency reporting for enterprise L&D | The real revenue thesis |
| Event tier | Instructor aggregate copilot for workshops/hackathons | Different buyer (host) |

---

## Research Sources

| Source | Type | Link |
|---|---|---|
| CloudLabs site & platform pages | Primary (vendor) | See `research/references.md` |
| Cosmos Lab Builder page | Primary (vendor) | See `research/references.md` |
| Azure/AWS marketplace listings | Secondary | See `research/references.md` |

---

## Update Log

| Date | Researcher | Key finding |
|---|---|---|
| 2026-06-30 | AI Session | Core insight: AI already disintermediating at moment-of-confusion; recapture in-product |
