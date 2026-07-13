# UX Notes

> **Last Updated:** <!-- DATE -->
> **Status:** NOT STARTED

---

## Purpose of This Document

User experience decisions, user flows, interaction patterns, and usability research findings. Before designing a new user flow, check here for established patterns and existing flow decisions.

---

## UX Principles

Every product interaction should be judged against these principles:

1. <!-- Principle 1 — e.g., "Reduce cognitive load — users make decisions faster with less information on screen" -->
2. <!-- Principle 2 — e.g., "Prevent errors — make the wrong action harder than the right one" -->
3. <!-- Principle 3 — e.g., "Feedback on every action — users should always know what happened" -->
4. <!-- Principle 4 — e.g., "Progressive disclosure — show only what the user needs at this moment" -->

---

## User Personas

### Persona: <!-- Persona Name (e.g., "The Power User") -->

| Field | Value |
|---|---|
| **Name** | <!-- Fictional name for reference --> |
| **Role** | <!-- Their job or role --> |
| **Age Range** | <!-- Approximate --> |
| **Tech Comfort** | <!-- Novice / Intermediate / Expert --> |
| **Goal** | <!-- What they want to accomplish with this product --> |
| **Frustration** | <!-- What currently frustrates them --> |
| **Behavior Pattern** | <!-- How they typically use software --> |

**Quote (typical statement from this user):**
> "<!-- First-person quote capturing their perspective -->"

**Design implications for this persona:**
- <!-- How this persona shapes design decisions -->

---

### Persona: <!-- Persona Name (e.g., "The Occasional User") -->

| Field | Value |
|---|---|
| **Name** | |
| **Role** | |
| **Tech Comfort** | |
| **Goal** | |
| **Frustration** | |

---

## Core User Flows

### Flow: <!-- Flow Name (e.g., "New User Onboarding") -->

| Field | Value |
|---|---|
| **Persona** | <!-- Which persona performs this flow --> |
| **Entry Point** | <!-- Where the user starts --> |
| **Success State** | <!-- What a successful completion looks like --> |
| **Failure States** | <!-- What could go wrong --> |
| **Frequency** | <!-- Once / Daily / Occasionally --> |
| **Priority** | <!-- P0 / P1 / P2 --> |
| **Status** | <!-- NOT DESIGNED / DESIGNED / IMPLEMENTED / VERIFIED --> |

**Flow Steps:**

```
Step 1: [User action] → [System response]
  ↓
Step 2: [User action] → [System response]
  ↓
  ├── Happy path: Step 3a
  └── Error path: Step 3b → [Error handling]
  ↓
Step 4: [Completion state]
```

**Edge Cases:**
- <!-- What if the user has no data yet? -->
- <!-- What if the action fails? -->
- <!-- What if the user leaves midway? -->

**Wireframe / Mockup:**
See `design/wireframes/<!-- flow-name -->/`

---

### Flow: <!-- Flow Name -->

| Field | Value |
|---|---|
| **Persona** | |
| **Entry Point** | |
| **Success State** | |

---

## Interaction Patterns

### Pattern: Empty States

How should the UI behave when there is no data to show?

- **Illustration:** <!-- Yes / No --> — <!-- Brief image description -->
- **Headline:** <!-- e.g., "You haven't added anything yet" -->
- **Call to Action:** <!-- Primary action to get started -->
- **Tone:** <!-- Encouraging, not apologetic -->

### Pattern: Loading States

| Scenario | Loading Treatment |
|---|---|
| Page load (< 300ms) | No indicator needed |
| Page load (300ms – 2s) | Skeleton screen |
| Page load (> 2s) | Spinner + progress if possible |
| Button action | Disable button + spinner in button |
| Background sync | Subtle indicator (not blocking) |

### Pattern: Error States

| Error Type | User Message | Recovery Action |
|---|---|---|
| Network error | "Unable to connect. Check your connection." | Retry button |
| Form validation | Field-level message below input | Highlight field |
| Server error | "Something went wrong. Try again." | Retry + support link |
| Not found | "This page doesn't exist." | Back / home button |
| Permission denied | "You don't have access to this." | Request access or explain |

### Pattern: Confirmation Dialogs

When to require confirmation:
- Deleting data permanently
- Actions that cannot be undone
- Actions affecting other users

When NOT to require confirmation:
- Saving changes (auto-save or clear save button)
- Navigation
- Reversible actions

**Confirmation dialog standard:**
- Title: "[Action] [Object]?" — e.g., "Delete Project?"
- Body: Clear consequence statement
- Primary button: Specific verb (not just "OK") — e.g., "Delete Project"
- Cancel button: Always present and prominent

### Pattern: Notifications and Toasts

| Trigger | Type | Duration | Position |
|---|---|---|---|
| Successful save | Success toast | 3 seconds | Bottom right |
| Destructive action completed | Info toast | 5 seconds + undo | Bottom |
| Error | Error toast | Manual dismiss | Bottom right |
| System alert | Banner | Manual dismiss | Top |

---

## Usability Research Findings

### Finding: <!-- Finding Title -->

| Field | Value |
|---|---|
| **Date** | <!-- DATE --> |
| **Method** | <!-- User interview / Usability test / Survey / Analytics --> |
| **Participants** | <!-- N participants --> |
| **Finding** | <!-- What was observed or discovered --> |
| **Severity** | <!-- Critical / High / Medium / Low --> |
| **Action** | <!-- What design change was made or is planned --> |

---

## UX Decision Log

| Date | Decision | Reason | Alternative Considered |
|---|---|---|---|
| <!-- DATE --> | UX notes template created | Project start | — |
