# AI Assistant Workflow Protocol

> This document defines the exact workflow every AI assistant session must follow.
> It exists to prevent hallucinations, context loss, requirement drift, and duplicated work.
>
> **Last Updated:** <!-- DATE -->
> **Version:** 1.0

---

## Why This File Exists

Large software projects fail when AI sessions:
- Start coding without reading what already exists
- Invent requirements that were never specified
- Re-implement features that already exist
- Make decisions that contradict earlier decisions
- Leave sessions without recording what was done

This workflow prevents all of the above.

---

## Session Lifecycle

Every AI session follows this lifecycle without exception:

```
START SESSION
     │
     ▼
[1] READ MEMORY          ← Orient, do not skip this
     │
     ▼
[2] VERIFY REQUEST       ← Check requirements and constraints
     │
     ▼
[3] PLAN                 ← Explicit plan before coding
     │
     ▼
[4] IMPLEMENT            ← Code with decision logging
     │
     ▼
[5] VERIFY               ← Test, lint, validate
     │
     ▼
[6] RECORD               ← Update all tracking documents
     │
     ▼
END SESSION
```

---

## Phase 1 — Read Memory (Session Start)

**Read these files in this order before doing anything else.**

### 1.1 Mandatory Reads

| Order | File | Purpose |
|---|---|---|
| 1 | `memory/session_handover.md` | What was in progress, what broke, what's next |
| 2 | `memory/current_state.md` | Overall project health and status |
| 3 | `memory/project_context.md` | The "why" behind the project |
| 4 | `docs/vision.md` | North star — all work must align to this |
| 5 | `docs/requirements.md` | What must be built |
| 6 | `docs/architecture.md` | How it is built — follow existing patterns |
| 7 | `docs/decisions.md` | Past decisions — do not contradict these |
| 8 | `tasks/in_progress.md` | Avoid duplicating active work |

### 1.2 Conditional Reads

Read these only if relevant to the current task:

- `docs/constraints.md` — If proposing a new technology or approach
- `memory/known_issues.md` — If working in an area with reported problems
- `memory/assumptions.md` — If requirements feel ambiguous
- `research/technical_notes.md` — If evaluating a technical approach
- `docs/glossary.md` — If encountering unfamiliar domain terms

### 1.3 Orientation Checklist

After reading, confirm you can answer all of these:

- [ ] What phase is the project in?
- [ ] What was the last completed task?
- [ ] What is currently in progress?
- [ ] What are the top 3 requirements for this session?
- [ ] Are there any blocking issues?
- [ ] Are there any decisions that constrain this session's work?

If you cannot answer all of these, read more files before proceeding.

---

## Phase 2 — Verify Request

Before writing a single line of code, verify the work is valid.

### 2.1 Requirements Check

1. Find the requirement in `docs/requirements.md`
2. Note the requirement ID (e.g., `FR-001`)
3. If the request is NOT in requirements, do one of:
   - Ask the user if this is a new requirement (then add it)
   - Refuse to implement until the requirement is documented

**Never implement undocumented requirements without explicit user confirmation.**

### 2.2 Duplication Check

Search for existing implementations:

```
Questions to ask before building:
1. Does this feature already exist in the codebase?
2. Is this feature listed in tasks/in_progress.md?
3. Is this feature listed in tasks/completed.md?
4. Does this duplicate any entry in memory/completed_tasks.md?
```

If the feature already exists — report it, do not rebuild it.

### 2.3 Constraint Check

Review `docs/constraints.md` and confirm:

- [ ] The proposed approach does not violate technical constraints
- [ ] The proposed technology is on the approved stack
- [ ] The proposed approach meets performance constraints
- [ ] The proposed approach meets security constraints
- [ ] The proposed approach meets compliance constraints

### 2.4 Decision Alignment Check

Review `docs/decisions.md` and confirm:

- [ ] The approach does not contradict a closed ADR
- [ ] If contradicting an ADR, there is a clear reason to revisit it
- [ ] Any new decision will be logged before coding begins

---

## Phase 3 — Plan Before Coding

### 3.1 State the Plan Explicitly

Before writing code, state the plan in the conversation:

```
PLAN:
- What I will build: [description]
- Why: [requirement ID or user request]
- Files I will create: [list]
- Files I will modify: [list]
- Files I will NOT touch: [list]
- Risks: [any concerns]
- Estimated scope: [small / medium / large]
```

### 3.2 Flag New Decisions

If the plan requires a new architectural or design decision, log it in `docs/decisions.md` BEFORE coding:

```markdown
## ADR-XXX: [Decision Title]
- **Date:** [date]
- **Status:** PROPOSED
- **Context:** [Why is this decision needed?]
- **Decision:** [What was decided?]
- **Alternatives Considered:** [What else was evaluated?]
- **Consequences:** [What changes as a result?]
```

Update status to ACCEPTED after user confirms the plan.

### 3.3 Flag New Assumptions

If any assumption is being made (e.g., "I assume the user wants X"), log it in `memory/assumptions.md` BEFORE implementing.

---

## Phase 4 — Implement

### 4.1 Implementation Rules

- Follow patterns established in `docs/architecture.md`
- Follow conventions from the existing codebase (naming, structure, style)
- Do not introduce new dependencies without logging in `docs/decisions.md`
- Do not add features beyond the stated requirement
- Do not refactor code outside the scope of the task

### 4.2 Mid-Implementation Logging

If during implementation a new decision is required:

1. **Stop** — do not make the decision silently
2. **State** the decision and alternatives to the user
3. **Log** the decision in `docs/decisions.md`
4. **Continue** only after the decision is recorded

### 4.3 Scope Control

If the task grows larger than anticipated:

1. Complete only the originally scoped work
2. Add the discovered additional work to `tasks/backlog.md`
3. Report the expanded scope to the user

**Do not silently expand scope.**

---

## Phase 5 — Verify

### 5.1 Self-Verification Checklist

After implementing, verify:

- [ ] The code compiles / runs without errors
- [ ] The feature works as specified in the requirement
- [ ] No existing functionality was broken
- [ ] No hardcoded values that should be configuration
- [ ] No sensitive data (keys, passwords, PII) in code
- [ ] Error cases are handled
- [ ] The implementation follows existing patterns

### 5.2 Requirement Traceability

For each requirement addressed in this session, confirm in `docs/requirements.md`:

- The requirement status is updated (PLANNED → IN PROGRESS → IMPLEMENTED)
- The implementing file/function is referenced

---

## Phase 6 — Record (Session End)

**This phase is mandatory before ending every session.**

### 6.1 Update Completed Tasks

Append to `memory/completed_tasks.md`:

```markdown
### [Date] — [Task Name]
- **Requirement:** [REQ-ID if applicable]
- **What was done:** [Description]
- **Files changed:** [List]
- **Decisions made:** [ADR-IDs if applicable]
- **Known issues introduced:** [Any new technical debt]
```

### 6.2 Update Task Tracking

- Move completed items from `tasks/in_progress.md` to `tasks/completed.md`
- Add discovered work to `tasks/backlog.md`
- Update priorities if anything changed

### 6.3 Update Current State

Update `memory/current_state.md`:

- Overall project status
- What is now working
- What is not yet working
- Current blockers

### 6.4 Write Session Handover

**This is the most important update.** The next session depends on this.

Update `memory/session_handover.md` with:

```markdown
## Handover — [Date] [Time]

### What was accomplished this session
[Bullet list]

### What is still in progress
[Bullet list with exact state — e.g., "Auth controller is 70% done, missing token refresh logic"]

### What to do next
[Ordered list of next actions]

### Warnings and gotchas
[Anything the next session must know to avoid problems]

### Files that changed this session
[List of all modified files]

### Open questions
[Unresolved questions that need answers]
```

### 6.5 Update Architecture (if changed)

If the session changed the system structure, update `docs/architecture.md`.

### 6.6 Update Glossary (if new terms introduced)

If new domain terms or technical terms were introduced, add them to `docs/glossary.md`.

---

## How to Record Decisions

Use this template in `docs/decisions.md` for every significant decision.

```markdown
## ADR-[NNN]: [Short Title]

| Field | Value |
|---|---|
| **Date** | YYYY-MM-DD |
| **Status** | PROPOSED / ACCEPTED / DEPRECATED / SUPERSEDED |
| **Decider** | [Human / AI Session] |
| **Supersedes** | ADR-NNN (if applicable) |

### Context
[What is the situation requiring this decision?]
[What problem are we solving?]

### Decision
[What was decided? State it clearly and specifically.]

### Alternatives Considered
| Option | Pros | Cons | Why Rejected |
|---|---|---|---|
| [Option A] | ... | ... | ... |
| [Option B] | ... | ... | ... |

### Consequences
**Positive:**
- [What improves?]

**Negative / Trade-offs:**
- [What gets worse or becomes harder?]

### Implementation Notes
[Anything a future developer needs to know to implement this correctly]
```

**Rules for decisions:**
- Never delete a decision — mark it DEPRECATED or SUPERSEDED
- Always link to the ADR that supersedes a deprecated one
- Decisions require context — future readers cannot guess your reasoning

---

## How to Avoid Duplicating Features

Before implementing any feature, run this checklist:

```
DUPLICATION PREVENTION CHECKLIST

[ ] Searched tasks/completed.md for this feature by keyword
[ ] Searched memory/completed_tasks.md for this feature by keyword
[ ] Searched tasks/in_progress.md — is this already being built?
[ ] Searched source/ directory for related existing code
[ ] Checked docs/requirements.md — is this already marked IMPLEMENTED?
[ ] Asked: "Could an existing module be extended instead of creating new code?"
```

If any check reveals the feature exists or is in progress — report it before proceeding.

---

## How to Verify Requirements Before Coding

### Step 1 — Find the requirement

Open `docs/requirements.md` and locate the requirement by ID or keyword.

### Step 2 — Confirm it is in scope

Check `docs/roadmap.md` — is this requirement in the current phase?

### Step 3 — Confirm it is not done

Check `tasks/completed.md` and `memory/completed_tasks.md` — not already implemented?

### Step 4 — Confirm no constraint blocks it

Check `docs/constraints.md` — no constraint prevents this implementation approach?

### Step 5 — Confirm no decision overrides it

Check `docs/decisions.md` — no past ADR changes how this should be built?

### Step 6 — Implement

Only after all 5 steps pass, begin implementation.

---

## Document Ownership Matrix

| Document | Who Creates | Who Updates | Who Reviews |
|---|---|---|---|
| `docs/vision.md` | Human | Human only | Human |
| `docs/requirements.md` | Human + AI | Human must approve AI additions | Human |
| `docs/architecture.md` | AI | AI after major changes | Human |
| `docs/decisions.md` | AI | AI (per session) | Human |
| `docs/constraints.md` | Human + AI | Both | Human |
| `docs/glossary.md` | Both | Both | Either |
| `docs/roadmap.md` | Human | Human | Human |
| `memory/*` | AI | AI (every session) | Either |
| `tasks/*` | Both | AI (per session) | Either |
| `research/*` | Both | Both | Either |
| `design/*` | Human | Both | Human |

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Harmful | What to Do Instead |
|---|---|---|
| Coding before reading memory | Creates conflicting implementations | Read mandatory files first |
| Adding features "while you're at it" | Untracked scope creep | Add to backlog, don't implement |
| Making silent decisions | Future sessions have no context | Log every decision in decisions.md |
| Guessing at requirements | Builds the wrong thing | Check requirements.md or ask |
| Skipping session handover | Next session starts blind | Always write handover notes |
| Deleting content from docs | Loses historical context | Mark as deprecated/superseded |
| Implementing without a plan | Creates untraceable changes | Always state plan before coding |
| Updating code without updating docs | Docs drift from reality | Update docs as part of implementation |

---

## Emergency Recovery Protocol

If a session ends without proper handover (context lost, crash, etc.):

1. Read `memory/current_state.md` for the last known state
2. Run `git log --oneline -20` to see recent commits
3. Read `tasks/in_progress.md` for what was being worked on
4. Read `tasks/completed.md` for what was recently finished
5. Reconstruct state from the above before continuing

If `git` is not available, read `memory/completed_tasks.md` to reconstruct timeline.

---

*This workflow document should be updated if the team identifies new failure modes or better practices.*
