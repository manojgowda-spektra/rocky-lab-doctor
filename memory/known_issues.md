# Known Issues

> **Last Updated:** <!-- DATE -->
> **Open Issues:** 0
> **Critical Issues:** 0

---

## Purpose of This Document

A running log of known bugs, defects, and problems in the project. When starting work in any area, check here first. When discovering a new issue, log it here immediately.

**Important:** An issue logged here is not the same as a ticket. This is awareness tracking — so AI sessions and developers know what is broken before touching an area.

---

## Status Legend

| Status | Meaning |
|---|---|
| `OPEN` | Known, not yet being worked on |
| `INVESTIGATING` | Being diagnosed |
| `IN PROGRESS` | Fix underway |
| `FIXED` | Fix implemented, pending verification |
| `VERIFIED` | Fix confirmed working in all environments |
| `WONTFIX` | Known but accepted — documented reason |
| `DUPLICATE` | Duplicate of another issue (linked) |

## Severity Legend

| Severity | Meaning |
|---|---|
| `CRITICAL` | System down or data loss — must fix immediately |
| `HIGH` | Major feature broken, no workaround |
| `MEDIUM` | Feature partially broken or workaround exists |
| `LOW` | Minor issue, cosmetic, or edge case |

---

## Critical Issues

<!-- CRITICAL severity issues — must be resolved before any release -->

*No critical issues at this time.*

---

## Open Issues

### ISS-001 — [Issue Title]

| Field | Value |
|---|---|
| **ID** | ISS-001 |
| **Severity** | <!-- CRITICAL / HIGH / MEDIUM / LOW --> |
| **Status** | <!-- OPEN / INVESTIGATING / IN PROGRESS --> |
| **Area** | <!-- Component or module affected --> |
| **Discovered** | <!-- DATE --> |
| **Discovered By** | <!-- Name / AI Session --> |
| **Assigned To** | <!-- Name / Unassigned --> |
| **Blocks** | <!-- Requirement ID or feature, if any --> |

**Description:**
<!-- Clear description of what is wrong -->

**Steps to Reproduce:**
1. <!-- Step 1 -->
2. <!-- Step 2 -->
3. <!-- Step 3 -->

**Expected Behavior:**
<!-- What should happen -->

**Actual Behavior:**
<!-- What actually happens -->

**Root Cause (if known):**
<!-- What is causing this -->

**Workaround:**
<!-- Temporary workaround if one exists -->

**Fix Plan:**
<!-- How it will be fixed and when -->

**Related Files:**
- `<!-- path/to/file -->`

---

<!-- Template for new issues — copy this block:

### ISS-NNN — [Issue Title]

| Field | Value |
|---|---|
| **ID** | ISS-NNN |
| **Severity** | |
| **Status** | OPEN |
| **Area** | |
| **Discovered** | YYYY-MM-DD |
| **Discovered By** | |
| **Assigned To** | Unassigned |
| **Blocks** | None |

**Description:**

**Steps to Reproduce:**
1. 
2. 

**Expected Behavior:**

**Actual Behavior:**

**Root Cause (if known):**

**Workaround:**

**Fix Plan:**

**Related Files:**

-->

---

## Resolved Issues

| ID | Title | Severity | Resolved | Fixed In | Resolution |
|---|---|---|---|---|---|
| | | | | | |

---

## Issue Patterns

<!-- Track recurring problem areas to identify systemic issues -->

| Area | Issue Count | Common Root Cause | Action Taken |
|---|---|---|---|
| | | | |

---

## Issue Log Update Rules

- When discovering an issue during work: add it here BEFORE continuing — even if you plan to fix it immediately
- When fixing an issue: update status to FIXED, then VERIFIED after confirmation
- When closing an issue: move to Resolved Issues table, do not delete the entry
- When seeing repeated issues in the same area: add to Issue Patterns table
