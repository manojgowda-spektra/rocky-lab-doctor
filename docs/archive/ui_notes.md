# UI Notes

> **Last Updated:** <!-- DATE -->
> **Status:** NOT STARTED
> **Design System:** <!-- None / Custom / Material / Tailwind / etc. -->

---

## Purpose of This Document

Visual design decisions, component standards, and UI guidelines. Before building any UI component, check here for established patterns. After making a UI decision, record it here.

---

## Design Principles

These principles guide all UI decisions. Every component and screen should embody them.

1. <!-- Principle 1 — e.g., "Clarity over cleverness — users should never have to guess what to do" -->
2. <!-- Principle 2 — e.g., "Accessible by default — WCAG 2.1 AA minimum" -->
3. <!-- Principle 3 — e.g., "Consistent patterns — similar things look and behave similarly" -->
4. <!-- Principle 4 -->

---

## Design System / Component Library

| Decision | Choice | ADR | Notes |
|---|---|---|---|
| Component library | <!-- None / MUI / ShadCN / Radix / Custom --> | ADR-XXX | |
| Icon library | <!-- Heroicons / Lucide / FontAwesome --> | | |
| CSS approach | <!-- Tailwind / CSS Modules / Styled Components --> | | |
| Animation library | <!-- Framer Motion / CSS / None --> | | |

---

## Color Palette

### Brand Colors

| Name | Hex | Usage |
|---|---|---|
| Primary | `#------` | Primary buttons, links, key actions |
| Primary Dark | `#------` | Hover states on primary |
| Secondary | `#------` | Secondary actions |
| Accent | `#------` | Highlights, calls to action |

### Semantic Colors

| Name | Hex | Usage |
|---|---|---|
| Success | `#------` | Success states, positive feedback |
| Warning | `#------` | Warning states |
| Error | `#------` | Error states, destructive actions |
| Info | `#------` | Informational states |

### Neutral Colors

| Name | Hex | Usage |
|---|---|---|
| Gray 100 | `#------` | Backgrounds |
| Gray 200 | `#------` | Borders |
| Gray 500 | `#------` | Secondary text |
| Gray 900 | `#------` | Primary text |
| White | `#FFFFFF` | Cards, surfaces |
| Black | `#000000` | High contrast text |

### Dark Mode Colors (if applicable)

| Name | Hex | Usage |
|---|---|---|
| Background | `#------` | |
| Surface | `#------` | |
| Text Primary | `#------` | |

---

## Typography

| Role | Font | Size | Weight | Line Height |
|---|---|---|---|---|
| Heading 1 | <!-- Font name --> | 2rem | 700 | 1.2 |
| Heading 2 | | 1.5rem | 600 | 1.3 |
| Heading 3 | | 1.25rem | 600 | 1.4 |
| Body | | 1rem | 400 | 1.5 |
| Small / Caption | | 0.875rem | 400 | 1.5 |
| Code | <!-- Monospace font --> | 0.875rem | 400 | 1.6 |

---

## Spacing System

| Token | Value | Usage |
|---|---|---|
| xs | 4px | Inline spacing, tight |
| sm | 8px | Component internal spacing |
| md | 16px | Standard spacing |
| lg | 24px | Section spacing |
| xl | 32px | Page section spacing |
| 2xl | 48px | Large section breaks |
| 3xl | 64px | Hero sections |

---

## Component Standards

### Buttons

| Variant | Usage | Style Notes |
|---|---|---|
| Primary | Main actions — one per view | Full color background |
| Secondary | Alternative actions | Border only |
| Ghost | Tertiary actions | No background |
| Destructive | Delete / irreversible actions | Red, requires confirmation |
| Disabled | Unavailable actions | 40% opacity |

**Button rules:**
- Primary button: one per page section maximum
- Destructive actions require confirmation dialog
- Loading state must be indicated (spinner or text change)

### Forms

| Element | Standard |
|---|---|
| Label position | Above input |
| Error message position | Below input |
| Required field indicator | Asterisk (*) with note |
| Input min-height | 40px (touch-friendly) |
| Validation timing | On blur, not on keystroke |

### Navigation

| Element | Behavior |
|---|---|
| Mobile nav | <!-- Bottom tab bar / Hamburger / Drawer --> |
| Desktop nav | <!-- Top bar / Sidebar / Both --> |
| Active state | <!-- Underline / Background / Bold --> |
| Breadcrumbs | <!-- Always / On detail pages / Never --> |

---

## Responsive Breakpoints

| Name | Width | Layout Notes |
|---|---|---|
| Mobile | < 768px | Single column, stacked |
| Tablet | 768–1023px | Two column where appropriate |
| Desktop | 1024–1279px | Full multi-column |
| Wide | 1280px+ | Max width container centered |

---

## Animation Guidelines

| Type | Duration | Easing | Notes |
|---|---|---|---|
| Page transition | 200ms | ease-in-out | Fade or slide |
| Modal open/close | 150ms | ease-out | Scale + fade |
| Button feedback | 100ms | ease | Color transition |
| Loading indicators | Loop | linear | |

**Rules:**
- Respect `prefers-reduced-motion` — disable animations for users who opt out
- No animation should block user interaction
- Prefer subtle animations over dramatic ones

---

## Accessibility Standards

| Standard | Target | Verified |
|---|---|---|
| Color contrast (text) | 4.5:1 minimum | NO |
| Color contrast (UI components) | 3:1 minimum | NO |
| Keyboard navigable | All interactive elements | NO |
| Screen reader compatible | All content | NO |
| Focus indicators visible | All interactive elements | NO |
| Alt text on images | All informational images | NO |
| ARIA labels | All unlabeled interactive elements | NO |

---

## UI Decision Log

| Date | Decision | Reason | ADR |
|---|---|---|---|
| <!-- DATE --> | UI notes template created | Project start | — |
