# Competitor Analysis — Rocky

> **Last Updated:** 2026-06-30
> **Status:** INITIAL (from discovery review; deepen during validation)
> **Total Competitors Analyzed:** 7 categories

---

## Purpose of This Document

Understand who else serves "AI help during learning/cloud work" and where Rocky genuinely differentiates. The thesis: **nobody sits inside the triangle of (lab intent) × (live environment state) × (pedagogical guardrails).**

---

## The Differentiation Triangle (the moat)

```
        LAB INTENT (objectives, task flow, expected outcome)
                          ▲
                          │   ← only CloudLabs/Cosmos has this
   LIVE ENVIRONMENT ──────┼────── PEDAGOGICAL GUARDRAILS
   STATE (real Azure/     │       (teach, don't spoil;
   AWS/GCP resources,     │        Socratic scaffolding)
   validation results)    │
   ← ChatGPT can't see ───┘   ← generic copilots won't do (no objective)
```

Cosmos already supplies two vertices (intent + validation logic) and the MCP infra to query the third (live cloud state). This is the structural advantage.

---

## Competitive Landscape

| Competitor / Category | What it is | Sits in triangle? | Why Rocky differs |
|---|---|---|---|
| **Microsoft Copilot** | Productivity/M365 assistant | No | No lab objective, no lab-validation grounding, not pedagogical |
| **GitHub Copilot / Cursor** | Code assistants | No | Help you *do*, not *learn toward an objective*; blind to lab state |
| **ChatGPT / Claude (generic)** | General LLMs | No | Blind to live cloud state & lab intent; spoils answers by default |
| **Microsoft Learn (+ AI)** | MS training + content Q&A | Partial (single-cloud content) | Single-cloud; content-Q&A, not live-environment-aware companion |
| **AWS Skill Builder** | AWS training | Partial (single-cloud) | Single-cloud; not a live multi-cloud in-VM companion |
| **Google Cloud Skills Boost (Qwiklabs)** | Closest *labs* competitor | Partial | Strong labs; threat if Google adds a strong companion — defense = multi-cloud + neutrality + pedagogy + live-state grounding |
| **Pluralsight / DataCamp AI tutors** | Curriculum copilots | Partial (pedagogy) | Not embedded in a live provisioned multi-cloud VM with real resource state |

---

## Direct Competitor Detail — Google Cloud Skills Boost (Qwiklabs)

| Field | Value |
|---|---|
| **Why it matters** | The closest analog: real provisioned cloud labs at scale |
| **Strength** | Deep Google Cloud integration, large catalog, established |
| **Weakness vs. Rocky** | Single-cloud bias; companion (if any) is provider-aligned, not neutral or deeply pedagogical |
| **Threat level** | HIGH — if Google ships a strong in-lab companion |
| **Our defense** | Multi-cloud neutrality + intent×state×pedagogy moat + competency signal |

---

## Indirect Competitor — Generic AI (ChatGPT/Copilot) as "the stuck helper"

| Field | Value |
|---|---|
| **Type** | Status-quo behavior — what learners use TODAY when stuck |
| **Why users choose it** | Free, familiar, immediate |
| **Why it falls short** | No lab objective, no live cloud state, spoils answers, teaches nothing transferable, sometimes wrong for the specific lab |
| **How Rocky wins** | In-product, context-grounded, pedagogy-first — captures the moment generic AI currently steals |

> **Strategic note:** This is the most important competitor. Rocky's core job is to *recapture the help-seeking moment* currently leaking to generic AI.

---

## Feature Comparison Matrix

| Capability | Rocky (target) | Generic AI | Copilot/Cursor | Provider training AI | Qwiklabs |
|---|---|---|---|---|---|
| Knows the lab objective | YES | NO | NO | PARTIAL | PARTIAL |
| Sees live cloud resource state | YES (telemetry-first) | NO | NO | NO | PARTIAL |
| Multi-cloud (Azure/AWS/GCP) | YES | YES | PARTIAL | NO | NO |
| Pedagogical (scaffolds, doesn't spoil) | YES | NO | NO | PARTIAL | PARTIAL |
| Environment-grounded debugging | YES | NO | NO | NO | PARTIAL |
| Drift-absorbing guidance | YES | NO | NO | NO | NO |
| Competency signal | YES (target) | NO | NO | PARTIAL | PARTIAL |
| Instructor aggregate view | YES (target) | NO | NO | NO | PARTIAL |

---

## Positioning Statement

> *Rocky is the only AI companion that knows your lab's objective, sees your actual cloud environment, and is tuned to teach rather than to answer.*

---

## Competitive Watch List

| Target | Why watching | Frequency |
|---|---|---|
| Google Cloud Skills Boost companion features | Closest competitor | Quarterly |
| Microsoft Learn AI assistant evolution | Provider co-option risk | Quarterly |
| AWS Skill Builder AI features | Provider co-option risk | Quarterly |
| Generic AI "study/tutor mode" features | Status-quo competitor | Ongoing |

---

## Update Log

| Date | Updated By | Change |
|---|---|---|
| 2026-06-30 | AI Session | Initial competitive analysis from discovery review |
