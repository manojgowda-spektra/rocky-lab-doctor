# Project Vision — Rocky

> **Status:** DRAFT (Discovery phase — vision is a working hypothesis, not yet validated)
> **Last Updated:** 2026-06-30
> **Owner:** Manoj Gowda, Spektra Systems
> **Review Date:** TBD (after validation experiments)

---

## Purpose of This Document

This document defines Rocky's north star. Everything must trace back here. **We are in discovery** — this vision is a strong hypothesis shaped by a board-level strategic review (see `memory/project_context.md` and `docs/decisions.md`), not a frozen commitment.

---

## Problem Statement

### The Problem We Are Solving

CloudLabs delivers hands-on cloud labs (training, workshops, hackathons, POCs, demos). The current experience works but is **instruction-driven and undifferentiated**: open lab → read guide → act in VM → follow steps to completion.

**The deeper, measurable problem is not "labs feel traditional" (an aesthetic frustration). It is that AI assistance is *already happening* during labs — outside the product.** Learners alt-tab to ChatGPT/Copilot the moment they're confused. CloudLabs is being silently disintermediated at its most valuable moment (the moment of confusion), by tools that have *none* of the lab context CloudLabs holds.

**Who is affected:**
- Learners (especially self-paced/async, and early-career)
- Instructors/hosts (flooded with repetitive questions in live events)
- Spektra (support cost, content-maintenance cost, competitive differentiation)
- Enterprise L&D buyers (cannot verify whether training produced real competency)

**Current pain points (the real, measurable ones):**
- **The "stuck cliff"** — no one to ask in self-paced labs → abandonment or silent alt-tab to generic AI.
- **Copy-paste learning** — learners complete steps mechanically; completion ≠ competency.
- **Opaque cloud errors** — failed deployments, wrong region, missing permissions are morale-killing dead ends.
- **Guide rot / drift** — provider UIs change constantly; static screenshots and step text decay (Cosmos already detects this at authoring time).
- **Instructor flood** — live events drown in identical repeated questions.

**Why existing solutions fail:**
- Generic AI (ChatGPT/Copilot) can't see the learner's lab objective or live cloud state, and spoils answers (anti-pedagogical).
- Static guides can't adapt, can't debug, and rot as UIs change.

---

## Vision Statement

### One-Line Vision

> A world where anyone learning in the cloud has an expert mentor beside them — one that sees what they see, knows where they're headed, and teaches them to do it themselves.

### Expanded Vision

Rocky is an environment-aware, pedagogy-first AI companion embedded in CloudLabs. It understands the lab's objective, observes the live environment (telemetry-first, not screen-surveillance-first), unblocks learners in the moment, teaches rather than spoils, and ultimately makes rigid step-by-step guides obsolete by becoming an **objective-driven adaptive tutor** that also emits a **defensible competency signal**.

**Critical framing (see ADR-001/002/003):** Rocky is the *intelligence*, not the robot. The avatar is a configurable, persona-tuned presentation layer — not the product.

---

## Goals

### Primary Goals

| ID | Goal | Metric | Target |
|---|---|---|---|
| G-001 | Reduce time-to-unblock when learners get stuck | Median minutes from stuck → recovered | Significant ↓ vs. baseline (set in validation) |
| G-002 | Increase lab completion for self-paced learners | Completion rate with Rocky vs. without | Measurable ↑ |
| G-003 | Convert completion into *demonstrated competency* | Post-lab competency/transfer score | Establish baseline, then ↑ |
| G-004 | Capture the assistance layer inside the product | % of help-seeking served by Rocky vs. external AI | Majority in-product |

### Secondary Goals

| ID | Goal | Metric | Target |
|---|---|---|---|
| G-101 | Reduce support tickets per lab | Tickets / 100 lab-hours | ↓ |
| G-102 | Reduce content-maintenance cost via runtime drift absorption | Guide-update effort | ↓ |
| G-103 | Give instructors aggregate live insight | Adoption by hosts in live events | Pilot adoption |

---

## Non-Goals (Explicit Exclusions)

**Rocky will NOT (at least initially):**
- Be a mandatory, always-on, proactive animated character for all users (see ADR-001, ADR-003).
- Lead with computer vision / screen-watching as its primary sense (see ADR-002).
- Be a generic coding copilot or a general-purpose chatbot.
- Hand learners the answer on demand (it teaches via scaffolding; spoiler-level is a deliberate dial).
- Replace human instructors — it augments them.

These exclusions exist to avoid the Clippy trap, surveillance rejection, scope sprawl, and anti-pedagogical behavior.

---

## Target Users

### Primary User — "Maya," the upskilling junior
| Field | Value |
|---|---|
| **Who they are** | Early-career engineer / student doing self-paced cloud labs |
| **Core need** | Get unstuck and actually understand, without an instructor present |
| **Technical level** | Novice–intermediate |
| **Current workaround** | Alt-tab to ChatGPT; or abandon when stuck |
| **Success** | Recovers from confusion in-product and retains the concept |

### Secondary User — "Devan," the senior architect (POC/eval)
| Field | Value |
|---|---|
| **Who they are** | Experienced engineer running a POC or product eval in a lab |
| **Core need** | Fast, precise environment debugging — and to be left alone otherwise |
| **Technical level** | Expert |
| **Key constraint** | Will reject a cartoon/proactive assistant; wants minimal/reactive/off |

### Tertiary Users
- **"Priya," instructor/host** — wants aggregate room insight, fewer repeated questions.
- **"Robert," enterprise L&D buyer** — wants competency proof + airtight security/governance.

---

## Success Criteria

| Criterion | How Verified | Target Date |
|---|---|---|
| Demand for in-moment help is real and measurable | Wizard-of-Oz pilot in live workshops | TBD (next experiment) |
| Telemetry-first grounding can serve most help without vision | Cosmos read-API + resource-graph spike | TBD |
| Enterprise will accept the observation model | Security buyer interviews | TBD |
| Unit economics close at workshop scale | Cost-per-lab-hour model | TBD |

---

## Stakeholders

| Name / Role | Interest | Influence | Communication |
|---|---|---|---|
| Manoj (project lead) | Strategic direction, validation | High | Direct |
| Cosmos team | Knowledge/API backbone | High | Integration dependency |
| Enterprise security buyers | Governance, data residency | High (gate) | Early interviews |
| Instructors / event hosts | Live-event value | Medium | Pilot feedback |

---

## Key Assumptions About the World

(Full risk/assumption log in `memory/assumptions.md`.)
1. Learners experience help-seeking friction acute enough to change behavior.
2. Cosmos can expose per-lab spec + validation logic + drift map to a learner-facing runtime.
3. Most value is reachable via telemetry/structured state, not computer vision.
4. Enterprises will accept *some* observation model with the right governance.
5. The same users who want help will also tolerate the observation that enables it.

---

## Alignment Checklist (use when evaluating any feature)

- [ ] Serves the primary user's core need (unblock + understand)?
- [ ] Advances a primary goal (G-001…G-004)?
- [ ] Violates a non-goal (Clippy / vision-first / spoiler / mandatory character)?
- [ ] Consistent with ADR-001/002/003?
- [ ] Worth the complexity and the trust/precision cost?

---

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 0.1 | 2026-06-30 | AI Session | Initial vision from board-level discovery review |
