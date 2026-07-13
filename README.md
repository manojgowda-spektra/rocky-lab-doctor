# Rocky + Lab Doctor — README

> **Last Updated:** 2026-07-03
> **Project Status:** ACTIVE — working prototype, demo-ready
> **Current Phase:** Hackathon demo → substrate (telemetry contract + real-data ingestion)
> **Version:** 0.1.0

---

## 🎬 DEMO QUICKSTART (fastest path)

1. Double-click **`source/rocky-prototype/start-demo.bat`** — it starts the server, runs a 22-check
   preflight (warming the LLM cache), and opens both demo tabs.
2. Follow **`docs/demo_runbook.md`** — the only current runbook (the archived one is stale).
3. Keep the server window open for the whole demo — the warm cache lives in that process.

---

## START HERE — AI Assistant Protocol

**If you are an AI assistant (Claude or otherwise), read this section before touching any file.**

### Step 1 — Orient yourself (do this first, every session)

Read these files in order before making any changes or suggestions:

1. `docs/rocky_strategic_review.md` — THE governing strategy (priorities, what's parked, the inversion)
2. `docs/rocky_complexity_audit.md` — what was cut and why; the lean-build rules you must follow
3. `docs/rocky_product_design.md` — what Rocky IS (identity, intervention engine, voice)
4. `docs/rocky_architecture_and_execution.md` — platform/API reality (CloudLabs + Cosmos)
5. `docs/decisions.md` — ADR ledger; do not re-litigate closed decisions
6. `docs/registers.md` — live risk/debt/backlog registers
7. `CHANGELOG.md` — what actually happened, newest first
8. `docs/archive/` — superseded documents; historical reference ONLY, never current truth

### Step 2 — Verify before coding (the audit rules — non-negotiable)

- New scored/predictive features ship as plain evidence flags first; numeric scores only after a real
  outcome log exists to calibrate against.
- Prefer a deterministic check over an LLM call wherever it gets 80% of the value.
- New UI surfaces need a named user who asked, or ship as an A/B — never as a default.
- Never assert unverified state anywhere (UI copy included): observed vs. predicted vs. modeled, always labeled.
- A new strategy doc that supersedes an old one must archive the old one in the same edit.
- Nothing is deleted in this repo (no version control): superseded things move to `docs/archive/` or
  `design/archive/` with a reason.

### Step 3 — Update records as you work

- Log meaningful changes in `CHANGELOG.md` (newest first)
- Log any new decision in `docs/decisions.md`; new risks/debt in `docs/registers.md`
- Run `node --test` in `source/rocky-prototype/` — all tests must stay green and deterministic (no billed
  LLM calls in tests)

> **Golden Rule:** evidence over polish. The engine asserts; the LLM narrates; the docs record.

---

## Project Overview

| Field | Value |
|---|---|
| **Project Name** | <!-- PROJECT NAME --> |
| **Description** | <!-- One-line description --> |
| **Owner** | <!-- Name / Team --> |
| **Start Date** | <!-- DATE --> |
| **Target Launch** | <!-- DATE --> |
| **Tech Stack** | <!-- Languages, frameworks, databases --> |
| **Repository** | <!-- URL --> |

### What This Project Does

<!-- 2-3 sentences describing what the project is and who it serves -->

### What This Project Does NOT Do

<!-- Explicit scope exclusions — critical for preventing scope creep -->

---

## Project Structure

```
PROJECT_ROOT/
│
├── docs/               # Authoritative project documentation
│   ├── vision.md           # Project goals, success criteria, stakeholders
│   ├── requirements.md     # Functional & non-functional requirements
│   ├── architecture.md     # System design, components, data flow
│   ├── decisions.md        # Architecture Decision Records (ADRs)
│   ├── constraints.md      # Technical and business constraints
│   ├── glossary.md         # Shared vocabulary and definitions
│   └── roadmap.md          # Milestones, phases, timeline
│
├── memory/             # AI session continuity — update every session
│   ├── current_state.md    # Current build status and health
│   ├── project_context.md  # Background, motivation, key context
│   ├── known_issues.md     # Active bugs and known problems
│   ├── assumptions.md      # Decisions made without full information
│   ├── completed_tasks.md  # Log of all completed work
│   └── session_handover.md # Handover notes between AI sessions
│
├── research/           # Discovery and analysis artifacts
│   ├── market_research.md  # Market landscape, opportunities
│   ├── competitors.md      # Competitive analysis
│   ├── references.md       # External links, papers, docs
│   └── technical_notes.md  # Technical research and spikes
│
├── tasks/              # Work item tracking
│   ├── backlog.md          # Prioritized work not yet started
│   ├── in_progress.md      # Active work items
│   ├── completed.md        # Finished work items
│   └── future_ideas.md     # Ideas for later consideration
│
├── design/             # UI/UX design artifacts
│   ├── ui_notes.md         # Visual design decisions
│   ├── ux_notes.md         # User experience decisions
│   └── wireframes/         # Wireframe images and sketches
│
├── source/             # Application source code
├── tests/              # Test suites
├── scripts/            # Build, deploy, utility scripts
│
├── README.md           # This file — start here
└── AI_WORKFLOW.md      # Detailed AI assistant workflow protocol
```

---

## Quick Status Dashboard

| Area | Status | Last Updated | Notes |
|---|---|---|---|
| Requirements | <!-- DRAFT / REVIEWED / FROZEN --> | <!-- DATE --> | <!-- note --> |
| Architecture | <!-- DRAFT / REVIEWED / FROZEN --> | <!-- DATE --> | <!-- note --> |
| Design | <!-- NOT STARTED / IN PROGRESS / COMPLETE --> | <!-- DATE --> | <!-- note --> |
| Core Development | <!-- NOT STARTED / IN PROGRESS / COMPLETE --> | <!-- DATE --> | <!-- note --> |
| Testing | <!-- NOT STARTED / IN PROGRESS / COMPLETE --> | <!-- DATE --> | <!-- note --> |
| Documentation | <!-- NOT STARTED / IN PROGRESS / COMPLETE --> | <!-- DATE --> | <!-- note --> |

---

## How to Use This Workspace

### For Human Contributors

1. All major decisions go into `docs/decisions.md` with rationale
2. Update `memory/current_state.md` when anything significant changes
3. Keep `tasks/in_progress.md` honest — if it's not being worked on, move it to backlog
4. Never delete content — mark things as deprecated or superseded instead

### For AI Sessions

Follow the **START HERE** protocol at the top of this file. See `AI_WORKFLOW.md` for the complete workflow.

---

## Contact & Governance

| Role | Name | Responsibility |
|---|---|---|
| Project Lead | S Manoj Gowda | Final decisions on scope and direction |
| Tech Lead | Kiran Gowda | Architecture and technical decisions |
| AI Sessions | Claude | Implementation, documentation, analysis |

---

*This README is a living document. Update it as the project evolves.*
