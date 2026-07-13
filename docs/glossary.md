# Glossary — Rocky

> **Last Updated:** 2026-06-30
> **Total Terms:** 14

---

## Purpose

Shared vocabulary so humans and AI sessions mean the same thing. Add terms as they arise.

---

## Domain & Product Terms

### Rocky
**Type:** Product · The proposed environment-aware, pedagogy-first AI companion embedded in CloudLabs. Refers to the *intelligence/agent*, not the avatar (see [Agent vs. Avatar]).

### CloudLabs
**Type:** Product · Spektra Systems' hands-on cloud lab platform (training, workshops, hackathons, POCs, demos) across Azure/AWS/GCP, Windows & Linux.

### Cosmos
**Type:** Product · CloudLabs' AI lab *lifecycle* platform: Builder (NL → ARM templates + lab guides + validation logic), Tester (live runs, step capture, drift detection), Agents (MCP tools, sub-agents, scheduled runs). Rocky's intended knowledge backbone.

### Validation logic
**Type:** Domain · Per-lab automated checks Cosmos generates that define a step's expected end-state. Rocky's ground truth for "did the learner do it right" and anti-hallucination grounding.

### Drift / Drift detection
**Type:** Domain · Divergence between documented lab instructions and the actual (changed) cloud portal UI. Cosmos detects drift at authoring; Rocky aims to **absorb drift at runtime**.

### Competency signal
**Type:** Domain · A defensible mastery score derived from observed learner behavior (hints used, mistakes, self-corrections, time). Basis for a potential enterprise revenue SKU.

---

## Concept & Strategy Terms

### Agent vs. Avatar
**Type:** Concept · The **agent** is Rocky's context engine/intelligence (the moat). The **avatar** is the configurable presentation skin (panel ↔ character ↔ voice). ADR-001 decouples them.

### Telemetry-first
**Type:** Concept · Architecture stance: acquire context from structured sources (Cosmos spec/validation, cloud resource graphs, DOM) before resorting to computer vision. See ADR-002.

### The Clippy trap
**Type:** Concept · Failure mode where a proactive, imprecise assistant interrupts unhelpfully and gets disabled/mocked. Drives ADR-003 (earned proactivity).

### Surveillance dread
**Type:** Concept · Enterprise/learner perception that an observing assistant is spyware. Drives telemetry-only mode + governance (constraints SC-001…SC-004).

### Socratic mode / Scaffolding & Fading
**Type:** Pedagogy · Teaching by hints and guided questions (scaffolding) that decrease as the learner gains mastery (fading), rather than handing over answers. Implemented as the spoiler-control dial (IDEA-003).

### The differentiation triangle
**Type:** Strategy · Rocky's moat = (lab intent) × (live environment state) × (pedagogical guardrails). No competitor sits inside all three.

### Wizard-of-Oz (WoW)
**Type:** Process · A validation method where a human secretly plays the role of the not-yet-built AI, to test demand and behavior cheaply before engineering. Planned as Rocky's first experiment.

### North Star Metric
**Type:** Process · For Rocky: **% of labs completed with demonstrated competency AND Rocky enabled** — fuses engagement (not disabled), outcome (completed), and value (learned).

---

## Abbreviations

| Acronym | Full Form | Note |
|---|---|---|
| ADR | Architecture Decision Record | `docs/decisions.md` |
| WoW | Wizard-of-Oz | Validation method |
| L&D | Learning & Development | Enterprise training buyers |
| VLM | Vision-Language Model | Screen-understanding model (fallback only) |
| MCP | Model Context Protocol | Tooling Cosmos agents use |
| RG | Resource Group | Azure resource container |
| SKU | Stock Keeping Unit | A sellable product tier |

---

## Log
| Date | Change |
|---|---|
| 2026-06-30 | Initial glossary from discovery review |
