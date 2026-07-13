# Future Ideas — Rocky

> **Last Updated:** 2026-06-30
> **Total Ideas:** 6 killer features + 1 transformational arc

---

## Purpose

Holding area for ideas not yet committed. In discovery, these are the candidate "killer features" from the board review, ranked by (value × feasibility-given-Cosmos). Promotion to backlog requires human sign-off + alignment check (vision.md) + constraint check.

---

## Killer Features (ranked)

### IDEA-001 — Environment-grounded debugging 🥇
| Field | Value |
|---|---|
| Status | OPEN · Value: HIGH · Feasibility: HIGH (Cosmos validation + resource graph) |
**Description:** "Your deployment failed because that VM SKU isn't available in East US; the lab expects West US 2 — here's the fix." Grounded in real provider error + Cosmos's expected outcome.
**Why first:** Clearest ROI (support deflection), feasible now via telemetry, highest user-felt value.

### IDEA-002 — Drift-absorbing guidance 🥈
| Field | Value |
|---|---|
| Status | OPEN · Value: HIGH · Feasibility: MED-HIGH |
**Description:** When the portal UI has changed and the static guide is stale, Rocky guides anyway by reading live state.
**Narrative:** *"Cosmos detects drift at authoring; Rocky absorbs drift at runtime."* Attacks Spektra's own content-maintenance cost.

### IDEA-003 — Spoiler control / Socratic mode
| Field | Value |
|---|---|
| Status | OPEN · Value: HIGH · Feasibility: MED |
**Description:** Adjustable assistance: hint → guided → answer. Teaches instead of solving. A stance generic copilots structurally can't take (no objective). Addresses teaching-hallucination risk via grounding.

### IDEA-004 — Pre-failure nudges (precise, rare)
| Field | Value |
|---|---|
| Status | OPEN · Value: HIGH · Feasibility: MED (precision-gated) |
**Description:** "You're about to create this in the wrong resource group." Caught *before* failure. Ships only once precision proven (ADR-003).

### IDEA-005 — Competency signal
| Field | Value |
|---|---|
| Status | OPEN · Value: HIGH · Feasibility: MED · **Revenue SKU** |
**Description:** Mastery score from observed behavior (hints used, mistakes, self-corrections, time-on-task). Enterprise L&D pays for "did they actually learn it," not "did they click finish." New SKU, not a feature.

### IDEA-006 — Instructor aggregate copilot
| Field | Value |
|---|---|
| Status | OPEN · Value: HIGH · Feasibility: MED · Different buyer (host) |
**Description:** Live room-wide view — "62% stuck on Step 7; 3 hit the same quota error." Killer for workshops/hackathons.

---

## Transformational Arc (the real prize)

### TECH-IDEA-001 — Objective-driven adaptive tutor (kill the linear guide)
**Description:** Replace "here are 40 steps" with "here's the objective; I'll guide, challenge, and adapt." Labs become generative/adaptive; assessment becomes continuous/embedded. Rocky moves Teacher → Mentor → Coach → Lab Partner along a scaffolding-and-fading arc.
**Why not now:** Earn the right via unblocking + grounding + proven precision first. Multi-year arc.
**Trigger to reconsider:** After IDEA-001/002 prove grounding works and trust is established.

---

## Authoring Flywheel (compounding moat)

### IDEA-010 — Confusion-data flywheel
**Description:** Every runtime confusion Rocky observes feeds Cosmos's drift detection + pitfall library → labs self-improve. Proprietary data competitors can't replicate.
**Why not now:** Requires Rocky in production at scale; depends on privacy/governance model.

---

## How to Promote an Idea
1. Human sign-off it aligns with `docs/vision.md`.
2. Check `docs/constraints.md` (security, economics, neutrality).
3. Validate the relevant assumption in `memory/assumptions.md`.
4. Add to `docs/requirements.md` + `tasks/backlog.md`. Mark here [PROMOTED].

---

## Log
| Date | Reviewed By | Notes |
|---|---|---|
| 2026-06-30 | AI Session | Initial killer-feature set + transformational arc from discovery review |
