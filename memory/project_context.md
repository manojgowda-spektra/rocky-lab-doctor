# Project Context — Rocky

> **Last Updated:** 2026-06-30
> **Purpose:** The "why" behind Rocky — context not obvious from requirements or code.

---

## Project Origin

Manoj Gowda at Spektra Systems wants to rethink the CloudLabs learning experience. The current model (open lab → read guide → act in VM → follow steps) works but feels traditional and instruction-driven. The initial idea: "Rocky," a cute futuristic floating robot companion living inside the lab environment.

A board-level discovery review (9 expert lenses) was run on 2026-06-30 to decide **whether Rocky should exist at all** before building anything. Outcome: **Great idea, transformational potential — readiness 76/100 — conditional on three reframes.** Full brief summarized in `docs/vision.md`, `docs/decisions.md`, `memory/assumptions.md`.

---

## The Real "Why" (key reframes from the review)

1. **The problem isn't aesthetics.** "Labs feel traditional" is a founder frustration. The *measurable* problem: AI assistance already happens during labs — **outside** the product (learners alt-tab to ChatGPT/Copilot when stuck). CloudLabs is being disintermediated at the moment of confusion. Rocky's job is to **recapture that moment in-product**, where it uniquely holds lab context.

2. **The intelligence is the asset; the robot is not.** The cute floating character is the riskiest, most overweighted part — it courts the Clippy trap and enterprise rejection while delighting only students. Decouple agent from avatar (ADR-001).

3. **Cosmos makes this a warm start, not a moonshot.** Cosmos already generates per-lab **validation logic**, does **drift detection**, and runs **MCP agents**. That supplies two of Rocky's three moat vertices and the infra for the third. Most value ships *without computer vision* (ADR-002).

4. **The real prize is bigger than a helper.** The transformational endgame is an objective-driven adaptive tutor that makes linear guides obsolete, plus a defensible **competency signal** (enterprise revenue SKU).

---

## The Moat (why we're positioned to win)

The differentiation triangle: **(lab intent) × (live environment state) × (pedagogical guardrails)**. Generic AI sits in none of these for this use case; providers (MS/AWS/Google) sit in at most one or two and are single-cloud. CloudLabs + Cosmos uniquely span all three.

---

## What We Tried / Considered and Rejected
| Approach | Why rejected |
|---|---|
| Mandatory always-on robot character | Clippy risk, enterprise rejection (ADR-001) |
| Vision-first (VLM watches screen) | Cost/latency/creepiness/brittleness; unnecessary given Cosmos (ADR-002) |
| Proactive-by-default | Annoyance → disable → gimmick (ADR-003) |
| "Just a chatbot panel" | Undifferentiated; doesn't use the moat |

---

## Non-Obvious Decisions
| Decision | Why it looks wrong | The real reason |
|---|---|---|
| Don't lead with the cool robot | "But the robot is the vision!" | The robot is a skin; the context engine is the moat |
| Don't watch the screen first | "Seeing the screen seems most powerful" | Telemetry is cheaper, faster, private, and already exists in Cosmos |
| Default Rocky to silent | "An assistant should be proactive!" | One false interrupt costs more than ten missed ones |

---

## Tribal Knowledge / External Context
- Cosmos is auth-walled (login-with-CloudLabs). Its in-app AI chat has **not** been evaluated firsthand yet (needs a logged-in Playwright session).
- CloudLabs carries SOC 2 Type II / ISO 27001 / GDPR / Microsoft SSPA — enterprise governance is an existing muscle (reduces, doesn't eliminate, the surveillance-rejection risk).
- Provider co-option (MS Learn / AWS Skill Builder / Google Cloud Skills Boost) is the long-term competitive threat.

---

## Dependencies on Other Teams
| Dependency | Need | Status |
|---|---|---|
| Cosmos team | Learner-facing read API (lab spec + validation + drift) | Unconfirmed — #1 thing to verify |
| Enterprise security buyers | Acceptable observation model | Interviews not yet done |

---

## Log
| Date | Added | Why |
|---|---|---|
| 2026-06-30 | Full context from discovery review | Project definition |
